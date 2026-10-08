// 🎯 Modo demo (portafolio público): Transferencias y Préstamos son las dos únicas
// funcionalidades que escriben en la red compartida del Banco Central (transferencias a
// cualquier CBU/alias de cualquier banco del curso, e informes de deuda en
// /central-deudores, visibles para todos). Sin verificación de sesión en el backend, un
// visitante público podría usar la identidad de este banco (CENTRAL_BANK_API_KEY) para
// tocar esa red compartida con CUALQUIER cbu_origen, no solo el de la cuenta demo.
//
// Con DEMO_MODE=true, ambas quedan restringidas a operar solo desde el/los CBU listados
// en DEMO_CBUS (la cuenta de prueba pública). En desarrollo local, sin estas variables
// definidas, esto no cambia nada del comportamiento actual.
const DEMO_MODE = process.env.DEMO_MODE === 'true';

const CBUS_DEMO_PERMITIDOS = (process.env.DEMO_CBUS || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);

// Lanza un error (con status 403 sugerido) si, en modo demo, el CBU dado no es uno de los
// permitidos. Fuera de modo demo (DEMO_MODE apagado), no hace nada.
function verificarCbuPermitidoEnDemo(cbu) {
    if (!DEMO_MODE) return;

    const cbuLimpio = String(cbu || '').trim();
    if (!CBUS_DEMO_PERMITIDOS.includes(cbuLimpio)) {
        const error = new Error(
            'Esta es una demo pública: transferencias y préstamos solo están habilitados desde la cuenta de prueba, para no afectar la red compartida del Banco Central con cuentas de otros bancos.'
        );
        error.esRestriccionDemo = true;
        throw error;
    }
}

module.exports = { DEMO_MODE, CBUS_DEMO_PERMITIDOS, verificarCbuPermitidoEnDemo };
