import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CheckCircle2, Copy, QrCode, Tag, XCircle, Loader2 } from 'lucide-react';
import './Cobrar.css';
import { API_URL } from '../../config/api';
import { armarLinkCobro } from '../../config/linkCobro';

const INTERVALO_ESTADO_MS = 3000;

// Últimos cobros de la persona (null si el servidor respondió con error).
async function pedirRecientes() {
  const res = await fetch(`${API_URL}/api/cobros`);
  const data = await res.json();
  return res.ok && Array.isArray(data) ? data : null;
}

// Cuánto lleva cobrado en el mes, cuánto le queda sin comisión y las condiciones.
async function pedirResumenMes() {
  const res = await fetch(`${API_URL}/api/cobros/resumen-mes`);
  const data = await res.json();
  return res.ok ? data : null;
}

const ETIQUETA_ESTADO = {
  PENDIENTE: 'Pendiente',
  PROCESANDO: 'Procesando',
  PAGADO: 'Cobrado',
  CANCELADO: 'Cancelado'
};

// 🎯 Cobrar con QR: el comercio (cualquier cliente) ingresa el monto y se genera un QR con un
// link al cobro. Todo lo que es plata —descuento del evento, tope, monto final— lo calcula el
// backend al crear el cobro; acá solo se muestra. Mientras el cobro esté abierto, esta pantalla
// pregunta su estado cada 3 segundos y avisa cuando se paga.
export default function Cobrar({ datosUsuario, alCobroRecibido, alCancelar }) {
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [cobro, setCobro] = useState(null);
  const [recientes, setRecientes] = useState([]);
  const [resumenMes, setResumenMes] = useState(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const formatearMoneda = (valor) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor) || 0);

  const formatearFecha = (stringFecha) => {
    const fecha = new Date(stringFecha);
    if (isNaN(fecha.getTime())) return '---';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(fecha);
  };

  const cargarRecientes = useCallback(async () => {
    try {
      const [data, resumen] = await Promise.all([pedirRecientes(), pedirResumenMes()]);
      if (data) setRecientes(data);
      if (resumen) setResumenMes(resumen);
    } catch (err) {
      console.error('❌ Error trayendo los cobros recientes:', err);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [data, resumen] = await Promise.all([pedirRecientes(), pedirResumenMes()]);
        if (cancelado) return;
        if (data) setRecientes(data);
        if (resumen) setResumenMes(resumen);
      } catch (err) {
        console.error('❌ Error trayendo los cobros recientes:', err);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  // Polling del estado mientras el cobro siga abierto. Se corta solo cuando pasa a PAGADO o
  // CANCELADO (o al salir de la pantalla).
  const idCobroAbierto = cobro && (cobro.estado === 'PENDIENTE' || cobro.estado === 'PROCESANDO') ? cobro.id : null;
  useEffect(() => {
    if (!idCobroAbierto) return;
    let cancelado = false;

    const consultar = async () => {
      try {
        const res = await fetch(`${API_URL}/api/cobros/${idCobroAbierto}`);
        const data = await res.json();
        if (cancelado || !res.ok) return;
        setCobro(data);
        if (data.estado === 'PAGADO') {
          cargarRecientes();
          if (alCobroRecibido) alCobroRecibido();
        }
      } catch (err) {
        console.error('❌ Error consultando el estado del cobro:', err);
      }
    };

    const intervalo = setInterval(consultar, INTERVALO_ESTADO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [idCobroAbierto, alCobroRecibido, cargarRecientes]);

  const handleMontoChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*(\.\d{0,2})?$/.test(value)) setMonto(value);
  };

  const handleGenerar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    if (!monto || Number(monto) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un monto mayor a cero.' });
      return;
    }

    try {
      setCargando(true);
      const res = await fetch(`${API_URL}/api/cobros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El monto viaja como texto, tal cual lo escribió el usuario: el backend lo valida y lo
        // guarda como NUMERIC sin pasar por decimales de punto flotante.
        body: JSON.stringify({ cbu: datosUsuario?.cbu, monto, descripcion: descripcion.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar el cobro.');

      setCobro(data);
      setMonto('');
      setDescripcion('');
      cargarRecientes();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCargando(false);
    }
  };

  const handleCancelarCobro = async () => {
    if (!cobro) return;
    try {
      setCargando(true);
      const res = await fetch(`${API_URL}/api/cobros/${cobro.id}/cancelar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cancelar el cobro.');
      setCobro(prev => ({ ...prev, estado: 'CANCELADO' }));
      cargarRecientes();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCargando(false);
    }
  };

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(armarLinkCobro(cobro.id));
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo copiar el link. Compartí el QR.' });
    }
  };

  const handleNuevoCobro = () => {
    setCobro(null);
    setMensaje({ tipo: '', texto: '' });
  };

  const handleReabrir = (c) => {
    setMensaje({ tipo: '', texto: '' });
    setCobro(c);
  };

  return (
    <div className="cobrar-container">
      <div className="cobrar-header-box">
        <span className="cobrar-eyebrow">De nuestra gente, para nuestra gente</span>
        <h2>Cobrar con QR</h2>
        <p>
          Generá un QR por el monto de la venta y mostráselo a tu cliente.
          {resumenMes && ` Los primeros ${formatearMoneda(resumenMes.topeGratis)} del mes no tienen comisión; después, ${Number(resumenMes.comisionPorcentaje)}% + IVA por cobro.`}
        </p>
      </div>

      <div className="cobrar-layout">
        <div className="cobrar-card">
          {!cobro && (
            <form onSubmit={handleGenerar} className="cobrar-form">
              <div className="cobrar-field">
                <label>Monto a cobrar (ARS)</label>
                <div className="cobrar-monto-wrapper">
                  <span className="cobrar-currency-prefix">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={monto}
                    onChange={handleMontoChange}
                    disabled={cargando}
                    className="cobrar-input-monto"
                    required
                  />
                </div>
              </div>

              <div className="cobrar-field">
                <label>Descripción (opcional)</label>
                <input
                  type="text"
                  maxLength={140}
                  placeholder="Ej. 2 empanadas y una gaseosa"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  disabled={cargando}
                  className="cobrar-input-text"
                />
              </div>

              <p className="cobrar-nota">
                <Tag size={14} /> Próximamente: si tu comercio se adhiere a una fiesta de la región, el
                descuento para tu cliente se va a aplicar solo al pagar con QR.
              </p>

              {mensaje.texto && (
                <div className={`cobrar-alert ${mensaje.tipo}`}>
                  <AlertTriangle size={16} /> {mensaje.texto}
                </div>
              )}

              <div className="cobrar-actions">
                <button type="button" onClick={alCancelar} disabled={cargando} className="btn-cob-secundario">
                  Volver al Inicio
                </button>
                <button type="submit" disabled={cargando || !monto} className="btn-cob-principal">
                  <QrCode size={16} /> {cargando ? 'Generando...' : 'Generar QR'}
                </button>
              </div>
            </form>
          )}

          {cobro && cobro.estado === 'PAGADO' && (
            <div className="cobrar-resultado exito">
              <div className="cobrar-resultado-icono"><CheckCircle2 size={34} /></div>
              <h3>¡Cobro recibido!</h3>
              <p className="cobrar-resultado-monto">{formatearMoneda(cobro.montoFinal)}</p>
              {Number(cobro.descuento) > 0 && (
                <p className="cobrar-resultado-detalle">
                  Precio {formatearMoneda(cobro.precio)} − descuento {formatearMoneda(cobro.descuento)} ({cobro.promo?.evento})
                </p>
              )}
              {Number(cobro.comision) > 0 && (
                <p className="cobrar-resultado-detalle">
                  Comisión {formatearMoneda(cobro.comision)} + IVA {formatearMoneda(cobro.ivaComision)} · Te quedan{' '}
                  <strong>{formatearMoneda(cobro.netoComercio)}</strong>
                </p>
              )}
              {cobro.descripcion && <p className="cobrar-resultado-detalle">{cobro.descripcion}</p>}
              <p className="cobrar-resultado-detalle">
                La plata se acredita en tu cuenta en cuanto se sincroniza con el Banco Central.
              </p>
              <button className="btn-cob-principal" onClick={handleNuevoCobro}>Nuevo cobro</button>
            </div>
          )}

          {cobro && cobro.estado === 'CANCELADO' && (
            <div className="cobrar-resultado cancelado">
              <div className="cobrar-resultado-icono"><XCircle size={34} /></div>
              <h3>Cobro cancelado</h3>
              <p className="cobrar-resultado-detalle">El QR ya no se puede pagar.</p>
              <button className="btn-cob-principal" onClick={handleNuevoCobro}>Nuevo cobro</button>
            </div>
          )}

          {cobro && (cobro.estado === 'PENDIENTE' || cobro.estado === 'PROCESANDO') && (
            <div className="cobrar-qr-box">
              <div className="cobrar-qr-marco">
                <QRCodeSVG value={armarLinkCobro(cobro.id)} size={220} level="M" marginSize={2} />
              </div>

              <span className="cobrar-qr-label">Precio</span>
              <p className="cobrar-qr-monto">{formatearMoneda(cobro.precio)}</p>
              {cobro.descripcion && <p className="cobrar-qr-descripcion">{cobro.descripcion}</p>}

              {/* El descuento en pesos depende de quién pague (su tope en el evento es por
                  persona), así que se calcula recién cuando el cliente paga. */}
              {cobro.promo && (
                <div className="cobrar-promo-aviso">
                  <Tag size={14} />
                  <span>
                    Tu cliente tiene <strong>{Number(cobro.porcentajeDescuento)}% de descuento</strong> por {cobro.promo.evento}
                    {' '}(hasta {formatearMoneda(cobro.promo.topePorPersona)} por persona en el evento). Lo financiás vos:
                    el monto que recibís se calcula cuando paga.
                  </span>
                </div>
              )}

              <div className="cobrar-estado-espera">
                <Loader2 size={15} className="cobrar-spinner" />
                {cobro.estado === 'PROCESANDO' ? 'Tu cliente está pagando...' : 'Esperando el pago...'}
              </div>

              {mensaje.texto && (
                <div className={`cobrar-alert ${mensaje.tipo}`}>
                  <AlertTriangle size={16} /> {mensaje.texto}
                </div>
              )}

              <div className="cobrar-actions centradas">
                <button type="button" className="btn-cob-secundario" onClick={handleCopiarLink}>
                  <Copy size={15} /> {linkCopiado ? '¡Link copiado!' : 'Copiar link'}
                </button>
                <button
                  type="button"
                  className="btn-cob-peligro"
                  onClick={handleCancelarCobro}
                  disabled={cargando || cobro.estado !== 'PENDIENTE'}
                >
                  Cancelar cobro
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="cobrar-info-panel">
          {resumenMes && (
            <div className="cobrar-mes">
              <span className="cobrar-mes-label">Cobrado este mes</span>
              <p className="cobrar-mes-monto">{formatearMoneda(resumenMes.cobradoMes)}</p>
              <p className="cobrar-mes-detalle">
                {Number(resumenMes.restanteGratis) > 0
                  ? `Te quedan ${formatearMoneda(resumenMes.restanteGratis)} sin comisión.`
                  : `Ya pasaste los ${formatearMoneda(resumenMes.topeGratis)} gratis: cada cobro paga ${Number(resumenMes.comisionPorcentaje)}% + IVA.`}
                {' '}Podés cobrar hasta {formatearMoneda(resumenMes.restanteLimite)} más este mes.
              </p>
            </div>
          )}
          <h4>Cobros recientes</h4>
          {recientes.length === 0 ? (
            <p className="cobrar-info-vacio">Todavía no generaste cobros.</p>
          ) : (
            <ul className="cobrar-recientes">
              {recientes.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="cobrar-reciente-item"
                    onClick={() => handleReabrir(c)}
                    disabled={c.estado !== 'PENDIENTE'}
                    title={c.estado === 'PENDIENTE' ? 'Volver a mostrar el QR' : undefined}
                  >
                    <div className="cobrar-reciente-info">
                      <strong>{formatearMoneda(c.montoFinal)}</strong>
                      <span>{c.descripcion || formatearFecha(c.fechaCreacion)}</span>
                    </div>
                    <span className={`cobrar-badge ${c.estado.toLowerCase()}`}>{ETIQUETA_ESTADO[c.estado] || c.estado}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
