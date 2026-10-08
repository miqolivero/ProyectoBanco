const Servicio = require('../models/servicioModel');
const { exigirCbuPropio, exigirPersonaPropia } = require('../middlewares/auth');

// 1. LISTAR EMPRESAS DE SERVICIO
exports.listarEmpresas = async (req, res) => {
    try {
        const empresas = await Servicio.listarEmpresas();
        res.json(empresas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. CONSULTAR DEUDA DE UN CLIENTE EN UNA EMPRESA
exports.obtenerDeuda = async (req, res) => {
    const { idEmpresa } = req.params;
    const { numero_cliente } = req.query;

    if (!numero_cliente || !String(numero_cliente).trim()) {
        return res.status(400).json({ error: 'Debe ingresar el número de cliente.' });
    }

    try {
        const facturas = await Servicio.obtenerDeuda(idEmpresa, String(numero_cliente));
        res.json(facturas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. PAGAR UNA FACTURA
exports.pagarFactura = async (req, res) => {
    const { id_factura, cbu } = req.body;

    if (!id_factura || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (id_factura, cbu).' });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;

    try {
        await Servicio.pagarFactura(id_factura, cbu);
        res.status(201).json({ message: '¡Factura pagada con éxito!' });
    } catch (error) {
        console.error('❌ Error en pagarFactura:', error.message);
        res.status(400).json({ error: error.message });
    }
};

// 4. LISTAR SERVICIOS AGENDADOS de una persona (con la factura del mes ya armada si corresponde)
exports.listarAgendados = async (req, res) => {
    const { idPersona } = req.query;
    if (!idPersona) {
        return res.status(400).json({ error: 'Debe indicar idPersona.' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const agendas = await Servicio.listarAgendados(Number(idPersona));
        res.json(agendas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. AGENDAR UN SERVICIO nuevo
exports.crearAgenda = async (req, res) => {
    const { idPersona, id_empresa, numero_cliente, alias, monto_fijo, dia_vencimiento, debito_automatico } = req.body;
    if (!idPersona || !id_empresa || !numero_cliente || !String(numero_cliente).trim()) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (idPersona, id_empresa, numero_cliente).' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const agenda = await Servicio.crearAgenda(
            Number(idPersona), Number(id_empresa), String(numero_cliente),
            alias, monto_fijo != null ? Number(monto_fijo) : null,
            dia_vencimiento != null ? Number(dia_vencimiento) : null, !!debito_automatico
        );
        res.status(201).json(agenda);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 6. EDITAR una agenda
exports.actualizarAgenda = async (req, res) => {
    const { idAgenda } = req.params;
    const { idPersona, alias, monto_fijo, dia_vencimiento, debito_automatico } = req.body;
    if (!idPersona) {
        return res.status(400).json({ error: 'Falta idPersona.' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        const agenda = await Servicio.actualizarAgenda(Number(idAgenda), Number(idPersona), {
            alias,
            montoFijo: monto_fijo != null ? Number(monto_fijo) : null,
            diaVencimiento: dia_vencimiento != null ? Number(dia_vencimiento) : null,
            debitoAutomatico: !!debito_automatico
        });
        res.json(agenda);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 7. ELIMINAR una agenda
exports.eliminarAgenda = async (req, res) => {
    const { idAgenda } = req.params;
    const { idPersona } = req.query;
    if (!idPersona) {
        return res.status(400).json({ error: 'Falta idPersona.' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    try {
        await Servicio.eliminarAgenda(Number(idAgenda), Number(idPersona));
        res.json({ message: 'Servicio desagendado.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 8. EJECUTAR DÉBITOS AUTOMÁTICOS del mes (a pedido del usuario, ver nota en el modelo)
exports.ejecutarDebitosAutomaticos = async (req, res) => {
    const { idPersona, cbu } = req.body;
    if (!idPersona || !cbu) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (idPersona, cbu).' });
    }
    if (!exigirPersonaPropia(req, res, idPersona)) return;
    if (!exigirCbuPropio(req, res, cbu)) return;
    try {
        const resultado = await Servicio.ejecutarDebitosAutomaticos(Number(idPersona), String(cbu));
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
