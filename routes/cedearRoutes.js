const express = require('express');
const router = express.Router();
const cedearController = require('../controllers/cedearController');
const { requireAuth } = require('../middlewares/auth');

// Catálogo con cotización en vivo: público (como cualquier pizarra de precios de mercado).
router.get('/catalogo', cedearController.listarCatalogo);
router.post('/ordenes', requireAuth, cedearController.registrarOrden);
router.get('/persona/:idPersona/portafolio', requireAuth, cedearController.obtenerPortafolio);

module.exports = router;
