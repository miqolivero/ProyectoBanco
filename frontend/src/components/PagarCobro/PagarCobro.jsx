import { useState, useEffect } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Store, XCircle, PiggyBank } from 'lucide-react';
import AdvertenciaCbuNuevo from '../AdvertenciaCbuNuevo/AdvertenciaCbuNuevo';
import './PagarCobro.css';
import { API_URL } from '../../config/api';

async function pedirCobro(idCobro) {
  const res = await fetch(`${API_URL}/api/cobros/${idCobro}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el cobro.');
  return data;
}

// 🎯 Pantalla a la que llega quien escanea un QR de cobro. El desglose (precio, descuento del
// evento, si se aplicó el tope y monto final) lo calculó el backend al crear el cobro: acá solo
// se muestra. Pagar ejecuta una transferencia normal por el monto final a la cuenta del comercio.
export default function PagarCobro({ idCobro, datosUsuario, alPagoExitoso, alCancelar }) {
  const [cobro, setCobro] = useState(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [pagando, setPagando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [advertencia, setAdvertencia] = useState(null);
  const [resultado, setResultado] = useState(null);

  const formatearMoneda = (valor) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor) || 0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await pedirCobro(idCobro);
        if (!cancelado) setCobro(data);
      } catch (err) {
        if (!cancelado) setErrorCarga(err.message);
      }
    })();
    return () => { cancelado = true; };
  }, [idCobro]);

  const pagar = async (confirmarCbuNuevo) => {
    setMensaje('');
    setPagando(true);
    try {
      const res = await fetch(`${API_URL}/api/cobros/${idCobro}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu_origen: datosUsuario?.cbu, confirmar_cbu_nuevo: confirmarCbuNuevo })
      });
      const data = await res.json();

      if (res.status === 409 && data.requiereConfirmacion) {
        setAdvertencia({ mensaje: data.error });
        return;
      }
      setAdvertencia(null);

      if (!res.ok) {
        // Si cambió el estado (lo pagó otro, lo cancelaron), se recarga para mostrarlo.
        if (res.status === 409 && data.estado) {
          setCobro(await pedirCobro(idCobro));
        }
        throw new Error(data.error || 'No se pudo completar el pago.');
      }

      setResultado(data);
      setCobro(data.cobro);
      if (alPagoExitoso) alPagoExitoso(Number(data.cobro.desglose.montoAPagar));
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setPagando(false);
    }
  };

  if (errorCarga) {
    return (
      <div className="pagar-container">
        <div className="pagar-card pagar-estado">
          <div className="pagar-estado-icono neutro"><XCircle size={32} /></div>
          <h3>No encontramos este cobro</h3>
          <p>{errorCarga}</p>
          <button className="btn-pag-secundario" onClick={alCancelar}>Volver al Inicio</button>
        </div>
      </div>
    );
  }

  if (!cobro) {
    return (
      <div className="pagar-container">
        <div className="pagar-card pagar-estado"><p>Cargando el cobro...</p></div>
      </div>
    );
  }

  if (cobro.rol === 'cobrador') {
    return (
      <div className="pagar-container">
        <div className="pagar-card pagar-estado">
          <div className="pagar-estado-icono neutro"><Store size={32} /></div>
          <h3>Este cobro es tuyo</h3>
          <p>No podés pagar un cobro que generaste vos. Mostrale el QR a tu cliente desde "Cobrar con QR".</p>
          <button className="btn-pag-secundario" onClick={alCancelar}>Volver al Inicio</button>
        </div>
      </div>
    );
  }

  const { comercio, desglose } = cobro;
  const hayDescuento = Number(desglose.descuento) > 0;

  if (cobro.estado === 'PAGADO' && cobro.pagadoPorVos) {
    return (
      <div className="pagar-container">
        <div className="pagar-card pagar-estado">
          <div className="pagar-estado-icono exito"><CheckCircle2 size={34} /></div>
          <h3>¡Pago realizado!</h3>
          <p className="pagar-estado-monto">{formatearMoneda(desglose.montoAPagar)}</p>
          <p>a {comercio.nombre}</p>
          {hayDescuento && (
            <div className="pagar-ahorro">
              <PiggyBank size={18} /> Ahorraste {formatearMoneda(desglose.descuento)} con Calamuchita
            </div>
          )}
          {resultado?.comprobante?.idTransaccion && (
            <p className="pagar-comprobante">Comprobante N° <span>{resultado.comprobante.idTransaccion}</span></p>
          )}
          <button className="btn-pag-principal" onClick={alCancelar}>Volver al Inicio</button>
        </div>
      </div>
    );
  }

  if (cobro.estado === 'PAGADO' || cobro.estado === 'CANCELADO') {
    return (
      <div className="pagar-container">
        <div className="pagar-card pagar-estado">
          <div className="pagar-estado-icono neutro"><XCircle size={32} /></div>
          <h3>{cobro.estado === 'PAGADO' ? 'Este cobro ya fue pagado' : 'El comercio canceló este cobro'}</h3>
          <p>Pedile al comercio que genere un QR nuevo.</p>
          <button className="btn-pag-secundario" onClick={alCancelar}>Volver al Inicio</button>
        </div>
      </div>
    );
  }

  const saldoInsuficiente = Number(datosUsuario?.saldo) < Number(desglose.montoAPagar);

  return (
    <div className="pagar-container">
      <div className="pagar-header-box">
        <span className="pagar-eyebrow">Pagá con la tranquilidad de las sierras</span>
        <h2>Pagar con QR</h2>
      </div>

      <div className="pagar-card">
        <div className="pagar-comercio">
          <div className="pagar-comercio-icono"><Store size={22} /></div>
          <div className="pagar-comercio-datos">
            <strong>{comercio.nombre}</strong>
            <span>
              {comercio.rubro ? `${comercio.rubro} · ` : ''}Cuenta terminada en {comercio.cbuTerminacion}
            </span>
          </div>
        </div>

        {comercio.adherido && (
          <div className="pagar-adherido">
            <BadgeCheck size={16} />
            <span>Comercio adherido a <strong>{comercio.eventoAdhesion}</strong></span>
          </div>
        )}

        {cobro.descripcion && <p className="pagar-descripcion">{cobro.descripcion}</p>}

        <div className="pagar-desglose">
          <div className="pagar-desglose-fila">
            <span>Precio</span><span>{formatearMoneda(desglose.precio)}</span>
          </div>
          {hayDescuento && (
            <div className="pagar-desglose-fila descuento">
              <span>
                Descuento {Number(desglose.porcentajeDescuento)}% · {desglose.evento}
                {desglose.topeAplicado && (
                  <em>
                    Se aplicó el tope de {formatearMoneda(desglose.topePorPersona)} por persona en el evento
                    {desglose.disponibleEnEvento != null && ` (te quedaban ${formatearMoneda(desglose.disponibleEnEvento)})`}
                  </em>
                )}
              </span>
              <span>− {formatearMoneda(desglose.descuento)}</span>
            </div>
          )}
          {!hayDescuento && desglose.evento && desglose.topeAplicado && (
            <div className="pagar-desglose-fila">
              <span>
                Ya usaste todo tu descuento de {desglose.evento}
                <em>El tope es de {formatearMoneda(desglose.topePorPersona)} por persona en el evento</em>
              </span>
              <span>$ 0</span>
            </div>
          )}
          <div className="pagar-desglose-fila total">
            <span>Pagás</span><span>{formatearMoneda(desglose.montoAPagar)}</span>
          </div>
        </div>

        <p className="pagar-saldo">
          Desde tu cuenta en pesos · Saldo disponible {formatearMoneda(datosUsuario?.saldo)}
        </p>

        {cobro.estado === 'PROCESANDO' && (
          <div className="pagar-alert">
            <AlertTriangle size={16} /> Este cobro se está pagando en este momento.
          </div>
        )}
        {saldoInsuficiente && (
          <div className="pagar-alert">
            <AlertTriangle size={16} /> No te alcanza el saldo para este pago.
          </div>
        )}
        {mensaje && (
          <div className="pagar-alert">
            <AlertTriangle size={16} /> {mensaje}
          </div>
        )}

        <div className="pagar-actions">
          <button type="button" className="btn-pag-secundario" onClick={alCancelar} disabled={pagando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-pag-principal"
            onClick={() => pagar(false)}
            disabled={pagando || saldoInsuficiente || cobro.estado !== 'PENDIENTE'}
          >
            {pagando ? 'Procesando con el Central...' : `Pagar ${formatearMoneda(desglose.montoAPagar)}`}
          </button>
        </div>
      </div>

      {advertencia && (
        <AdvertenciaCbuNuevo
          mensaje={advertencia.mensaje}
          nombreDestino={comercio.titular}
          procesando={pagando}
          alConfirmar={() => pagar(true)}
          alCancelar={() => setAdvertencia(null)}
        />
      )}
    </div>
  );
}
