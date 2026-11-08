const express = require('express');
const router = express.Router();
const eventoController = require('../controllers/eventoController');
const { requireAuth } = require('../middlewares/auth');

// Calendario de beneficios y pedido de adhesión de un comercio a un evento.
router.get('/', requireAuth, eventoController.listarEventos);
router.post('/:id/adhesiones', requireAuth, eventoController.solicitarAdhesion);

module.exports = router;
