const Tarjeta = require('../models/tarjetaModel');
const { esMontoPositivo } = require('../utils/validaciones');
const { exigirPersonaPropia, exigirCbuPropio } = require('../middlewares/auth');

// 1. LISTAR TARJETAS + resumen (límite/consumido/disponible/cuotas) de una persona
exports.listarPorPersona = async (req, res) => {
    const { idPersona } = req.params;
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const tarjetas = await Tarjeta.listarPorPersona(idPersona);
        const resumenes = await Promise.all(tarjetas.map(t => Tarjeta.obtenerResumen(t.id_tarjeta)));
        res.json(resumenes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. SOLICITAR TARJETA nueva
exports.solicitar = async (req, res) => {
    const { idPersona, marca } = req.body;
    if (!idPersona) {
        return res.status(400).json({ error: 'Falta idPersona.' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const tarjeta = await Tarjeta.solicitar(idPersona, marca);
        res.status(201).json(tarjeta);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. REGISTRAR CONSUMO
exports.registrarConsumo = async (req, res) => {
    const { id_tarjeta, comercio, monto_total, cantidad_cuotas, idPersona } = req.body;
    if (!id_tarjeta || !comercio || !String(comercio).trim() || !monto_total || !idPersona) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_tarjeta, comercio, monto_total, idPersona).' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    // 🐛 Antes solo se chequeaba "!monto_total" (verdadero/falso) — un monto negativo pasaba de
    // largo, generaba una cuota con importe negativo, y al "pagar" esa cuota (pagarCuota resta
    // el importe del saldo) restar un negativo ACREDITA plata gratis al titular. Misma familia
    // que el bug de préstamos: nunca confiar en que el monto venga positivo, validarlo siempre.
    if (!esMontoPositivo(monto_total)) {
        return res.status(400).json({ error: 'El monto debe ser un número mayor a cero.' });
    }
    const cuotas = Number(cantidad_cuotas) || 1;
    if (cuotas < 1 || cuotas > 24) {
        return res.status(400).json({ error: 'La cantidad de cuotas debe estar entre 1 y 24.' });
    }
    try {
        const consumo = await Tarjeta.registrarConsumo(id_tarjeta, String(comercio).trim(), Number(monto_total), cuotas, idPersona);
        res.status(201).json(consumo);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 4. PAGAR UNA CUOTA
exports.pagarCuota = async (req, res) => {
    const { id_cuota, cbu } = req.body;
    if (!id_cuota || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_cuota, cbu).' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        await Tarjeta.pagarCuota(id_cuota, String(cbu));
        res.status(201).json({ message: '¡Cuota pagada con éxito!' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
