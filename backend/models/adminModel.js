const pool = require('../config/db');

// Código de Calamuchita Bank en la red del Banco Central: los 3 primeros dígitos de todos sus
// CBU. Sirve para distinguir, entre las transferencias, cuáles son entre clientes propios y
// cuáles cruzan a otro banco de la red de la cátedra.
const CODIGO_BANCO_PROPIO = '004';

// 🎯 Consultas del panel de gerencia. Todas son agregaciones de solo lectura sobre el banco
// entero — por eso no reciben ni filtran por persona, y por eso las protege requireGerente.
//
// Dos criterios que se repiten:
//  - Los montos se suman en SQL (DECIMAL exacto), nunca en JavaScript: sumar plata con
//    floats de JS acumula errores de redondeo.
//  - Pesos y dólares no se suman nunca entre sí. Donde importa el volumen de plata, se
//    reporta por moneda o se filtra a pesos y se aclara.
class Admin {
    // Indicadores generales del banco: clientes, cuentas y dónde está la plata de los clientes.
    static async indicadores() {
        const { rows } = await pool.query(`
            SELECT
                (SELECT count(*) FROM personas)                                         AS clientes,
                (SELECT count(*) FROM personas WHERE clerk_id IS NOT NULL)              AS clientes_con_acceso,
                (SELECT count(*) FROM cuentas_bancarias WHERE moneda = 'ARS')           AS cuentas_ars,
                (SELECT count(*) FROM cuentas_bancarias WHERE moneda = 'USD')           AS cuentas_usd,
                (SELECT COALESCE(sum(saldo), 0) FROM cuentas_bancarias WHERE moneda = 'ARS') AS saldo_ars,
                (SELECT COALESCE(sum(saldo), 0) FROM cuentas_bancarias WHERE moneda = 'USD') AS saldo_usd,

                -- Plata que salió del saldo disponible pero sigue siendo del cliente y está en el banco.
                (SELECT COALESCE(sum(r.saldo_actual), 0) FROM reservas r
                    JOIN cuentas_bancarias c ON c.id_cuenta = r.id_cuenta WHERE c.moneda = 'ARS')   AS reservas_ars,
                (SELECT COALESCE(sum(pf.capital), 0) FROM plazos_fijos pf
                    JOIN cuentas_bancarias c ON c.id_cuenta = pf.id_cuenta
                    WHERE pf.estado = 'ACTIVO' AND c.moneda = 'ARS')                                 AS plazos_fijos_ars,
                (SELECT count(*) FROM plazos_fijos WHERE estado = 'ACTIVO')                         AS plazos_fijos_activos,

                -- Cartera de crédito: lo que los clientes le deben al banco.
                (SELECT count(*) FROM prestamos WHERE estado = 'ACTIVO')                            AS prestamos_activos,
                (SELECT COALESCE(sum(cp.capital), 0) FROM cuotas_prestamo cp
                    JOIN prestamos p ON p.id_prestamo = cp.id_prestamo
                    WHERE cp.estado = 'PENDIENTE' AND p.estado = 'ACTIVO')                          AS capital_prestado_pendiente,
                (SELECT COALESCE(sum(monto), 0) FROM prestamos)                                     AS prestamos_otorgados_historico,
                (SELECT count(*) FROM tarjetas_credito)                                             AS tarjetas,
                (SELECT COALESCE(sum(monto), 0) FROM cuotas_tarjeta WHERE estado = 'PENDIENTE')     AS tarjetas_saldo_pendiente,

                (SELECT count(*) FROM polizas WHERE estado = 'ACTIVA')                              AS polizas_activas,
                (SELECT COALESCE(sum(prima_mensual), 0) FROM polizas WHERE estado = 'ACTIVA')       AS primas_mensuales,
                (SELECT count(DISTINCT id_persona) FROM ordenes_cedear)                             AS inversores_cedear,

                (SELECT count(*) FROM movimientos)                                                  AS movimientos_total,
                (SELECT count(*) FROM movimientos
                    WHERE fecha_movimiento >= CURRENT_DATE - INTERVAL '30 days')                    AS movimientos_30d
        `);
        return rows[0];
    }

