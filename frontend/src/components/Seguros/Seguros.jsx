import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './Seguros.css';

export default function Seguros({ datosUsuario, alContratarExitoso, alCancelar }) {
  const [productos, setProductos] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const [idProducto, setIdProducto] = useState('');
  const [sumaAsegurada, setSumaAsegurada] = useState('');
  const [beneficiarios, setBeneficiarios] = useState('');
  const [cotizacion, setCotizacion] = useState(null);
  const [cotizando, setCotizando] = useState(false);
  const [contratando, setContratando] = useState(false);

  const [cancelandoId, setCancelandoId] = useState(null);

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const cargarDatos = async () => {
    try {
      const [resProductos, resPolizas] = await Promise.all([
        fetch('http://localhost:3001/api/seguros/productos'),
        fetch(`http://localhost:3001/api/seguros/persona/${datosUsuario.id}`)
      ]);
      const dataProductos = await resProductos.json();
      const dataPolizas = await resPolizas.json();
      if (Array.isArray(dataProductos)) {
        setProductos(dataProductos);
        if (dataProductos.length > 0 && !idProducto) setIdProducto(String(dataProductos[0].id_producto_seguro));
      }
      if (Array.isArray(dataPolizas)) setPolizas(dataPolizas);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar la información de seguros.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.id]);

  useEffect(() => {
    const suma = Number(sumaAsegurada);
    if (!idProducto || !suma || suma <= 0) {
      setCotizacion(null);
      return;
    }
    let cancelado = false;
    const cotizar = async () => {
      try {
        setCotizando(true);
        const response = await fetch('http://localhost:3001/api/seguros/cotizar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idPersona: datosUsuario.id, id_producto_seguro: Number(idProducto), suma_asegurada: suma })
        });
        const data = await response.json();
        if (!cancelado) {
          if (response.ok) setCotizacion(data);
          else { setCotizacion(null); setMensaje({ tipo: 'error', texto: data.error }); }
        }
      } catch {
        if (!cancelado) setCotizacion(null);
      } finally {
        if (!cancelado) setCotizando(false);
      }
    };
    const timeout = setTimeout(cotizar, 400);
    return () => { cancelado = true; clearTimeout(timeout); };
  }, [idProducto, sumaAsegurada, datosUsuario?.id]);

  const handleContratar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    if (!cotizacion) {
      setMensaje({ tipo: 'error', texto: 'Elegí un producto e ingresá una suma asegurada válida.' });
      return;
    }

    try {
      setContratando(true);
      const response = await fetch('http://localhost:3001/api/seguros/contratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu: datosUsuario.cbu,
          id_producto_seguro: Number(idProducto),
          suma_asegurada: Number(sumaAsegurada),
          beneficiarios: beneficiarios.trim() || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo contratar la póliza.');

      setMensaje({ tipo: 'exito', texto: `¡Póliza de ${data.producto} contratada! Se debitó la primera prima de ${formatearMoneda(data.prima_mensual)}.` });
      setSumaAsegurada('');
      setBeneficiarios('');
      setCotizacion(null);
      await cargarDatos();
      if (alContratarExitoso) alContratarExitoso(Number(data.prima_mensual));
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setContratando(false);
    }
  };

  const handleCancelar = async (idPoliza) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setCancelandoId(idPoliza);
      const response = await fetch('http://localhost:3001/api/seguros/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_poliza: idPoliza, idPersona: datosUsuario.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cancelar la póliza.');

      setMensaje({ tipo: 'exito', texto: 'Póliza cancelada.' });
      await cargarDatos();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCancelandoId(null);
    }
  };

  return (
    <div className="seguros-container">
      <div className="seguros-header-box">
        <h2>Seguros</h2>
        <p>Cotizá y contratá coberturas para vos y tu familia.</p>
      </div>

      <div className="seguros-layout">
      <div className="seguros-main">
        <div className="seguros-card">
          <h3 className="seguros-subtitulo">Cotizar y contratar</h3>
          <form onSubmit={handleContratar} className="seguros-form">
            <div className="seguros-row">
              <div className="seguros-field">
                <label>Producto</label>
                <select
                  value={idProducto}
                  onChange={(e) => setIdProducto(e.target.value)}
                  disabled={contratando}
                  className="seguros-input-select"
                >
                  {productos.map(p => (
                    <option key={p.id_producto_seguro} value={p.id_producto_seguro}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="seguros-field">
                <label>Suma asegurada</label>
                <input
                  type="number"
                  placeholder="$ 0"
                  value={sumaAsegurada}
                  onChange={(e) => setSumaAsegurada(e.target.value)}
                  disabled={contratando}
                  className="seguros-input-text"
                />
              </div>
            </div>

            <div className="seguros-field">
              <label>Beneficiarios (opcional)</label>
              <input
                type="text"
                placeholder="Ej. Cónyuge e hijos"
                value={beneficiarios}
                onChange={(e) => setBeneficiarios(e.target.value)}
                disabled={contratando}
                className="seguros-input-text"
              />
            </div>

            {cotizando && <div className="seguros-simulador">Cotizando...</div>}
            {!cotizando && cotizacion && (
              <div className="seguros-simulador">
                Prima mensual estimada para {cotizacion.producto} (edad {cotizacion.edad}): <strong>{formatearMoneda(cotizacion.primaMensual)}</strong>
              </div>
            )}

            <button type="submit" disabled={contratando || !cotizacion} className="btn-seg-contratar">
              {contratando ? 'Contratando...' : 'Contratar Póliza'}
            </button>
          </form>

          {mensaje.texto && (
            <div className={`seguros-alert ${mensaje.tipo}`}>
              {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
            </div>
          )}
        </div>

        <div className="seguros-lista">
          <h3 className="seguros-subtitulo">Mis pólizas</h3>
          {cargando ? (
            <p className="seguros-empty-msg">Cargando...</p>
          ) : polizas.length === 0 ? (
            <p className="seguros-empty-msg">Todavía no contrataste ninguna póliza.</p>
          ) : (
            polizas.map(p => (
              <div key={p.id_poliza} className={`seguros-item-card ${p.estado !== 'ACTIVA' ? 'seguros-item-cancelada' : ''}`}>
                <div className="seguros-item-header">
                  <strong>{p.producto}</strong>
                  <span className={`seguros-badge-estado ${p.estado === 'ACTIVA' ? 'activa' : 'cancelada'}`}>{p.estado}</span>
                </div>
                <span className="seguros-item-detalle">
                  Suma asegurada {formatearMoneda(p.suma_asegurada)} · Prima {formatearMoneda(p.prima_mensual)}/mes
                  {p.beneficiarios ? ` · Beneficiarios: ${p.beneficiarios}` : ''}
                </span>
                {p.estado === 'ACTIVA' && (
                  <button
                    onClick={() => handleCancelar(p.id_poliza)}
                    disabled={cancelandoId === p.id_poliza}
                    className="btn-seg-cancelar"
                  >
                    {cancelandoId === p.id_poliza ? '...' : 'Cancelar póliza'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <button onClick={alCancelar} className="btn-seg-volver">Volver al Inicio</button>
      </div>

      <div className="seguros-info-panel">
        <h4>Resumen</h4>
        <span className="seguros-info-label">Saldo en tu cuenta</span>
        <p className="seguros-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>
        <span className="seguros-info-label">Pólizas activas</span>
        <p className="seguros-info-dato">{polizas.filter(p => p.estado === 'ACTIVA').length}</p>
        <span className="seguros-info-label">Prima mensual total</span>
        <p className="seguros-info-dato">{formatearMoneda(polizas.filter(p => p.estado === 'ACTIVA').reduce((acc, p) => acc + Number(p.prima_mensual), 0))}</p>
      </div>
      </div>
    </div>
  );
}
