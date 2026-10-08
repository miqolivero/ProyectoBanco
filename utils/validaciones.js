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

module.exports = { esMontoPositivo };
