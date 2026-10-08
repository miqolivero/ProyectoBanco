const express = require('express');
const router = express.Router();
const seguroController = require('../controllers/seguroController');
const { requireAuth } = require('../middlewares/auth');

// Catálogo de productos de seguro: público (como la vidriera de cualquier aseguradora).
router.get('/productos', seguroController.listarProductos);
router.post('/cotizar', requireAuth, seguroController.cotizar);
router.post('/contratar', requireAuth, seguroController.contratar);
router.get('/persona/:idPersona', requireAuth, seguroController.listarPorPersona);
router.post('/cancelar', requireAuth, seguroController.cancelar);

module.exports = router;
