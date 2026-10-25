const express = require('express');
const router = express.Router();
const personaController = require('../controllers/personaController');
const { requireAuth, requireGerente } = require('../middlewares/auth');

// 🎯 POST '/' (registro) y las rutas /clerk|verificar/:clerkId NO llevan requireAuth: se llaman
// antes de que exista un registro local de la persona (es justamente lo que crean/consultan),
// así que requireAuth (que busca esa fila) rompería el flujo de onboarding. Cada una hace su
// propia verificación liviana contra la sesión de Clerk — ver personaController.js.
// La lista completa de personas (DNI, email, teléfono, dirección de TODOS los clientes) es un
// dato de gerencia. Antes solo pedía requireAuth, así que cualquier cliente logueado podía
// bajarse la base entera. El frontend no la usa: el panel de gerente tiene su propio endpoint.
router.get('/', requireAuth, requireGerente, personaController.obtenerPersonas);
router.post('/', personaController.crearPersona);
router.get('/:id/roles', requireAuth, personaController.obtenerRoles);
router.get('/:id/productos', requireAuth, personaController.obtenerProductos);
router.get('/:id/cuenta-usd', requireAuth, personaController.obtenerCuentaUSD);
router.post('/:id/cuenta-usd', requireAuth, personaController.abrirCuentaUSD);
router.get('/clerk/:clerkId', personaController.obtenerPorClerk);

router.get('/verificar/:clerkId', personaController.obtenerPorClerk);
// RUTA PARA ALIAS: El CBU viaja en la URL
router.put('/:cbu/alias', requireAuth, personaController.cambiarAlias);

// AJUSTES DE PERFIL: email / teléfono / dirección
router.put('/:id/perfil', requireAuth, personaController.actualizarPerfil);

module.exports = router;