// 🎯 Middleware de autenticación real del backend.
//
// Hasta ahora Clerk solo validaba el login del lado del frontend — el backend confiaba
// ciegamente en el `cbu`/`idPersona` que viniera en el body/query de cada request. Cualquiera
// que supiera (o adivinara) el CBU de otro usuario podía transferir, pagar servicios, liquidar
// plazos fijos, etc. "desde" esa cuenta sin ser su dueño. Esto verifica el JWT de Clerk en cada
// request protegida y resuelve qué CBUs/persona le pertenecen de verdad, para que los
// controllers puedan comparar contra eso en vez de confiar en el body.
const { clerkMiddleware, getAuth } = require('@clerk/express');
const Persona = require('../models/personaModel');

// 🎯 @clerk/express (v2) necesita TANTO la Secret Key como la Publishable Key para poder
// verificar un token — si falta cualquiera de las dos, clerkMiddleware() tira una excepción
// interna en cuanto procesa la primera request (parsePublishableKey / "Publishable key is
// missing"), y esa excepción no siempre se comporta igual según qué headers traiga la request
// (se comprobó en pruebas: a veces corta con 500, a veces la deja pasar de largo sin auth). Nada
// de eso es aceptable para el middleware que se supone protege el dinero — así que NI SIQUIERA
// se instancia clerkMiddleware() si falta alguna clave: quedan handlers propios que cortan con
// un 503 claro y predecible, sin depender del comportamiento interno de la librería ante una
// config incompleta.
const CLERK_LISTO = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

if (!CLERK_LISTO) {
    console.warn(
        '⚠️  Falta CLERK_SECRET_KEY y/o CLERK_PUBLISHABLE_KEY — TODOS los endpoints protegidos ' +
        'van a rechazar las requests con 503 hasta que se completen en .env ' +
        '(Clerk Dashboard → API Keys).'
    );
}

// Se monta una sola vez, global, en app.js: no bloquea nada por sí sola, solo intenta leer y
// verificar el token si viene uno (deja `req.auth` listo para que requireAuth lo use). Si falta
// alguna clave, es un no-op — requireAuth es quien corta la request en ese caso, más abajo.
const clerkAttach = CLERK_LISTO
    ? clerkMiddleware({
          secretKey: process.env.CLERK_SECRET_KEY,
          publishableKey: process.env.CLERK_PUBLISHABLE_KEY
      })
    : (req, res, next) => next();

// Middleware "duro": corta la request con 503/401/404/403 si no hay sesión válida o la persona
// autenticada no tiene registro local todavía. Deja `req.personaAutenticada` = { id, dni,
// nombre, apellido, cbus: [{cbu, moneda}] } para que el controller lo use.
async function requireAuth(req, res, next) {
    if (!CLERK_LISTO) {
        return res.status(503).json({ error: 'El servidor no tiene la autenticación configurada todavía.' });
    }
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return res.status(401).json({ error: 'No autenticado. Iniciá sesión para continuar.' });
        }

        const identidad = await Persona.getIdentidadCompleta(userId);
        if (!identidad) {
            return res.status(404).json({ error: 'Tu sesión es válida pero todavía no completaste el registro.' });
        }

        req.personaAutenticada = identidad;
        next();
    } catch (error) {
        console.error('❌ Error verificando sesión:', error.message);
        res.status(500).json({ error: 'No se pudo verificar la sesión.' });
    }
}

// Confirma que `cbu` sea una cuenta real de la persona autenticada (en cualquier moneda).
// Devuelve true/false y responde el 403 por su cuenta — así el controller solo hace:
//   if (!exigirCbuPropio(req, res, cbu)) return;
// Si `cbu` viene vacío/undefined no corta acá — deja que el controller valide "falta el dato"
// con su propio mensaje, como ya hacía antes.
function exigirCbuPropio(req, res, cbu) {
    if (!cbu) return true;
    const cbuLimpio = String(cbu).trim();
    const esPropio = req.personaAutenticada.cbus.some(c => c.cbu === cbuLimpio);
    if (!esPropio) {
        res.status(403).json({ error: 'Esa cuenta no te pertenece.' });
        return false;
    }
    return true;
}

// Igual que exigirCbuPropio pero para endpoints que identifican al actor por idPersona en vez
// de por CBU (tarjetas, préstamos, seguros).
function exigirPersonaPropia(req, res, idPersona) {
    if (!idPersona) return true;
    if (String(req.personaAutenticada.id) !== String(idPersona)) {
        res.status(403).json({ error: 'Ese recurso no te pertenece.' });
        return false;
    }
    return true;
}

// Versión liviana de requireAuth para los dos endpoints que se llaman ANTES de que exista un
// registro local (personaController: obtenerPorClerk, crearPersona) — no pueden usar requireAuth
// porque este busca una fila en Personas que todavía puede no existir. Devuelve el userId de la
// sesión actual, o null si no hay sesión válida (incluida la config incompleta de Clerk) — nunca
// tira una excepción hacia afuera, así el controller solo hace `if (!userId) return 401`.
function obtenerUserIdSesion(req) {
    if (!CLERK_LISTO) return null;
    try {
        return getAuth(req).userId || null;
    } catch {
        return null;
    }
}

module.exports = { clerkAttach, requireAuth, exigirCbuPropio, exigirPersonaPropia, obtenerUserIdSesion };
