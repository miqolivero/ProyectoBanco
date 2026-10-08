const express = require('express');
const router = express.Router();
const reservaController = require('../controllers/reservaController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/', reservaController.listar);
router.post('/', reservaController.crear);
router.post('/aportar', reservaController.aportar);
router.post('/retirar', reservaController.retirar);
router.delete('/:idReserva', reservaController.eliminar);

module.exports = router;
