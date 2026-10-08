const pool = require('../config/db');
const Movimiento = require('./movimientoModel');
const { obtenerCotizacionesCedears, obtenerPrecioCedear } = require('../config/externalApis');

class Cedear {
    // 1. LISTAR catálogo con cotización en vivo
    static async listarCatalogo() {
        return obtenerCotizacionesCedears();
    }

    // 2. REGISTRAR ORDEN (compra o venta), al precio de mercado del momento
    static async registrarOrden(cbu, ticker, cantidad, tipo) {
        const tipoFinal = tipo === 'VENTA' ? 'VENTA' : 'COMPRA';
        const precio = await obtenerPrecioCedear(ticker);
        const importe = precio * Number(cantidad);

        // 🎯 id_cuenta/id_persona no cambian, se pueden leer fuera de la transacción — pero el
        // saldo NO: se relee más abajo con FOR UPDATE dentro de la transacción, para que dos
        // órdenes concurrentes de la misma cuenta no puedan pasar ambas el chequeo de saldo/
        // tenencia con el mismo valor viejo (la fila bloqueada además serializa compra/venta
        // contra la misma cuenta, protegiendo también el chequeo de tenencia neta de más abajo).
        const resCuenta = await pool.query(
            `SELECT c.id_cuenta, pr.id_persona
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE c.cbu = $1`,
            [cbu.trim()]
        );
        if (resCuenta.rows.length === 0) {
            throw new Error('La cuenta asociada a ese CBU no existe.');
        }
        const { id_cuenta, id_persona } = resCuenta.rows[0];

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resSaldoLock = await client.query(
                'SELECT saldo FROM Cuentas_Bancarias WHERE id_cuenta = $1 FOR UPDATE',
                [id_cuenta]
            );
            const saldo = resSaldoLock.rows[0].saldo;

            if (tipoFinal === 'COMPRA') {
                if (Number(saldo) < importe) {
                    throw new Error(`Saldo insuficiente. Necesitás $${importe.toFixed(2)} para comprar ${cantidad} ${ticker}.`);
                }
                await client.query(
                    'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                    [importe, id_cuenta]
                );
            } else {
                // VENTA: validar que tenga suficiente tenencia neta de ese ticker
                const resTenencia = await client.query(
                    `SELECT COALESCE(SUM(CASE WHEN tipo = 'COMPRA' THEN cantidad ELSE -cantidad END), 0) AS neta
                     FROM Ordenes_Cedear WHERE id_persona = $1 AND ticker = $2`,
                    [id_persona, ticker]
                );
                const tenenciaActual = Number(resTenencia.rows[0].neta);
                if (tenenciaActual < Number(cantidad)) {
                    throw new Error(`No tenés suficientes ${ticker}. Tenencia actual: ${tenenciaActual}.`);
                }
                await client.query(
                    'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2',
                    [importe, id_cuenta]
                );
            }

            const resOrden = await client.query(
                `INSERT INTO Ordenes_Cedear (id_persona, id_cuenta, ticker, cantidad, tipo, precio)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id_orden, ticker, cantidad, tipo, precio, fecha`,
                [id_persona, id_cuenta, ticker, Number(cantidad), tipoFinal, precio]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(
                client, tipoFinal === 'COMPRA' ? 'COMPRA_CEDEAR' : 'VENTA_CEDEAR'
            );
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    id_cuenta,
                    idTipoMovimiento,
                    tipoFinal === 'COMPRA' ? -importe : importe,
                    `${tipoFinal === 'COMPRA' ? 'Compra' : 'Venta'} de ${cantidad} ${ticker} a $${precio.toFixed(2)}`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            await client.query('COMMIT');
            return resOrden.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 3. PORTAFOLIO de una persona: tenencia neta + precio promedio de compra + ganancia no realizada
    static async obtenerPortafolio(idPersona) {
        const resOrdenes = await pool.query(
            `SELECT ticker, cantidad, tipo, precio FROM Ordenes_Cedear WHERE id_persona = $1 ORDER BY fecha ASC`,
            [idPersona]
        );

        const porTicker = {};
        for (const o of resOrdenes.rows) {
            if (!porTicker[o.ticker]) {
                porTicker[o.ticker] = { cantidadNeta: 0, totalCompradoImporte: 0, totalCompradoCantidad: 0 };
            }
            const t = porTicker[o.ticker];
            if (o.tipo === 'COMPRA') {
                t.cantidadNeta += Number(o.cantidad);
                t.totalCompradoImporte += Number(o.cantidad) * Number(o.precio);
                t.totalCompradoCantidad += Number(o.cantidad);
            } else {
                t.cantidadNeta -= Number(o.cantidad);
            }
        }

        const tickersConTenencia = Object.keys(porTicker).filter(t => porTicker[t].cantidadNeta > 0);
        if (tickersConTenencia.length === 0) return [];

        const cotizaciones = await obtenerCotizacionesCedears();
        const precioPorTicker = Object.fromEntries(cotizaciones.map(c => [c.ticker, c.precio]));

        return tickersConTenencia.map(ticker => {
            const t = porTicker[ticker];
            const precioPromedioCompra = t.totalCompradoCantidad > 0 ? t.totalCompradoImporte / t.totalCompradoCantidad : 0;
            const precioActual = precioPorTicker[ticker] ?? null;
            const valorActual = precioActual != null ? t.cantidadNeta * precioActual : null;
            const costoBase = t.cantidadNeta * precioPromedioCompra;
            const gananciaNoRealizada = valorActual != null ? valorActual - costoBase : null;

            return {
                ticker,
                cantidad: Number(t.cantidadNeta.toFixed(4)),
                precioPromedioCompra: Number(precioPromedioCompra.toFixed(2)),
                precioActual,
                valorActual: valorActual != null ? Number(valorActual.toFixed(2)) : null,
                gananciaNoRealizada: gananciaNoRealizada != null ? Number(gananciaNoRealizada.toFixed(2)) : null
            };
        });
    }
}

module.exports = Cedear;
