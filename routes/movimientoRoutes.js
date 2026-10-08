const express = require('express');
const router = express.Router();
const movimientoController = require('../controllers/movimientoController');
const { requireAuth } = require('../middlewares/auth');

// IMPORTANTE: Aquí NO ponemos /api/movimientos porque eso ya está en app.js
// Solo ponemos lo que sigue después.

// 🎯 requireAuth en todo lo que toca cuentas/saldo — el controller además valida con
// exigirCbuPropio que el CBU del body/query sea realmente una cuenta de quien está logueado
// (no alcanza con estar autenticado: hay que ser dueño del CBU sobre el que se opera).
// /cambio/cotizacion queda pública a propósito (es solo el valor del dólar, sin datos
// personales — como cualquier casa de cambio muestra su pizarra sin pedir login).

// Ruta para transferir (POST http://localhost:3001/api/movimientos/transferir)
router.post('/transferir', requireAuth, movimientoController.realizarTransferencia);

// Ruta para el historial (GET http://localhost:3001/api/movimientos/historial)
router.get('/historial', requireAuth, movimientoController.obtenerTransacciones);

// ... otras rutas
router.get('/sincronizar', requireAuth, movimientoController.sincronizarTransferenciasRecibidas);

router.post('/depositar', requireAuth, movimientoController.realizarDeposito);

router.post('/recargar', requireAuth, movimientoController.realizarRecarga);

router.get('/validar-destino/:destino', requireAuth, movimientoController.buscarTitularDestino);

// Cambio de divisa (comprar/vender dólares contra la propia cuenta)
router.get('/cambio/cotizacion', movimientoController.obtenerCotizacionCambio);
router.post('/cambio', requireAuth, movimientoController.realizarCambioDivisa);

module.exports = router;