const { mundoActual } = require('./sandboxDemo');

const CENTRAL_BANK_URL = 'https://centralbank.brocoly.cc/api';

// Cliente único para hablar con la API del Banco Central del profesor.
// Centraliza la URL base y los headers obligatorios (x-environment, x-api-key)
// para que no se repitan (ni se desincronicen) en cada controller.
function centralBankFetch(path, options = {}) {
    // En una sesión de demo, el Central se simula (nada se escribe en la red compartida).
    const mundo = mundoActual();
    if (mundo) {
        return mundo.centralFalso(path, options, (p = path, o = options) => centralBankFetchReal(p, o));
    }
    return centralBankFetchReal(path, options);
}

function centralBankFetchReal(path, options = {}) {
    return fetch(`${CENTRAL_BANK_URL}${path}`, {
        ...options,
        headers: {
            'x-environment': 'test',
            'x-api-key': process.env.CENTRAL_BANK_API_KEY,
            ...options.headers,
        },
    });
}

module.exports = { centralBankFetch, CENTRAL_BANK_URL };