    // Cuotas vencidas e impagas, de préstamos y de tarjeta. Es lo primero que un gerente mira:
    // el dinero que debería haber entrado y no entró.
    static async mora() {
        const { rows } = await pool.query(`
            WITH vencidas AS (
                SELECT p.id_persona, 'PRESTAMO' AS origen, cp.cuota AS monto, cp.fecha_vencimiento
                FROM cuotas_prestamo cp
                JOIN prestamos p ON p.id_prestamo = cp.id_prestamo
                WHERE cp.estado = 'PENDIENTE' AND cp.fecha_vencimiento < CURRENT_DATE
                UNION ALL
                SELECT pr.id_persona, 'TARJETA' AS origen, ct.monto, ct.fecha_vencimiento
                FROM cuotas_tarjeta ct
                JOIN consumos_tarjeta co ON co.id_consumo = ct.id_consumo
                JOIN tarjetas_credito t ON t.id_tarjeta = co.id_tarjeta
                JOIN productos pr ON pr.id_producto = t.id_producto
                WHERE ct.estado = 'PENDIENTE' AND ct.fecha_vencimiento < CURRENT_DATE
            )
            SELECT per.id, per.nombre, per.apellido, per.dni,
                   count(*)                                           AS cuotas,
                   sum(v.monto)                                       AS monto,
                   max(CURRENT_DATE - v.fecha_vencimiento)            AS dias_max_atraso,
                   bool_or(v.origen = 'PRESTAMO')                     AS en_prestamos,
                   bool_or(v.origen = 'TARJETA')                      AS en_tarjeta
            FROM vencidas v
            JOIN personas per ON per.id = v.id_persona
            GROUP BY per.id, per.nombre, per.apellido, per.dni
            ORDER BY monto DESC
        `);
        return rows;
    }

    // Ingresos y egresos de los últimos 12 meses. Solo pesos: sumar dólares al mismo volumen
    // mezclaría monedas.
    static async actividadMensual() {
        const { rows } = await pool.query(`
            SELECT to_char(date_trunc('month', m.fecha_movimiento), 'YYYY-MM')   AS mes,
                   count(*)                                                       AS cantidad,
                   COALESCE(sum(m.monto) FILTER (WHERE m.monto > 0), 0)           AS ingresos,
                   COALESCE(-sum(m.monto) FILTER (WHERE m.monto < 0), 0)          AS egresos
            FROM movimientos m
            JOIN cuentas_bancarias c ON c.id_cuenta = m.id_cuenta
            WHERE c.moneda = 'ARS'
              AND m.fecha_movimiento >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
            GROUP BY 1
            ORDER BY 1
        `);
        return rows;
    }

    // Qué operaciones usan los clientes. La cantidad cuenta todas las monedas; el volumen, solo pesos.
    static async operacionesPorTipo() {
        const { rows } = await pool.query(`
            SELECT tm.nombre                                                       AS tipo,
                   count(*)                                                        AS cantidad,
                   COALESCE(sum(abs(m.monto)) FILTER (WHERE c.moneda = 'ARS'), 0)  AS volumen_ars
            FROM movimientos m
            JOIN tipos_movimiento tm ON tm.id_tipo_movimiento = m.id_tipo_movimiento
            JOIN cuentas_bancarias c ON c.id_cuenta = m.id_cuenta
            GROUP BY tm.nombre
            ORDER BY cantidad DESC
        `);
        return rows;
    }

    // Transferencias agrupadas por el banco del otro lado. Para una enviada, la contraparte es el
    // destino; para una recibida, el origen. Es la foto de la interoperabilidad con la red.
    static async transferenciasPorBanco() {
        const { rows } = await pool.query(`
            SELECT CASE WHEN tm.nombre = 'TRANSFERENCIA_ENVIADA'
                        THEN left(m.cbu_destino, 3) ELSE left(m.cbu_origen, 3) END       AS codigo,
                   count(*) FILTER (WHERE tm.nombre = 'TRANSFERENCIA_ENVIADA')           AS enviadas,
                   count(*) FILTER (WHERE tm.nombre = 'TRANSFERENCIA_RECIBIDA')          AS recibidas,
                   COALESCE(sum(abs(m.monto)) FILTER (
                       WHERE tm.nombre = 'TRANSFERENCIA_ENVIADA' AND c.moneda = 'ARS'), 0) AS enviado_ars,
                   COALESCE(sum(abs(m.monto)) FILTER (
                       WHERE tm.nombre = 'TRANSFERENCIA_RECIBIDA' AND c.moneda = 'ARS'), 0) AS recibido_ars
            FROM movimientos m
            JOIN tipos_movimiento tm ON tm.id_tipo_movimiento = m.id_tipo_movimiento
            JOIN cuentas_bancarias c ON c.id_cuenta = m.id_cuenta
            WHERE tm.nombre IN ('TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECIBIDA')
              AND (CASE WHEN tm.nombre = 'TRANSFERENCIA_ENVIADA'
                        THEN m.cbu_destino ELSE m.cbu_origen END) IS NOT NULL
            GROUP BY 1
            ORDER BY (count(*)) DESC
        `);
        return rows.map(r => ({ ...r, propio: r.codigo === CODIGO_BANCO_PROPIO }));
    }

