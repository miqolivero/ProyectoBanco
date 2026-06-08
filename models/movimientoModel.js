const pool = require('../config/db');

class Movimiento {
    // 1. OBTENER SALDO LOCAL
    static async obtenerSaldo(cbu) {
        const res = await pool.query('SELECT saldo FROM Cuentas_Bancarias WHERE cbu = $1', [cbu.trim()]);
        return res.rows.length > 0 ? res.rows[0].saldo : null;
    }

    // 2. REGISTRAR SALIDA (Modificado para guardar el idCentral que da el BCRA)
    static async registrarTransferenciaLocal(cbuOrigen, cbuDestino, monto, idCentral) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resCuenta = await client.query(
                'SELECT id_cuenta FROM Cuentas_Bancarias WHERE cbu = $1', 
                [cbuOrigen.trim()]
            );
            const idCuentaLocal = resCuenta.rows[0].id_cuenta;

            // Restamos el saldo localmente
            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2', 
                [monto, idCuentaLocal]
            );

            const bankCode = cbuDestino.substring(0, 3);
            const nombreBanco = global.diccionarioBancos[bankCode] || `Banco (${bankCode})`;

            const queryInsert = `
                INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, 
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)
            `;

            await client.query(queryInsert, [
                idCuentaLocal,
                1, // ID para 'Transferencia'
                -monto, // Negativo porque sale dinero
                `Envío a ${nombreBanco} (CBU: ${cbuDestino})`,
                cbuOrigen.trim(),
                cbuDestino.trim(),
                idCentral
            ]);

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 3. VERIFICAR SI YA EXISTE
    static async verificarExistenciaCentral(t) {
        const idCentral = t._id || t.id; 
        if (!idCentral) return false;

        const query = `
            SELECT id_movimiento FROM movimientos 
            WHERE id_transaccion_central = $1
        `;
        const res = await pool.query(query, [idCentral]);
        return res.rows.length > 0;
    }

    // 4. REGISTRAR INGRESO (Dinero recibido desde el Central)
    static async registrarIngresoExterno(t) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(
                'SELECT id_cuenta FROM Cuentas_Bancarias WHERE cbu = $1', 
                [t.cbuDestino]
            );

            if (res.rows.length > 0) {
                const idCuenta = res.rows[0].id_cuenta;
                const monto = Number(t.importe || t.monto); // Acepta ambas variantes de la API
                const idCentral = t._id || t.id;

                // Sumamos el saldo localmente
                await client.query(
                    'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2', 
                    [monto, idCuenta]
                );

                const bankCode = t.cbuOrigen.substring(0, 3);
                const nombreBanco = global.diccionarioBancos[bankCode] || "Banco Externo";
                const emisor = t.personaOrigen ? `${t.personaOrigen.nombre} ${t.personaOrigen.apellido}` : "Tercero";

                const queryInsert = `
                    INSERT INTO movimientos (
                        id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, 
                        descripcion, cbu_origen, cbu_destino, id_transaccion_central
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;

                await client.query(queryInsert, [
                    idCuenta,
                    1, 
                    monto, 
                    t.createdAt || new Date(), 
                    `Recibido de ${emisor} (${nombreBanco})`,
                    t.cbuOrigen,
                    t.cbuDestino,
                    idCentral
                ]);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

static async obtenerTodos(cbu) {
    // La query filtra para que si sos origen de un movimiento interno, veas el negativo.
    // Si sos el destino, veas el positivo. Así nunca se te duplica en tu pantalla.
    const query = `
      SELECT 
        id_movimiento,
        monto,
        fecha_movimiento,
        descripcion,
        cbu_origen,
        cbu_destino,
        id_transaccion_central
      FROM movimientos
      WHERE 
        (cbu_origen = $1 AND monto < 0)
        OR 
        (cbu_destino = $1 AND monto > 0)
      ORDER BY fecha_movimiento DESC;
    `;
    
    const { rows } = await pool.query(query, [String(cbu).trim()]);
    return rows;
}

// 5. REGISTRAR DEPÓSITO LOCAL (Efectivo por Caja/Terminal)
static async registrarDepositoLocal(cbu, monto) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Buscamos el id_cuenta asociado al CBU
        const resCuenta = await client.query(
            'SELECT id_cuenta FROM Cuentas_Bancarias WHERE cbu = $1', 
            [cbu.trim()]
        );

        if (resCuenta.rows.length === 0) {
            throw new Error("La cuenta asociada a ese CBU no existe.");
        }

        const idCuentaLocal = resCuenta.rows[0].id_cuenta;

        // Sumamos el saldo localmente
        await client.query(
            'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2', 
            [Number(monto), idCuentaLocal]
        );

        // Insertamos el movimiento en la base de datos
        const queryInsert = `
            INSERT INTO movimientos (
                id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, 
                descripcion, cbu_origen, cbu_destino, id_transaccion_central
            ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)
        `;

        await client.query(queryInsert, [
            idCuentaLocal,
            2, // ID para 'Depósito' (Asumiendo que 1 es Transferencia, podés cambiarlo si usás otro ID)
            Number(monto), // Positivo porque está ingresando dinero
            `Depósito en efectivo por Terminal`,
            cbu.trim(), // Origen es la misma cuenta
            cbu.trim(), // Destino es la misma cuenta
            null        // Al ser local, no genera ID en el Banco Central externo
        ]);

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



module.exports = Movimiento;