const Cedear = require('../models/cedearModel');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirCbuPropio, exigirPersonaPropia } = require('../middlewares/auth');

// 1. LISTAR catálogo con cotización en vivo
exports.listarCatalogo = async (req, res) => {
    try {
        const catalogo = await Cedear.listarCatalogo();
        res.json(catalogo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. REGISTRAR ORDEN (compra o venta)
exports.registrarOrden = async (req, res) => {
    const { cbu, ticker, cantidad, tipo } = req.body;
    if (!cbu || !ticker || !cantidad || !tipo) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (cbu, ticker, cantidad, tipo).' });
    }
    if (!esMontoPositivo(cantidad)) {
        return res.status(400).json({ error: 'La cantidad debe ser un número mayor a cero.' });
    }
    if (!['COMPRA', 'VENTA'].includes(tipo)) {
        return res.status(400).json({ error: 'El tipo debe ser COMPRA o VENTA.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const orden = await Cedear.registrarOrden(String(cbu), String(ticker), Number(cantidad), tipo);
        res.status(201).json(orden);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. OBTENER PORTAFOLIO de una persona
exports.obtenerPortafolio = async (req, res) => {
    const { idPersona } = req.params;
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const portafolio = await Cedear.obtenerPortafolio(idPersona);
        res.json(portafolio);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
