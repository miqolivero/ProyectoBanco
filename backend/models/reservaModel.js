const pool = require('../config/db');
const Movimiento = require('./movimientoModel');

class Reserva {
    // 1. LISTAR RESERVAS de una cuenta (identificada por CBU)
    static async listarPorCbu(cbu) {
        const res = await pool.query(
            `SELECT r.id_reserva, r.nombre, r.monto_objetivo, r.saldo_actual, r.fecha_meta
             FROM Reservas r
             JOIN Cuentas_Bancarias c ON c.id_cuenta = r.id_cuenta
             WHERE c.cbu = $1
             ORDER BY r.id_reserva DESC`,
            [cbu.trim()]
        );
        return res.rows;
    }

    // 2. CREAR RESERVA nueva (arranca en $0, sin mover saldo)
    static async crear(cbu, nombre, montoObjetivo, fechaMeta) {
        const resCuenta = await pool.query(
            'SELECT id_cuenta FROM Cuentas_Bancarias WHERE cbu = $1',
            [cbu.trim()]
        );
        if (resCuenta.rows.length === 0) {
            throw new Error('La cuenta asociada a ese CBU no existe.');
        }

        const res = await pool.query(
            `INSERT INTO Reservas (id_cuenta, nombre, monto_objetivo, fecha_meta)
             VALUES ($1, $2, $3, $4)
             RETURNING id_reserva, nombre, monto_objetivo, saldo_actual, fecha_meta`,
            [resCuenta.rows[0].id_cuenta, nombre.trim(), montoObjetivo || null, fechaMeta || null]
        );
        return res.rows[0];
    }

    // 3. ELIMINAR una reserva vacía (si tiene saldo, primero hay que retirarlo)
    static async eliminar(idReserva, cbu) {
        const res = await pool.query(
            `SELECT r.id_reserva, r.saldo_actual, c.cbu
             FROM Reservas r
             JOIN Cuentas_Bancarias c ON c.id_cuenta = r.id_cuenta
             WHERE r.id_reserva = $1`,
            [idReserva]
        );
        if (res.rows.length === 0) {
            throw new Error('La reserva no existe.');
        }
        const reserva = res.rows[0];
        if (reserva.cbu !== cbu.trim()) {
            throw new Error('Esa reserva no pertenece a esta cuenta.');
        }
        if (Number(reserva.saldo_actual) > 0) {
            throw new Error('Para eliminar la reserva primero tenés que retirar el saldo que tiene.');
        }

        await pool.query('DELETE FROM Reservas WHERE id_reserva = $1', [idReserva]);
        return true;
    }

    // 4. APORTAR a una reserva (mueve plata de la cuenta principal hacia el "bolsillo")
    static async aportar(idReserva, monto, cbu) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resReserva = await client.query(
                'SELECT r.id_reserva, r.nombre, r.id_cuenta, c.cbu, c.saldo FROM Reservas r JOIN Cuentas_Bancarias c ON c.id_cuenta = r.id_cuenta WHERE r.id_reserva = $1 FOR UPDATE',
                [idReserva]
            );
            if (resReserva.rows.length === 0) {
                throw new Error('La reserva no existe.');
            }
            const reserva = resReserva.rows[0];
            if (reserva.cbu !== cbu.trim()) {
                throw new Error('Esa reserva no pertenece a esta cuenta.');
            }
            if (Number(reserva.saldo) < Number(monto)) {
                throw new Error('Saldo insuficiente.');
            }

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                [Number(monto), reserva.id_cuenta]
            );
            await client.query(
                'UPDATE Reservas SET saldo_actual = saldo_actual + $1 WHERE id_reserva = $2',
                [Number(monto), idReserva]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'APORTE_RESERVA');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    reserva.id_cuenta,
                    idTipoMovimiento,
                    -Number(monto),
                    `Aporte a reserva "${reserva.nombre}"`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 5. RETIRAR de una reserva (devuelve plata del "bolsillo" a la cuenta principal)
    static async retirar(idReserva, monto, cbu) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resReserva = await client.query(
                'SELECT r.id_reserva, r.nombre, r.id_cuenta, r.saldo_actual, c.cbu FROM Reservas r JOIN Cuentas_Bancarias c ON c.id_cuenta = r.id_cuenta WHERE r.id_reserva = $1 FOR UPDATE',
                [idReserva]
            );
            if (resReserva.rows.length === 0) {
                throw new Error('La reserva no existe.');
            }
            const reserva = resReserva.rows[0];
            if (reserva.cbu !== cbu.trim()) {
                throw new Error('Esa reserva no pertenece a esta cuenta.');
            }
            if (Number(reserva.saldo_actual) < Number(monto)) {
                throw new Error('La reserva no tiene fondos suficientes.');
            }

            await client.query(
                'UPDATE Reservas SET saldo_actual = saldo_actual - $1 WHERE id_reserva = $2',
                [Number(monto), idReserva]
            );
            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2',
                [Number(monto), reserva.id_cuenta]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'RETIRO_RESERVA');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    reserva.id_cuenta,
                    idTipoMovimiento,
                    Number(monto),
                    `Retiro de reserva "${reserva.nombre}"`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Reserva;
