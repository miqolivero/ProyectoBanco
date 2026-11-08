const Evento = require('../models/eventoModel');
const Cobro = require('../models/cobroModel');
const Persona = require('../models/personaModel');
const { exigirCbuPropio } = require('../middlewares/auth');
const { EVENTOS_HABILITADOS } = require('../config/funcionalidades');

// Mientras los eventos estén apagados (config/funcionalidades.js), el frontend los muestra como
// "Próximamente" y estos endpoints responden 403 por si alguien los llama directo.
const PROXIMAMENTE = { error: 'El calendario de beneficios y la adhesión de comercios estarán disponibles próximamente.', codigo: 'PROXIMAMENTE' };

// 1. CALENDARIO DE BENEFICIOS (GET /api/eventos): vigentes y próximos, con sus adheridos.
exports.listarEventos = async (req, res) => {
    if (!EVENTOS_HABILITADOS) return res.status(403).json(PROXIMAMENTE);
    try {
        const eventos = await Evento.listarVigentesYProximos(req.personaAutenticada.id);
        res.json(eventos);
    } catch (error) {
        console.error('❌ Error listando eventos:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el calendario de beneficios.' });
    }
};

// 2. "QUIERO SUMARME" (POST /api/eventos/:id/adhesiones)
// Crea una adhesión PENDIENTE (la aprobación queda fuera de alcance: no hay panel para eso).
// Se valida solo, sin intervención: que la cuenta esté activa y en pesos, y que la provincia
// del domicilio de la persona sea la del evento.
exports.solicitarAdhesion = async (req, res) => {
    if (!EVENTOS_HABILITADOS) return res.status(403).json(PROXIMAMENTE);
    const idEvento = Number(req.params.id);
    const { cbu, nombre_comercial, rubro } = req.body;

    const nombreComercial = String(nombre_comercial || '').trim();
    const rubroLimpio = String(rubro || '').trim();
    if (nombreComercial.length < 2 || nombreComercial.length > 120) {
        return res.status(400).json({ error: 'Ingresá el nombre comercial (entre 2 y 120 caracteres).' });
    }
    if (rubroLimpio.length < 2 || rubroLimpio.length > 80) {
        return res.status(400).json({ error: 'Ingresá el rubro (entre 2 y 80 caracteres).' });
    }
    if (!Number.isInteger(idEvento) || idEvento <= 0) {
        return res.status(404).json({ error: 'El evento no existe.' });
    }

    const cbuCuenta = cbu ? String(cbu).trim() : req.personaAutenticada.cbus.find(c => c.moneda === 'ARS')?.cbu;
    if (!cbuCuenta) return res.status(400).json({ error: 'Necesitás una cuenta en pesos para adherirte.' });
    if (!exigirCbuPropio(req, res, cbuCuenta)) return;

    try {
        const evento = await Evento.obtenerPorId(idEvento);
        if (!evento || !evento.activo || !evento.no_terminado) {
            return res.status(404).json({ error: 'El evento no existe o ya terminó.' });
        }

        const cuenta = await Cobro.obtenerCuenta(cbuCuenta);
        if (!cuenta || cuenta.estado_producto !== 'ACTIVO') {
            return res.status(400).json({ error: 'Tu cuenta no está activa: no se puede pedir la adhesión.' });
        }
        if (cuenta.moneda !== 'ARS') {
            return res.status(400).json({ error: 'La adhesión tiene que hacerse con tu cuenta en pesos.' });
        }

        const { provincia } = await Persona.obtenerBonificacion(req.personaAutenticada.id);
        if (!provincia) {
            return res.status(400).json({ error: 'Completá la provincia de tu domicilio antes de adherirte.' });
        }
        if (provincia !== evento.provincia) {
            return res.status(400).json({
                error: `Este evento es para comercios de ${evento.provincia} y tu domicilio está en ${provincia}.`
            });
        }

        const adhesion = await Evento.solicitarAdhesion(cuenta.id_cuenta, idEvento, nombreComercial, rubroLimpio);
        res.status(201).json({ message: '¡Solicitud enviada! El banco la va a revisar.', adhesion });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya pediste sumarte a este evento con esa cuenta.' });
        }
        console.error('❌ Error solicitando adhesión:', error.message);
        res.status(500).json({ error: 'No se pudo enviar la solicitud.' });
    }
};
