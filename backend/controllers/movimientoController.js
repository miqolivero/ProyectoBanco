const Movimiento = require('../models/movimientoModel');
const { centralBankFetch } = require('../config/centralBank');
const { obtenerCotizacionDolar } = require('../config/externalApis');
const { verificarCbuPermitidoEnDemo } = require('../config/demoMode');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirCbuPropio } = require('../middlewares/auth');

// 1. REALIZAR TRANSFERENCIA (Soporta CBU o Alias automáticamente y registra el Titular)
exports.realizarTransferencia = async (req, res) => {
    const { cbu_origen, cbu_destino, monto, concepto } = req.body;

    if (!cbu_origen || !cbu_destino || !monto) {
        return res.status(400).json({ error: "Faltan datos obligatorios" });
    }
    // 🐛 Antes solo se chequeaba "!monto" (verdadero/falso) — un monto negativo pasaba de largo
    // acá, y como saldo_origen < monto_negativo nunca es cierto, también pasaba la validación
    // de saldo de más abajo. El resultado: "transferir" un monto negativo debitaba de menos (o
    // directo acreditaba) en vez de debitar — la misma familia de bug que el de préstamos/
    // depósitos. No confiamos en que el Central lo vaya a rechazar por su cuenta: se valida acá.
    if (!esMontoPositivo(monto)) {
        return res.status(400).json({ error: "El monto debe ser un número mayor a cero." });
    }
    if (!exigirCbuPropio(req, res, cbu_origen)) return;

    // 🎯 true una vez que reservarSaldoAtomico debitó de verdad — si algo falla después (el
    // Central rechaza, o cualquier excepción), el catch/rechazo de abajo tiene que reintegrar
    // este monto, si no la plata desaparece localmente sin haber salido de verdad.
    let saldoReservado = false;

    try {
        // En DEMO_MODE, esta es la única barrera antes de tocar la red compartida del Banco
        // Central: sin verificación de sesión en el backend, cualquiera podría transferir
        // "desde" cualquier CBU. Ver config/demoMode.js.
        verificarCbuPermitidoEnDemo(cbu_origen);

        // Chequeo "blando" solo para dar un mensaje de error rápido y con el saldo disponible
        // (y de paso, leer la moneda de la cuenta de origen) — el chequeo real y atómico que
        // efectivamente protege contra condiciones de carrera es reservarSaldoAtomico más abajo.
        const cuentaOrigen = await Movimiento.obtenerCuentaPorCbu(cbu_origen);

        if (cuentaOrigen === null) {
            return res.status(404).json({ error: "Cuenta de origen no encontrada localmente" });
        }

        const saldoDisponible = cuentaOrigen.saldo;
        const monedaOrigen = cuentaOrigen.moneda || 'ARS';

        if (Number(saldoDisponible) < Number(monto)) {
            return res.status(400).json({ error: "Saldo insuficiente", disponible: saldoDisponible });
        }

        let cbuDestinoFinal = cbu_destino.trim();
        const esAlias = !/^\d{22}$/.test(cbuDestinoFinal);
        
        // VARIABLE NUEVA: Aquí guardaremos el nombre del titular que encontremos en el Central
        let nombreTitularFinal = "Titular No Especificado";

        if (esAlias) {
            console.log(`🔍 El destino ingresado es un Alias: [${cbuDestinoFinal}]. Traduciendo a CBU...`);
            
            const respuestaAlias = await centralBankFetch(`/persons/alias/${cbuDestinoFinal}`);

            const datosPersona = await respuestaAlias.json();

            if (!respuestaAlias.ok) {
                console.error("⚠️ Error al buscar alias en el Central:", datosPersona);
                return res.status(404).json({ 
                    error: "El Alias ingresado no pertenece a ningún usuario registrado en la red central." 
                });
            }

            if (datosPersona && datosPersona.cbu) {
                cbuDestinoFinal = datosPersona.cbu.trim();
                // Acoplamos el nombre del alias resuelto (la API del Central usa nombre/apellido, no firstName/lastName)
                nombreTitularFinal = `${datosPersona.nombre || ''} ${datosPersona.apellido || ''}`.trim() || "Titular No Especificado";
                console.log(`🎯 Alias traducido con éxito. Destinatario CBU: ${cbuDestinoFinal} (${nombreTitularFinal})`);
            } else {
                return res.status(400).json({ error: "El Central respondió pero no devolvió un CBU válido para ese alias." });
            }
        }
        // Nota: para CBU directo no hace falta un GET separado (el endpoint /persons/cbu/:cbu no existe;
        // el real es /persons/:cbu). El propio POST /transactions ya devuelve nombreDestino, así que
        // el nombre del titular se toma de ahí más abajo.

        // 🐛 BUG CORREGIDO: nada acá validaba que origen y destino fueran de la misma moneda —
        // se podía transferir USD a un CBU en ARS (o viceversa) sin que nadie lo impida. El
        // Central expone /accounts/{cbu}, que devuelve la moneda real de CUALQUIER cuenta
        // (se probó con curl: funciona tanto para ARS como para USD, no solo para "monedas
        // distintas de ARS" como se pensaba originalmente) — la usamos para frenar el mismatch
        // antes de mandar nada a /transactions.
        const respuestaCuentaDestino = await centralBankFetch(`/accounts/${cbuDestinoFinal}`);
        let monedaDestino = null;
        if (respuestaCuentaDestino.ok) {
            const datosCuentaDestino = await respuestaCuentaDestino.json().catch(() => null);
            monedaDestino = datosCuentaDestino?.moneda || null;
        } else if (respuestaCuentaDestino.status !== 404) {
            // El Central respondió pero no con un 404 limpio (ej. caído/timeout) — no podemos
            // confirmar la moneda del destino, así que frenamos en vez de asumir que está bien.
            return res.status(502).json({ error: "No pudimos verificar la cuenta de destino en el Banco Central. Probá de nuevo en unos minutos." });
        }
        // Un CBU sin fila en /accounts es una cuenta ARS "normal" (esa ruta solo lista las cuentas
        // con moneda propia registrada aparte) — por eso el default acá es ARS, no un rechazo.
        if ((monedaDestino || 'ARS') !== monedaOrigen) {
            return res.status(400).json({
                error: `No se puede transferir ${monedaOrigen} a una cuenta en ${monedaDestino || 'ARS'}. Elegí una cuenta destino en la misma moneda.`
            });
        }

        // 🎯 Reserva atómica del monto ANTES de tocar el Central Bank: un solo UPDATE con el
        // chequeo de saldo incluido en el WHERE, no el SELECT-y-después-UPDATE de arriba (que es
        // solo cosmético). Dos transferencias concurrentes de la misma cuenta ya no pueden pasar
        // ambas y debitar de más — la segunda pierde la carrera acá y nunca llega a mandarse al
        // Central. Si el Central termina rechazando la transferencia, se reintegra más abajo.
        const reservaOk = await Movimiento.reservarSaldoAtomico(cbu_origen, monto);
        if (!reservaOk) {
            return res.status(400).json({ error: "Saldo insuficiente", disponible: saldoDisponible });
        }
        saldoReservado = true;

        // 2. 🚀 ENVIAR TRANSFERENCIA AL CENTRAL BANK
        console.log(`📡 Enviando transaccion al central: Origen ${cbu_origen} -> Destino ${cbuDestinoFinal}`);
        const responseBCRA = await centralBankFetch('/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cbuOrigen: cbu_origen.trim(),
                cbuDestino: cbuDestinoFinal, 
                importe: Number(monto),
                saldoOrigen: Number(saldoDisponible)
            })
        });

        const dataBCRA = await responseBCRA.json();

        if (responseBCRA.status === 201 || responseBCRA.status === 200) {
            // La respuesta de POST /transactions trae el ID en "transaccionId" (no "_id"/"id" como
            // en el GET /transactions del polling) — por eso el comprobante quedaba en "Generando ID...".
            const idFinal = dataBCRA.transaccionId || dataBCRA._id || dataBCRA.id;

            // El Central ya devuelve el nombre completo del destinatario en la propia respuesta de la transacción.
            // Es la fuente más confiable (no depende de adivinar el shape de /persons), así que tiene prioridad.
            if (dataBCRA.nombreDestino) {
                nombreTitularFinal = dataBCRA.nombreDestino;
            }

            // 3. Guarda localmente pasando también el nombre del titular obtenido 🎯
            const registro = await Movimiento.registrarTransferenciaLocal(
                cbu_origen.trim(), cbuDestinoFinal, monto, idFinal, nombreTitularFinal, concepto
            );

            // 4. Armamos el comprobante completo para que el frontend lo muestre/descargue sin pedir nada más
            res.status(201).json({
                message: "¡Transferencia exitosa!",
                id: idFinal,
                comprobante: {
                    idTransaccion: idFinal,
                    fecha: registro.fechaMovimiento,
                    monto: Number(monto),
                    concepto: concepto && concepto !== 'Varios' ? concepto : null,
                    cbuOrigen: cbu_origen.trim(),
                    cbuDestino: cbuDestinoFinal,
                    nombreDestino: nombreTitularFinal,
                    bancoDestino: registro.nombreBanco
                }
            });
        } else {
            console.error("⚠️ El Central rechazó la transacción final:", dataBCRA);
            // El Central dijo que no, pero ya habíamos reservado (debitado) el monto localmente
            // para evitar la carrera — hay que devolverlo, si no el usuario pierde saldo sin que
            // la transferencia haya salido.
            await Movimiento.revertirReservaSaldo(cbu_origen, monto);
            res.status(responseBCRA.status).json({ error: "Rechazo del Central", detalle: dataBCRA });
        }
    } catch (error) {
        if (error.esRestriccionDemo) {
            return res.status(403).json({ error: error.message });
        }
        // Cualquier excepción después de reservar el saldo (ej. el registro local post-Central
        // falla) tiene que reintegrar la reserva — el Central Bank es la fuente de la verdad y ya
        // aceptó la transferencia, pero si no podemos ni dejar constancia local, mejor devolver
        // el monto y que el usuario reintente antes que perderlo silenciosamente.
        if (saldoReservado) {
            try {
                await Movimiento.revertirReservaSaldo(cbu_origen, monto);
            } catch (errorReintegro) {
                console.error("❌❌ CRÍTICO: no se pudo reintegrar una reserva de saldo tras un error:", errorReintegro.message);
            }
        }
        console.error("❌ Error en realizarTransferencia:", error.message);
        res.status(500).json({ error: "Error interno en el servidor", detalle: error.message });
    }
};

