// Helpers para APIs públicas reales (sin auth), en el mismo espíritu que centralBank.js:
// centralizar la URL base y el manejo de errores para no repetirlo en cada modelo.

const ARGENTINADATOS_URL = 'https://api.argentinadatos.com/v1';

// Tasa de referencia de Plazo Fijo: la API de ArgentinaDatos devuelve la tnaClientes
// de ~30 bancos por separado, no una "tasa de referencia" única. Usamos el promedio de
// tnaClientes de todas las entidades como referencia representativa del mercado.
async function obtenerTasaReferenciaPlazoFijo() {
    const response = await fetch(`${ARGENTINADATOS_URL}/finanzas/tasas/plazoFijo`);
    if (!response.ok) {
        throw new Error('No se pudo obtener la tasa de referencia de Plazo Fijo (ArgentinaDatos).');
    }
    const entidades = await response.json();
    const conTasa = entidades.filter(e => typeof e.tnaClientes === 'number' && e.tnaClientes > 0);
    if (conTasa.length === 0) {
        throw new Error('ArgentinaDatos no devolvió tasas válidas.');
    }
    const promedio = conTasa.reduce((acc, e) => acc + e.tnaClientes, 0) / conTasa.length;
    return promedio * 100; // la API devuelve fracción (0.19 = 19%), lo pasamos a porcentaje
}

// Tasa de referencia de Préstamos Personales: misma lógica que Plazo Fijo — la API devuelve
// la TNA de cada entidad por separado, usamos el promedio como referencia de mercado.
async function obtenerTasaReferenciaPrestamos() {
    const response = await fetch(`${ARGENTINADATOS_URL}/finanzas/creditos/prestamosPersonales`);
    if (!response.ok) {
        throw new Error('No se pudo obtener la tasa de referencia de Préstamos (ArgentinaDatos).');
    }
    const entidades = await response.json();
    const conTasa = entidades.filter(e => typeof e.tna === 'number' && e.tna > 0);
    if (conTasa.length === 0) {
        throw new Error('ArgentinaDatos no devolvió tasas válidas.');
    }
    const promedio = conTasa.reduce((acc, e) => acc + e.tna, 0) / conTasa.length;
    return promedio * 100; // la API devuelve fracción (0.75 = 75%), lo pasamos a porcentaje
}

const DATA912_URL = 'https://data912.com';

// Catálogo curado de CEDEARs (empresas conocidas) sobre los ~960 símbolos que devuelve la API
// (incluye variantes en dólar-cable/MEP tipo "AAPLD" que no nos interesan para este catálogo).
const TICKERS_CEDEARS_DESTACADOS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX',
    'KO', 'MELI', 'DISN', 'NKE', 'PFE', 'XOM', 'JPM', 'WMT', 'BA', 'SBUX', 'V', 'MA'
];

// Cotizaciones de CEDEARs en vivo (Data912, pública sin auth). Devuelve solo el catálogo
// curado de arriba, con el precio de cierre ("c") como referencia.
async function obtenerCotizacionesCedears() {
    const response = await fetch(`${DATA912_URL}/live/arg_cedears`);
    if (!response.ok) {
        throw new Error('No se pudo obtener la cotización de CEDEARs (Data912).');
    }
    const datos = await response.json();
    return datos
        .filter(d => TICKERS_CEDEARS_DESTACADOS.includes(d.symbol))
        .map(d => ({ ticker: d.symbol, precio: d.c, variacionPct: d.pct_change }));
}

// Precio actual de un ticker puntual (para validar una orden al momento de ejecutarla).
async function obtenerPrecioCedear(ticker) {
    const cotizaciones = await obtenerCotizacionesCedears();
    const encontrado = cotizaciones.find(c => c.ticker === ticker);
    if (!encontrado) {
        throw new Error(`No se encontró cotización para el ticker ${ticker}.`);
    }
    return encontrado.precio;
}

const DOLARAPI_URL = 'https://dolarapi.com/v1';

// Cotización del dólar oficial (pública, sin auth) — la usa el cambio de divisa ARS<->USD.
// DolarAPI devuelve varias "casas" (oficial, blue, MEP, etc.); usamos "oficial" como la que
// ofrece el banco, con compra/venta ya separados (no hace falta promediar como con las tasas).
async function obtenerCotizacionDolar() {
    const response = await fetch(`${DOLARAPI_URL}/dolares/oficial`);
    if (!response.ok) {
        throw new Error('No se pudo obtener la cotización del dólar (DolarAPI).');
    }
    const datos = await response.json();
    if (typeof datos.compra !== 'number' || typeof datos.venta !== 'number') {
        throw new Error('DolarAPI no devolvió una cotización válida.');
    }
    return { compra: datos.compra, venta: datos.venta, casa: datos.nombre, fecha: datos.fechaActualizacion };
}

module.exports = {
    obtenerTasaReferenciaPlazoFijo,
    obtenerTasaReferenciaPrestamos,
    obtenerCotizacionesCedears,
    obtenerPrecioCedear,
    obtenerCotizacionDolar
};
