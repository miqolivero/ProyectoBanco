const Admin = require('../models/adminModel');
const { CODIGO_BANCO_PROPIO } = require('../models/adminModel');

// El código de banco se traduce a nombre con el diccionario que app.js carga del Banco Central
// al arrancar. Si la API de la cátedra no respondió, queda el código: el panel sigue andando.
const nombreBanco = (codigo) => {
    if (codigo === CODIGO_BANCO_PROPIO) return 'Calamuchita Bank';
    return global.diccionarioBancos?.[codigo] || `Banco (${codigo})`;
};

// 1. RESUMEN: todo lo que muestra el tablero en una sola respuesta. Las consultas son
//    independientes entre sí, así que corren en paralelo.
exports.resumen = async (req, res) => {
    try {
        const [indicadores, mora, actividadMensual, operacionesPorTipo, transferencias, topClientes, descuadradas] =
            await Promise.all([
                Admin.indicadores(),
                Admin.mora(),
                Admin.actividadMensual(),
                Admin.operacionesPorTipo(),
                Admin.transferenciasPorBanco(),
                Admin.topClientes(5),
                Admin.cuentasDescuadradas(),
            ]);

        res.json({
            indicadores,
            mora,
            actividadMensual,
            operacionesPorTipo,
            transferenciasPorBanco: transferencias.map(t => ({ ...t, banco: nombreBanco(t.codigo) })),
            topClientes,
            cuentasDescuadradas: descuadradas,
            generadoEn: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Error armando el resumen de gerencia:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el resumen del banco.' });
    }
};

// 2. CARTERA DE CLIENTES
exports.clientes = async (req, res) => {
    try {
        res.json(await Admin.clientes());
    } catch (error) {
        console.error('❌ Error listando clientes:', error.message);
        res.status(500).json({ error: 'No se pudo cargar la cartera de clientes.' });
    }
};

// 3. ÚLTIMOS MOVIMIENTOS DEL BANCO. El límite se acota a 1..100 para que un parámetro
//    manipulado no pueda pedir la tabla de movimientos entera de un saque.
exports.movimientos = async (req, res) => {
    const pedido = parseInt(req.query.limite, 10);
    const limite = Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), 100) : 15;
    try {
        res.json(await Admin.movimientosRecientes(limite));
    } catch (error) {
        console.error('❌ Error listando movimientos recientes:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los movimientos.' });
    }
};
