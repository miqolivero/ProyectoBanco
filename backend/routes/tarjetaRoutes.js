const express = require('express');
const router = express.Router();
const tarjetaController = require('../controllers/tarjetaController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/persona/:idPersona', tarjetaController.listarPorPersona);
router.post('/solicitar', tarjetaController.solicitar);
router.post('/consumos', tarjetaController.registrarConsumo);
router.post('/pagar', tarjetaController.pagarCuota);

module.exports = router;
