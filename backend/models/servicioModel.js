const pool = require('../config/db');
const Movimiento = require('./movimientoModel');
const { esMontoPositivo } = require('../utils/validaciones');

// 'YYYY-MM' del mes actual — identifica el período de una factura generada por un servicio
// agendado, para no volver a generarla si ya existe una de este mes.
function periodoActual() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

class Servicio {
    // 1. LISTAR EMPRESAS DE SERVICIO (catálogo propio del banco, mock local)
    static async listarEmpresas() {
        const res = await pool.query('SELECT id_empresa, nombre, rubro FROM Empresas_Servicio ORDER BY nombre');
        return res.rows;
    }

    // 2. CONSULTAR DEUDA PENDIENTE de un cliente en una empresa dada
    static async obtenerDeuda(idEmpresa, numeroCliente) {
        const res = await pool.query(
            `SELECT id_factura, id_empresa, numero_cliente, importe, vencimiento, estado
             FROM Facturas_Servicio
             WHERE id_empresa = $1 AND numero_cliente = $2 AND estado = 'PENDIENTE'
             ORDER BY vencimiento ASC`,
            [idEmpresa, numeroCliente.trim()]
        );
        return res.rows;
    }

    // 3. PAGAR UNA FACTURA (debita la cuenta, marca la factura como pagada y registra el movimiento)
    static async pagarFactura(idFactura, cbu) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resFactura = await client.query(
                `SELECT f.id_factura, f.importe, f.estado, e.nombre AS nombre_empresa
                 FROM Facturas_Servicio f
                 JOIN Empresas_Servicio e ON e.id_empresa = f.id_empresa
                 WHERE f.id_factura = $1
                 FOR UPDATE`,
                [idFactura]
            );

            if (resFactura.rows.length === 0) {
                throw new Error('La factura no existe.');
            }
            const factura = resFactura.rows[0];
            if (factura.estado !== 'PENDIENTE') {
                throw new Error('Esa factura ya fue pagada.');
            }

            const resCuenta = await client.query(
                'SELECT id_cuenta, saldo FROM Cuentas_Bancarias WHERE cbu = $1',
                [cbu.trim()]
            );
            if (resCuenta.rows.length === 0) {
                throw new Error('La cuenta asociada a ese CBU no existe.');
            }
            const idCuentaLocal = resCuenta.rows[0].id_cuenta;
            const importe = Number(factura.importe);

