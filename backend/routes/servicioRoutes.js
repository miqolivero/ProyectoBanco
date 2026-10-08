const express = require('express');
const router = express.Router();
const servicioController = require('../controllers/servicioController');
const { requireAuth } = require('../middlewares/auth');

// Catálogo público (nombre de empresas, consulta de deuda por número de cliente) — sin datos
// del usuario logueado, no necesita auth. Todo lo que paga o toca la agenda de alguien sí.
router.get('/empresas', servicioController.listarEmpresas);
router.get('/empresas/:idEmpresa/deuda', servicioController.obtenerDeuda);
router.post('/pagar', requireAuth, servicioController.pagarFactura);

// Servicios agendados (acceso rápido + monto fijo mensual + débito automático)
router.get('/agendados', requireAuth, servicioController.listarAgendados);
router.post('/agendados', requireAuth, servicioController.crearAgenda);
router.put('/agendados/:idAgenda', requireAuth, servicioController.actualizarAgenda);
router.delete('/agendados/:idAgenda', requireAuth, servicioController.eliminarAgenda);
router.post('/agendados/debitar', requireAuth, servicioController.ejecutarDebitosAutomaticos);

module.exports = router;
