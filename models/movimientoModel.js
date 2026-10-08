const pool = require('../config/db');
const { esMontoPositivo } = require('../utils/validaciones');

// Tope diario de ingreso de dinero (depósitos), por moneda de la cuenta. Pedido explícito:
// $10.000.000 ARS y US$5.000 por día. Se mide sobre la suma de depósitos (tipo CREDITO,
// exclusivo de registrarDepositoLocal) ya acreditados hoy en esa cuenta — no cuenta lo
// recibido por transferencia, préstamo, etc., solo lo que entra por "Cargar Dinero".
const TOPE_DIARIO_DEPOSITO_ARS = 10000000;
const TOPE_DIARIO_DEPOSITO_USD = 5000;

class Movimiento {
    // 1. OBTENER SALDO LOCAL
    static async obtenerSaldo(cbu) {
        const res = await pool.query('SELECT saldo FROM Cuentas_Bancarias WHERE cbu = $1', [cbu.trim()]);
        return res.rows.length > 0 ? res.rows[0].saldo : null;
    }

    // Saldo + moneda (+ alias) juntos: lo usa la transferencia para validar que origen y destino
    // sean de la misma moneda antes de mandar nada al Central (ver realizarTransferencia), y
    // también el asistente de IA para responder preguntas de saldo con el dato real (antes
    // devolvía solo cbu/moneda y el modelo terminaba inventando un monto).
    static async obtenerCuentaPorCbu(cbu) {
        const res = await pool.query('SELECT saldo, moneda, alias FROM Cuentas_Bancarias WHERE cbu = $1', [cbu.trim()]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // Busca el id de un tipo de movimiento por nombre en vez de hardcodearlo:
    // los IDs de Tipos_Movimiento no son estables entre entornos (ver init/01_schema.sql
    // vs la base real), así que resolvemos siempre por nombre.
    static async obtenerIdTipoMovimiento(clientOPool, nombre) {
        const res = await clientOPool.query(
            'SELECT id_tipo_movimiento FROM Tipos_Movimiento WHERE nombre = $1',
            [nombre]
        );
        if (res.rows.length === 0) {
            throw new Error(`No existe el tipo de movimiento '${nombre}' en Tipos_Movimiento`);
        }
        return res.rows[0].id_tipo_movimiento;
    }

    // 🎯 Reserva atómica de saldo: un solo UPDATE con la condición de saldo incluida en el WHERE
    // (no un SELECT y después un UPDATE separado) — así dos transferencias concurrentes de la
    // misma cuenta no pueden pasar ambas el chequeo de saldo con el mismo valor "viejo" y debitar
    // las dos. Devuelve true si alcanzó el saldo (y ya quedó debitado), false si no alcanzaba.
    // Se llama ANTES de mandar nada al Central Bank — si no hay saldo, ni se intenta la transferencia
    // externa. Si el Central rechaza la transferencia después de reservado, hay que reintegrar
    // con acreditarAtomico (ver revertirReservaSaldo).
    static async reservarSaldoAtomico(cbu, monto) {
        if (!esMontoPositivo(monto)) {
            throw new Error('El monto debe ser mayor a cero.');
        }
        const res = await pool.query(
            'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE cbu = $2 AND saldo >= $1 RETURNING saldo',
            [monto, cbu.trim()]
        );
        return res.rows.length > 0;
    }

    // Reintegra una reserva de saldo que no se pudo concretar (ej. el Central rechazó la
    // transferencia después de que ya debitamos localmente para reservar el monto).
    static async revertirReservaSaldo(cbu, monto) {
        await pool.query(
            'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE cbu = $2',
            [monto, cbu.trim()]
        );
    }

   // 2. REGISTRAR SALIDA (Modificado para guardar el Titular y el idCentral)
    // Devuelve los datos del movimiento insertado (para armar el comprobante en el controller)
    // en vez de un simple `true`, y ahora acepta un concepto opcional que se anexa a la descripción.
    // 🎯 Ya NO debita saldo acá — el débito ocurre antes, de forma atómica, vía
    // reservarSaldoAtomico (llamado por el controller antes de tocar el Central Bank). Este método
    // solo inserta el movimiento una vez que la transferencia externa ya se confirmó.
    static async registrarTransferenciaLocal(cbuOrigen, cbuDestino, monto, idCentral, nombreTitular = "Titular No Especificado", concepto = null) {
        if (!esMontoPositivo(monto)) {
            throw new Error('El monto de la transferencia debe ser mayor a cero.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resCuenta = await client.query(
                'SELECT id_cuenta FROM Cuentas_Bancarias WHERE cbu = $1',
                [cbuOrigen.trim()]
            );
            const idCuentaLocal = resCuenta.rows[0].id_cuenta;

            const bankCode = cbuDestino.substring(0, 3);
            const nombreBanco = global.diccionarioBancos[bankCode] || `Banco (${bankCode})`;

            const queryInsert = `
                INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)
                RETURNING id_movimiento, fecha_movimiento
            `;

            // 🎯 Ahora la descripción guarda dinámicamente el nombre del Titular y el Banco
            // (y el concepto, si el usuario eligió uno distinto del default "Varios")
            const descripcionFormateada = (concepto && concepto !== 'Varios')
                ? `Envío a ${nombreTitular} (${nombreBanco}) - ${concepto}`
                : `Envío a ${nombreTitular} (${nombreBanco})`;

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'TRANSFERENCIA_ENVIADA');

            const resInsert = await client.query(queryInsert, [
                idCuentaLocal,
                idTipoMovimiento,
                -monto, // Negativo porque sale dinero
                descripcionFormateada,
                cbuOrigen.trim(),
                cbuDestino.trim(),
                idCentral
            ]);

            await client.query('COMMIT');
            return {
                idMovimiento: resInsert.rows[0].id_movimiento,
                fechaMovimiento: resInsert.rows[0].fecha_movimiento,
                nombreBanco
            };
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

                const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'TRANSFERENCIA_RECIBIDA');

                await client.query(queryInsert, [
                    idCuenta,
                    idTipoMovimiento,
                    monto,
                    t.createdAt || new Date(), 
                    `Recibido de ${emisor} (${nombreBanco})`,
                    t.cbuOrigen,
                    t.cbuDestino,
                    idCentral
                ]);
            }

            await client.query('COMMIT');
            return res.rows.length > 0;
        } catch (error) {
            await client.query('ROLLBACK');
            // 23505 = violación de unique constraint. Con el índice único sobre
            // id_transaccion_central (ver init/01_schema.sql), esto significa que otro pedido de
            // sincronización concurrente (dos pestañas, o el propio reintento del polling) ya
            // insertó esta misma transferencia externa un instante antes — no es un error real,
            // es exactamente el caso que el índice existe para frenar. No hay nada que acreditar
            // de nuevo, así que lo tratamos como éxito idempotente en vez de propagar el error.
            if (error.code === '23505') {
                return false;
            }
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
        m.id_movimiento,
        m.monto,
        m.fecha_movimiento,
        m.descripcion,
        m.cbu_origen,
        m.cbu_destino,
        m.id_transaccion_central,
        tm.nombre AS tipo_movimiento
      FROM movimientos m
      JOIN tipos_movimiento tm ON tm.id_tipo_movimiento = m.id_tipo_movimiento
      WHERE
        (m.cbu_origen = $1 AND m.monto < 0)
        OR
        (m.cbu_destino = $1 AND m.monto > 0)
      ORDER BY m.fecha_movimiento DESC;
    `;
    
    const { rows } = await pool.query(query, [String(cbu).trim()]);
    return rows;
}

// 5. REGISTRAR DEPÓSITO LOCAL (Efectivo por Caja/Terminal)
static async registrarDepositoLocal(cbu, monto) {
    // Defensa en profundidad: el controller ya valida esto, pero el modelo no debería confiar
    // en que todo caller lo haga.
    if (!esMontoPositivo(monto)) {
        throw new Error('El monto del depósito debe ser mayor a cero.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Buscamos el id_cuenta asociado al CBU. FOR UPDATE: bloquea la fila mientras dura la
        // transacción, así dos depósitos simultáneos a la misma cuenta no puedan colarse los
        // dos por debajo del tope diario leyendo el mismo "depositado hasta ahora" a la vez.
        const resCuenta = await client.query(
            'SELECT id_cuenta, moneda FROM Cuentas_Bancarias WHERE cbu = $1 FOR UPDATE',
            [cbu.trim()]
        );

        if (resCuenta.rows.length === 0) {
            throw new Error("La cuenta asociada a ese CBU no existe.");
        }

        const { id_cuenta: idCuentaLocal, moneda } = resCuenta.rows[0];
        const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'CREDITO');

        // Tope diario de depósitos, según la moneda de la cuenta.
        const tope = moneda === 'USD' ? TOPE_DIARIO_DEPOSITO_USD : TOPE_DIARIO_DEPOSITO_ARS;
        const simboloMoneda = moneda === 'USD' ? 'US$' : '$';
        const resHoy = await client.query(
            `SELECT COALESCE(SUM(monto), 0) AS depositado_hoy
             FROM movimientos
             WHERE id_cuenta = $1 AND id_tipo_movimiento = $2 AND fecha_movimiento::date = CURRENT_DATE`,
            [idCuentaLocal, idTipoMovimiento]
        );
        const depositadoHoy = Number(resHoy.rows[0].depositado_hoy);
        if (depositadoHoy + Number(monto) > tope) {
            const restante = Math.max(tope - depositadoHoy, 0).toFixed(2);
            throw new Error(
                `Superás el límite diario de depósitos (${simboloMoneda}${tope.toLocaleString('es-AR')}). ` +
                `Ya depositaste ${simboloMoneda}${depositadoHoy.toLocaleString('es-AR')} hoy — te quedan ${simboloMoneda}${Number(restante).toLocaleString('es-AR')} disponibles.`
            );
        }

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
            idTipoMovimiento,
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

// 6. REGISTRAR RECARGA DE CELULAR (mock local, resta saldo)
static async registrarRecargaLocal(cbu, monto, operadora, numero) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // FOR UPDATE: el controller ya hizo un chequeo de saldo "blando" antes de llegar acá,
        // pero era un SELECT suelto sin bloqueo — esta es la relectura atómica y autoritativa,
        // así dos recargas concurrentes de la misma cuenta no pueden pasar ambas con el mismo
        // saldo viejo y dejarla en negativo.
        const resCuenta = await client.query(
            'SELECT id_cuenta, saldo FROM Cuentas_Bancarias WHERE cbu = $1 FOR UPDATE',
            [cbu.trim()]
        );

        if (resCuenta.rows.length === 0) {
            throw new Error("La cuenta asociada a ese CBU no existe.");
        }

        const { id_cuenta: idCuentaLocal, saldo } = resCuenta.rows[0];

        if (Number(saldo) < Number(monto)) {
            throw new Error("Saldo insuficiente para realizar la recarga.");
        }

        await client.query(
            'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
            [Number(monto), idCuentaLocal]
        );

        const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'RECARGA');

        const queryInsert = `
            INSERT INTO movimientos (
                id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                descripcion, cbu_origen, cbu_destino, id_transaccion_central
            ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)
        `;

        await client.query(queryInsert, [
            idCuentaLocal,
            idTipoMovimiento,
            -Number(monto), // Negativo porque sale dinero
            `Recarga ${operadora} (${numero})`,
            cbu.trim(),
            cbu.trim(),
            null
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

// Cambio de divisa entre las dos cajas (ARS/USD) de la MISMA persona — "vender" o "comprar"
// dólares, según el estándar interno propuesto por la cátedra (POST /accounts/{cbu}/cambio).
// La dirección la decide la moneda de la cuenta que se pasa como origen: si es USD, es una
// venta (se acredita en la caja ARS de la misma persona); si es ARS, es una compra.
static async cambiarDivisa(cbuOrigen, monto) {
    const { obtenerCotizacionDolar } = require('../config/externalApis');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // FOR UPDATE: bloquea la fila de la cuenta de origen para que dos cambios de divisa
        // concurrentes de la misma cuenta no puedan leer el mismo saldo viejo y pasar los dos
        // el chequeo de saldo insuficiente de más abajo.
        const resOrigen = await client.query(
            `SELECT c.id_cuenta, c.saldo, c.moneda, pr.id_persona
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE c.cbu = $1
             FOR UPDATE OF c`,
            [cbuOrigen.trim()]
        );
        if (resOrigen.rows.length === 0) {
            throw new Error('La cuenta de origen no existe.');
        }
        const { id_cuenta: idCuentaOrigen, saldo: saldoOrigen, moneda: monedaOrigen, id_persona: idPersona } = resOrigen.rows[0];

        if (Number(saldoOrigen) < Number(monto)) {
            throw new Error('Saldo insuficiente.');
        }

        const monedaDestino = monedaOrigen === 'USD' ? 'ARS' : 'USD';
        const resDestino = await client.query(
            `SELECT c.id_cuenta
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE pr.id_persona = $1 AND c.moneda = $2`,
            [idPersona, monedaDestino]
        );
        if (resDestino.rows.length === 0) {
            throw new Error(`No tenés una caja de ahorro en ${monedaDestino} todavía.`);
        }
        const idCuentaDestino = resDestino.rows[0].id_cuenta;

        const cotizacion = await obtenerCotizacionDolar();
        let montoDestino, cotizacionUsada, descripcionOrigen, descripcionDestino;

        if (monedaOrigen === 'USD') {
            // Venta: el banco compra los dólares al cliente, al precio de "compra".
            cotizacionUsada = cotizacion.compra;
            montoDestino = Number((Number(monto) * cotizacionUsada).toFixed(2));
            descripcionOrigen = `Venta de USD ${Number(monto).toFixed(2)} a $${cotizacionUsada} (dólar ${cotizacion.casa})`;
            descripcionDestino = `Venta de USD ${Number(monto).toFixed(2)} → ARS ${montoDestino.toFixed(2)}`;
        } else {
            // Compra: el banco vende dólares al cliente, al precio de "venta".
            cotizacionUsada = cotizacion.venta;
            montoDestino = Number((Number(monto) / cotizacionUsada).toFixed(2));
            descripcionOrigen = `Compra de USD ${montoDestino.toFixed(2)} a $${cotizacionUsada} (dólar ${cotizacion.casa})`;
            descripcionDestino = `Compra de USD ${montoDestino.toFixed(2)} con ARS ${Number(monto).toFixed(2)}`;
        }

        await client.query('UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2', [Number(monto), idCuentaOrigen]);
        await client.query('UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2', [montoDestino, idCuentaDestino]);

        const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'CAMBIO_DIVISA');
        const queryInsert = `
            INSERT INTO movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion, cbu_origen, cbu_destino, id_transaccion_central)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $5, NULL)
        `;
        await client.query(queryInsert, [idCuentaOrigen, idTipoMovimiento, -Number(monto), descripcionOrigen, cbuOrigen.trim()]);
        await client.query(queryInsert, [idCuentaDestino, idTipoMovimiento, montoDestino, descripcionDestino, cbuOrigen.trim()]);

        await client.query('COMMIT');
        return {
            montoOrigen: Number(monto),
            monedaOrigen,
            montoDestino,
            monedaDestino,
            cotizacionUsada,
            casa: cotizacion.casa
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

}



module.exports = Movimiento;