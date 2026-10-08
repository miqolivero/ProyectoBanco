const express = require('express');
const router = express.Router();
const asistenteController = require('../controllers/asistenteController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

router.post('/chat', asistenteController.chat);

module.exports = router;
