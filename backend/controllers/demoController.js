const pool = require('../config/db');
const {
    USUARIOS_DEMO, USUARIO_DEMO_PRINCIPAL, ID_COBRO_EJEMPLO, MINUTOS_INACTIVIDAD,
    crearMundo, obtenerMundo, cerrarMundo
} = require('../config/sandboxDemo');
const { esUuid } = require('../utils/validaciones');

// Lo que el frontend necesita para mostrar la demo.
function datosSesion(mundo, usuario) {
    return {
        token: mundo.token,
        usuario,
        usuarios: USUARIOS_DEMO,
        cobroEjemplo: ID_COBRO_EJEMPLO,
        minutosInactividad: MINUTOS_INACTIVIDAD
    };
}

// 1. ENTRAR A LA DEMO (POST /api/demo/sesion) — sin registro ni login.
exports.crearSesion = async (req, res) => {
    try {
        const mundo = await crearMundo(pool.conectarReal);
        const existe = await mundo.client.query('SELECT 1 FROM Personas WHERE clerk_id = $1', [USUARIO_DEMO_PRINCIPAL]);
        if (existe.rows.length === 0) {
            await cerrarMundo(mundo.token);
            return res.status(503).json({ error: 'La cuenta demo no está cargada en la base (falta correr init/06_cuenta_demo.sql).' });
        }
        res.status(201).json(datosSesion(mundo, USUARIO_DEMO_PRINCIPAL));
    } catch (error) {
        console.error('❌ No se pudo abrir la sesión demo:', error.message);
        res.status(503).json({ error: 'No se pudo abrir la demo en este momento. Probá de nuevo en unos segundos.' });
    }
};

// 2. SUMARSE A UNA DEMO DESDE OTRO DISPOSITIVO (POST /api/demo/unirse) — es lo que pasa al
// escanear con el celular un QR generado en la demo: el link trae el token de esa sesión y se
// entra como la persona demo que NO generó el cobro (para poder pagarlo).
exports.unirse = async (req, res) => {
    const mundo = obtenerMundo(String(req.headers['x-demo-token'] || ''));
    if (!mundo) {
        return res.status(410).json({ error: 'Esa demo ya terminó. Generá un QR nuevo desde la demo.', codigo: 'DEMO_EXPIRADA' });
    }
    const { idCobro } = req.body || {};
    let usuario = USUARIO_DEMO_PRINCIPAL;
    try {
        if (esUuid(idCobro)) {
            const r = await mundo.client.query(
                `SELECT p.clerk_id FROM Cobros co
                 JOIN Cuentas_Bancarias cb ON cb.id_cuenta = co.id_cuenta_cobradora
                 JOIN Productos pr ON pr.id_producto = cb.id_producto
                 JOIN Personas p ON p.id = pr.id_persona
                 WHERE co.id_cobro = $1`, [idCobro]);
            const cobrador = r.rows[0]?.clerk_id;
            if (cobrador) usuario = USUARIOS_DEMO.find(u => u !== cobrador) || USUARIO_DEMO_PRINCIPAL;
        }
        mundo.ultimoUso = Date.now();
        res.json(datosSesion(mundo, usuario));
    } catch (error) {
        console.error('❌ Error sumándose a la demo:', error.message);
        res.status(500).json({ error: 'No se pudo entrar a la demo.' });
    }
};

// 3. SALIR (POST /api/demo/salir): se deshace todo lo hecho en la sesión.
exports.salir = async (req, res) => {
    const token = String(req.headers['x-demo-token'] || '');
    if (obtenerMundo(token)) await cerrarMundo(token);
    res.json({ message: 'Saliste de la demo. Nada de lo que hiciste quedó guardado.' });
};