            if (Number(resCuenta.rows[0].saldo) < importe) {
                throw new Error('Saldo insuficiente.');
            }

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                [importe, idCuentaLocal]
            );

            await client.query(
                "UPDATE Facturas_Servicio SET estado = 'PAGADA' WHERE id_factura = $1",
                [idFactura]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PAGO_SERVICIO');

            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    idCuentaLocal,
                    idTipoMovimiento,
                    -importe,
                    `Pago de servicio: ${factura.nombre_empresa}`,
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

    // 4. AGENDAR UN SERVICIO (guarda empresa+numero_cliente como acceso rápido; opcionalmente
    // con un monto fijo mensual + día de vencimiento, para que el banco le arme la factura de
    // cada mes solo en vez de tener que buscarla a mano cada vez)
    static async crearAgenda(idPersona, idEmpresa, numeroCliente, alias, montoFijo, diaVencimiento, debitoAutomatico) {
        if (montoFijo != null && !esMontoPositivo(montoFijo)) {
            throw new Error('El monto fijo debe ser un número mayor a cero (o dejarlo vacío).');
        }
        if (diaVencimiento != null && (!Number.isInteger(Number(diaVencimiento)) || diaVencimiento < 1 || diaVencimiento > 28)) {
            throw new Error('El día de vencimiento debe ser un número entre 1 y 28.');
        }
        const res = await pool.query(
            `INSERT INTO Servicios_Agendados (id_persona, id_empresa, numero_cliente, alias, monto_fijo, dia_vencimiento, debito_automatico)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id_agenda, id_empresa, numero_cliente, alias, monto_fijo, dia_vencimiento, debito_automatico, fecha_alta`,
            [idPersona, idEmpresa, numeroCliente.trim(), alias || null, montoFijo || null, diaVencimiento || null, !!debitoAutomatico]
        );
        return res.rows[0];
    }

    // 5. EDITAR una agenda (alias, monto fijo, día de vencimiento, débito automático)
    static async actualizarAgenda(idAgenda, idPersona, { alias, montoFijo, diaVencimiento, debitoAutomatico }) {
        if (montoFijo != null && !esMontoPositivo(montoFijo)) {
            throw new Error('El monto fijo debe ser un número mayor a cero (o dejarlo vacío).');
        }
        if (diaVencimiento != null && (!Number.isInteger(Number(diaVencimiento)) || diaVencimiento < 1 || diaVencimiento > 28)) {
            throw new Error('El día de vencimiento debe ser un número entre 1 y 28.');
        }
        const res = await pool.query(
            `UPDATE Servicios_Agendados
             SET alias = $1, monto_fijo = $2, dia_vencimiento = $3, debito_automatico = $4
             WHERE id_agenda = $5 AND id_persona = $6
             RETURNING id_agenda, id_empresa, numero_cliente, alias, monto_fijo, dia_vencimiento, debito_automatico, fecha_alta`,
            [alias || null, montoFijo || null, diaVencimiento || null, !!debitoAutomatico, idAgenda, idPersona]
        );
        if (res.rows.length === 0) {
            throw new Error('Esa agenda no existe o no te pertenece.');
        }
        return res.rows[0];
    }

    // 6. ELIMINAR una agenda
    static async eliminarAgenda(idAgenda, idPersona) {
        const res = await pool.query(
            'DELETE FROM Servicios_Agendados WHERE id_agenda = $1 AND id_persona = $2 RETURNING id_agenda',
            [idAgenda, idPersona]
        );
        if (res.rows.length === 0) {
            throw new Error('Esa agenda no existe o no te pertenece.');
        }
        return true;
    }

    // Genera (si todavía no existe) la factura del período actual para una agenda con monto
    // fijo. Usa `client` si viene dentro de una transacción (débito automático), o el pool
    // directo si se llama suelta (listar). Devuelve la factura del período, exista o no la
    // acabe de crear.
    static async _generarFacturaDelPeriodo(runner, agenda) {
        if (agenda.monto_fijo == null || agenda.dia_vencimiento == null) return null;

        const periodo = periodoActual();
        const resExistente = await runner.query(
            `SELECT id_factura, id_empresa, numero_cliente, importe, vencimiento, estado
             FROM Facturas_Servicio WHERE id_agenda = $1 AND periodo = $2`,
            [agenda.id_agenda, periodo]
        );
        if (resExistente.rows.length > 0) return resExistente.rows[0];

        const hoy = new Date();
        const vencimiento = new Date(hoy.getFullYear(), hoy.getMonth(), agenda.dia_vencimiento);
        const resNueva = await runner.query(
            `INSERT INTO Facturas_Servicio (id_empresa, id_persona, numero_cliente, importe, vencimiento, estado, periodo, id_agenda)
             VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6, $7)
             RETURNING id_factura, id_empresa, numero_cliente, importe, vencimiento, estado`,
            [agenda.id_empresa, agenda.id_persona, agenda.numero_cliente, agenda.monto_fijo, vencimiento, periodo, agenda.id_agenda]
        );
        return resNueva.rows[0];
    }

    // 7. LISTAR agendas de una persona, con la factura del mes ya generada (si corresponde)
    static async listarAgendados(idPersona) {
        const res = await pool.query(
            `SELECT sa.id_agenda, sa.id_empresa, sa.numero_cliente, sa.alias, sa.monto_fijo,
                    sa.dia_vencimiento, sa.debito_automatico, sa.fecha_alta,
                    e.nombre AS nombre_empresa, e.rubro
             FROM Servicios_Agendados sa
             JOIN Empresas_Servicio e ON e.id_empresa = sa.id_empresa
             WHERE sa.id_persona = $1
             ORDER BY sa.fecha_alta DESC`,
            [idPersona]
        );

        const agendas = [];
        for (const agenda of res.rows) {
            const facturaDelMes = await Servicio._generarFacturaDelPeriodo(pool, { ...agenda, id_persona: idPersona });
            agendas.push({ ...agenda, facturaDelMes });
        }
        return agendas;
    }

    // 8. EJECUTAR DÉBITOS AUTOMÁTICOS: genera (si hace falta) y paga la factura del mes de
    // cada agenda con debito_automatico=true. Se dispara a pedido del usuario (un botón), no
    // en segundo plano — no hay infraestructura de tareas programadas en este proyecto, así
    // que "automático" significa "el banco arma y cobra la cuenta, en vez de tener que buscarla
    // y pagarla a mano vos", no que corre solo sin que nadie lo mire.
    static async ejecutarDebitosAutomaticos(idPersona, cbu) {
        const resAgendas = await pool.query(
            `SELECT id_agenda, id_empresa, numero_cliente, monto_fijo, dia_vencimiento
             FROM Servicios_Agendados
             WHERE id_persona = $1 AND debito_automatico = true AND monto_fijo IS NOT NULL AND dia_vencimiento IS NOT NULL`,
            [idPersona]
        );

        const pagados = [];
        const errores = [];
        for (const agenda of resAgendas.rows) {
            try {
                const factura = await Servicio._generarFacturaDelPeriodo(pool, { ...agenda, id_persona: idPersona });
                if (factura.estado === 'PAGADA') continue; // ya se había pagado antes
                await Servicio.pagarFactura(factura.id_factura, cbu);
                pagados.push({ id_agenda: agenda.id_agenda, importe: Number(factura.importe) });
            } catch (error) {
                errores.push({ id_agenda: agenda.id_agenda, error: error.message });
            }
        }
        return { pagados, errores };
    }
}

module.exports = Servicio;