// 2. OBTENER HISTORIAL LOCAL (Versión Ultra Protegida)
exports.obtenerTransacciones = async (req, res) => {
    try {
        const queryCbu = req.query ? req.query.cbu : null;
        const paramsCbu = req.params ? req.params.cbu : null;
        const bodyCbu = req.body ? req.body.cbu : null;

        const cbu = queryCbu || paramsCbu || bodyCbu;

        if (!cbu || cbu === "undefined" || cbu === "null" || String(cbu).trim() === "") {
            console.log("⏳ Historial: Petición recibida antes de que el frontend cargue el CBU. Esperando...");
            return res.status(200).json([]);
        }

        const cbuLimpio = String(cbu).trim();
        if (!exigirCbuPropio(req, res, cbuLimpio)) return;
        console.log(`⏳ Buscando historial limpio (Anti-duplicados) para CBU: ${cbuLimpio}`);

        const movimientosLocales = await Movimiento.obtenerTodos(cbuLimpio);
        return res.status(200).json(movimientosLocales);
    } catch (error) {
        console.error("❌ Error real al traer transacciones locales:", error.message);
        return res.status(500).json({ error: "Error de servidor al leer el historial", detalle: error.message });
    }
};

// 3. POLLEAR Y SINCRONIZAR TRANSFERENCIAS RECIBIDAS
exports.sincronizarTransferenciasRecibidas = async (req, res) => {
    try {
        const minutos = req.query.minutos || 30;

        console.log(`📡 Sincronizando transacciones (ventana: ${minutos} min)`);

        const responseBCRA = await centralBankFetch(`/transactions?minutos=${minutos}`);

        const dataBCRA = await responseBCRA.json();

        if (responseBCRA.status === 200) {
            let procesadas = 0;

            if (!Array.isArray(dataBCRA)) {
                return res.status(200).json({ mensaje: "Sincronización abortada: no vino formato array." });
            }

            console.log(`🔍 Se encontraron ${dataBCRA.length} movimientos totales en el Central.`);

            for (const t of dataBCRA) {
                const idTransaccion = t._id || t.id;
                
                if (t.estado !== "aprobada") {
                    console.log(`❌ Transacción omitida (Estado: ${t.estado}): ID ${idTransaccion}`);
                    continue; 
                }

                // No filtramos por prefijo de banco: registrarIngresoExterno ya solo acredita
                // si cbuDestino corresponde a una cuenta que existe en nuestra base local
                // (así se ignoran automáticamente las transacciones donde nosotros somos el origen).
                const existe = await Movimiento.verificarExistenciaCentral(t);

                if (!existe) {
                    const acreditada = await Movimiento.registrarIngresoExterno(t);
                    if (acreditada) {
                        console.log(`   ✅ Ingreso guardado e impactado en saldo local: ID ${idTransaccion}`);
                        procesadas++;
                    } else {
                        console.log(`   ⏭️ Omitida (No es una cuenta local, somos el origen): ID ${idTransaccion}`);
                    }
                } else {
                    console.log(`   ⏭️ Omitida (Ya existía localmente): ID ${idTransaccion}`);
                }
            }
            res.status(200).json({ mensaje: `Sincronización completada. ${procesadas} nuevas acreditaciones.` });
        } else {
            res.status(responseBCRA.status).json({ error: "Error al sincronizar", detalle: dataBCRA });
        }
    } catch (error) {
        console.error("❌ ERROR EN SINCRONIZAR:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// 4. REALIZAR DEPÓSITO LOCAL
exports.realizarDeposito = async (req, res) => {
    const { cbu, monto } = req.body;

    if (!cbu || !esMontoPositivo(monto)) {
        return res.status(400).json({ error: "El CBU y un monto válido son obligatorios." });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;

    try {
        await Movimiento.registrarDepositoLocal(cbu, monto);
        res.status(201).json({ message: "¡Depósito acreditado con éxito!" });
    } catch (error) {
        console.error("❌ Error en realizarDeposito:", error.message);
        res.status(500).json({ error: "Error interno al procesar el depósito", detalle: error.message });
    }
};
// 5. REALIZAR RECARGA DE CELULAR (mock local)
exports.realizarRecarga = async (req, res) => {
    const { cbu, monto, operadora, numero } = req.body;

    if (!cbu || !esMontoPositivo(monto) || !operadora || !numero) {
        return res.status(400).json({ error: "CBU, monto, operadora y número de celular son obligatorios." });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;

    try {
        const saldoDisponible = await Movimiento.obtenerSaldo(cbu);

        if (saldoDisponible === null) {
            return res.status(404).json({ error: "Cuenta no encontrada localmente" });
        }

        if (Number(saldoDisponible) < Number(monto)) {
            return res.status(400).json({ error: "Saldo insuficiente", disponible: saldoDisponible });
        }

        await Movimiento.registrarRecargaLocal(cbu, monto, operadora, numero);
        res.status(201).json({ message: "¡Recarga realizada con éxito!" });
    } catch (error) {
        console.error("❌ Error en realizarRecarga:", error.message);
        res.status(500).json({ error: "Error interno al procesar la recarga", detalle: error.message });
    }
};

exports.buscarTitularDestino = async (req, res) => {
    const { destino } = req.params; // Puede ser CBU o Alias ingresado en el input

    if (!destino) {
        return res.status(400).json({ error: "Debe ingresar un CBU o Alias" });
    }

    const destinoLimpio = destino.trim();
    const esAlias = !/^\d{22}$/.test(destinoLimpio);

    // La ruta real de la API del Central para buscar por CBU es /persons/:cbu (NO /persons/cbu/:cbu)
    const rutaCentral = esAlias
        ? `/persons/alias/${destinoLimpio}`
        : `/persons/${destinoLimpio}`;

    try {
        const respuesta = await centralBankFetch(rutaCentral);

        const datosPersona = await respuesta.json();

        if (!respuesta.ok) {
            return res.status(404).json({ error: "Destinatario no encontrado en la red central." });
        }

        // La API del Central devuelve nombre/apellido (no firstName/lastName) y no incluye el nombre del banco
        return res.status(200).json({
            nombre: `${datosPersona.nombre || ''} ${datosPersona.apellido || ''}`.trim() || "Titular No Especificado",
            cbu: datosPersona.cbu || destinoLimpio
        });

    } catch (error) {
        console.error("❌ Error al buscar titular:", error.message);
        return res.status(500).json({ error: "Error al consultar los datos del destinatario" });
    }
};

// 7. COTIZACIÓN DEL DÓLAR (para mostrar el preview antes de confirmar el cambio)
exports.obtenerCotizacionCambio = async (req, res) => {
    try {
        const cotizacion = await obtenerCotizacionDolar();
        res.status(200).json(cotizacion);
    } catch (error) {
        console.error("❌ Error obteniendo cotización del dólar:", error.message);
        res.status(502).json({ error: "No se pudo obtener la cotización del dólar en este momento." });
    }
};

// 8. CAMBIO DE DIVISA: vender o comprar dólares contra la propia cuenta en la otra moneda
exports.realizarCambioDivisa = async (req, res) => {
    const { cbu, monto } = req.body;

    if (!cbu || !esMontoPositivo(monto)) {
        return res.status(400).json({ error: "El CBU y un monto válido son obligatorios." });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;

    try {
        const resultado = await Movimiento.cambiarDivisa(cbu, Number(monto));
        res.status(201).json({ message: "¡Cambio realizado con éxito!", ...resultado });
    } catch (error) {
        console.error("❌ Error en realizarCambioDivisa:", error.message);
        res.status(400).json({ error: error.message || "No se pudo procesar el cambio." });
    }
};