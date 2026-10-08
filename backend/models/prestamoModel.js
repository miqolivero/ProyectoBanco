const pool = require('../config/db');
const Movimiento = require('./movimientoModel');
const { centralBankFetch } = require('../config/centralBank');
const { obtenerTasaReferenciaPrestamos } = require('../config/externalApis');
const { verificarCbuPermitidoEnDemo } = require('../config/demoMode');

const SPREAD_BPS = 1000; // el banco cobra 1000 puntos básicos (10%) más que la tasa de referencia
const PLAZOS_PERMITIDOS_MESES = [6, 12, 18, 24, 36, 48];
const SITUACION_MAXIMA_ACEPTADA = 2; // BCRA: 1=Normal, 2=Riesgo bajo — de ahí en más (3 a 5) se rechaza
const MULTIPLICADOR_SALDO = 5; // tope de endeudamiento = 5x el saldo PROPIO (ver nota abajo)...
const TOPE_MINIMO = 100000; // ...con un piso de $100.000 para que una cuenta nueva en $0 pueda pedir algo
const MAX_PRESTAMOS_ACTIVOS = 3; // no se pueden tener más de 3 préstamos ACTIVOS en simultáneo

// 🐛 BUG CORREGIDO: el tope se calculaba como saldo_actual × 5, pero el préstamo otorgado se
// acredita en esa misma cuenta — cada préstamo inflaba el saldo, que a su vez inflaba el tope
// del próximo préstamo, permitiendo pedir plata sin límite real (loop de endeudamiento infinito).
// Ahora se calcula sobre el "saldo propio" = saldo_actual − deuda_activa: la plata que vino de
// préstamos todavía no pagados se resta antes de multiplicar, así tomar un préstamo no aumenta
// la capacidad para tomar el siguiente. Pagar cuotas sí la libera (baja la deuda activa).
function calcularTopeEndeudamiento(saldoActual, deudaActiva) {
    const saldoPropio = Math.max(Number(saldoActual) - Number(deudaActiva), 0);
    return Math.max(saldoPropio * MULTIPLICADOR_SALDO, TOPE_MINIMO);
}

class Prestamo {
    // 1. TASA vigente que ofrece el banco (referencia de mercado + spread — salvo que la
    // persona se haya ganado la bonificación, ver tieneBuenHistorial).
    // idPersona es opcional: si no se pasa (ej. alguien todavía no identificado), se cobra el
    // spread completo por default — nunca se bonifica "por las dudas".
    static async obtenerTasaVigente(idPersona = null) {
        const [tasaReferencia, buenHistorial] = await Promise.all([
            obtenerTasaReferenciaPrestamos(),
            idPersona ? Prestamo.tieneBuenHistorial(idPersona) : Promise.resolve(false)
        ]);
        const spreadBps = buenHistorial ? 0 : SPREAD_BPS;
        const tnaOfrecida = tasaReferencia + (spreadBps / 100);
        return {
            tasaReferencia: Number(tasaReferencia.toFixed(3)),
            spreadBps,
            tnaOfrecida: Number(tnaOfrecida.toFixed(3)),
            plazosPermitidos: PLAZOS_PERMITIDOS_MESES,
            bonificado: buenHistorial
        };
    }

    // 🎯 "Pagó un crédito en tiempo y forma": tiene al menos un préstamo ya PAGADO en el que
    // NINGUNA cuota se pagó después de su fecha_vencimiento. Comparamos por fecha calendario
    // (::date), no por el timestamp completo, para que pagar más tarde el mismo día del
    // vencimiento siga contando como "en término".
    // Cuotas PAGADAs de antes de que existiera fecha_pago (columna agregada después) tienen ese
    // campo en NULL — se tratan como "no verificable", nunca como bonificable, para no premiar
    // puntualidad que en realidad no se puede confirmar.
    static async tieneBuenHistorial(idPersona) {
        const res = await pool.query(
            `SELECT EXISTS (
                SELECT 1 FROM Prestamos pr
                WHERE pr.id_persona = $1 AND pr.estado = 'PAGADO'
                AND NOT EXISTS (
                    SELECT 1 FROM Cuotas_Prestamo cp
                    WHERE cp.id_prestamo = pr.id_prestamo
                    AND (cp.fecha_pago IS NULL OR cp.fecha_pago::date > cp.fecha_vencimiento)
                )
            ) AS tiene_buen_historial`,
            [idPersona]
        );
        return res.rows[0].tiene_buen_historial;
    }

