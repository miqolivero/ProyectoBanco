const express = require('express');
const router = express.Router();
const personaController = require('../controllers/personaController');

// Rutas de consulta y creación
router.get('/', personaController.obtenerPersonas);
router.post('/', personaController.crearPersona);
router.get('/:id/roles', personaController.obtenerRoles);
router.get('/:id/productos', personaController.obtenerProductos);
router.get('/clerk/:clerkId', personaController.obtenerPorClerk);

router.get('/verificar/:clerkId', personaController.obtenerPorClerk);
// RUTA PARA ALIAS: El CBU viaja en la URL
router.put('/:cbu/alias', personaController.cambiarAlias);

module.exports = router;