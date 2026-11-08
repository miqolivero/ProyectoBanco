const Cobro = require('../models/cobroModel');
const Movimiento = require('../models/movimientoModel');
const { ejecutarTransferencia, MENSAJE_CBU_NUEVO } = require('./movimientoController');
const { exigirCbuPropio } = require('../middlewares/auth');
const { normalizarMontoDecimal, esUuid } = require('../utils/validaciones');
const { mundoActual } = require('../config/sandboxDemo');

// Límite de lo que una cuenta puede RECIBIR por cobros con QR en un mes calendario (Córdoba).
// Es para pagos presenciales en comercios, no para mover montos grandes. También es el máximo
// de un cobro individual.
const LIMITE_MENSUAL_COBROS = 1000000;
const LARGO_MAXIMO_DESCRIPCION = 140;

const formatearPesos = (valor) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor));
const TEXTO_LIMITE = formatearPesos(LIMITE_MENSUAL_COBROS);

// Si no mandan un CBU, se usa la cuenta en pesos de la persona (los cobros son siempre en ARS).
function cbuOElDePesos(req, cbu) {
    if (cbu) return String(cbu).trim();
    return req.personaAutenticada.cbus.find(c => c.moneda === 'ARS')?.cbu || null;
}

// Valida que la cuenta exista, sea de la persona (eso ya lo hizo exigirCbuPropio), esté en
// pesos y activa. Devuelve la cuenta o un { status, error } para responder.
async function validarCuentaOperable(cbu) {
    if (!cbu) return { status: 400, error: 'No tenés una cuenta en pesos para operar con QR.' };
    const cuenta = await Cobro.obtenerCuenta(cbu);
    if (!cuenta) return { status: 404, error: 'La cuenta no existe.' };
    if (cuenta.moneda !== 'ARS') return { status: 400, error: 'Los cobros con QR son solo en pesos. Elegí tu cuenta en ARS.' };
    if (cuenta.estado_producto !== 'ACTIVO') return { status: 400, error: 'La cuenta no está activa.' };
    return { cuenta };
}

// Lo que ve el que COBRA: el estado (para el polling) y cuánto va a recibir.
function vistaCobrador(c) {
    return {
        id: c.id_cobro,
        estado: c.estado,
        descripcion: c.descripcion,
        precio: c.precio,
        porcentajeDescuento: c.porcentaje_descuento,
        descuento: c.descuento,
        topeAplicado: c.tope_aplicado,
        // Mientras está pendiente es el precio: el descuento depende de quién pague (su tope en
        // el evento) y recién se fija al pagar.
        montoFinal: c.monto_pagado,
        // Comisión del banco al comercio (2% + IVA una vez pasado el tope gratis del mes). Se
        // fija al pagar; mientras está pendiente es 0.
        comision: c.comision,
        ivaComision: c.iva_comision,
        netoComercio: c.neto_comercio,
        promo: c.id_adhesion
            ? { evento: c.evento_nombre, nombreComercial: c.nombre_comercial, topePorPersona: c.evento_tope }
            : null,
        fechaCreacion: c.fecha_creacion,
        fechaPago: c.fecha_pago
    };
}

// Lo que ve el que PAGA: a quién le paga y el desglose. Si el cobro sigue pendiente, el
// desglose es el calculado para ESTA persona (`calculo`, con lo que le queda de tope en el
// evento); si ya se pagó, el que quedó guardado. Nunca expone el CBU completo del comercio ni
// quién pagó (si es un cobro ajeno ya pagado).
function vistaPagador(c, { adhesion, idPersona, calculo }) {
    const d = calculo || c;
    return {
        id: c.id_cobro,
        estado: c.estado,
        descripcion: c.descripcion,
        pagadoPorVos: c.estado === 'PAGADO' && String(c.id_persona_pagadora) === String(idPersona),
        comercio: {
            nombre: adhesion?.nombre_comercial || c.nombre_comercial || c.titular_cobrador,
            titular: c.titular_cobrador,
            rubro: adhesion?.rubro || c.rubro || null,
            adherido: Boolean(adhesion),
            eventoAdhesion: adhesion?.evento_nombre || null,
            cbuTerminacion: c.cbu_cobrador.slice(-4)
        },
        desglose: {
            precio: c.precio,
            evento: c.id_adhesion ? c.evento_nombre : null,
            porcentajeDescuento: c.porcentaje_descuento,
            descuento: d.descuento,
            topeAplicado: d.tope_aplicado,
            topePorPersona: c.id_adhesion ? c.evento_tope : null,
            // Lo que le quedaba de descuento en el evento antes de esta compra (solo si es pendiente).
            disponibleEnEvento: calculo && c.id_adhesion ? calculo.disponible : null,
            montoAPagar: d.monto_pagado
        },
        fechaPago: c.estado === 'PAGADO' ? c.fecha_pago : null
    };
}