    // 2. SIMULAR amortización francesa (cuota fija), función pura, no toca la DB
    static simularAmortizacion(monto, plazoMeses, tnaAnual) {
        const i = (Number(tnaAnual) / 100) / 12;
        const n = Number(plazoMeses);
        const factor = Math.pow(1 + i, n);
        const cuotaFija = Number(monto) * (i * factor) / (factor - 1);

        let saldo = Number(monto);
        const tabla = [];
        for (let k = 1; k <= n; k++) {
            const interes = saldo * i;
            // La última cuota absorbe el resto por redondeo, así el saldo cierra exacto en 0.
            let capital = k === n ? saldo : cuotaFija - interes;
            saldo = Number((saldo - capital).toFixed(2));
            tabla.push({
                numero: k,
                capital: Number(capital.toFixed(2)),
                interes: Number(interes.toFixed(2)),
                cuota: Number((capital + interes).toFixed(2)),
                saldoRestante: saldo
            });
        }
        return { cuotaFija: Number(cuotaFija.toFixed(2)), tabla };
    }

    // 3. CONSULTAR situación crediticia en la red compartida del Banco Central
    static async consultarSituacion(dni) {
        const response = await centralBankFetch(`/central-deudores/${dni}`);
        if (!response.ok) {
            throw new Error('No se pudo consultar la situación crediticia en el Banco Central.');
        }
        return response.json(); // { dni, situacion, deudas }
    }

    // 4. LISTAR préstamos de una cuenta
    static async listarPorCbu(cbu) {
        const resPrestamos = await pool.query(
            `SELECT pr.id_prestamo, pr.monto, pr.plazo_meses, pr.tna, pr.cuota_fija, pr.fecha_alta, pr.estado
             FROM Prestamos pr
             JOIN Cuentas_Bancarias c ON c.id_cuenta = pr.id_cuenta
             WHERE c.cbu = $1
             ORDER BY pr.fecha_alta DESC`,
            [cbu.trim()]
        );

        const prestamos = [];
        for (const p of resPrestamos.rows) {
            const resCuotas = await pool.query(
                `SELECT id_cuota, numero, capital, interes, cuota, fecha_vencimiento, estado
                 FROM Cuotas_Prestamo WHERE id_prestamo = $1 ORDER BY numero ASC`,
                [p.id_prestamo]
            );
            const cuotasPendientes = resCuotas.rows.filter(c => c.estado === 'PENDIENTE');
            prestamos.push({
                ...p,
                cuotasPendientes,
                proximaCuota: cuotasPendientes[0] || null
            });
        }
        return prestamos;
    }

    // 5. CAPACIDAD de endeudamiento vigente de una cuenta (tope, deuda activa, disponible)
    static async obtenerCapacidad(cbu) {
        const resCuenta = await pool.query(
            `SELECT c.saldo, pr.id_persona
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             WHERE c.cbu = $1`,
            [cbu.trim()]
        );
        if (resCuenta.rows.length === 0) {
            throw new Error('La cuenta asociada a ese CBU no existe.');
        }
        const { saldo, id_persona } = resCuenta.rows[0];

        const resDeudaActiva = await pool.query(
            `SELECT COALESCE(SUM(cp.capital), 0) AS deuda_pendiente
             FROM Cuotas_Prestamo cp
             JOIN Prestamos pr ON pr.id_prestamo = cp.id_prestamo
             WHERE pr.id_persona = $1 AND pr.estado = 'ACTIVO' AND cp.estado = 'PENDIENTE'`,
            [id_persona]
        );
        const deudaActiva = Number(resDeudaActiva.rows[0].deuda_pendiente);
        const tope = calcularTopeEndeudamiento(saldo, deudaActiva);

        const resActivos = await pool.query(
            `SELECT COUNT(*) AS cantidad FROM Prestamos WHERE id_persona = $1 AND estado = 'ACTIVO'`,
            [id_persona]
        );
        const prestamosActivos = Number(resActivos.rows[0].cantidad);

        return {
            tope: Number(tope.toFixed(2)),
            deudaActiva: Number(deudaActiva.toFixed(2)),
            disponible: Number((tope - deudaActiva).toFixed(2)),
            prestamosActivos,
            maxPrestamosActivos: MAX_PRESTAMOS_ACTIVOS,
            puedeSolicitar: prestamosActivos < MAX_PRESTAMOS_ACTIVOS
        };
    }

