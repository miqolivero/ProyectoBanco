// Costos que el banco le cobra (o le muestra) a sus clientes. Todos como texto y no como número,
// para que las cuentas las haga Postgres en NUMERIC sin pasar por decimales de punto flotante.

// IVA de las comisiones y cargos bancarios (alícuota general).
const IVA_PORCENTAJE = '21';

// Mantenimiento mensual de la cuenta para quien NO está bonificado. Por ahora solo se muestra:
// no se debita a nadie (ver Persona.costoMantenimiento).
const MANTENIMIENTO_NETO = '7500.00';

// Comisión por cobrar con QR, siempre a cargo del COMERCIO (el que paga no paga nada extra).
// Los primeros $250.000 cobrados en el mes son gratis; el cobro que hace pasar ese tope, y todos
// los siguientes del mes, pagan el porcentaje + IVA sobre el total del cobro.
const COMISION_QR_PORCENTAJE = '2';
const COMISION_QR_TOPE_GRATIS_MENSUAL = '250000.00';

module.exports = { IVA_PORCENTAJE, MANTENIMIENTO_NETO, COMISION_QR_PORCENTAJE, COMISION_QR_TOPE_GRATIS_MENSUAL };
