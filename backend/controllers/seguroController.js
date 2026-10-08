const Seguro = require('../models/seguroModel');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirCbuPropio, exigirPersonaPropia } = require('../middlewares/auth');

// 1. LISTAR catálogo de productos de seguro
exports.listarProductos = async (req, res) => {
    try {
        const productos = await Seguro.listarProductos();
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. COTIZAR
exports.cotizar = async (req, res) => {
    const { idPersona, id_producto_seguro, suma_asegurada } = req.body;
    if (!idPersona || !id_producto_seguro || !suma_asegurada) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (idPersona, id_producto_seguro, suma_asegurada).' });
    }
    if (!esMontoPositivo(suma_asegurada)) {
        return res.status(400).json({ error: 'La suma asegurada debe ser un número mayor a cero.' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const cotizacion = await Seguro.cotizar(idPersona, id_producto_seguro, Number(suma_asegurada));
        res.json(cotizacion);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. CONTRATAR una póliza
exports.contratar = async (req, res) => {
    const { cbu, id_producto_seguro, suma_asegurada, beneficiarios } = req.body;
    if (!cbu || !id_producto_seguro || !suma_asegurada) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (cbu, id_producto_seguro, suma_asegurada).' });
    }
    // 🐛 A diferencia de /cotizar, este endpoint (el que realmente mueve plata) no validaba el
    // signo de la suma asegurada — una suma negativa da una prima negativa, y al "cobrarla"
    // (saldo - prima_negativa) ACREDITA plata gratis en vez de debitarla.
    if (!esMontoPositivo(suma_asegurada)) {
        return res.status(400).json({ error: 'La suma asegurada debe ser un número mayor a cero.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const poliza = await Seguro.contratar(String(cbu), id_producto_seguro, Number(suma_asegurada), beneficiarios);
        res.status(201).json(poliza);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 4. LISTAR pólizas de una persona
exports.listarPorPersona = async (req, res) => {
    const { idPersona } = req.params;
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const polizas = await Seguro.listarPorPersona(idPersona);
        res.json(polizas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. CANCELAR una póliza
exports.cancelar = async (req, res) => {
    const { id_poliza, idPersona } = req.body;
    if (!id_poliza || !idPersona) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_poliza, idPersona).' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        await Seguro.cancelar(id_poliza, idPersona);
        res.json({ message: 'Póliza cancelada.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
