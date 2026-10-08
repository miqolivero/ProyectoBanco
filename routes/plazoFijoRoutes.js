const express = require('express');
const router = express.Router();
const plazoFijoController = require('../controllers/plazoFijoController');
const { requireAuth } = require('../middlewares/auth');

// La tasa vigente es información pública (como la pizarra de tasas de cualquier banco).
router.get('/tasa', plazoFijoController.obtenerTasa);
router.get('/', requireAuth, plazoFijoController.listar);
router.post('/', requireAuth, plazoFijoController.constituir);
router.post('/liquidar', requireAuth, plazoFijoController.liquidar);

module.exports = router;
