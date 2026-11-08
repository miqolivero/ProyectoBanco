const pool = require('../config/db');
const { SQL_HOY, SQL_INICIO_MES, ZONA_HORARIA } = require('../utils/fechas');
const { IVA_PORCENTAJE, COMISION_QR_PORCENTAJE, COMISION_QR_TOPE_GRATIS_MENSUAL } = require('../utils/costos');
const { EVENTOS_HABILITADOS } = require('../config/funcionalidades');
// Con los eventos apagados ("Próximamente"), ningún cobro toma promo ni se presenta como de un
// comercio adherido: es un cobro común, sin descuento. Constante nuestra, no dato del usuario.
const SQL_EVENTOS_HABILITADOS = EVENTOS_HABILITADOS ? 'true' : 'false';

// Columnas del detalle de un cobro, con todo lo que necesitan tanto la pantalla del que cobra
// como la del que paga. Fechas DATE como texto (ver Persona.obtenerBonificacion).
const SELECT_DETALLE = `
    SELECT co.id_cobro, co.precio, co.descripcion, co.porcentaje_descuento, co.descuento,
           co.tope_aplicado, co.monto_pagado, co.estado, co.fecha_creacion, co.fecha_pago,
           co.id_transaccion_central, co.id_cuenta_cobradora, co.id_adhesion,
           co.comision, co.iva_comision, co.comision_debitada,
           (co.monto_pagado - co.comision - co.iva_comision)::numeric(15, 2) AS neto_comercio,
           cc.cbu AS cbu_cobrador,
           prc.id_persona AS id_persona_cobradora,
           TRIM(pc.nombre || ' ' || pc.apellido) AS titular_cobrador,
           e.nombre AS evento_nombre, e.ciudad AS evento_ciudad, e.tope_descuento AS evento_tope,
           a.nombre_comercial, a.rubro,
           prp.id_persona AS id_persona_pagadora
    FROM Cobros co
    JOIN Cuentas_Bancarias cc ON cc.id_cuenta = co.id_cuenta_cobradora
    JOIN Productos prc ON prc.id_producto = cc.id_producto
    JOIN Personas pc ON pc.id = prc.id_persona
    LEFT JOIN Eventos e ON e.id_evento = co.id_evento
    LEFT JOIN Adhesiones_Evento a ON a.id_adhesion = co.id_adhesion
    LEFT JOIN Cuentas_Bancarias cp ON cp.id_cuenta = co.id_cuenta_pagadora
    LEFT JOIN Productos prp ON prp.id_producto = cp.id_producto
`;

// Lo que una cuenta ya recibió por QR en el mes calendario actual de Córdoba ($1 = id_cuenta).
// Cuenta también los PROCESANDO (pagos en curso, de pocos segundos), para que dos pagos
// simultáneos no puedan pasar el límite juntos.
const SQL_COBRADO_EN_EL_MES = `
    SELECT COALESCE(SUM(monto_pagado), 0) AS cobrado
    FROM Cobros
    WHERE id_cuenta_cobradora = $1
      AND (estado = 'PROCESANDO'
           OR (estado = 'PAGADO'
               AND (fecha_pago AT TIME ZONE '${ZONA_HORARIA}') >= ${SQL_INICIO_MES}
               AND (fecha_pago AT TIME ZONE '${ZONA_HORARIA}') < ${SQL_INICIO_MES} + INTERVAL '1 month'))
`;

// Error con lo que le queda disponible en el mes, para que el controller arme el mensaje.
function errorLimiteMensual(disponible) {
    const error = new Error('Límite mensual de cobros con QR superado.');
    error.code = 'LIMITE_MENSUAL';
    error.disponible = disponible;
    return error;
}

