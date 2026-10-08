const PlazoFijo = require('../models/plazoFijoModel');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirCbuPropio } = require('../middlewares/auth');

// 1. TASA vigente ofrecida por el banco
exports.obtenerTasa = async (req, res) => {
    try {
        const tasa = await PlazoFijo.obtenerTasaVigente();
        res.json(tasa);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. LISTAR plazos fijos de una cuenta
exports.listar = async (req, res) => {
    const { cbu } = req.query;
    if (!cbu) {
        return res.status(400).json({ error: 'Debe indicar el CBU de la cuenta.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const plazos = await PlazoFijo.listarPorCbu(String(cbu));
        res.json(plazos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. CONSTITUIR un plazo fijo nuevo
exports.constituir = async (req, res) => {
    const { cbu, capital, plazo_dias } = req.body;
    if (!cbu || !capital || !plazo_dias) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (cbu, capital, plazo_dias).' });
    }
    if (!esMontoPositivo(capital)) {
        return res.status(400).json({ error: 'El capital debe ser un número mayor a cero.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const plazoFijo = await PlazoFijo.constituir(String(cbu), Number(capital), Number(plazo_dias));
        res.status(201).json(plazoFijo);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 4. LIQUIDAR un plazo fijo vencido
exports.liquidar = async (req, res) => {
    const { id_plazo_fijo, cbu } = req.body;
    if (!id_plazo_fijo || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_plazo_fijo, cbu).' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const resultado = await PlazoFijo.liquidar(id_plazo_fijo, String(cbu));
        res.status(201).json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
