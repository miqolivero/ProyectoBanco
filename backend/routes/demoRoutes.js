const express = require('express');
const router = express.Router();
const demoController = require('../controllers/demoController');

// Cuenta demo para probar el banco sin registrarse y sin guardar nada (ver config/sandboxDemo.js).
// Sin requireAuth a propósito: es justamente la entrada para quien no tiene cuenta.
router.post('/sesion', demoController.crearSesion);
router.post('/unirse', demoController.unirse);
router.post('/salir', demoController.salir);

module.exports = router;