class Cobro {
    // Cuenta + estado del producto, para validar que la cuenta que cobra o paga esté operativa.
    static async obtenerCuenta(cbu) {
        const res = await pool.query(
            `SELECT c.id_cuenta, c.cbu, c.moneda, c.saldo, pr.id_persona, ep.nombre AS estado_producto
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             JOIN Estados_Producto ep ON ep.id_estado_producto = pr.id_estado_producto
             WHERE c.cbu = $1`,
            [String(cbu).trim()]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // 🎯 Crea el cobro y le asocia la promo: aplica sola si la cuenta tiene una adhesión APROBADA
    // a un evento activo y vigente hoy en Córdoba — el que cobra no elige nada. Si califica para
    // más de un evento a la vez, se usa el de mayor descuento (el más favorable para el cliente).
    // El DESCUENTO en pesos todavía no se fija acá: el tope del evento es por cliente (lo que ya
    // descontó en todo el evento), y al generar el QR no se sabe quién va a pagar. Se calcula
    // al pagar (ver calcularDescuento / tomarParaPago); hasta entonces descuento = 0 y
    // monto_pagado = precio.
    // `precio` llega como texto ya normalizado ('10000.00'), ver normalizarMontoDecimal.
    // 🎯 Límite mensual: se inserta y, en la misma transacción, se compara lo ya cobrado en el
    // mes + el precio de este cobro contra el límite. Si se pasa, se deshace y se lanza
    // LIMITE_MENSUAL. Es un aviso temprano (con el precio sin descuento, el caso más exigente):
    // el control que manda es el de tomarParaPago, con el monto final real.
    static async crear(idCuentaCobradora, precio, descripcion, limiteMensual) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const res = await client.query(
                `WITH promo AS (
                     SELECT a.id_adhesion, e.id_evento, e.porcentaje_descuento
                     FROM Adhesiones_Evento a
                     JOIN Eventos e ON e.id_evento = a.id_evento
                     WHERE a.id_cuenta = $1
                       AND ${SQL_EVENTOS_HABILITADOS}
                       AND a.estado = 'APROBADA'
                       AND e.activo
                       AND ${SQL_HOY} BETWEEN e.fecha_inicio AND e.fecha_fin
                     ORDER BY e.porcentaje_descuento DESC, e.tope_descuento DESC, e.id_evento
                     LIMIT 1
                 )
                 INSERT INTO Cobros (id_cuenta_cobradora, precio, descripcion, id_evento, id_adhesion,
                                     porcentaje_descuento, descuento, tope_aplicado, monto_pagado)
                 SELECT $1, $2::numeric, $3, p.id_evento, p.id_adhesion,
                        COALESCE(p.porcentaje_descuento, 0), 0, false, $2::numeric
                 FROM (SELECT 1) AS base
                 LEFT JOIN promo p ON true
                 RETURNING id_cobro, monto_pagado`,
                [idCuentaCobradora, precio, descripcion]
            );
            const { id_cobro: idCobro, monto_pagado: montoPagado } = res.rows[0];

            const limite = await Cobro.verificarLimite(client, idCuentaCobradora, montoPagado, limiteMensual);
            if (!limite.entra) {
                await client.query('ROLLBACK');
                throw errorLimiteMensual(limite.disponible);
            }

            await client.query('COMMIT');
            return Cobro.obtenerPorId(idCobro);
        } catch (error) {
            if (error.code !== 'LIMITE_MENSUAL') await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 🎯 Descuento de un cobro para UN cliente puntual, todo en NUMERIC:
    //   descuento_bruto = precio × % del evento
    //   disponible      = tope del evento − lo que este cliente ya descontó en el mismo evento
    //                     (cobros PAGADOS o en curso, con cualquiera de sus cuentas, en cualquier
    //                     comercio adherido)
    //   descuento       = MIN(descuento_bruto, disponible)
    //   monto_pagado    = precio − descuento   (lo que paga el cliente y recibe el comercio)
    // Sin promo, todo da 0. Sirve para mostrar el desglose antes de pagar y para fijarlo al pagar.
    static async calcularDescuento(idCobro, idPersonaPagadora, clientOPool = pool) {
        const res = await clientOPool.query(
            `WITH base AS (
                 SELECT co.precio,
                        e.tope_descuento AS tope,
                        ROUND(co.precio * co.porcentaje_descuento / 100, 2) AS bruto,
                        GREATEST(COALESCE(e.tope_descuento, 0) - COALESCE(usado.total, 0), 0) AS disponible
                 FROM Cobros co
                 LEFT JOIN Eventos e ON e.id_evento = co.id_evento
                 LEFT JOIN LATERAL (
                     SELECT SUM(c2.descuento) AS total
                     FROM Cobros c2
                     JOIN Cuentas_Bancarias cb ON cb.id_cuenta = c2.id_cuenta_pagadora
                     JOIN Productos pr ON pr.id_producto = cb.id_producto
                     WHERE c2.id_evento = co.id_evento
                       AND c2.id_cobro <> co.id_cobro
                       AND c2.estado IN ('PAGADO', 'PROCESANDO')
                       AND pr.id_persona = $2
                 ) usado ON true
                 WHERE co.id_cobro = $1
             )
             SELECT precio, tope,
                    disponible::numeric(15, 2) AS disponible,
                    LEAST(bruto, disponible)::numeric(15, 2) AS descuento,
                    (precio - LEAST(bruto, disponible))::numeric(15, 2) AS monto_pagado,
                    (bruto > disponible) AS tope_aplicado
             FROM base`,
            [idCobro, idPersonaPagadora]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // 🎯 Comisión del comercio por un cobro de `monto` (ya con el descuento aplicado):
    //   - Si lo cobrado en el mes + este cobro no pasa el tope gratis → $0.
    //   - Si lo pasa → % del TOTAL del cobro (no solo de lo que excede) + IVA sobre la comisión.
    // Se calcula dentro de tomarParaPago, con la cuenta del comercio ya bloqueada.
    static async calcularComision(client, idCuenta, monto) {
        const res = await client.query(
            `WITH mes AS (${SQL_COBRADO_EN_EL_MES}),
             base AS (
                 SELECT (mes.cobrado + $2::numeric) > $3::numeric AS paga,
                        ROUND($2::numeric * $4::numeric / 100, 2) AS comision
                 FROM mes
             )
             SELECT CASE WHEN paga THEN comision ELSE 0 END::numeric(15, 2) AS comision,
                    CASE WHEN paga THEN ROUND(comision * $5::numeric / 100, 2) ELSE 0 END::numeric(15, 2) AS iva_comision
             FROM base`,
            [idCuenta, monto, COMISION_QR_TOPE_GRATIS_MENSUAL, COMISION_QR_PORCENTAJE, IVA_PORCENTAJE]
        );
        return res.rows[0];
    }

    // Cómo viene el mes del comercio: cuánto cobró, cuánto le queda sin comisión y las condiciones.
    // Lo muestra la pantalla de Cobrar con QR.
    static async resumenDelMes(idCuenta, limiteMensual) {
        const res = await pool.query(
            `WITH mes AS (${SQL_COBRADO_EN_EL_MES})
             SELECT mes.cobrado::numeric(15, 2) AS cobrado,
                    $2::numeric(15, 2) AS tope_gratis,
                    GREATEST($2::numeric - mes.cobrado, 0)::numeric(15, 2) AS restante_gratis,
                    $3::numeric(15, 2) AS limite_mensual,
                    GREATEST($3::numeric - mes.cobrado, 0)::numeric(15, 2) AS restante_limite
             FROM mes`,
            [idCuenta, COMISION_QR_TOPE_GRATIS_MENSUAL, limiteMensual]
        );
        return { ...res.rows[0], comision_porcentaje: COMISION_QR_PORCENTAJE, iva_porcentaje: IVA_PORCENTAJE };
    }

    // 🎯 Debita la comisión de un cobro pagado, UNA sola vez, en el momento en que el ingreso ya
    // está acreditado en la cuenta del comercio. Se llama desde los dos lados que pueden llegar
    // último (lo que pase después de que la transferencia salió):
    //   - la sincronización con el Central, al registrar el ingreso (Movimiento.registrarIngresoExterno);
    //   - el pago, al marcar el cobro como PAGADO (debitarComisionPendiente).
    // Si todavía falta alguna de las dos cosas, no hace nada y lo resuelve la otra. El FOR UPDATE
    // sobre el cobro + la marca comision_debitada evitan que se debite dos veces.
    // Corre dentro de la transacción de `client` (el que llama hace BEGIN/COMMIT).
    static async debitarComision(client, idTransaccionCentral) {
        if (!idTransaccionCentral) return false;
        const resCobro = await client.query(
            `SELECT co.id_cobro, co.comision, co.iva_comision, co.precio, co.monto_pagado,
                    co.id_cuenta_cobradora, c.cbu
             FROM Cobros co
             JOIN Cuentas_Bancarias c ON c.id_cuenta = co.id_cuenta_cobradora
             WHERE co.id_transaccion_central = $1
               AND co.estado = 'PAGADO'
               AND NOT co.comision_debitada
               AND (co.comision + co.iva_comision) > 0
             FOR UPDATE OF co`,
            [idTransaccionCentral]
        );
        if (resCobro.rows.length === 0) return false;
        const cobro = resCobro.rows[0];

        const resIngreso = await client.query(
            `SELECT 1 FROM movimientos
             WHERE id_transaccion_central = $1 AND id_cuenta = $2 AND monto > 0`,
            [idTransaccionCentral, cobro.id_cuenta_cobradora]
        );
        if (resIngreso.rows.length === 0) return false;

        await client.query(
            `UPDATE Cuentas_Bancarias SET saldo = saldo - ($1::numeric + $2::numeric) WHERE id_cuenta = $3`,
            [cobro.comision, cobro.iva_comision, cobro.id_cuenta_cobradora]
        );
        await client.query(
            `INSERT INTO movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                                      descripcion, cbu_origen, cbu_destino, id_transaccion_central)
             SELECT $1, tm.id_tipo_movimiento, -($2::numeric + $3::numeric), CURRENT_TIMESTAMP,
                    $4, $5, $5, NULL
             FROM Tipos_Movimiento tm WHERE tm.nombre = 'COMISION_COBRO_QR'`,
            [cobro.id_cuenta_cobradora, cobro.comision, cobro.iva_comision,
             `Comisión cobro con QR (${COMISION_QR_PORCENTAJE}% + IVA ${IVA_PORCENTAJE}%) sobre $${cobro.monto_pagado}`,
             cobro.cbu]
        );
        await client.query('UPDATE Cobros SET comision_debitada = true WHERE id_cobro = $1', [cobro.id_cobro]);
        return true;
    }

    // Versión con transacción propia, para llamarla después de confirmarPago.
    static async debitarComisionPendiente(idTransaccionCentral) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const debitada = await Cobro.debitarComision(client, idTransaccionCentral);
            await client.query('COMMIT');
            return debitada;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ¿Entra `monto` en lo que le queda del mes a la cuenta? La cuenta en NUMERIC la hace Postgres.
    static async verificarLimite(client, idCuenta, monto, limiteMensual) {
        const res = await client.query(
            `WITH mes AS (${SQL_COBRADO_EN_EL_MES})
             SELECT (mes.cobrado + $2::numeric) <= $3::numeric AS entra,
                    GREATEST($3::numeric - mes.cobrado, 0)::numeric(15, 2) AS disponible
             FROM mes`,
            [idCuenta, monto, limiteMensual]
        );
        return res.rows[0];
    }

    static async obtenerPorId(idCobro) {
        const res = await pool.query(`${SELECT_DETALLE} WHERE co.id_cobro = $1`, [idCobro]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // ¿La cuenta que cobra es HOY un comercio adherido aprobado de algún evento vigente? Es lo
    // que decide, al pagar, si se muestra "comercio adherido" en vez de la advertencia de CBU
    // nuevo. Se consulta en el momento del pago (no se copia del cobro): si la adhesión se
    // suspendió entre que se generó el QR y que se paga, ya no se presenta como adherido.
    static async adhesionVigente(idCuenta) {
        if (!EVENTOS_HABILITADOS) return null;
        const res = await pool.query(
            `SELECT a.id_adhesion, a.nombre_comercial, a.rubro, e.nombre AS evento_nombre
             FROM Adhesiones_Evento a
             JOIN Eventos e ON e.id_evento = a.id_evento
             WHERE a.id_cuenta = $1
               AND a.estado = 'APROBADA'
               AND e.activo
               AND ${SQL_HOY} BETWEEN e.fecha_inicio AND e.fecha_fin
             ORDER BY e.porcentaje_descuento DESC, e.id_evento
             LIMIT 1`,
            [idCuenta]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // 🎯 "Tomar" el cobro para pagarlo: PENDIENTE → PROCESANDO en un solo UPDATE condicional.
    // Si dos personas confirman a la vez, Postgres serializa las dos sentencias sobre la misma
    // fila y la segunda ya no encuentra el estado PENDIENTE: no actualiza nada y devuelve null.
    // Así es imposible pagar dos veces el mismo cobro, y tampoco se puede cancelar mientras se
    // está pagando (cancelar exige PENDIENTE).
    // Acá también se FIJA el descuento del cliente (ver calcularDescuento) y se hacen cumplir los
    // dos límites, cada uno con su bloqueo para que dos pagos simultáneos no lean la misma suma
    // vieja y se pasen juntos:
    //   - el tope del evento del cliente: se bloquea la fila de la persona que paga (dos pagos
    //     suyos a la vez, en comercios distintos, no pueden usar el mismo saldo de descuento);
    //   - el límite mensual del comercio: se bloquea la fila de su cuenta.
    // Los bloqueos se toman siempre en el mismo orden (cobro → persona → cuenta del comercio),
    // así dos pagos no pueden quedar esperándose entre sí.
    // Devuelve null si el cobro ya no estaba PENDIENTE, o { excedeLimite, disponible } si no
    // entra en el límite del mes del comercio.
    static async tomarParaPago(idCobro, idCuentaPagadora, idPersonaPagadora, limiteMensual) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resCobro = await client.query(
                `SELECT id_cuenta_cobradora FROM Cobros
                 WHERE id_cobro = $1 AND estado = 'PENDIENTE'
                 FOR UPDATE`,
                [idCobro]
            );
            if (resCobro.rows.length === 0) {
                await client.query('ROLLBACK');
                return null;
            }
            const { id_cuenta_cobradora: idCuentaCobradora } = resCobro.rows[0];

            await client.query('SELECT 1 FROM Personas WHERE id = $1 FOR UPDATE', [idPersonaPagadora]);
            const calculo = await Cobro.calcularDescuento(idCobro, idPersonaPagadora, client);

            await client.query('SELECT 1 FROM Cuentas_Bancarias WHERE id_cuenta = $1 FOR UPDATE', [idCuentaCobradora]);
            const limite = await Cobro.verificarLimite(client, idCuentaCobradora, calculo.monto_pagado, limiteMensual);
            if (!limite.entra) {
                await client.query('ROLLBACK');
                return { excedeLimite: true, disponible: limite.disponible };
            }

            const comision = await Cobro.calcularComision(client, idCuentaCobradora, calculo.monto_pagado);

            const res = await client.query(
                `UPDATE Cobros
                 SET estado = 'PROCESANDO', id_cuenta_pagadora = $2,
                     descuento = $3, monto_pagado = $4, tope_aplicado = $5,
                     comision = $6, iva_comision = $7
                 WHERE id_cobro = $1
                 RETURNING id_cobro, monto_pagado, descuento`,
                [idCobro, idCuentaPagadora, calculo.descuento, calculo.monto_pagado, calculo.tope_aplicado,
                 comision.comision, comision.iva_comision]
            );
            await client.query('COMMIT');
            return res.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // La transferencia salió: PROCESANDO → PAGADO, con la fecha y el id del Central (que es el
    // mismo que quedó en el movimiento, así el cobro y la transferencia quedan vinculados).
    static async confirmarPago(idCobro, idTransaccionCentral) {
        const res = await pool.query(
            `UPDATE Cobros SET estado = 'PAGADO', fecha_pago = now(), id_transaccion_central = $2
             WHERE id_cobro = $1 AND estado = 'PROCESANDO'
             RETURNING id_cobro`,
            [idCobro, idTransaccionCentral]
        );
        return res.rows.length > 0;
    }

    // La transferencia no salió (saldo, rechazo del Central, error): el cobro vuelve a quedar
    // disponible para pagarse, y el descuento que se había fijado para ese cliente se deshace
    // (no le consume tope del evento a nadie).
    static async liberarPago(idCobro) {
        await pool.query(
            `UPDATE Cobros
             SET estado = 'PENDIENTE', id_cuenta_pagadora = NULL,
                 descuento = 0, monto_pagado = precio, tope_aplicado = false,
                 comision = 0, iva_comision = 0
             WHERE id_cobro = $1 AND estado = 'PROCESANDO'`,
            [idCobro]
        );
    }

    // Solo el dueño de la cuenta que cobra, y solo si sigue PENDIENTE (uno pagado o en pleno
    // pago no se puede cancelar). Devuelve false si no se canceló.
    static async cancelar(idCobro, idPersona) {
        const res = await pool.query(
            `UPDATE Cobros co SET estado = 'CANCELADO'
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE co.id_cobro = $1
               AND co.estado = 'PENDIENTE'
               AND c.id_cuenta = co.id_cuenta_cobradora
               AND pr.id_persona = $2
             RETURNING co.id_cobro`,
            [idCobro, idPersona]
        );
        return res.rows.length > 0;
    }

    // Últimos cobros generados por la persona (con cualquiera de sus cuentas).
    static async listarDePersona(idPersona, limite = 8) {
        const res = await pool.query(
            `${SELECT_DETALLE}
             WHERE prc.id_persona = $1
             ORDER BY co.fecha_creacion DESC
             LIMIT $2`,
            [idPersona, limite]
        );
        return res.rows;
    }

    // "Ahorraste con Calamuchita": suma de los descuentos que la persona recibió COMO PAGADORA
    // en cobros pagados durante el mes calendario actual de Córdoba. La suma la hace Postgres
    // en NUMERIC y vuelve como texto ('1500.00').
    static async ahorroDelMes(idPersona) {
        const res = await pool.query(
            `SELECT COALESCE(SUM(co.descuento), 0)::numeric(15, 2) AS ahorro,
                    COUNT(*) FILTER (WHERE co.descuento > 0) AS compras_con_descuento
             FROM Cobros co
             JOIN Cuentas_Bancarias c ON c.id_cuenta = co.id_cuenta_pagadora
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE pr.id_persona = $1
               AND co.estado = 'PAGADO'
               AND (co.fecha_pago AT TIME ZONE '${ZONA_HORARIA}') >= ${SQL_INICIO_MES}
               AND (co.fecha_pago AT TIME ZONE '${ZONA_HORARIA}') < ${SQL_INICIO_MES} + INTERVAL '1 month'`,
            [idPersona]
        );
        return res.rows[0];
    }
}

module.exports = Cobro;
