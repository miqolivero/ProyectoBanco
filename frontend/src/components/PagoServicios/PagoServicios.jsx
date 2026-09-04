import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './PagoServicios.css';

export default function PagoServicios({ datosUsuario, alPagarExitoso, alCancelar }) {
  const [empresas, setEmpresas] = useState([]);
  const [idEmpresa, setIdEmpresa] = useState('');
  const [numeroCliente, setNumeroCliente] = useState('');
  const [facturas, setFacturas] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  useEffect(() => {
    fetch('http://localhost:3001/api/servicios/empresas')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEmpresas(data);
          if (data.length > 0) setIdEmpresa(String(data[0].id_empresa));
        }
      })
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudo cargar el listado de empresas.' }));
  }, []);

  const handleConsultar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });
    setFacturas(null);

    if (!idEmpresa || !numeroCliente.trim()) {
      setMensaje({ tipo: 'error', texto: 'Elegí una empresa e ingresá tu número de cliente.' });
      return;
    }

    try {
      setConsultando(true);
      const response = await fetch(
        `http://localhost:3001/api/servicios/empresas/${idEmpresa}/deuda?numero_cliente=${encodeURIComponent(numeroCliente.trim())}`
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo consultar la deuda.');

      setFacturas(data);
      if (data.length === 0) {
        setMensaje({ tipo: 'exito', texto: 'No encontramos facturas pendientes para ese número de cliente.' });
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setConsultando(false);
    }
  };

  const handlePagar = async (factura) => {
    if (Number(factura.importe) > Number(datosUsuario?.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo actual es de ${formatearMoneda(datosUsuario?.saldo)}` });
      return;
    }

    setMensaje({ tipo: '', texto: '' });

    try {
      setPagando(true);
      const response = await fetch('http://localhost:3001/api/servicios/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_factura: factura.id_factura, cbu: datosUsuario.cbu })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo procesar el pago.');

      setMensaje({ tipo: 'exito', texto: `¡Listo! Pagaste ${formatearMoneda(factura.importe)}.` });
      setFacturas(prev => prev.filter(f => f.id_factura !== factura.id_factura));

      if (alPagarExitoso) alPagarExitoso(Number(factura.importe));
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setPagando(false);
    }
  };

  return (
    <div className="servicios-container">
      <div className="servicios-header-box">
        <h2>Pago de Servicios</h2>
        <p>Consultá y pagá tus facturas de luz, gas, agua e internet.</p>
      </div>

      <div className="servicios-layout">
      <div className="servicios-card">
        <form onSubmit={handleConsultar} className="servicios-form">
          <div className="servicios-row">
            <div className="servicios-field">
              <label>Empresa</label>
              <select
                value={idEmpresa}
                onChange={(e) => setIdEmpresa(e.target.value)}
                disabled={consultando || empresas.length === 0}
                className="servicios-input-select"
              >
                {empresas.map(emp => (
                  <option key={emp.id_empresa} value={emp.id_empresa}>{emp.nombre} ({emp.rubro})</option>
                ))}
              </select>
            </div>

            <div className="servicios-field">
              <label>Número de cliente</label>
              <input
                type="text"
                placeholder="Ej. 12345"
                value={numeroCliente}
                onChange={(e) => setNumeroCliente(e.target.value)}
                disabled={consultando}
                className="servicios-input-text"
              />
            </div>
          </div>

          <button type="submit" disabled={consultando} className="btn-serv-consultar">
            {consultando ? 'Consultando...' : 'Consultar Deuda'}
          </button>
        </form>

        {mensaje.texto && (
          <div className={`servicios-alert ${mensaje.tipo}`}>
            {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
          </div>
        )}

        {facturas && facturas.length > 0 && (
          <div className="servicios-facturas-list">
            {facturas.map(f => (
              <div key={f.id_factura} className="servicios-factura-item">
                <div>
                  <p className="servicios-factura-importe">{formatearMoneda(f.importe)}</p>
                  <span className="servicios-factura-vencimiento">Vence: {new Date(f.vencimiento).toLocaleDateString('es-AR')}</span>
                </div>
                <button
                  onClick={() => handlePagar(f)}
                  disabled={pagando}
                  className="btn-serv-pagar"
                >
                  {pagando ? 'Procesando...' : 'Pagar'}
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={alCancelar} className="btn-serv-volver">
          Volver al Inicio
        </button>
      </div>

      <div className="servicios-info-panel">
        <h4>Tu cuenta</h4>
        <span className="servicios-info-label">Saldo actual</span>
        <p className="servicios-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>

        <span className="servicios-info-label">Empresas disponibles</span>
        <div className="servicios-info-empresas">
          {empresas.map(emp => (
            <div key={emp.id_empresa} className="servicios-info-empresa-item">
              <span>{emp.nombre}</span>
              <span className="servicios-info-empresa-rubro">{emp.rubro}</span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
