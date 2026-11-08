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
        this.cbusDemo = new Set();
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
    const cbus = await client.query(
        `SELECT cb.cbu FROM Cuentas_Bancarias cb
         JOIN Productos pr ON pr.id_producto = cb.id_producto
         JOIN Personas p ON p.id = pr.id_persona
         WHERE p.clerk_id = ANY($1)`, [USUARIOS_DEMO]);
    cbus.rows.forEach(r => mundo.cbusDemo.add(r.cbu));
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
