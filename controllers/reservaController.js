const Reserva = require('../models/reservaModel');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirCbuPropio } = require('../middlewares/auth');

// 1. LISTAR RESERVAS de una cuenta
exports.listar = async (req, res) => {
    const { cbu } = req.query;
    if (!cbu) {
        return res.status(400).json({ error: 'Debe indicar el CBU de la cuenta.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const reservas = await Reserva.listarPorCbu(String(cbu));
        res.json(reservas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. CREAR RESERVA
exports.crear = async (req, res) => {
    const { cbu, nombre, monto_objetivo, fecha_meta } = req.body;
    if (!cbu || !nombre || !String(nombre).trim()) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (cbu, nombre).' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const reserva = await Reserva.crear(String(cbu), String(nombre), monto_objetivo, fecha_meta);
        res.status(201).json(reserva);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. APORTAR a una reserva
exports.aportar = async (req, res) => {
    const { id_reserva, monto, cbu } = req.body;
    if (!id_reserva || !monto || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_reserva, monto, cbu).' });
    }
    if (!esMontoPositivo(monto)) {
        return res.status(400).json({ error: 'El monto debe ser un número mayor a cero.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        await Reserva.aportar(id_reserva, Number(monto), String(cbu));
        res.status(201).json({ message: 'Aporte realizado con éxito.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 4. RETIRAR de una reserva
exports.retirar = async (req, res) => {
    const { id_reserva, monto, cbu } = req.body;
    if (!id_reserva || !monto || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_reserva, monto, cbu).' });
    }
    if (!esMontoPositivo(monto)) {
        return res.status(400).json({ error: 'El monto debe ser un número mayor a cero.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        await Reserva.retirar(id_reserva, Number(monto), String(cbu));
        res.status(201).json({ message: 'Retiro realizado con éxito.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 5. ELIMINAR una reserva vacía
exports.eliminar = async (req, res) => {
    const { idReserva } = req.params;
    const { cbu } = req.body;
    if (!cbu) {
        return res.status(400).json({ error: 'Falta el CBU de la cuenta.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        await Reserva.eliminar(idReserva, String(cbu));
        res.json({ message: 'Reserva eliminada con éxito.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
