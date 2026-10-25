const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireGerente } = require('../middlewares/auth');

// Panel de gerencia: todo el router exige sesión válida Y el rol Gerente. Se aplica con
// router.use para que ninguna ruta nueva que se agregue acá pueda quedar desprotegida por olvido.
router.use(requireAuth, requireGerente);

router.get('/resumen', adminController.resumen);
router.get('/clientes', adminController.clientes);
router.get('/movimientos', adminController.movimientos);

module.exports = router;
