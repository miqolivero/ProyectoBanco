const express = require('express');
const router = express.Router();
const prestamoController = require('../controllers/prestamoController');
const { requireAuth } = require('../middlewares/auth');

// 🎯 Tasa y simulador ahora SÍ necesitan auth: la tasa que se muestra depende de si la persona
// ya pagó un préstamo anterior en tiempo y forma (ver Prestamo.tieneBuenHistorial), así que hay
// que saber quién pregunta para poder personalizarla.
router.get('/tasa', requireAuth, prestamoController.obtenerTasa);
router.post('/simular', requireAuth, prestamoController.simular);
router.get('/capacidad', requireAuth, prestamoController.obtenerCapacidad);
router.get('/', requireAuth, prestamoController.listar);
router.post('/', requireAuth, prestamoController.solicitar);
router.post('/pagar', requireAuth, prestamoController.pagarCuota);

module.exports = router;