// 1. CREAR COBRO (POST /api/cobros) — cualquier cliente, sin comisión.
exports.crearCobro = async (req, res) => {
    const { cbu, monto, descripcion } = req.body;

    const precio = normalizarMontoDecimal(monto, LIMITE_MENSUAL_COBROS);
    if (!precio) {
        return res.status(400).json({ error: `Ingresá un monto mayor a cero, con hasta 2 decimales y de no más de ${TEXTO_LIMITE}.` });
    }
    const descripcionLimpia = descripcion ? String(descripcion).trim() : '';
    if (descripcionLimpia.length > LARGO_MAXIMO_DESCRIPCION) {
        return res.status(400).json({ error: `La descripción puede tener hasta ${LARGO_MAXIMO_DESCRIPCION} caracteres.` });
    }

    const cbuCobrador = cbuOElDePesos(req, cbu);
    if (!exigirCbuPropio(req, res, cbuCobrador)) return;

    try {
        const { cuenta, status, error } = await validarCuentaOperable(cbuCobrador);
        if (!cuenta) return res.status(status).json({ error });

        const cobro = await Cobro.crear(cuenta.id_cuenta, precio, descripcionLimpia || null, LIMITE_MENSUAL_COBROS);
        res.status(201).json(vistaCobrador(cobro));
    } catch (error) {
        if (error.code === 'LIMITE_MENSUAL') {
            return res.status(400).json({
                error: `Superás el límite de ${TEXTO_LIMITE} por mes en cobros con QR. Este mes podés cobrar ${formatearPesos(error.disponible)} más.`,
                disponibleMes: error.disponible
            });
        }
        console.error('❌ Error creando cobro:', error.message);
        res.status(500).json({ error: 'No se pudo generar el cobro.' });
    }
};

// 2. MIS COBROS RECIENTES (GET /api/cobros)
exports.listarMisCobros = async (req, res) => {
    try {
        const cobros = await Cobro.listarDePersona(req.personaAutenticada.id);
        res.json(cobros.map(vistaCobrador));
    } catch (error) {
        console.error('❌ Error listando cobros:', error.message);
        res.status(500).json({ error: 'No se pudieron traer tus cobros.' });
    }
};

// 2.1 CÓMO VIENE EL MES (GET /api/cobros/resumen-mes): cuánto cobró, cuánto le queda sin
// comisión y hasta el límite mensual. Todo calculado acá; la pantalla de Cobrar solo lo muestra.
exports.resumenDelMes = async (req, res) => {
    const cbu = cbuOElDePesos(req, req.query.cbu);
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const { cuenta, status, error } = await validarCuentaOperable(cbu);
        if (!cuenta) return res.status(status).json({ error });
        const r = await Cobro.resumenDelMes(cuenta.id_cuenta, LIMITE_MENSUAL_COBROS);
        res.json({
            cobradoMes: r.cobrado,
            topeGratis: r.tope_gratis,
            restanteGratis: r.restante_gratis,
            limiteMensual: r.limite_mensual,
            restanteLimite: r.restante_limite,
            comisionPorcentaje: r.comision_porcentaje,
            ivaPorcentaje: r.iva_porcentaje
        });
    } catch (error) {
        console.error('❌ Error armando el resumen del mes de cobros:', error.message);
        res.status(500).json({ error: 'No se pudo calcular tu resumen del mes.' });
    }
};

// 3. DETALLE (GET /api/cobros/:id) — la misma URL sirve a los dos lados: al dueño le devuelve
// su vista (la que pollea cada 3 s esperando el pago) y a cualquier otro, la de pago.
exports.obtenerCobro = async (req, res) => {
    const { id } = req.params;
    if (!esUuid(id)) return res.status(404).json({ error: 'El cobro no existe. Revisá el link o el QR.' });

    try {
        const cobro = await Cobro.obtenerPorId(id);
        if (!cobro) return res.status(404).json({ error: 'El cobro no existe. Revisá el link o el QR.' });

        const idPersona = req.personaAutenticada.id;
        if (String(cobro.id_persona_cobradora) === String(idPersona)) {
            return res.json({ rol: 'cobrador', ...vistaCobrador(cobro) });
        }
        const adhesion = await Cobro.adhesionVigente(cobro.id_cuenta_cobradora);
        const calculo = cobro.estado === 'PENDIENTE' ? await Cobro.calcularDescuento(id, idPersona) : null;
        res.json({ rol: 'pagador', ...vistaPagador(cobro, { adhesion, idPersona, calculo }) });
    } catch (error) {
        console.error('❌ Error obteniendo cobro:', error.message);
        res.status(500).json({ error: 'No se pudo consultar el cobro.' });
    }
};