    // Los clientes con más saldo en pesos.
    static async topClientes(limite = 5) {
        const { rows } = await pool.query(`
            SELECT p.id, p.nombre, p.apellido,
                   COALESCE(sum(c.saldo) FILTER (WHERE c.moneda = 'ARS'), 0) AS saldo_ars,
                   COALESCE(sum(c.saldo) FILTER (WHERE c.moneda = 'USD'), 0) AS saldo_usd
            FROM personas p
            JOIN productos pr ON pr.id_persona = p.id
            JOIN cuentas_bancarias c ON c.id_producto = pr.id_producto
            GROUP BY p.id, p.nombre, p.apellido
            ORDER BY saldo_ars DESC
            LIMIT $1
        `, [limite]);
        return rows;
    }

    // 🎯 Control de integridad: cuentas cuyo saldo no coincide con la suma de sus movimientos.
    // Es la regla central del modelo de datos ("el saldo es la suma del historial") convertida en
    // un control que el gerente puede ver. En un banco sano esta lista está vacía; si aparece
    // algo, hay plata que ningún movimiento explica.
    static async cuentasDescuadradas() {
        const { rows } = await pool.query(`
            SELECT c.id_cuenta, c.cbu, c.moneda, c.saldo,
                   COALESCE(s.suma, 0)              AS suma_movimientos,
                   c.saldo - COALESCE(s.suma, 0)    AS diferencia,
                   p.nombre, p.apellido
            FROM cuentas_bancarias c
            LEFT JOIN (SELECT id_cuenta, sum(monto) AS suma FROM movimientos GROUP BY id_cuenta) s
                   ON s.id_cuenta = c.id_cuenta
            JOIN productos pr ON pr.id_producto = c.id_producto
            JOIN personas p ON p.id = pr.id_persona
            WHERE c.saldo <> COALESCE(s.suma, 0)
            ORDER BY abs(c.saldo - COALESCE(s.suma, 0)) DESC
        `);
        return rows;
    }

    // Cartera de clientes con su posición. No devuelve clerk_id: el gerente necesita saber si el
    // cliente tiene acceso a la app, no su identificador interno de autenticación.
    static async clientes() {
        const { rows } = await pool.query(`
            SELECT p.id, p.nombre, p.apellido, p.dni, p.email, p.telefono,
                   (p.clerk_id IS NOT NULL)                                       AS tiene_acceso,
                   count(DISTINCT c.id_cuenta)                                    AS cuentas,
                   COALESCE(sum(c.saldo) FILTER (WHERE c.moneda = 'ARS'), 0)      AS saldo_ars,
                   COALESCE(sum(c.saldo) FILTER (WHERE c.moneda = 'USD'), 0)      AS saldo_usd,
                   min(pr.fecha_alta)                                             AS cliente_desde,
                   (SELECT count(*) FROM tarjetas_credito t
                        JOIN productos pt ON pt.id_producto = t.id_producto
                        WHERE pt.id_persona = p.id)                               AS tarjetas,
                   (SELECT count(*) FROM prestamos pre
                        WHERE pre.id_persona = p.id AND pre.estado = 'ACTIVO')    AS prestamos_activos,
                   COALESCE((SELECT string_agg(r.nombre_rol, ', ' ORDER BY r.id_rol)
                        FROM roles_x_personas rp JOIN roles r ON r.id_rol = rp.id_rol
                        WHERE rp.id_persona = p.id), '')                          AS roles
            FROM personas p
            LEFT JOIN productos pr ON pr.id_persona = p.id
            LEFT JOIN cuentas_bancarias c ON c.id_producto = pr.id_producto
            GROUP BY p.id, p.nombre, p.apellido, p.dni, p.email, p.telefono, p.clerk_id
            ORDER BY p.apellido, p.nombre
        `);
        return rows;
    }

    // Últimos movimientos de todo el banco, con el cliente al que pertenecen.
    static async movimientosRecientes(limite = 15) {
        const { rows } = await pool.query(`
            SELECT m.id_movimiento, m.fecha_movimiento, tm.nombre AS tipo, m.monto, c.moneda,
                   m.descripcion, p.nombre, p.apellido,
                   (m.id_transaccion_central IS NOT NULL) AS via_banco_central
            FROM movimientos m
            JOIN tipos_movimiento tm ON tm.id_tipo_movimiento = m.id_tipo_movimiento
            JOIN cuentas_bancarias c ON c.id_cuenta = m.id_cuenta
            JOIN productos pr ON pr.id_producto = c.id_producto
            JOIN personas p ON p.id = pr.id_persona
            ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
            LIMIT $1
        `, [limite]);
        return rows;
    }
}

module.exports = Admin;
module.exports.CODIGO_BANCO_PROPIO = CODIGO_BANCO_PROPIO;
