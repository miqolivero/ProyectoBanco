// Las 24 jurisdicciones de Argentina (23 provincias + CABA). Es la fuente de verdad del
// backend: el frontend la pide a GET /api/personas/provincias en vez de tener su propia copia,
// y la base tiene la misma lista como CHECK (ver init/04_cobros_eventos.sql).
const PROVINCIAS = [
    'Buenos Aires',
    'Ciudad Autónoma de Buenos Aires',
    'Catamarca',
    'Chaco',
    'Chubut',
    'Córdoba',
    'Corrientes',
    'Entre Ríos',
    'Formosa',
    'Jujuy',
    'La Pampa',
    'La Rioja',
    'Mendoza',
    'Misiones',
    'Neuquén',
    'Río Negro',
    'Salta',
    'San Juan',
    'San Luis',
    'Santa Cruz',
    'Santa Fe',
    'Santiago del Estero',
    'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
    'Tucumán'
];

// La provincia que da derecho a la bonificación de mantenimiento ("de nuestra gente").
const PROVINCIA_BONIFICADA = 'Córdoba';

function esProvinciaValida(valor) {
    return PROVINCIAS.includes(valor);
}

module.exports = { PROVINCIAS, PROVINCIA_BONIFICADA, esProvinciaValida };
