const pool = require('../config/db');
const Movimiento = require('./movimientoModel');
const { esMontoPositivo } = require('../utils/validaciones');

const LIMITE_COMPRA_DEFAULT = 500000;
const DIA_CIERRE_DEFAULT = 10;
const AÑOS_VIGENCIA = 5;

// Genera un número de tarjeta con formato y dígito verificador (Luhn) válidos.
// No representa ninguna tarjeta real: es mock local, igual que devolvería una API de datos falsos.
function generarDigitoLuhn(digitos) {
    let suma = 0;
    let duplicar = true;
    for (let i = digitos.length - 1; i >= 0; i--) {
        let n = digitos[i];
        if (duplicar) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        suma += n;
        duplicar = !duplicar;
    }
    return (10 - (suma % 10)) % 10;
}

function generarNumeroTarjeta(marca) {
    const prefijo = marca === 'Mastercard' ? String(51 + Math.floor(Math.random() * 5)) : '4';
    const digitos = prefijo.split('').map(Number);
    while (digitos.length < 15) digitos.push(Math.floor(Math.random() * 10));
    digitos.push(generarDigitoLuhn(digitos));
    return digitos.join('');
}

class Tarjeta {
    // 1. LISTAR TARJETAS de una persona (puede tener varias, de distinta marca)
    static async listarPorPersona(idPersona) {
        const res = await pool.query(
            `SELECT t.id_tarjeta, t.numero_tarjeta, t.marca, t.fecha_vencimiento, t.limite_compra, t.dia_cierre
             FROM Tarjetas_Credito t
             JOIN Productos pr ON pr.id_producto = t.id_producto
             WHERE pr.id_persona = $1
             ORDER BY t.id_tarjeta ASC`,
            [idPersona]
        );
        return res.rows;
    }

