import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Repeat } from 'lucide-react';
import SelectorCuenta from '../SelectorCuenta/SelectorCuenta';
import './CambioDivisa.css';
import { API_URL } from '../../config/api';

export default function CambioDivisa({ cuentas, monedaActiva, onCambiarMoneda, mostrarAbrirUSD, onAbrirUSD, abriendoUSD, alCambioExitoso, alCancelar }) {
  const [monto, setMonto] = useState('');
  const [cotizacion, setCotizacion] = useState(null);
  const [cargandoCotizacion, setCargandoCotizacion] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const cuentaOrigen = cuentas?.find(c => c.moneda === monedaActiva) || cuentas?.[0];
  const esVenta = cuentaOrigen?.moneda === 'USD'; // vender USD -> ARS, o comprar USD con ARS
  const monedaDestino = esVenta ? 'ARS' : 'USD';
  const tieneAmbasCuentas = (cuentas?.length || 0) >= 2;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setCargandoCotizacion(true);
        const res = await fetch(`${API_URL}/api/movimientos/cambio/cotizacion`);
        const data = await res.json();
        if (!cancelado && res.ok) setCotizacion(data);
      } catch {
        // silencioso: el preview solo no se muestra, no bloquea la pantalla
      } finally {
        if (!cancelado) setCargandoCotizacion(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const formatear = (valor, moneda) => {
    return new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-AR', { style: 'currency', currency: moneda }).format(valor || 0);
  };

  const cotizacionUsada = cotizacion ? (esVenta ? cotizacion.compra : cotizacion.venta) : null;
  const montoDestinoPreview = cotizacionUsada && monto
    ? (esVenta ? Number(monto) * cotizacionUsada : Number(monto) / cotizacionUsada)
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un monto mayor a cero.' });
      return;
    }
    if (montoNum > Number(cuentaOrigen?.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo en ${cuentaOrigen.moneda} es ${formatear(cuentaOrigen.saldo, cuentaOrigen.moneda)}.` });
      return;
    }

    try {
      setCargando(true);
      const response = await fetch(`${API_URL}/api/movimientos/cambio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu: cuentaOrigen.cbu, monto: montoNum })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo procesar el cambio.');

      setMensaje({
        tipo: 'exito',
        texto: `¡Listo! Se acreditaron ${formatear(data.montoDestino, data.monedaDestino)} en tu cuenta en ${data.monedaDestino} (cotización ${data.casa}: $${data.cotizacionUsada}).`
      });
      setMonto('');
      if (alCambioExitoso) {
        alCambioExitoso(data.montoOrigen, data.monedaOrigen, data.montoDestino, data.monedaDestino);
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="cambio-container">
      <div className="cambio-header-box">
        <span className="cambio-eyebrow">Dos monedas, un mismo cauce</span>
        <h2>Cambio de Divisa</h2>
        <p>Convertí saldo entre tu cuenta en ARS y tu cuenta en USD, a la cotización oficial del momento.</p>
      </div>

      {cuentas?.length > 0 && (
        <SelectorCuenta
          cuentas={cuentas}
          monedaActiva={monedaActiva}
          onCambiarMoneda={onCambiarMoneda}
          mostrarAbrirUSD={mostrarAbrirUSD}
          onAbrirUSD={onAbrirUSD}
          abriendoUSD={abriendoUSD}
        />
      )}

      {!tieneAmbasCuentas ? (
        <div className="cambio-card">
          <p className="cambio-aviso">Para cambiar de moneda necesitás tener abiertas tanto tu cuenta en ARS como tu cuenta en USD. Abrí la que te falte arriba.</p>
        </div>
      ) : (
        <div className="cambio-layout">
          <div className="cambio-card">
            <div className="cambio-direccion">
              <span className="cambio-direccion-desde">{cuentaOrigen.moneda}</span>
              <Repeat size={18} />
              <span className="cambio-direccion-hacia">{monedaDestino}</span>
            </div>
            <p className="cambio-subtitulo">{esVenta ? 'Vendés dólares y recibís pesos.' : 'Comprás dólares con tus pesos.'}</p>

            <form onSubmit={handleSubmit} className="cambio-form">
              <div className="cambio-field">
                <label>Monto a {esVenta ? 'vender' : 'cambiar'} ({cuentaOrigen.moneda})</label>
                <div className="cambio-input-wrapper">
                  <span className="cambio-currency-prefix">{cuentaOrigen.moneda === 'USD' ? 'US$' : '$'}</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    disabled={cargando}
                    className="cambio-input-monto"
                    required
                  />
                  {/* 🎯 "Usar máximo": carga de una todo el saldo disponible en la moneda de
                      origen, para no tener que copiar el número a mano si se quiere cambiar
                      toda la plata que hay en la cuenta. */}
                  <button
                    type="button"
                    className="btn-cambio-max"
                    onClick={() => setMonto(String(Number(cuentaOrigen?.saldo || 0)))}
                    disabled={cargando || !cuentaOrigen?.saldo}
                  >
                    MÁX
                  </button>
                </div>
                <span className="cambio-saldo-disponible">
                  Disponible: {formatear(cuentaOrigen?.saldo, cuentaOrigen?.moneda)}
                </span>
              </div>

              <div className="cambio-preview">
                {cargandoCotizacion ? (
                  <span className="cambio-preview-cargando">Consultando cotización...</span>
                ) : cotizacionUsada ? (
                  <>
                    <span className="cambio-preview-label">Recibís aproximadamente</span>
                    <strong className="cambio-preview-monto">{formatear(montoDestinoPreview, monedaDestino)}</strong>
                    <span className="cambio-preview-detalle">Dólar {cotizacion.casa}: {esVenta ? 'compra' : 'venta'} ${cotizacionUsada}</span>
                  </>
                ) : (
                  <span className="cambio-preview-cargando">No se pudo consultar la cotización.</span>
                )}
              </div>

              {mensaje.texto && (
                <div className={`cambio-alert ${mensaje.tipo}`}>
                  {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
                </div>
              )}

              <div className="cambio-actions">
                <button type="button" onClick={alCancelar} disabled={cargando} className="btn-cambio-cancelar">
                  Volver al Inicio
                </button>
                <button type="submit" disabled={cargando || !monto || cargandoCotizacion} className="btn-cambio-confirmar">
                  {cargando ? 'Procesando...' : esVenta ? 'Vender dólares' : 'Comprar dólares'}
                </button>
              </div>
            </form>
          </div>

          <div className="cambio-info-panel">
            <h4>Tus cuentas</h4>
            {cuentas.map(c => (
              <div key={c.moneda} className="cambio-info-cuenta">
                <span className="cambio-info-label">{c.moneda === 'USD' ? 'Cuenta en USD' : 'Cuenta Corriente'}</span>
                <p className="cambio-info-dato">{formatear(c.saldo, c.moneda)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