    // 6. SOLICITAR un préstamo nuevo
    static async solicitar(cbu, monto, plazoMeses) {
        // En DEMO_MODE, esta es la única barrera antes de consultar/informar deuda en la red
        // compartida del Banco Central (/central-deudores): sin verificación de sesión en el
        // backend, cualquiera podría pedir un préstamo "desde" cualquier CBU. Ver config/demoMode.js.
        verificarCbuPermitidoEnDemo(cbu);

        if (!PLAZOS_PERMITIDOS_MESES.includes(Number(plazoMeses))) {
            throw new Error(`El plazo debe ser uno de: ${PLAZOS_PERMITIDOS_MESES.join(', ')} meses.`);
        }

        const resCuenta = await pool.query(
            `SELECT c.id_cuenta, c.saldo, pr.id_persona, p.dni
             FROM Cuentas_Bancarias c
             JOIN Productos pr ON pr.id_producto = c.id_producto
             JOIN Personas p ON p.id = pr.id_persona
             WHERE c.cbu = $1`,
            [cbu.trim()]
        );
        if (resCuenta.rows.length === 0) {
            throw new Error('La cuenta asociada a ese CBU no existe.');
        }
        const { id_cuenta, id_persona, dni, saldo } = resCuenta.rows[0];

        // Tope de cantidad: no se pueden tener más de MAX_PRESTAMOS_ACTIVOS préstamos ACTIVOS
        // en simultáneo, sin importar el monto de cada uno.
        const resActivos = await pool.query(
            `SELECT COUNT(*) AS cantidad FROM Prestamos WHERE id_persona = $1 AND estado = 'ACTIVO'`,
            [id_persona]
        );
        if (Number(resActivos.rows[0].cantidad) >= MAX_PRESTAMOS_ACTIVOS) {
            throw new Error(`Ya tenés ${MAX_PRESTAMOS_ACTIVOS} préstamos activos, el máximo permitido. Pagá alguno para poder solicitar otro.`);
        }

        // Chequeo de situación crediticia contra la red compartida del Banco Central: si algún
        // banco (el nuestro u otro) ya reportó una situación mala para este DNI, se rechaza.
        const situacionInfo = await Prestamo.consultarSituacion(dni);
        if (situacionInfo.situacion > SITUACION_MAXIMA_ACEPTADA) {
            throw new Error(`Situación crediticia desfavorable (nivel ${situacionInfo.situacion}/5 en la red de bancos). No se puede otorgar el préstamo.`);
        }

        // Tope de endeudamiento: 5x el saldo PROPIO (saldo actual menos lo que ya se debe por
        // préstamos activos — ver calcularTopeEndeudamiento), con piso $100.000 para cuentas
        // nuevas en $0. Sumamos el capital pendiente de todos los préstamos ACTIVOS + el nuevo
        // monto contra ese tope — así no se puede eludir pidiendo varios préstamos chicos, ni
        // inflando el propio tope a fuerza de tomar préstamos (ese era el bug).
        const resDeudaActiva = await pool.query(
            `SELECT COALESCE(SUM(cp.capital), 0) AS deuda_pendiente
             FROM Cuotas_Prestamo cp
             JOIN Prestamos pr ON pr.id_prestamo = cp.id_prestamo
             WHERE pr.id_persona = $1 AND pr.estado = 'ACTIVO' AND cp.estado = 'PENDIENTE'`,
            [id_persona]
        );
        const deudaActiva = Number(resDeudaActiva.rows[0].deuda_pendiente);
        const tope = calcularTopeEndeudamiento(saldo, deudaActiva);
        if (deudaActiva + Number(monto) > tope) {
            throw new Error(`Monto excede tu capacidad de endeudamiento. Tope: $${tope.toFixed(2)} (5x tu saldo propio, mínimo $100.000) · Deuda activa: $${deudaActiva.toFixed(2)} · Disponible: $${(tope - deudaActiva).toFixed(2)}`);
        }

        const { tnaOfrecida } = await Prestamo.obtenerTasaVigente(id_persona);
        const { cuotaFija, tabla } = Prestamo.simularAmortizacion(monto, plazoMeses, tnaOfrecida);

        const client = await pool.connect();
        let idPrestamo;
        try {
            await client.query('BEGIN');

            const resPrestamo = await client.query(
                `INSERT INTO Prestamos (id_persona, id_cuenta, monto, plazo_meses, tna, cuota_fija, estado)
                 VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO')
                 RETURNING id_prestamo`,
                [id_persona, id_cuenta, Number(monto), Number(plazoMeses), tnaOfrecida, cuotaFija]
            );
            idPrestamo = resPrestamo.rows[0].id_prestamo;

            const hoy = new Date();
            for (const fila of tabla) {
                const fechaVencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + fila.numero, hoy.getDate());
                await client.query(
                    `INSERT INTO Cuotas_Prestamo (id_prestamo, numero, capital, interes, cuota, fecha_vencimiento, estado)
                     VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE')`,
                    [idPrestamo, fila.numero, fila.capital, fila.interes, fila.cuota, fechaVencimiento]
                );
            }

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo + $1 WHERE id_cuenta = $2',
                [Number(monto), id_cuenta]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PRESTAMO_OTORGADO');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    id_cuenta,
                    idTipoMovimiento,
                    Number(monto),
                    `Préstamo otorgado a ${plazoMeses} meses (TNA ${tnaOfrecida}%)`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        // Informamos la deuda nueva a la red compartida del Banco Central. Best-effort: si esto
        // falla, el préstamo ya quedó otorgado localmente (mismo criterio que la resolución de
        // nombreTitular en transferencias, que tampoco bloquea la operación si el Central falla).
        try {
            await centralBankFetch('/central-deudores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni, monto: Number(monto), situacion: 1 })
            });
        } catch (error) {
            console.error('⚠️ No se pudo informar la deuda del préstamo al Banco Central:', error.message);
        }

