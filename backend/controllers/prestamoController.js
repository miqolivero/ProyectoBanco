const Prestamo = require('../models/prestamoModel');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirCbuPropio } = require('../middlewares/auth');

// 1. TASA vigente ofrecida al banco — personalizada: si quien pregunta ya pagó un préstamo
// anterior en tiempo y forma, se le muestra la tasa sin el spread (ver Prestamo.tieneBuenHistorial).
exports.obtenerTasa = async (req, res) => {
    try {
        const tasa = await Prestamo.obtenerTasaVigente(req.personaAutenticada.id);
        res.json(tasa);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. SIMULAR (no toca la DB ni el Banco Central) — misma tasa personalizada que obtenerTasa,
// para que lo que el usuario simula coincida con lo que después le otorgan de verdad.
exports.simular = async (req, res) => {
    const { monto, plazo_meses } = req.body;
    if (!monto || !plazo_meses) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (monto, plazo_meses).' });
    }
    try {
        const { tnaOfrecida, bonificado } = await Prestamo.obtenerTasaVigente(req.personaAutenticada.id);
        const simulacion = Prestamo.simularAmortizacion(Number(monto), Number(plazo_meses), tnaOfrecida);
        res.json({ tna: tnaOfrecida, bonificado, ...simulacion });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2.5. CAPACIDAD de endeudamiento vigente
exports.obtenerCapacidad = async (req, res) => {
    const { cbu } = req.query;
    if (!cbu) {
        return res.status(400).json({ error: 'Debe indicar el CBU de la cuenta.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const capacidad = await Prestamo.obtenerCapacidad(String(cbu));
        res.json(capacidad);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. LISTAR préstamos de una cuenta
exports.listar = async (req, res) => {
    const { cbu } = req.query;
    if (!cbu) {
        return res.status(400).json({ error: 'Debe indicar el CBU de la cuenta.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const prestamos = await Prestamo.listarPorCbu(String(cbu));
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. SOLICITAR un préstamo nuevo
exports.solicitar = async (req, res) => {
    const { cbu, monto, plazo_meses } = req.body;
    if (!cbu || !monto || !plazo_meses) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (cbu, monto, plazo_meses).' });
    }
    if (!esMontoPositivo(monto)) {
        return res.status(400).json({ error: 'El monto debe ser un número mayor a cero.' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const resultado = await Prestamo.solicitar(String(cbu), Number(monto), Number(plazo_meses));
        res.status(201).json(resultado);
    } catch (error) {
        res.status(error.esRestriccionDemo ? 403 : 400).json({ error: error.message });
    }
};

// 5. PAGAR UNA CUOTA
exports.pagarCuota = async (req, res) => {
    const { id_cuota, cbu } = req.body;
    if (!id_cuota || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_cuota, cbu).' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const resultado = await Prestamo.pagarCuota(id_cuota, String(cbu));
        res.status(201).json({ message: '¡Cuota pagada con éxito!', ...resultado });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
