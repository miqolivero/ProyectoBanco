// 🎯 AGREGADO: Cargar variables de entorno antes de cualquier otra cosa
require('dotenv').config();

const express = require('express');
const cors = require('cors');

// --- 1. INSTANCIACIÓN DE EXPRESS (¡Primero que nada!) ---
const app = express();

// --- 2. CONFIGURACIÓN DE CORS ---
// 🎯 Vite a veces levanta en otro puerto (5174, 5175...) si el 5173 ya está ocupado por
// una instancia vieja de "npm run dev" que quedó corriendo de otra sesión — con el origin
// fijo a 5173 esos casos rompían silenciosamente todos los fetch del front con "Failed to
// fetch". Aceptamos cualquier puerto de localhost/127.0.0.1 (solo en dev, nunca se despliega
// así en producción) en vez de perseguir manualmente cuál puerto quedó libre cada vez.
const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;
// 🎯 Preparado para producción: además de cualquier localhost (dev), se permite el/los
// dominio(s) del frontend ya desplegado vía FRONTEND_URL (uno o varios separados por coma,
// ej. "https://mi-banco.vercel.app"). En local, si no se define, esto queda vacío y no
// cambia nada del comportamiento actual.
const origenesPermitidos = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || localhostRegex.test(origin) || origenesPermitidos.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// --- 3. IMPORTACIÓN DE RUTAS Y CONTROLADORES ---
const personaRoutes = require('./routes/personaRoutes');
const movimientoRoutes = require('./routes/movimientoRoutes');
const servicioRoutes = require('./routes/servicioRoutes');
const reservaRoutes = require('./routes/reservaRoutes');
const tarjetaRoutes = require('./routes/tarjetaRoutes');
const plazoFijoRoutes = require('./routes/plazoFijoRoutes');
const prestamoRoutes = require('./routes/prestamoRoutes');
const seguroRoutes = require('./routes/seguroRoutes');
const cedearRoutes = require('./routes/cedearRoutes');
const asistenteRoutes = require('./routes/asistenteRoutes');
const { centralBankFetch } = require('./config/centralBank');
const { clerkAttach } = require('./middlewares/auth');
const pool = require('./config/db');

// --- 4. CONFIGURACIÓN GLOBAL ---
global.diccionarioBancos = {};

// --- 5. FUNCIÓN PARA CARGAR BANCOS DESDE LA API ---
const cargarListaBancos = async () => {
    try {
        console.log("📡 Intentando conectar con el Central...");
        
        const response = await centralBankFetch('/banks');

        console.log(`📡 Estado de la API de Bancos: ${response.status} ${response.statusText}`);

        const data = await response.json();

        if (!response.ok) {
            console.log(`⚠️ API rechazó la solicitud:`, data);
            return;
        }

        if (Array.isArray(data)) {
            data.forEach(b => {
                const codeFormatted = b.bankCode.toString().padStart(3, '0');
                global.diccionarioBancos[codeFormatted] = b.name;
            });
            console.log("✅ Diccionario de bancos cargado correctamente.");
        }
    } catch (error) {
        console.error("❌ Error de red o formato:", error.message);
    }
};

// --- 6. MIDDLEWARES REQUERIDOS ---
app.use(express.json());
// 🎯 Lee y valida (si viene) el JWT de Clerk en cada request y arma req.auth — no bloquea nada
// por sí solo, es lo que después usa requireAuth (middlewares/auth.js) en cada ruta protegida.
app.use(clerkAttach);

// --- 7. HEALTH CHECK ---
// 🎯 Sirve para dos cosas en producción: que Render pueda chequear si el servicio está vivo, y
// para poder diagnosticar de una si el backend desplegado realmente llega a la base (el error
// más típico al pasar a Supabase es que conecte el servidor pero no la DB). No expone ningún
// dato: solo dice si el SELECT de prueba respondió.
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, db: 'ok' });
    } catch (error) {
        console.error('❌ Health check: la base no responde:', error.message);
        res.status(503).json({ ok: false, db: 'error', detalle: error.message });
    }
});

// --- 8. RUTAS PRINCIPALES ---
app.use('/api/personas', personaRoutes);
app.use('/api/movimientos', movimientoRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/tarjetas', tarjetaRoutes);
app.use('/api/plazos-fijos', plazoFijoRoutes);
app.use('/api/prestamos', prestamoRoutes);
app.use('/api/seguros', seguroRoutes);
app.use('/api/cedears', cedearRoutes);
app.use('/api/asistente', asistenteRoutes);

// --- 9. MANEJO DE ERRORES BÁSICO ---
app.use((err, req, res, next) => {
    console.error("❌ Error no controlado:", err.stack);
    res.status(500).json({ error: 'Algo salió mal en el servidor' });
});

// --- 10. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`✅ Rutas listas: /api/personas y /api/movimientos`);
    
    setTimeout(cargarListaBancos, 1000);
});