        return { id_prestamo: idPrestamo, cuotaFija, tabla };
    }

    // 7. PAGAR UNA CUOTA
    static async pagarCuota(idCuota, cbu) {
        const client = await pool.connect();
        let dniPrestamo, prestamoSaldado = false, idPrestamo;
        try {
            await client.query('BEGIN');

            const resCuota = await client.query(
                `SELECT cp.id_cuota, cp.cuota, cp.estado, cp.numero, pr.id_prestamo, pr.id_cuenta, pr.plazo_meses,
                        p.id AS id_persona_prestamo, p.dni
                 FROM Cuotas_Prestamo cp
                 JOIN Prestamos pr ON pr.id_prestamo = cp.id_prestamo
                 JOIN Personas p ON p.id = pr.id_persona
                 WHERE cp.id_cuota = $1
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
            idPrestamo = cuota.id_prestamo;
            dniPrestamo = cuota.dni;

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
            if (cuenta.id_persona_cuenta !== cuota.id_persona_prestamo) {
                throw new Error('Esa cuota no pertenece al titular de esta cuenta.');
            }

            const importe = Number(cuota.cuota);
            if (Number(cuenta.saldo) < importe) {
                throw new Error('Saldo insuficiente.');
            }

            await client.query(
                'UPDATE Cuentas_Bancarias SET saldo = saldo - $1 WHERE id_cuenta = $2',
                [importe, cuenta.id_cuenta]
            );
            await client.query(
                "UPDATE Cuotas_Prestamo SET estado = 'PAGADA', fecha_pago = CURRENT_TIMESTAMP WHERE id_cuota = $1",
                [idCuota]
            );

            const idTipoMovimiento = await Movimiento.obtenerIdTipoMovimiento(client, 'PAGO_PRESTAMO');
            await client.query(
                `INSERT INTO movimientos (
                    id_cuenta, id_tipo_movimiento, monto, fecha_movimiento,
                    descripcion, cbu_origen, cbu_destino, id_transaccion_central
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
                [
                    cuenta.id_cuenta,
                    idTipoMovimiento,
                    -importe,
                    `Pago de préstamo, cuota ${cuota.numero}/${cuota.plazo_meses}`,
                    cbu.trim(),
                    cbu.trim(),
                    null
                ]
            );

            const resRestantes = await client.query(
                "SELECT COUNT(*) AS pendientes FROM Cuotas_Prestamo WHERE id_prestamo = $1 AND estado = 'PENDIENTE'",
                [idPrestamo]
            );
            if (Number(resRestantes.rows[0].pendientes) === 0) {
                await client.query("UPDATE Prestamos SET estado = 'PAGADO' WHERE id_prestamo = $1", [idPrestamo]);
                prestamoSaldado = true;
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        // Si el préstamo quedó totalmente pagado, avisamos al Central que la deuda se saldó
        // (best-effort, no bloquea el pago si el Central no responde).
        if (prestamoSaldado) {
            try {
                await centralBankFetch('/central-deudores', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dni: dniPrestamo, monto: 0, situacion: 1 })
                });
            } catch (error) {
                console.error('⚠️ No se pudo informar el saldado del préstamo al Banco Central:', error.message);
            }
        }

        return { prestamoSaldado };
    }
}

module.exports = Prestamo;
