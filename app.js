const express = require('express');
const cors = require('cors');

// --- 1. INSTANCIACIÓN DE EXPRESS (¡Primero que nada!) ---
const app = express();

// --- 2. CONFIGURACIÓN DE CORS ---
app.use(cors({
    origin: 'http://localhost:5173', // El puerto de tu React
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// --- 3. IMPORTACIÓN DE RUTAS Y CONTROLADORES ---
const personaRoutes = require('./routes/personaRoutes');
const movimientoRoutes = require('./routes/movimientoRoutes');
const tablaController = require('./controllers/tablaController');

// --- 4. CONFIGURACIÓN GLOBAL ---
global.diccionarioBancos = {};

// --- 5. FUNCIÓN PARA CARGAR BANCOS DESDE LA API ---
const cargarListaBancos = async () => {
    try {
        console.log("📡 Intentando conectar con el Central...");
        
        const response = await fetch('https://centralbank.brocoly.cc/api/banks', {
            method: 'GET',
            headers: { 
                'x-environment': 'test', 
                'x-api-key': '71d9a899-d4a3-4754-908a-77752e3fa1c3'
            },
            body: null 
        });

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
app.use(express.json()); // Removimos el cors() duplicado que estaba acá suelto

// --- 7. RUTAS PRINCIPALES ---

// Rutas de Personas
app.use('/api/personas', personaRoutes);

// Rutas de Movimientos
app.use('/api/movimientos', movimientoRoutes);

// Endpoint para visualizar tablas crudas
app.get('/api/tablas/:tabla', tablaController.obtenerTabla);

// Endpoint de Debug para ver si el diccionario se cargó
app.get('/debug-bancos', (req, res) => {
    res.json(global.diccionarioBancos);
});

// --- 8. MANEJO DE ERRORES BÁSICO ---
app.use((err, req, res, next) => {
    console.error("❌ Error no controlado:", err.stack);
    res.status(500).json({ error: 'Algo salió mal en el servidor' });
});

// --- 9. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`✅ Rutas listas: /api/personas y /api/movimientos`);
    
    // Ejecutamos la carga de bancos un segundo después de iniciar para mayor estabilidad
    setTimeout(cargarListaBancos, 1000);
});