// 3.1 VISTA PÚBLICA (GET /api/cobros/:id/publico) — sin sesión. Es lo que ve quien abre el
// link del QR y todavía no es cliente: el detalle del cobro y, si hay promo, que el descuento
// es para clientes. Lo mínimo: ni CBU, ni titular (si no es un comercio adherido, el nombre de
// la persona no se muestra), ni descuento en pesos (depende de quién pague).
exports.obtenerCobroPublico = async (req, res) => {
    const { id } = req.params;
    if (!esUuid(id)) return res.status(404).json({ error: 'El cobro no existe. Revisá el link o el QR.' });

    try {
        const cobro = await Cobro.obtenerPorId(id);
        if (!cobro) return res.status(404).json({ error: 'El cobro no existe. Revisá el link o el QR.' });

        const adhesion = await Cobro.adhesionVigente(cobro.id_cuenta_cobradora);
        res.json({
            id: cobro.id_cobro,
            estado: cobro.estado,
            descripcion: cobro.descripcion,
            precio: cobro.precio,
            comercio: {
                nombre: adhesion?.nombre_comercial || cobro.nombre_comercial || null,
                rubro: adhesion?.rubro || cobro.rubro || null,
                adherido: Boolean(adhesion)
            },
            promo: cobro.id_adhesion
                ? { evento: cobro.evento_nombre, porcentajeDescuento: cobro.porcentaje_descuento, topePorPersona: cobro.evento_tope }
                : null
        });
    } catch (error) {
        console.error('❌ Error obteniendo cobro público:', error.message);
        res.status(500).json({ error: 'No se pudo consultar el cobro.' });
    }
};

