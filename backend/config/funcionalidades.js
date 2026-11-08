// 🎯 Funcionalidades que existen en el código pero todavía no se ofrecen a los clientes.
//
// EVENTOS (calendario de beneficios, descuentos por evento al pagar con QR y adhesión de
// comercios): se muestra como "Próximamente" en el frontend. Mientras esté apagado, un cobro
// con QR es un cobro común: sin descuento y sin "comercio adherido". Para habilitarlo:
// EVENTOS_HABILITADOS=true en el .env del backend (y quitar el "Próximamente" del frontend).
const EVENTOS_HABILITADOS = process.env.EVENTOS_HABILITADOS === 'true';

// COBROS CON QR (generar un QR para cobrar y pagarlo escaneándolo): también "Próximamente".
// Con esto apagado, todo /api/cobros responde 403. Para habilitarlo: COBROS_QR_HABILITADOS=true
// en el .env del backend y COBROS_QR_HABILITADOS = true en frontend/src/config/funcionalidades.js.
const COBROS_QR_HABILITADOS = process.env.COBROS_QR_HABILITADOS === 'true';

const PROXIMAMENTE = { error: 'Esta funcionalidad va a estar disponible próximamente.', codigo: 'PROXIMAMENTE' };

module.exports = { EVENTOS_HABILITADOS, COBROS_QR_HABILITADOS, PROXIMAMENTE };
