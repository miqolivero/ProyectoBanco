const pool = require('../config/db');
const Movimiento = require('./movimientoModel');
const { esMontoPositivo } = require('../utils/validaciones');

// Factor de prima por franja etaria: cuanto mayor la edad, mayor el riesgo asegurado y
// mayor el factor. Fórmula simplificada (no es una tabla actuarial real):
// prima_mensual = suma_asegurada * factorPorEdad / 1000
const FRANJAS_EDAD = [
    { hasta: 30, factor: 0.5 },
    { hasta: 45, factor: 0.8 },
    { hasta: 60, factor: 1.5 },
    { hasta: 75, factor: 3.0 },
    { hasta: Infinity, factor: 5.0 }
];

function calcularEdad(fechaNac) {
    const hoy = new Date();
    const nacimiento = new Date(fechaNac);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const noCumplioAun = (hoy.getMonth() < nacimiento.getMonth()) ||
        (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
    if (noCumplioAun) edad--;
    return edad;
}

function factorPorEdad(edad) {
    return FRANJAS_EDAD.find(f => edad <= f.hasta).factor;
}

class Seguro {
    // 1. LISTAR catálogo de productos de seguro
    static async listarProductos() {
        const res = await pool.query('SELECT id_producto_seguro, nombre, descripcion FROM Productos_Seguro ORDER BY id_producto_seguro');
        return res.rows;
    }

    // 2. COTIZAR (función pura salvo por la lectura de fecha_nac, no guarda nada)
    static async cotizar(idPersona, idProductoSeguro, sumaAsegurada) {
        // Defensa en profundidad: contratar() llama a este mismo método para calcular la prima
        // a cobrar — una suma asegurada <= 0 da una prima <= 0, que al debitarse (saldo - prima)
        // termina acreditando plata en vez de cobrarla. Ver nota en seguroController.js.
        if (!esMontoPositivo(sumaAsegurada)) {
            throw new Error('La suma asegurada debe ser mayor a cero.');
        }

        const resPersona = await pool.query('SELECT fecha_nac FROM Personas WHERE id = $1', [idPersona]);
        if (resPersona.rows.length === 0) {
            throw new Error('La persona no existe.');
        }
        if (!resPersona.rows[0].fecha_nac) {
            throw new Error('No se puede cotizar: falta la fecha de nacimiento en tu perfil.');
        }

        const resProducto = await pool.query('SELECT nombre FROM Productos_Seguro WHERE id_producto_seguro = $1', [idProductoSeguro]);
        if (resProducto.rows.length === 0) {
            throw new Error('El producto de seguro no existe.');
        }

        const edad = calcularEdad(resPersona.rows[0].fecha_nac);
        const factor = factorPorEdad(edad);
        const primaMensual = Number(sumaAsegurada) * factor / 1000;

        return {
            producto: resProducto.rows[0].nombre,
            edad,
            factor,
            sumaAsegurada: Number(sumaAsegurada),
            primaMensual: Number(primaMensual.toFixed(2))
        };
    }

    // 3. CONTRATAR una póliza: cobra la primera prima de la cuenta y la deja activa
    static async contratar(cbu, idProductoSeguro, sumaAsegurada, beneficiarios) {
        const resCuenta = await pool.query(
            `SELECT c.id_cuenta, c.saldo, pr.id_persona
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE c.cbu = $1`,
            [cbu.trim()]
        );
        if (resCuenta.rows.length === 0) {
            throw new Error('La cuenta asociada a ese CBU no existe.');
        }
        const { id_cuenta, id_persona, saldo } = resCuenta.rows[0];

        const cotizacion = await Seguro.cotizar(id_persona, idProductoSeguro, sumaAsegurada);
        if (Number(saldo) < cotizacion.primaMensual) {
            throw new Error(`Saldo insuficiente para pagar la primera prima ($${cotizacion.primaMensual.toFixed(2)}).`);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resPoliza = await client.query(
                `INSERT INTO Polizas (id_persona, id_cuenta, id_producto_seguro, suma_asegurada, prima_mensual, beneficiarios, estado)
                 VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVA')
                 RETURNING id_poliza, suma_asegurada, prima_mensual, beneficiarios, fecha_alta, estado`,
                [id_persona, id_cuenta, idProductoSeguro, cotizacion.sumaAsegurada, cotizacion.primaMensual, beneficiarios || null]
            );
            const poliza = resPoliza.rows[0];

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                [cotizacion.primaMensual, id_cuenta]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PAGO_SEGURO');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    id_cuenta,
                    idTipoMovimiento,
                    -cotizacion.primaMensual,
                    `Contratación seguro ${cotizacion.producto} (primera prima)`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            await client.query('COMMIT');
            return { ...poliza, producto: cotizacion.producto };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 4. LISTAR pólizas de una persona
    static async listarPorPersona(idPersona) {
        const res = await pool.query(
            `SELECT p.id_poliza, p.suma_asegurada, p.prima_mensual, p.beneficiarios, p.fecha_alta, p.estado,
                    ps.nombre AS producto
             FROM Polizas p
             JOIN Productos_Seguro ps ON ps.id_producto_seguro = p.id_producto_seguro
             WHERE p.id_persona = $1
             ORDER BY p.fecha_alta DESC`,
            [idPersona]
        );
        return res.rows;
    }

    // 5. CANCELAR una póliza (no reembolsa primas ya pagadas)
    static async cancelar(idPoliza, idPersona) {
        const res = await pool.query(
            'SELECT id_poliza, id_persona, estado FROM Polizas WHERE id_poliza = $1',
            [idPoliza]
        );
        if (res.rows.length === 0) {
            throw new Error('La póliza no existe.');
        }
        const poliza = res.rows[0];
        if (poliza.id_persona !== idPersona) {
            throw new Error('Esa póliza no te pertenece.');
        }
        if (poliza.estado !== 'ACTIVA') {
            throw new Error('Esa póliza ya está cancelada.');
        }

        await pool.query("UPDATE Polizas SET estado = 'CANCELADA' WHERE id_poliza = $1", [idPoliza]);
        return true;
    }
}

module.exports = Seguro;