// 4. PAGAR (POST /api/cobros/:id/pagar)
// La plata se mueve con ejecutarTransferencia, el mismo flujo de cualquier transferencia (con
// el Banco Central de por medio). El cobro se "toma" antes de transferir (PENDIENTE →
// PROCESANDO, atómico) y se confirma o se libera según cómo termine la transferencia.
exports.pagarCobro = async (req, res) => {
    const { id } = req.params;
    const { cbu_origen, confirmar_cbu_nuevo } = req.body;
    if (!esUuid(id)) return res.status(404).json({ error: 'El cobro no existe.' });

    const cbuPagador = cbuOElDePesos(req, cbu_origen);
    if (!exigirCbuPropio(req, res, cbuPagador)) return;

    const idPersona = req.personaAutenticada.id;
    const cbusPropios = req.personaAutenticada.cbus.map(c => c.cbu);
    let cobroTomado = false;

    try {
        const { cuenta, status, error } = await validarCuentaOperable(cbuPagador);
        if (!cuenta) return res.status(status).json({ error });

        const cobro = await Cobro.obtenerPorId(id);
        if (!cobro) return res.status(404).json({ error: 'El cobro no existe.' });

        if (String(cobro.id_persona_cobradora) === String(idPersona)) {
            return res.status(400).json({ error: 'No podés pagar un cobro que generaste vos.' });
        }
        if (cobro.estado !== 'PENDIENTE') {
            return res.status(409).json({ error: mensajeEstadoNoPagable(cobro.estado), estado: cobro.estado });
        }
        // En la demo solo se pagan QRs de la demo: pagar el cobro de un cliente real tomaría su
        // fila (FOR UPDATE) dentro de la transacción de la demo y lo dejaría trabado hasta que
        // la demo termine. Ver config/sandboxDemo.js.
        const mundo = mundoActual();
        if (mundo && !mundo.cbusDemo.has(cobro.cbu_cobrador)) {
            return res.status(403).json({ error: 'Desde la cuenta demo solo podés pagar QRs generados en la demo.' });
        }

        // Advertencia anti-estafa: a un comercio adherido de un evento vigente no se le muestra
        // (se le muestra que es adherido); a cualquier otro CBU nuevo, sí.
        const adhesion = await Cobro.adhesionVigente(cobro.id_cuenta_cobradora);
        if (!adhesion && confirmar_cbu_nuevo !== true) {
            const yaLePago = await Movimiento.yaTransfirioA(cbusPropios, cobro.cbu_cobrador);
            if (!yaLePago) {
                return res.status(409).json({
                    error: MENSAJE_CBU_NUEVO,
                    requiereConfirmacion: true,
                    motivo: 'CBU_NUEVO'
                });
            }
        }

        const tomado = await Cobro.tomarParaPago(id, cuenta.id_cuenta, idPersona, LIMITE_MENSUAL_COBROS);
        if (!tomado) {
            // Otro pago (o una cancelación) ganó la carrera entre la lectura de arriba y este UPDATE.
            const actual = await Cobro.obtenerPorId(id);
            return res.status(409).json({ error: mensajeEstadoNoPagable(actual?.estado), estado: actual?.estado });
        }
        if (tomado.excedeLimite) {
            return res.status(409).json({
                error: `El comercio alcanzó su límite de ${TEXTO_LIMITE} por mes en cobros con QR, así que este cobro no se puede pagar. No se te debitó nada.`,
                motivo: 'LIMITE_MENSUAL_COMERCIO'
            });
        }
        cobroTomado = true;

        const nombreComercio = adhesion?.nombre_comercial || cobro.nombre_comercial;
        const transferencia = await ejecutarTransferencia({
            cbuOrigen: cbuPagador,
            cbuDestino: cobro.cbu_cobrador,
            monto: tomado.monto_pagado,
            concepto: nombreComercio ? `Pago con QR en ${nombreComercio}` : 'Pago con QR',
            cbusPropios,
            controlCbuNuevo: false // ya se resolvió arriba, con la regla de comercio adherido
        });

        if (transferencia.status !== 201) {
            await Cobro.liberarPago(id);
            cobroTomado = false;
            return res.status(transferencia.status).json(transferencia.body);
        }

        const confirmado = await Cobro.confirmarPago(id, transferencia.body.id);
        cobroTomado = false;
        if (!confirmado) {
            // No debería pasar (el cobro estaba tomado por este mismo pedido); la transferencia ya
            // salió, así que se informa como pagado igual y queda registrado para revisar.
            console.error(`❌❌ El cobro ${id} se pagó (transacción ${transferencia.body.id}) pero no se pudo marcar como PAGADO.`);
        } else {
            // Si la sincronización ya acreditó el ingreso al comercio (pudo ganarle a esta
            // respuesta), la comisión se debita acá; si no, la debita la sincronización cuando
            // llegue. No frena el pago: la plata ya salió.
            try {
                await Cobro.debitarComisionPendiente(transferencia.body.id);
            } catch (errorComision) {
                console.error(`❌ No se pudo debitar la comisión del cobro ${id}:`, errorComision.message);
            }
        }

        const actualizado = await Cobro.obtenerPorId(id);
        res.status(201).json({
            message: '¡Pago realizado!',
            comprobante: transferencia.body.comprobante,
            cobro: vistaPagador(actualizado, { adhesion, idPersona })
        });
    } catch (error) {
        if (cobroTomado) {
            try {
                await Cobro.liberarPago(id);
            } catch (errorLiberar) {
                console.error(`❌❌ No se pudo liberar el cobro ${id} tras un error:`, errorLiberar.message);
            }
        }
        console.error('❌ Error pagando cobro:', error.message);
        res.status(500).json({ error: 'No se pudo completar el pago.' });
    }
};

// 5. CANCELAR (POST /api/cobros/:id/cancelar) — solo el que cobra, y solo si sigue pendiente.
exports.cancelarCobro = async (req, res) => {
    const { id } = req.params;
    if (!esUuid(id)) return res.status(404).json({ error: 'El cobro no existe.' });

    try {
        const cancelado = await Cobro.cancelar(id, req.personaAutenticada.id);
        if (cancelado) {
            return res.json({ message: 'Cobro cancelado.', estado: 'CANCELADO' });
        }

        const cobro = await Cobro.obtenerPorId(id);
        if (!cobro) return res.status(404).json({ error: 'El cobro no existe.' });
        if (String(cobro.id_persona_cobradora) !== String(req.personaAutenticada.id)) {
            return res.status(403).json({ error: 'Ese cobro no es tuyo.' });
        }
        res.status(409).json({ error: `No se puede cancelar: ${mensajeEstadoNoPagable(cobro.estado).toLowerCase()}`, estado: cobro.estado });
    } catch (error) {
        console.error('❌ Error cancelando cobro:', error.message);
        res.status(500).json({ error: 'No se pudo cancelar el cobro.' });
    }
};

function mensajeEstadoNoPagable(estado) {
    if (estado === 'PAGADO') return 'Este cobro ya fue pagado.';
    if (estado === 'CANCELADO') return 'Este cobro fue cancelado por el comercio.';
    if (estado === 'PROCESANDO') return 'Este cobro se está pagando en este momento.';
    return 'Este cobro ya no está disponible.';
}
