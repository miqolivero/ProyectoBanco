const express = require('express');
const router = express.Router();
const movimientoController = require('../controllers/movimientoController');

// IMPORTANTE: Aquí NO ponemos /api/movimientos porque eso ya está en app.js
// Solo ponemos lo que sigue después.

// Ruta para transferir (POST http://localhost:3001/api/movimientos/transferir)
router.post('/transferir', movimientoController.realizarTransferencia);

// Ruta para el historial (GET http://localhost:3001/api/movimientos/historial)
router.get('/historial', movimientoController.obtenerTransacciones);

// ... otras rutas
router.get('/sincronizar', movimientoController.sincronizarTransferenciasRecibidas);

router.post('/depositar', movimientoController.realizarDeposito);

module.exports = router;