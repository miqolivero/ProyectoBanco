const Evento = require('../models/eventoModel');
const Cobro = require('../models/cobroModel');
const Persona = require('../models/personaModel');
const { formatearMesAnio, nombreMesActual } = require('../utils/fechas');
const { EVENTOS_HABILITADOS } = require('../config/funcionalidades');

// RESUMEN DE BENEFICIOS para la pantalla de Inicio (GET /api/beneficios/resumen), en un solo
// pedido: el evento vigente a destacar, cuánto ahorró este mes pagando con QR y hasta cuándo
// tiene bonificado el mantenimiento. Todo calculado acá: el frontend solo lo muestra.
exports.obtenerResumen = async (req, res) => {
    const idPersona = req.personaAutenticada.id;
    try {
        const [eventoDestacado, ahorro, bonificacion, costo] = await Promise.all([
            EVENTOS_HABILITADOS ? Evento.destacado() : null,
            Cobro.ahorroDelMes(idPersona),
            Persona.obtenerBonificacion(idPersona),
            Persona.costoMantenimiento()
        ]);

        res.json({
            eventoDestacado,
            ahorroMes: {
                monto: ahorro.ahorro,
                comprasConDescuento: Number(ahorro.compras_con_descuento),
                mes: nombreMesActual()
            },
            bonificacion: bonificacion?.vigente
                ? { vigente: true, hasta: bonificacion.hasta, hastaTexto: formatearMesAnio(bonificacion.hasta) }
                : { vigente: false },
            // Lo que cuesta el mantenimiento por mes. Solo informativo: hoy no se debita a nadie.
            mantenimiento: {
                bonificado: Boolean(bonificacion?.vigente),
                neto: costo.neto,
                porcentajeIva: costo.porcentaje_iva,
                iva: costo.iva,
                total: costo.total
            }
        });
    } catch (error) {
        console.error('❌ Error armando el resumen de beneficios:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar tus beneficios.' });
    }
};