    // 2. SOLICITAR TARJETA nueva (crea el Producto + Tarjetas_Credito)
    // Máximo 2 tarjetas por persona, una de cada marca (no dos Visa ni dos Mastercard).
    static async solicitar(idPersona, marca) {
        const marcaFinal = marca === 'Mastercard' ? 'Mastercard' : 'Visa';

        const existentes = await Tarjeta.listarPorPersona(idPersona);
        if (existentes.some(t => t.marca === marcaFinal)) {
            throw new Error(`Ya tenés una tarjeta ${marcaFinal}. Solo se permite una de cada marca.`);
        }
        if (existentes.length >= 2) {
            throw new Error('Ya alcanzaste el máximo de 2 tarjetas (una Visa y una Mastercard).');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resTipoProducto = await client.query(
                "SELECT id_tipo_producto FROM Tipos_Producto WHERE nombre = 'TARJETA_CREDITO'"
            );
            const resEstado = await client.query(
                "SELECT id_estado_producto FROM Estados_Producto WHERE nombre = 'ACTIVO'"
            );

            const resProducto = await client.query(
                'INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto) VALUES ($1, $2, $3) RETURNING id_producto',
                [idPersona, resTipoProducto.rows[0].id_tipo_producto, resEstado.rows[0].id_estado_producto]
            );
            const idProducto = resProducto.rows[0].id_producto;

            const fechaVencimiento = new Date();
            fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + AÑOS_VIGENCIA);

            // Reintenta si por azar se genera un número ya existente (UNIQUE numero_tarjeta)
            let intentos = 0;
            while (true) {
                const numero = generarNumeroTarjeta(marcaFinal);
                try {
                    const resTarjeta = await client.query(
                        `INSERT INTO Tarjetas_Credito (id_producto, numero_tarjeta, marca, fecha_vencimiento, limite_compra, dia_cierre)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         RETURNING id_tarjeta, numero_tarjeta, marca, fecha_vencimiento, limite_compra, dia_cierre`,
                        [idProducto, numero, marcaFinal, fechaVencimiento, LIMITE_COMPRA_DEFAULT, DIA_CIERRE_DEFAULT]
                    );
                    await client.query('COMMIT');
                    return resTarjeta.rows[0];
                } catch (error) {
                    if (error.code === '23505' && intentos < 5) { // unique_violation: reintentar con otro número
                        intentos++;
                        continue;
                    }
                    throw error;
                }
            }
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 3. RESUMEN de la tarjeta: límite, consumido (cuotas pendientes) y disponible
    static async obtenerResumen(idTarjeta) {
        const resTarjeta = await pool.query(
            'SELECT id_tarjeta, numero_tarjeta, marca, fecha_vencimiento, limite_compra, dia_cierre FROM Tarjetas_Credito WHERE id_tarjeta = $1',
            [idTarjeta]
        );
        if (resTarjeta.rows.length === 0) {
            throw new Error('La tarjeta no existe.');
        }
        const tarjeta = resTarjeta.rows[0];

        const resConsumido = await pool.query(
            `SELECT COALESCE(SUM(ct.monto), 0) AS consumido
             FROM Cuotas_Tarjeta ct
             JOIN Consumos_Tarjeta co ON co.id_consumo = ct.id_consumo
             WHERE co.id_tarjeta = $1 AND ct.estado = 'PENDIENTE'`,
            [idTarjeta]
        );
        const consumido = Number(resConsumido.rows[0].consumido);

        const resCuotas = await pool.query(
            `SELECT ct.id_cuota, ct.numero_cuota, ct.monto, ct.fecha_vencimiento, ct.estado,
                    co.comercio, co.cantidad_cuotas
             FROM Cuotas_Tarjeta ct
             JOIN Consumos_Tarjeta co ON co.id_consumo = ct.id_consumo
             WHERE co.id_tarjeta = $1 AND ct.estado = 'PENDIENTE'
             ORDER BY ct.fecha_vencimiento ASC`,
            [idTarjeta]
        );

        return {
            ...tarjeta,
            consumido,
            disponible: Number(tarjeta.limite_compra) - consumido,
            cuotasPendientes: resCuotas.rows
        };
    }

    // 4. REGISTRAR CONSUMO (compra en N cuotas), valida contra el límite disponible
    // 🎯 idPersona: quien dice estar haciendo el consumo. Antes cualquiera que supiera/adivinara
    // un id_tarjeta (entero secuencial chico) podía cargarle un consumo — y la deuda real que
    // genera — a la tarjeta de otra persona, sin ninguna verificación. Ahora se exige y se valida
    // contra el dueño real, igual que ya hacía pagarCuota más abajo.
    static async registrarConsumo(idTarjeta, comercio, montoTotal, cantidadCuotas, idPersona) {
        // Defensa en profundidad: el controller ya valida esto, pero el modelo no debería
        // confiar en que todo caller lo haga — un monto <= 0 acá generaría una cuota "negativa"
        // que, al pagarse, acredita plata en vez de debitarla (ver nota en tarjetaController.js).
        if (!esMontoPositivo(montoTotal)) {
            throw new Error('El monto del consumo debe ser mayor a cero.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resTarjeta = await client.query(
                `SELECT tc.limite_compra, tc.dia_cierre, pr.id_persona
                 FROM Tarjetas_Credito tc
                 JOIN Productos pr ON pr.id_producto = tc.id_producto
                 WHERE tc.id_tarjeta = $1 FOR UPDATE OF tc`,
                [idTarjeta]
            );
            if (resTarjeta.rows.length === 0) {
                throw new Error('La tarjeta no existe.');
            }
            const { limite_compra, dia_cierre, id_persona: idPersonaTitular } = resTarjeta.rows[0];
            if (String(idPersonaTitular) !== String(idPersona)) {
                throw new Error('Esa tarjeta no te pertenece.');
            }

            const resConsumido = await client.query(
                `SELECT COALESCE(SUM(ct.monto), 0) AS consumido
                 FROM Cuotas_Tarjeta ct
                 JOIN Consumos_Tarjeta co ON co.id_consumo = ct.id_consumo
                 WHERE co.id_tarjeta = $1 AND ct.estado = 'PENDIENTE'`,
                [idTarjeta]
            );
            const consumido = Number(resConsumido.rows[0].consumido);
            const disponible = Number(limite_compra) - consumido;

            if (Number(montoTotal) > disponible) {
                throw new Error(`Límite insuficiente. Disponible: $${disponible.toFixed(2)}`);
            }

            const resConsumo = await client.query(
                `INSERT INTO Consumos_Tarjeta (id_tarjeta, comercio, monto_total, cantidad_cuotas)
                 VALUES ($1, $2, $3, $4) RETURNING id_consumo`,
                [idTarjeta, comercio, Number(montoTotal), cantidadCuotas]
            );
            const idConsumo = resConsumo.rows[0].id_consumo;

            // Cada cuota vence el día de cierre de los meses siguientes; la última cuota
            // absorbe el resto por redondeo para que la suma coincida exacto con montoTotal.
            const montoCuotaBase = Math.floor((Number(montoTotal) / cantidadCuotas) * 100) / 100;
            const hoy = new Date();
            let acumulado = 0;

            for (let i = 1; i <= cantidadCuotas; i++) {
                const esUltima = i === cantidadCuotas;
                const montoCuota = esUltima ? Number((Number(montoTotal) - acumulado).toFixed(2)) : montoCuotaBase;
                acumulado += montoCuota;

                const fechaVencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + i, dia_cierre);

                await client.query(
                    `INSERT INTO Cuotas_Tarjeta (id_consumo, numero_cuota, monto, fecha_vencimiento, estado)
                     VALUES ($1, $2, $3, $4, 'PENDIENTE')`,
                    [idConsumo, i, montoCuota, fechaVencimiento]
                );
            }

            await client.query('COMMIT');
            return { id_consumo: idConsumo };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 5. PAGAR UNA CUOTA (debita la cuenta del titular de la tarjeta)
    static async pagarCuota(idCuota, cbu) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resCuota = await client.query(
                `SELECT ct.id_cuota, ct.monto, ct.estado, ct.numero_cuota,
                        co.comercio, co.cantidad_cuotas, co.id_tarjeta,
                        prTarjeta.id_persona AS id_persona_tarjeta
                 FROM Cuotas_Tarjeta ct
                 JOIN Consumos_Tarjeta co ON co.id_consumo = ct.id_consumo
                 JOIN Tarjetas_Credito t ON t.id_tarjeta = co.id_tarjeta
                 JOIN Productos prTarjeta ON prTarjeta.id_producto = t.id_producto
                 WHERE ct.id_cuota = $1
                 FOR UPDATE`,
                [idCuota]
            );
            if (resCuota.rows.length === 0) {
                throw new Error('La cuota no existe.');
            }
            const cuota = resCuota.rows[0];
            if (cuota.estado !== 'PENDIENTE') {
                throw new Error('Esa cuota ya fue pagada.');
            }

            const resCuenta = await client.query(
                `SELECT c.id_cuenta, c.saldo, prCuenta.id_persona AS id_persona_cuenta
                 FROM Cuentas_Bancarias c
                 JOIN Productos prCuenta ON prCuenta.id_producto = c.id_producto
                 WHERE c.cbu = $1`,
                [cbu.trim()]
            );
            if (resCuenta.rows.length === 0) {
                throw new Error('La cuenta asociada a ese CBU no existe.');
            }
            const cuenta = resCuenta.rows[0];
            if (cuenta.id_persona_cuenta !== cuota.id_persona_tarjeta) {
                throw new Error('Esa cuota no pertenece al titular de esta cuenta.');
            }

            const importe = Number(cuota.monto);
            if (Number(cuenta.saldo) < importe) {
                throw new Error('Saldo insuficiente.');
            }

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                [importe, cuenta.id_cuenta]
            );
            await client.query(
                "UPDATE Cuotas_Tarjeta SET estado = 'PAGADA' WHERE id_cuota = $1",
                [idCuota]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PAGO_TARJETA');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    cuenta.id_cuenta,
                    idTipoMovimiento,
                    -importe,
                    `Pago tarjeta: ${cuota.comercio} (cuota ${cuota.numero_cuota}/${cuota.cantidad_cuotas})`,
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

module.exports = Tarjeta;
