// 🎯 Cuenta DEMO "sin impactar en la base de datos".
//
// Cuando alguien entra a la demo (POST /api/demo/sesion) se abre un "mundo": una conexión
// propia a Postgres con una transacción que NUNCA se confirma. Todo lo que hace la persona
// (transferir, pagar un QR, pedir un préstamo...) corre adentro de esa transacción, así que ve
// sus cambios al instante, pero nadie más los ve y al salir de la demo —o a los 15 minutos sin
// uso— se hace ROLLBACK y la base queda exactamente como estaba.
//
// Para no tener que tocar los ~100 lugares que usan `pool.query` / `pool.connect`, config/db.js
// le pregunta a este módulo si la request actual pertenece a un mundo (AsyncLocalStorage) y, si
// es así, manda la consulta a la conexión del mundo. Los BEGIN/COMMIT/ROLLBACK de los modelos
// se traducen a SAVEPOINTs: siguen siendo atómicos (un ROLLBACK deshace solo lo de ese modelo),
// pero nunca confirman nada de verdad.
//
// El Banco Central también se simula adentro de un mundo (ver centralFalso): una demo pública
// no puede mandar transferencias reales a la red compartida de la cátedra.
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

// Personas de la demo (clerk_id en la base, ver init/06_cuenta_demo.sql). Son las únicas
// identidades que se pueden usar con un token de demo.
const USUARIOS_DEMO = ['demo_cliente', 'demo_comercio'];
const USUARIO_DEMO_PRINCIPAL = 'demo_cliente';
// Cobro QR pendiente que viene cargado en la demo (lo genera el comercio demo) para que se
// pueda probar el pago escaneando un QR apenas se entra.
const ID_COBRO_EJEMPLO = 'de300000-0000-4000-8000-000000000001';

const MINUTOS_INACTIVIDAD = Number(process.env.DEMO_MINUTOS_INACTIVIDAD || 15);
const MINUTOS_MAXIMOS = Number(process.env.DEMO_MINUTOS_MAXIMOS || 60);
// Cada mundo ocupa una conexión del pool mientras dura: se limita para no dejar sin conexiones
// a los clientes reales. Si se llena, se cierra el mundo más viejo.
const MAX_MUNDOS = Number(process.env.DEMO_MAX_SESIONES || 3);

const contexto = new AsyncLocalStorage();
const mundos = new Map();

function mundoActual() {
    return contexto.getStore() || null;
}

class Mundo {
    constructor(token, client) {
        this.token = token;
        this.client = client;
        this.creado = Date.now();
        this.ultimoUso = Date.now();
        this.cola = Promise.resolve();
        this.seq = 0;
        this.cerrado = false;
        // Transacciones "enviadas" al Central falso, para que la sincronización las acredite.
        this.transacciones = [];
        // Se completan con la copia privada de la cuenta demo (ver clonarCuentaDemo).
        this.cbusDemo = new Set();
        this.clerkIds = {};
        this.cobroEjemplo = null;
    }

    // Consulta "suelta" (fuera de una transacción de un modelo): va directo a la conexión.
    query(...args) {
        return this.client.query(...args);
    }

    // Lo que devuelve `pool.connect()` dentro de un mundo: un cliente que traduce las
    // transacciones del modelo a savepoints sobre la conexión del mundo.
    conectar() {
        const mundo = this;
        const pila = [];
        return {
            async query(texto, ...resto) {
                const sentencia = typeof texto === 'string' ? texto.trim().toUpperCase() : '';
                if (sentencia === 'BEGIN') {
                    const sp = `sp_${++mundo.seq}`;
                    await mundo.client.query(`SAVEPOINT ${sp}`);
                    pila.push(sp);
                    return { rows: [], rowCount: 0 };
                }
                if (sentencia === 'COMMIT') {
                    const sp = pila.pop();
                    if (sp) await mundo.client.query(`RELEASE SAVEPOINT ${sp}`);
                    return { rows: [], rowCount: 0 };
                }
                if (sentencia === 'ROLLBACK') {
                    const sp = pila.pop();
                    if (sp) {
                        await mundo.client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
                        await mundo.client.query(`RELEASE SAVEPOINT ${sp}`);
                    }
                    return { rows: [], rowCount: 0 };
                }
                return mundo.client.query(texto, ...resto);
            },
            release() { /* la conexión es del mundo: se libera recién al cerrarlo */ }
        };
    }

