// Zona horaria de referencia del banco para todo lo que dependa de "qué día es hoy" (vigencia
// de eventos, mes del ahorro, vencimiento de la bonificación). No se confía en la zona del
// servidor: en Render/Supabase suele ser UTC, y entre las 21 y las 24 h de Córdoba eso ya es
// "mañana" — un evento que termina hoy dejaría de valer 3 horas antes.
const ZONA_HORARIA = 'America/Argentina/Cordoba';

// Fragmentos SQL para usar dentro de las queries (la zona es una constante nuestra, no un
// dato del usuario, así que interpolarla no abre ninguna inyección).
const SQL_HOY = `(now() AT TIME ZONE '${ZONA_HORARIA}')::date`;
const SQL_INICIO_MES = `date_trunc('month', now() AT TIME ZONE '${ZONA_HORARIA}')`;

// 'YYYY-MM-DD' (un DATE de Postgres) → "octubre de 2027". Se arma la fecha al mediodía UTC y
// se formatea en UTC para que ningún corrimiento de zona la mueva de mes.
function formatearMesAnio(fechaIso) {
    if (!fechaIso) return null;
    const fecha = new Date(`${String(fechaIso).slice(0, 10)}T12:00:00Z`);
    if (isNaN(fecha.getTime())) return null;
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fecha);
}

function nombreMesActual() {
    return new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: ZONA_HORARIA }).format(new Date());
}

module.exports = { ZONA_HORARIA, SQL_HOY, SQL_INICIO_MES, formatearMesAnio, nombreMesActual };
