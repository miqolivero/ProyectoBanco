const express = require('express');
const router = express.Router();
const cobroController = require('../controllers/cobroController');
const { requireAuth } = require('../middlewares/auth');
const { COBROS_QR_HABILITADOS, PROXIMAMENTE } = require('../config/funcionalidades');

// Mientras el QR esté en "Próximamente" (config/funcionalidades.js), ningún endpoint responde.
router.use((req, res, next) => (COBROS_QR_HABILITADOS ? next() : res.status(403).json(PROXIMAMENTE)));

// Cobrar con QR. El QR lleva solo el id del cobro. Para pagarlo (y para ver el desglose con el
// descuento de cada uno) hay que estar logueado; sin sesión solo existe la vista /publico.
router.post('/', requireAuth, cobroController.crearCobro);
router.get('/', requireAuth, cobroController.listarMisCobros);
// Antes de '/:id' para que "resumen-mes" no se tome como un id de cobro.
router.get('/resumen-mes', requireAuth, cobroController.resumenDelMes);
router.get('/:id', requireAuth, cobroController.obtenerCobro);
// Sin sesión a propósito: lo ve quien abre el link y todavía no es cliente (solo datos mínimos).
router.get('/:id/publico', cobroController.obtenerCobroPublico);
router.post('/:id/pagar', requireAuth, cobroController.pagarCobro);
router.post('/:id/cancelar', requireAuth, cobroController.cancelarCobro);

module.exports = router;