    // Serializa las requests del mundo (una a la vez sobre la misma conexión) y envuelve cada
    // una en un savepoint: si una consulta suelta falla y deja la transacción abortada, se
    // vuelve al estado previo a esa request en vez de dejar el mundo inutilizable.
    async ejecutar(req, res, next) {
        const anterior = this.cola;
        let liberar;
        this.cola = new Promise(resolve => { liberar = resolve; });
        await anterior;

        if (this.cerrado) {
            liberar();
            return res.status(410).json({ error: 'La sesión de demo terminó. Volvé a entrar.', codigo: 'DEMO_EXPIRADA' });
        }
        this.ultimoUso = Date.now();
        const sp = `req_${++this.seq}`;
        let terminado = false;
        const terminar = async () => {
            if (terminado) return;
            terminado = true;
            try {
                await this.client.query(`RELEASE SAVEPOINT ${sp}`);
            } catch {
                try {
                    await this.client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
                    await this.client.query(`RELEASE SAVEPOINT ${sp}`);
                } catch (error) {
                    console.error('❌ Demo: el mundo quedó inutilizable, se cierra:', error.message);
                    cerrarMundo(this.token);
                }
            }
            liberar();
        };
        res.on('finish', terminar);
        res.on('close', terminar);

        try {
            await this.client.query(`SAVEPOINT ${sp}`);
        } catch (error) {
            console.error('❌ Demo: no se pudo abrir el savepoint de la request:', error.message);
            cerrarMundo(this.token);
            await terminar();
            return res.status(410).json({ error: 'La sesión de demo terminó. Volvé a entrar.', codigo: 'DEMO_EXPIRADA' });
        }
        contexto.run(this, () => next());
    }

    // 🎯 Banco Central simulado. Las consultas de solo lectura sobre cuentas que NO son de la
    // demo van al Central real (así se puede ver el nombre del titular de un alias de otro
    // banco); todo lo que escribe en la red compartida se responde acá sin salir.
    async centralFalso(path, options, fetchReal) {
        const metodo = (options.method || 'GET').toUpperCase();
        const body = options.body ? JSON.parse(options.body) : null;
        const responder = (status, datos) => new Response(datos === undefined ? null : JSON.stringify(datos), {
            status, headers: { 'Content-Type': 'application/json' }
        });
        const buscarCuenta = async (campo, valor) => {
            const r = await this.client.query(
                `SELECT cb.cbu, cb.alias, cb.moneda, p.nombre, p.apellido FROM Cuentas_Bancarias cb
                 JOIN Productos pr ON pr.id_producto = cb.id_producto
                 JOIN Personas p ON p.id = pr.id_persona
                 WHERE cb.${campo} = $1`, [valor]);
            return r.rows[0] || null;
        };
        let m;

        if (metodo === 'GET' && (m = path.match(/^\/persons\/alias\/(.+)$/))) {
            const c = await buscarCuenta('alias', decodeURIComponent(m[1]).toLowerCase());
            if (c) return responder(200, { cbu: c.cbu, nombre: c.nombre, apellido: c.apellido });
            return fetchReal();
        }
        if (metodo === 'GET' && (m = path.match(/^\/persons\/(\d{22})$/))) {
            const c = await buscarCuenta('cbu', m[1]);
            if (c) return responder(200, { cbu: c.cbu, nombre: c.nombre, apellido: c.apellido });
            return fetchReal();
        }
        if (metodo === 'GET' && (m = path.match(/^\/accounts\/(\d{22})$/))) {
            const c = await buscarCuenta('cbu', m[1]);
            if (c) return c.moneda === 'ARS' ? responder(404, { message: 'Sin cuenta aparte' }) : responder(200, { cbu: c.cbu, moneda: c.moneda });
            return fetchReal();
        }
        if (metodo === 'POST' && path === '/transactions') {
            const destino = await buscarCuenta('cbu', body.cbuDestino);
            const origen = await buscarCuenta('cbu', body.cbuOrigen);
            const t = {
                _id: `demo-${crypto.randomUUID()}`,
                cbuOrigen: body.cbuOrigen,
                cbuDestino: body.cbuDestino,
                importe: body.importe,
                estado: 'aprobada',
                createdAt: new Date().toISOString(),
                personaOrigen: origen ? { nombre: origen.nombre, apellido: origen.apellido } : null
            };
            // Solo se acredita localmente si el destino es otra cuenta de la demo. Si es una
            // cuenta real (de este banco o de otro), en la demo la plata "sale" pero no se toca
            // la cuenta de nadie: ni se bloquea su fila ni se le suma saldo.
            if (this.cbusDemo.has(body.cbuDestino)) this.transacciones.push(t);
            let nombreDestino = destino ? `${destino.nombre} ${destino.apellido}` : null;
            if (!nombreDestino) {
                try {
                    // GET explícito: sin el {} heredaría el POST (y el body) de la transferencia.
                    const r = await fetchReal(`/persons/${body.cbuDestino}`, {});
                    if (r.ok) {
                        const p = await r.json();
                        nombreDestino = `${p.nombre || ''} ${p.apellido || ''}`.trim() || null;
                    }
                } catch { /* best-effort, como en la transferencia real */ }
            }
            return responder(201, { transaccionId: t._id, nombreDestino });
        }
        if (metodo === 'GET' && path.startsWith('/transactions')) {
            return responder(200, this.transacciones);
        }
        if (metodo === 'POST' && (path === '/accounts' || path === '/persons')) {
            const cbu = '0049999' + String(Date.now()).slice(-11) + String(Math.floor(Math.random() * 1e4)).padStart(4, '0');
            this.cbusDemo.add(cbu);
            return responder(201, { cbu, alias: body?.alias || null, moneda: body?.moneda || 'ARS', saldo: 0 });
        }
        if (metodo === 'PUT' && /^\/persons\/\d{22}\/alias$/.test(path)) {
            return responder(200, { mensaje: 'Alias actualizado (demo)' });
        }
        if (metodo === 'GET' && (m = path.match(/^\/central-deudores\/(\d+)$/))) {
            return responder(200, { dni: m[1], situacion: 1, deudas: [] });
        }
        if (metodo === 'POST' && path === '/central-deudores') {
            return responder(201, body);
        }
        if (metodo === 'GET') return fetchReal();
        return responder(403, { message: 'Operación no disponible en la demo.' });
    }
}

