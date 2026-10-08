const pool = require('../config/db');
const Movimiento = require('./movimientoModel');
const { obtenerTasaReferenciaPlazoFijo } = require('../config/externalApis');

const SPREAD_BPS = 200; // el banco paga 200 puntos básicos (2%) menos que la tasa de referencia
// 30 días es el mínimo real exigido por el BCRA para un plazo fijo tradicional; 180 es el
// máximo que ofrece el banco (pedido explícito: no se ofrecen plazos a 365 días).
const PLAZOS_PERMITIDOS = [30, 60, 90, 180];

class PlazoFijo {
    // 1. TASA vigente que ofrece el banco (referencia de mercado - spread)
    static async obtenerTasaVigente() {
        const tasaReferencia = await obtenerTasaReferenciaPlazoFijo();
        const tnaOfrecida = tasaReferencia - (SPREAD_BPS / 100);
        return {
            tasaReferencia: Number(tasaReferencia.toFixed(3)),
            spreadBps: SPREAD_BPS,
            tnaOfrecida: Number(tnaOfrecida.toFixed(3)),
            plazosPermitidos: PLAZOS_PERMITIDOS
        };
    }

    // 2. LISTAR plazos fijos de una cuenta, con info de si ya se puede liquidar
    static async listarPorCbu(cbu) {
        const res = await pool.query(
            `SELECT pf.id_plazo_fijo, pf.capital, pf.tna, pf.fecha_alta, pf.fecha_vencimiento, pf.estado
             FROM Plazos_Fijos pf
             JOIN Cuentas_Bancarias c ON c.id_cuenta = pf.id_cuenta
             WHERE c.cbu = $1
             ORDER BY pf.fecha_alta DESC`,
            [cbu.trim()]
        );
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        return res.rows.map(pf => {
            const vencimiento = new Date(pf.fecha_vencimiento);
            const diasRestantes = Math.max(0, Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24)));
            const diasTotales = Math.round((vencimiento - new Date(pf.fecha_alta)) / (1000 * 60 * 60 * 24));
            const interesEstimado = Number(pf.capital) * (Number(pf.tna) / 100) * (diasTotales / 365);
            return {
                ...pf,
                diasRestantes,
                puedeLiquidar: pf.estado === 'ACTIVO' && diasRestantes === 0,
                interesEstimado: Number(interesEstimado.toFixed(2))
            };
        });
    }

    // 3. CONSTITUIR un plazo fijo nuevo (debita la cuenta)
    static async constituir(cbu, capital, plazoDias) {
        if (!PLAZOS_PERMITIDOS.includes(Number(plazoDias))) {
            throw new Error(`El plazo debe ser uno de: ${PLAZOS_PERMITIDOS.join(', ')} días.`);
        }

        const { tnaOfrecida } = await PlazoFijo.obtenerTasaVigente();

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resCuenta = await client.query(
                'SELECT id_cuenta, saldo FROM Cuentas_Bancarias WHERE cbu = $1 FOR UPDATE',
                [cbu.trim()]
            );
            if (resCuenta.rows.length === 0) {
                throw new Error('La cuenta asociada a ese CBU no existe.');
            }
            const cuenta = resCuenta.rows[0];
            if (Number(cuenta.saldo) < Number(capital)) {
                throw new Error('Saldo insuficiente.');
            }

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                [Number(capital), cuenta.id_cuenta]
            );

            const resPlazoFijo = await client.query(
                `INSERT INTO Plazos_Fijos (id_cuenta, capital, tna, fecha_alta, fecha_vencimiento, estado)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_DATE + $4::int, 'ACTIVO')
                 RETURNING id_plazo_fijo, capital, tna, fecha_alta, fecha_vencimiento, estado`,
                [cuenta.id_cuenta, Number(capital), tnaOfrecida, Number(plazoDias)]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PLAZO_FIJO_CONSTITUCION');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    cuenta.id_cuenta,
                    idTipoMovimiento,
                    -Number(capital),
                    `Constitución de Plazo Fijo a ${plazoDias} días (TNA ${tnaOfrecida}%)`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            await client.query('COMMIT');
            return resPlazoFijo.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 4. LIQUIDAR un plazo fijo ya vencido (acredita capital + interés)
    static async liquidar(idPlazoFijo, cbu) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resPlazoFijo = await client.query(
                `SELECT pf.id_plazo_fijo, pf.id_cuenta, pf.capital, pf.tna, pf.fecha_alta, pf.fecha_vencimiento, pf.estado, c.cbu
                 FROM Plazos_Fijos pf
                 JOIN Cuentas_Bancarias c ON c.id_cuenta = pf.id_cuenta
                 WHERE pf.id_plazo_fijo = $1
                 FOR UPDATE`,
                [idPlazoFijo]
            );
            if (resPlazoFijo.rows.length === 0) {
                throw new Error('El plazo fijo no existe.');
            }
            const pf = resPlazoFijo.rows[0];

            if (pf.cbu !== cbu.trim()) {
                throw new Error('Ese plazo fijo no pertenece a esta cuenta.');
            }
            if (pf.estado !== 'ACTIVO') {
                throw new Error('Ese plazo fijo ya fue liquidado.');
            }

            const resFecha = await client.query('SELECT CURRENT_DATE < $1::date AS todavia_no_vencio', [pf.fecha_vencimiento]);
            if (resFecha.rows[0].todavia_no_vencio) {
                const vencStr = new Date(pf.fecha_vencimiento).toLocaleDateString('es-AR');
                throw new Error(`Todavía no llegaste a la fecha de vencimiento (${vencStr}). No se puede cobrar antes de tiempo.`);
            }

            const diasTotales = Math.round((new Date(pf.fecha_vencimiento) - new Date(pf.fecha_alta)) / (1000 * 60 * 60 * 24));
            const interes = Number(pf.capital) * (Number(pf.tna) / 100) * (diasTotales / 365);
            const totalACreditar = Number(pf.capital) + interes;

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2',
                [totalACreditar, pf.id_cuenta]
            );
            await client.query(
                "UPDATE Plazos_Fijos SET estado = 'VENCIDO' WHERE id_plazo_fijo = $1",
                [idPlazoFijo]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PLAZO_FIJO_LIQUIDACION');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    pf.id_cuenta,
                    idTipoMovimiento,
                    totalACreditar,
                    `Liquidación de Plazo Fijo: capital $${Number(pf.capital).toFixed(2)} + interés $${interes.toFixed(2)}`,
                    pf.cbu,
                    pf.cbu,
                    null
                ]
            );

            await client.query('COMMIT');
            return { capital: Number(pf.capital), interes: Number(interes.toFixed(2)), total: Number(totalACreditar.toFixed(2)) };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = PlazoFijo;
