import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './Prestamos.css';

export default function Prestamos({ datosUsuario, alSolicitarExitoso, alPagarExitoso, alCancelar }) {
  const [tasa, setTasa] = useState(null);
  const [cargandoTasa, setCargandoTasa] = useState(true);

  const [capacidad, setCapacidad] = useState(null);

  const [prestamos, setPrestamos] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  const [monto, setMonto] = useState('');
  const [plazoMeses, setPlazoMeses] = useState('12');
  const [simulacion, setSimulacion] = useState(null);
  const [simulando, setSimulando] = useState(false);
  const [solicitando, setSolicitando] = useState(false);

  const [pagandoId, setPagandoId] = useState(null);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const cargarTasa = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/prestamos/tasa');
      const data = await response.json();
      if (response.ok) setTasa(data);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo obtener la tasa vigente.' });
    } finally {
      setCargandoTasa(false);
    }
  };

  const cargarCapacidad = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/prestamos/capacidad?cbu=${datosUsuario.cbu}`);
      const data = await response.json();
      if (response.ok) setCapacidad(data);
    } catch {
      // silencioso: si falla, el backend igual valida al solicitar
    }
  };

  const cargarLista = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/prestamos?cbu=${datosUsuario.cbu}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) setPrestamos(data);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar el listado de préstamos.' });
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarTasa();
    cargarCapacidad();
    cargarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.cbu]);

  useEffect(() => {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0 || !plazoMeses) {
      setSimulacion(null);
      return;
    }
    let cancelado = false;
    const simular = async () => {
      try {
        setSimulando(true);
        const response = await fetch('http://localhost:3001/api/prestamos/simular', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monto: montoNum, plazo_meses: Number(plazoMeses) })
        });
        const data = await response.json();
        if (!cancelado && response.ok) setSimulacion(data);
      } catch {
        if (!cancelado) setSimulacion(null);
      } finally {
        if (!cancelado) setSimulando(false);
      }
    };
    const timeout = setTimeout(simular, 400); // debounce mientras el usuario escribe el monto
    return () => { cancelado = true; clearTimeout(timeout); };
  }, [monto, plazoMeses]);

  const handleSolicitar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un monto mayor a cero.' });
      return;
    }
    if (capacidad && montoNum > capacidad.disponible) {
      setMensaje({ tipo: 'error', texto: `Superás tu capacidad de endeudamiento. Disponible: ${formatearMoneda(capacidad.disponible)}` });
      return;
    }

    try {
      setSolicitando(true);
      const response = await fetch('http://localhost:3001/api/prestamos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu: datosUsuario.cbu, monto: montoNum, plazo_meses: Number(plazoMeses) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo otorgar el préstamo.');

      setMensaje({ tipo: 'exito', texto: `¡Préstamo otorgado! Se acreditaron ${formatearMoneda(montoNum)} en tu cuenta.` });
      setMonto('');
      setSimulacion(null);
      await cargarLista();
      await cargarCapacidad();
      if (alSolicitarExitoso) alSolicitarExitoso(montoNum);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setSolicitando(false);
    }
  };

  const handlePagarCuota = async (idCuota, cuota) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setPagandoId(idCuota);
      const response = await fetch('http://localhost:3001/api/prestamos/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_cuota: idCuota, cbu: datosUsuario.cbu })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo pagar la cuota.');

      setMensaje({ tipo: 'exito', texto: data.prestamoSaldado ? `¡Cuota pagada y préstamo saldado por completo!` : `¡Cuota de ${formatearMoneda(cuota)} pagada!` });
      await cargarLista();
      await cargarCapacidad();
      if (alPagarExitoso) alPagarExitoso(Number(cuota));
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setPagandoId(null);
    }
  };

  return (
    <div className="prest-container">
      <div className="prest-header-box">
        <h2>Préstamos Personales</h2>
        <p>Solicitá un préstamo con cuota fija y pagalo en cómodas cuotas mensuales.</p>
      </div>

      <div className="prest-tasa-banner">
        {cargandoTasa ? (
          <span>Consultando tasa vigente...</span>
        ) : tasa ? (
          <>
            <div>
              <span className="prest-tasa-label">TNA que cobra el banco</span>
              <strong className="prest-tasa-valor">{tasa.tnaOfrecida}%</strong>
            </div>
            <span className="prest-tasa-detalle">
              Tasa de referencia de mercado: {tasa.tasaReferencia}% (promedio de ~25 entidades, ArgentinaDatos) + {tasa.spreadBps} bps
            </span>
          </>
        ) : (
          <span>No se pudo obtener la tasa vigente en este momento.</span>
        )}
      </div>

      <div className="prest-layout">
      <div className="prest-main">
      <div className="prest-card">
        <h3 className="prest-subtitulo">Solicitar préstamo</h3>
        <form onSubmit={handleSolicitar} className="prest-form">
          <div className="prest-row">
            <div className="prest-field">
              <label>Monto a solicitar</label>
              <input
                type="number"
                placeholder="$ 0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                disabled={solicitando}
                className="prest-input-text"
              />
            </div>
            <div className="prest-field">
              <label>Plazo</label>
              <select
                value={plazoMeses}
                onChange={(e) => setPlazoMeses(e.target.value)}
                disabled={solicitando}
                className="prest-input-select"
              >
                {(tasa?.plazosPermitidos || [6, 12, 18, 24, 36, 48]).map(m => (
                  <option key={m} value={m}>{m} meses</option>
                ))}
              </select>
            </div>
          </div>

          {simulando && <div className="prest-simulador">Calculando cuota...</div>}
          {!simulando && simulacion && (
            <div className="prest-simulador">
              Cuota mensual fija: <strong>{formatearMoneda(simulacion.cuotaFija)}</strong> × {plazoMeses} meses = {formatearMoneda(simulacion.cuotaFija * Number(plazoMeses))} total
            </div>
          )}

          <button type="submit" disabled={solicitando || !tasa} className="btn-prest-solicitar">
            {solicitando ? 'Procesando...' : 'Solicitar Préstamo'}
          </button>
        </form>

        {mensaje.texto && (
          <div className={`prest-alert ${mensaje.tipo}`}>
            {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
          </div>
        )}
      </div>

      <div className="prest-lista">
        <h3 className="prest-subtitulo">Mis préstamos</h3>
        {cargandoLista ? (
          <p className="prest-empty-msg">Cargando...</p>
        ) : prestamos.length === 0 ? (
          <p className="prest-empty-msg">Todavía no solicitaste ningún préstamo.</p>
        ) : (
          prestamos.map(p => (
            <div key={p.id_prestamo} className={`prest-item-card ${p.estado === 'PAGADO' ? 'prest-item-pagado' : ''}`}>
              <div className="prest-item-header">
                <strong>{formatearMoneda(p.monto)}</strong>
                <span className={`prest-badge-estado ${p.estado === 'PAGADO' ? 'pagado' : 'activo'}`}>{p.estado}</span>
              </div>
              <span className="prest-item-detalle">TNA {p.tna}% · {p.plazo_meses} cuotas de {formatearMoneda(p.cuota_fija)}</span>

              {p.proximaCuota && (
                <div className="prest-proxima-cuota">
                  <div>
                    <span className="prest-cuota-label">Próxima cuota ({p.proximaCuota.numero}/{p.plazo_meses})</span>
                    <span className="prest-cuota-vencimiento">Vence {new Date(p.proximaCuota.fecha_vencimiento).toLocaleDateString('es-AR')}</span>
                  </div>
                  <div className="prest-cuota-accion">
                    <span className="prest-cuota-monto">{formatearMoneda(p.proximaCuota.cuota)}</span>
                    <button
                      onClick={() => handlePagarCuota(p.proximaCuota.id_cuota, p.proximaCuota.cuota)}
                      disabled={pagandoId === p.proximaCuota.id_cuota}
                      className="btn-prest-pagar"
                    >
                      {pagandoId === p.proximaCuota.id_cuota ? '...' : 'Pagar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <button onClick={alCancelar} className="btn-prest-volver">Volver al Inicio</button>
      </div>

      <div className="prest-info-panel">
        <h4>Resumen</h4>
        <span className="prest-info-label">Saldo en tu cuenta</span>
        <p className="prest-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>
        {capacidad && (
          <>
            <span className="prest-info-label">Capacidad disponible</span>
            <p className="prest-info-dato">{formatearMoneda(capacidad.disponible)}</p>
            <span className="prest-info-label">Deuda activa</span>
            <p className="prest-info-dato">{formatearMoneda(capacidad.deudaActiva)}</p>
          </>
        )}
        <span className="prest-info-label">Préstamos activos</span>
        <p className="prest-info-dato">{prestamos.filter(p => p.estado === 'ACTIVO').length}</p>
      </div>
      </div>
    </div>
  );
}