// 🎯 Copia privada de la cuenta demo para UN mundo.
//
// Las filas de init/06_cuenta_demo.sql son una PLANTILLA que ningún mundo toca. Si todos los
// mundos operaran sobre las mismas filas, el primero que modificara un saldo dejaría esa fila
// bloqueada hasta que termine (su transacción nunca se confirma), y cualquier otra demo abierta
// al mismo tiempo —otra pestaña, el celular, otra persona— fallaría con "lock timeout".
// Por eso, al abrir un mundo se copia la plantilla (personas, cuentas, movimientos, tarjeta,
// plazo fijo, reserva...) DENTRO de su transacción, con CBU/alias/DNI únicos: cada demo tiene
// sus propias filas, no compite con nadie, y la copia desaparece con el ROLLBACK.
async function clonarCuentaDemo(client) {
    const sufijo = crypto.randomInt(100000, 999999).toString();
    const q = (texto, params) => client.query(texto, params);
    const columnas = {};
    const columnasDe = async (tabla) => {
        if (!columnas[tabla]) {
            const r = await q(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [tabla]);
            columnas[tabla] = r.rows.map(c => c.column_name);
        }
        return columnas[tabla];
    };
    // Copia una fila cambiando algunas columnas; devuelve la PK nueva.
    const copiarFila = async (tabla, pk, fila, cambios) => {
        const cols = (await columnasDe(tabla)).filter(c => c !== pk);
        const valores = cols.map(c => (c in cambios ? cambios[c] : fila[c]));
        const r = await q(
            `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${pk}`,
            valores);
        return r.rows[0][pk];
    };
    // Copia todas las filas de `tabla` cuya columna `fk` apunte a algo ya copiado, remapeando
    // esa y las demás columnas de `remapeos`. Devuelve Map(pk vieja → pk nueva).
    const copiarHijos = async (tabla, pk, fk, remapeos, cambiosExtra = () => ({})) => {
        const mapa = new Map();
        const claves = [...remapeos[fk].keys()];
        if (claves.length === 0) return mapa;
        const filas = (await q(`SELECT * FROM ${tabla} WHERE ${fk} = ANY($1) ORDER BY ${pk}`, [claves])).rows;
        for (const fila of filas) {
            const cambios = {};
            for (const [col, m] of Object.entries(remapeos)) {
                if (fila[col] != null && m.has(fila[col])) cambios[col] = m.get(fila[col]);
            }
            Object.assign(cambios, cambiosExtra(fila));
            mapa.set(fila[pk], await copiarFila(tabla, pk, fila, cambios));
        }
        return mapa;
    };
    const digitos = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

    // 1. Personas (la plantilla se reconoce por su clerk_id)
    const personas = (await q('SELECT * FROM Personas WHERE clerk_id = ANY($1) ORDER BY id', [USUARIOS_DEMO])).rows;
    if (personas.length === 0) return null;
    const mPersonas = new Map();
    const clerkIds = {};
    for (const [i, p] of personas.entries()) {
        const clerkId = `${p.clerk_id}__${sufijo}`;
        clerkIds[p.clerk_id] = clerkId;
        mPersonas.set(p.id, await copiarFila('personas', 'id', p, { dni: `9${i}${sufijo}`, clerk_id: clerkId }));
    }
    await q(
        `INSERT INTO Roles_x_Personas (id_persona, id_rol)
         SELECT m.nueva, rp.id_rol FROM Roles_x_Personas rp
         JOIN unnest($1::int[], $2::int[]) AS m(vieja, nueva) ON m.vieja = rp.id_persona`,
        [[...mPersonas.keys()], [...mPersonas.values()]]);

    // 2. Productos y cuentas (CBU y alias nuevos, únicos)
    const mProductos = await copiarHijos('productos', 'id_producto', 'id_persona', { id_persona: mPersonas });
    const mCbus = new Map();
    const mCuentas = await copiarHijos('cuentas_bancarias', 'id_cuenta', 'id_producto', { id_producto: mProductos }, (c) => {
        const cbu = `0049998${sufijo}${digitos(9)}`;
        mCbus.set(c.cbu, cbu);
        return { cbu, alias: c.alias ? `${c.alias}.${sufijo}`.slice(0, 50) : null };
    });

    // 3. Movimientos, en un solo INSERT (son la mayoría de las filas)
    await q(
        `INSERT INTO Movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion,
                                  cbu_origen, cbu_destino, id_transaccion_central)
         SELECT mc.nueva, m.id_tipo_movimiento, m.monto, m.fecha_movimiento, m.descripcion,
                COALESCE(o.nuevo, m.cbu_origen), COALESCE(d.nuevo, m.cbu_destino), m.id_transaccion_central
         FROM Movimientos m
         JOIN unnest($1::int[], $2::int[]) AS mc(vieja, nueva) ON mc.vieja = m.id_cuenta
         LEFT JOIN unnest($3::text[], $4::text[]) AS o(viejo, nuevo) ON o.viejo = m.cbu_origen
         LEFT JOIN unnest($3::text[], $4::text[]) AS d(viejo, nuevo) ON d.viejo = m.cbu_destino
         ORDER BY m.id_movimiento`,
        [[...mCuentas.keys()], [...mCuentas.values()], [...mCbus.keys()], [...mCbus.values()]]);

    // 4. Productos asociados
    const mTarjetas = await copiarHijos('tarjetas_credito', 'id_tarjeta', 'id_producto', { id_producto: mProductos },
        () => ({ numero_tarjeta: `4507${digitos(12)}` }));
    const mConsumos = await copiarHijos('consumos_tarjeta', 'id_consumo', 'id_tarjeta', { id_tarjeta: mTarjetas });
    await copiarHijos('cuotas_tarjeta', 'id_cuota', 'id_consumo', { id_consumo: mConsumos });
    await copiarHijos('plazos_fijos', 'id_plazo_fijo', 'id_cuenta', { id_cuenta: mCuentas });
    await copiarHijos('reservas', 'id_reserva', 'id_cuenta', { id_cuenta: mCuentas });
    const mCobros = await copiarHijos('cobros', 'id_cobro', 'id_cuenta_cobradora',
        { id_cuenta_cobradora: mCuentas, id_cuenta_pagadora: mCuentas });

    // 5. Servicios agendados propios (con monto fijo: generan su factura del mes). Así se puede
    // probar el pago de servicios sin tocar facturas de clientes reales (ver servicioController).
    const idCliente = mPersonas.get(personas.find(p => p.clerk_id === USUARIO_DEMO_PRINCIPAL)?.id);
    if (idCliente) {
        await q(
            `INSERT INTO Servicios_Agendados (id_persona, id_empresa, numero_cliente, alias, monto_fijo, dia_vencimiento, debito_automatico)
             SELECT $1, e.id_empresa, $2 || e.id_empresa, s.alias, s.monto, 10, false
             FROM (VALUES ('Electricidad', 'Luz de casa', 21450.00), ('Gas', 'Gas de casa', 18900.00)) AS s(rubro, alias, monto)
             JOIN LATERAL (SELECT id_empresa FROM Empresas_Servicio WHERE rubro = s.rubro ORDER BY id_empresa LIMIT 1) e ON true`,
            [idCliente, `D${sufijo}-`]);
    }

    return {
        clerkIds,
        cbus: new Set(mCbus.values()),
        cobroEjemplo: mCobros.get(ID_COBRO_EJEMPLO) || null
    };
}

