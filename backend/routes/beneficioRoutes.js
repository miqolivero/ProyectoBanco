const express = require('express');
const router = express.Router();
const beneficioController = require('../controllers/beneficioController');
const { requireAuth } = require('../middlewares/auth');

// Evento destacado, ahorro del mes y bonificación de mantenimiento (pantalla de Inicio).
router.get('/resumen', requireAuth, beneficioController.obtenerResumen);

module.exports = router;
