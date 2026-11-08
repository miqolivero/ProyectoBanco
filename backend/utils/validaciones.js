// Validación de montos compartida entre controllers y modelos. Centraliza el chequeo que
// antes se repetía a mano como "Number(x) <= 0" en cada endpoint — ese patrón no atrapa un
// valor no numérico (ej. monto: "abc" → Number("abc") es NaN, y "NaN <= 0" da false, así que
// pasaba de largo la validación y recién explotaba más abajo, al intentar bindearlo en una
// consulta SQL, con un error confuso de 500 en vez de un 400 claro).
//
// Usar en controllers: if (!esMontoPositivo(monto)) return res.status(400).json({ error: '...' });
// Usar en modelos (defensa en profundidad, por si algún otro caller no pasa por el controller):
//   if (!esMontoPositivo(monto)) throw new Error('...');
function esMontoPositivo(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0;
}

// Para montos que se guardan y se calculan como NUMERIC en la base (cobros con QR): en vez de
// pasar por Number() —que convierte a punto flotante— se valida el texto tal cual llega y se
// devuelve normalizado, listo para mandarlo como parámetro a Postgres. Acepta hasta 2
// decimales con punto. Devuelve null si no es un monto válido y mayor a cero.
function normalizarMontoDecimal(valor, maximo = 10000000) {
    const texto = String(valor ?? '').trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(texto)) return null;
    const [enteros, decimales = ''] = texto.split('.');
    const enterosLimpios = enteros.replace(/^0+(?=\d)/, '');
    const normalizado = `${enterosLimpios}.${decimales.padEnd(2, '0')}`;
    if (/^0\.00$/.test(normalizado)) return null;
    // Comparación del tope sin flotantes: por cantidad de dígitos y después como texto.
    const [ent] = normalizado.split('.');
    const topeTexto = String(maximo);
    if (ent.length > topeTexto.length || (ent.length === topeTexto.length && normalizado > `${topeTexto}.00`)) {
        return null;
    }
    return normalizado;
}

// UUID v4 (los ids de cobro). Validarlo antes de consultar evita que un link mal copiado
// termine en un error 500 de Postgres ("invalid input syntax for type uuid").
function esUuid(valor) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(valor || ''));
}

module.exports = { esMontoPositivo, normalizarMontoDecimal, esUuid };