async function cerrarMundo(token) {
    const mundo = mundos.get(token);
    if (!mundo || mundo.cerrado) return;
    mundo.cerrado = true;
    mundos.delete(token);
    try {
        await mundo.client.query('ROLLBACK');
    } catch (error) {
        console.error('⚠️ Demo: error al deshacer el mundo:', error.message);
    }
    // true = destruir la conexión en vez de devolverla al pool (tenía SETs de sesión propios).
    mundo.client.release(true);
    console.log(`🧪 Demo cerrada (${mundos.size} activas). Todo lo hecho se deshizo.`);
}

// `conectarReal` es el pool.connect original (sin pasar por el desvío de config/db.js).
async function crearMundo(conectarReal) {
    if (mundos.size >= MAX_MUNDOS) {
        const masViejo = [...mundos.values()].sort((a, b) => a.ultimoUso - b.ultimoUso)[0];
        await cerrarMundo(masViejo.token);
    }
    const client = await conectarReal();
    try {
        // Una demo nunca debería quedarse esperando un bloqueo de un cliente real, ni colgar.
        await client.query("SET lock_timeout = '5s'");
        await client.query("SET statement_timeout = '20s'");
        // Red de seguridad del lado de Postgres: si el servidor de Node muere, la base corta sola
        // la transacción abierta (y la deshace) en vez de dejarla colgada para siempre.
        await client.query(`SET idle_in_transaction_session_timeout = '${MINUTOS_MAXIMOS + 5}min'`);
        await client.query('BEGIN');
    } catch (error) {
        client.release(true);
        throw error;
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const mundo = new Mundo(token, client);
    let copia;
    try {
        copia = await clonarCuentaDemo(client);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* la conexión se descarta igual */ }
        client.release(true);
        throw error;
    }
    if (!copia) {
        await client.query('ROLLBACK');
        client.release(true);
        return null; // falta correr init/06_cuenta_demo.sql
    }
    mundo.clerkIds = copia.clerkIds;
    mundo.cbusDemo = copia.cbus;
    mundo.cobroEjemplo = copia.cobroEjemplo;
    mundos.set(token, mundo);
    console.log(`🧪 Demo abierta (${mundos.size} activas).`);
    return mundo;
}

function obtenerMundo(token) {
    return token ? mundos.get(token) || null : null;
}

// Cierra los mundos inactivos o que ya duraron demasiado.
setInterval(() => {
    const ahora = Date.now();
    for (const mundo of mundos.values()) {
        if (ahora - mundo.ultimoUso > MINUTOS_INACTIVIDAD * 60000 || ahora - mundo.creado > MINUTOS_MAXIMOS * 60000) {
            cerrarMundo(mundo.token);
        }
    }
}, 60000).unref();

module.exports = {
    USUARIOS_DEMO, USUARIO_DEMO_PRINCIPAL, ID_COBRO_EJEMPLO, MINUTOS_INACTIVIDAD,
    mundoActual, crearMundo, obtenerMundo, cerrarMundo
};
