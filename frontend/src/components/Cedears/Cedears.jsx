import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './Cedears.css';

export default function Cedears({ datosUsuario, alOrdenExitosa, alCancelar }) {
  const [catalogo, setCatalogo] = useState([]);
  const [portafolio, setPortafolio] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const [ticker, setTicker] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipoOrden, setTipoOrden] = useState('COMPRA');
  const [operando, setOperando] = useState(false);

  const formatearMoneda = (valor) => {
    if (valor == null) return '—';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor);
  };

  const cargarDatos = async () => {
    try {
      const [resCatalogo, resPortafolio] = await Promise.all([
        fetch('http://localhost:3001/api/cedears/catalogo'),
        fetch(`http://localhost:3001/api/cedears/persona/${datosUsuario.id}/portafolio`)
      ]);
      const dataCatalogo = await resCatalogo.json();
      const dataPortafolio = await resPortafolio.json();
      if (Array.isArray(dataCatalogo)) {
        setCatalogo(dataCatalogo);
        if (dataCatalogo.length > 0 && !ticker) setTicker(dataCatalogo[0].ticker);
      }
      if (Array.isArray(dataPortafolio)) setPortafolio(dataPortafolio);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar la cotización de CEDEARs.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.id]);

  const tickerSeleccionado = catalogo.find(c => c.ticker === ticker);

  const handleOrdenar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    const cantidadNum = Number(cantidad);
    if (!ticker || !cantidadNum || cantidadNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Elegí un ticker y una cantidad mayor a cero.' });
      return;
    }

    try {
      setOperando(true);
      const response = await fetch('http://localhost:3001/api/cedears/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu: datosUsuario.cbu, ticker, cantidad: cantidadNum, tipo: tipoOrden })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar la orden.');

      const importe = Number(data.precio) * Number(data.cantidad);
      setMensaje({ tipo: 'exito', texto: `¡${tipoOrden === 'COMPRA' ? 'Compraste' : 'Vendiste'} ${data.cantidad} ${data.ticker} a ${formatearMoneda(data.precio)} c/u (${formatearMoneda(importe)} total)!` });
      setCantidad('');
      await cargarDatos();
      if (alOrdenExitosa) alOrdenExitosa(importe, tipoOrden);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setOperando(false);
    }
  };

  return (
    <div className="cedears-container">
      <div className="cedears-header-box">
        <h2>Inversiones en CEDEARs</h2>
        <p>Comprá y vendé CEDEARs con cotización en vivo del mercado argentino.</p>
      </div>

      <div className="cedears-layout">
      <div className="cedears-main">
        <div className="cedears-card">
          <h3 className="cedears-subtitulo">Comprar / Vender</h3>
          <form onSubmit={handleOrdenar} className="cedears-form">
            <div className="cedears-row">
              <div className="cedears-field">
                <label>Ticker</label>
                <select
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  disabled={operando || cargando}
                  className="cedears-input-select"
                >
                  {catalogo.map(c => (
                    <option key={c.ticker} value={c.ticker}>{c.ticker} — {formatearMoneda(c.precio)}</option>
                  ))}
                </select>
              </div>
              <div className="cedears-field">
                <label>Operación</label>
                <select
                  value={tipoOrden}
                  onChange={(e) => setTipoOrden(e.target.value)}
                  disabled={operando}
                  className="cedears-input-select"
                >
                  <option value="COMPRA">Comprar</option>
                  <option value="VENTA">Vender</option>
                </select>
              </div>
              <div className="cedears-field">
                <label>Cantidad</label>
                <input
                  type="number"
                  placeholder="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  disabled={operando}
                  className="cedears-input-text"
                />
              </div>
            </div>

            {tickerSeleccionado && cantidad && Number(cantidad) > 0 && (
              <div className="cedears-simulador">
                {tipoOrden === 'COMPRA' ? 'Vas a pagar' : 'Vas a recibir'} aproximadamente{' '}
                <strong>{formatearMoneda(tickerSeleccionado.precio * Number(cantidad))}</strong>
                {' '}({formatearMoneda(tickerSeleccionado.precio)} × {cantidad})
              </div>
            )}

            <button type="submit" disabled={operando || catalogo.length === 0} className="btn-ced-operar">
              {operando ? 'Procesando...' : tipoOrden === 'COMPRA' ? 'Comprar' : 'Vender'}
            </button>
          </form>

          {mensaje.texto && (
            <div className={`cedears-alert ${mensaje.tipo}`}>
              {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
            </div>
          )}
        </div>

        <div className="cedears-lista">
          <h3 className="cedears-subtitulo">Mi portafolio</h3>
          {cargando ? (
            <p className="cedears-empty-msg">Cargando...</p>
          ) : portafolio.length === 0 ? (
            <p className="cedears-empty-msg">Todavía no tenés CEDEARs en cartera.</p>
          ) : (
            portafolio.map(p => (
              <div key={p.ticker} className="cedears-item-card">
                <div className="cedears-item-header">
                  <strong>{p.ticker}</strong>
                  <span className={`cedears-item-ganancia ${p.gananciaNoRealizada >= 0 ? 'positiva' : 'negativa'}`}>
                    {p.gananciaNoRealizada != null ? `${p.gananciaNoRealizada >= 0 ? '+' : ''}${formatearMoneda(p.gananciaNoRealizada)}` : '—'}
                  </span>
                </div>
                <span className="cedears-item-detalle">
                  {p.cantidad} unidades · Costo promedio {formatearMoneda(p.precioPromedioCompra)} · Precio actual {formatearMoneda(p.precioActual)}
                </span>
                <span className="cedears-item-valor">Valor actual: {formatearMoneda(p.valorActual)}</span>
              </div>
            ))
          )}
        </div>

        <button onClick={alCancelar} className="btn-ced-volver">Volver al Inicio</button>
      </div>

      <div className="cedears-info-panel">
        <h4>Resumen</h4>
        <span className="cedears-info-label">Saldo en tu cuenta</span>
        <p className="cedears-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>
        <span className="cedears-info-label">Valor total del portafolio</span>
        <p className="cedears-info-dato">{formatearMoneda(portafolio.reduce((acc, p) => acc + (p.valorActual || 0), 0))}</p>
        <span className="cedears-info-label">Ganancia/pérdida no realizada</span>
        <p className={`cedears-info-dato ${portafolio.reduce((acc, p) => acc + (p.gananciaNoRealizada || 0), 0) >= 0 ? 'positiva' : 'negativa'}`}>
          {formatearMoneda(portafolio.reduce((acc, p) => acc + (p.gananciaNoRealizada || 0), 0))}
        </p>
      </div>
      </div>
    </div>
  );
}
