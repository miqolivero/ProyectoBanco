import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import './Reservas.css';

export default function Reservas({ datosUsuario, alMovimientoExitoso, alCancelar }) {
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const [nombreNueva, setNombreNueva] = useState('');
  const [objetivoNueva, setObjetivoNueva] = useState('');
  const [fechaMetaNueva, setFechaMetaNueva] = useState('');
  const [creando, setCreando] = useState(false);

  const [montoInputs, setMontoInputs] = useState({});
  const [procesandoId, setProcesandoId] = useState(null);

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const cargarReservas = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/reservas?cbu=${datosUsuario.cbu}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) setReservas(data);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar el listado de reservas.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarReservas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.cbu]);

  const handleCrear = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    if (!nombreNueva.trim()) {
      setMensaje({ tipo: 'error', texto: 'Ponele un nombre a la reserva (ej. "Vacaciones").' });
      return;
    }

    try {
      setCreando(true);
      const response = await fetch('http://localhost:3001/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu: datosUsuario.cbu,
          nombre: nombreNueva.trim(),
          monto_objetivo: objetivoNueva ? Number(objetivoNueva) : null,
          fecha_meta: fechaMetaNueva || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear la reserva.');

      setNombreNueva('');
      setObjetivoNueva('');
      setFechaMetaNueva('');
      setMensaje({ tipo: 'exito', texto: `¡Reserva "${data.nombre}" creada!` });
      await cargarReservas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCreando(false);
    }
  };

  const handleEliminar = async (idReserva) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setProcesandoId(idReserva);
      const response = await fetch(`http://localhost:3001/api/reservas/${idReserva}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu: datosUsuario.cbu })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo eliminar la reserva.');

      setMensaje({ tipo: 'exito', texto: 'Reserva eliminada.' });
      await cargarReservas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setProcesandoId(null);
    }
  };

  const handleMovimiento = async (idReserva, tipo) => {
    const monto = Number(montoInputs[idReserva]);
    if (!monto || monto <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un monto mayor a cero.' });
      return;
    }

    setMensaje({ tipo: '', texto: '' });

    try {
      setProcesandoId(idReserva);
      const endpoint = tipo === 'aportar' ? 'aportar' : 'retirar';
      const response = await fetch(`http://localhost:3001/api/reservas/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_reserva: idReserva, monto, cbu: datosUsuario.cbu })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo procesar el movimiento.');

      setMensaje({ tipo: 'exito', texto: tipo === 'aportar' ? `Aportaste ${formatearMoneda(monto)}.` : `Retiraste ${formatearMoneda(monto)}.` });
      setMontoInputs(prev => ({ ...prev, [idReserva]: '' }));
      await cargarReservas();

      if (alMovimientoExitoso) alMovimientoExitoso(monto, tipo);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <div className="reservas-container">
      <div className="reservas-header-box">
        <h2>Reservas y Ahorros</h2>
        <p>Separá plata de tu cuenta principal en "bolsillos" con objetivos, sin abrir otra cuenta.</p>
      </div>

      <div className="reservas-layout">
      <div className="reservas-main">
      <div className="reservas-card">
        <h3 className="reservas-subtitulo">Nueva reserva</h3>
        <form onSubmit={handleCrear} className="reservas-form">
          <div className="reservas-row">
            <div className="reservas-field">
              <label>Nombre</label>
              <input
                type="text"
                placeholder="Ej. Vacaciones"
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                disabled={creando}
                className="reservas-input-text"
              />
            </div>
            <div className="reservas-field">
              <label>Objetivo (opcional)</label>
              <input
                type="number"
                placeholder="$ 0"
                value={objetivoNueva}
                onChange={(e) => setObjetivoNueva(e.target.value)}
                disabled={creando}
                className="reservas-input-text"
              />
            </div>
            <div className="reservas-field">
              <label>Fecha meta (opcional)</label>
              <input
                type="date"
                value={fechaMetaNueva}
                onChange={(e) => setFechaMetaNueva(e.target.value)}
                disabled={creando}
                className="reservas-input-text"
              />
            </div>
          </div>

          <button type="submit" disabled={creando} className="btn-res-crear">
            {creando ? 'Creando...' : '+ Crear Reserva'}
          </button>
        </form>

        {mensaje.texto && (
          <div className={`reservas-alert ${mensaje.tipo}`}>
            {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
          </div>
        )}
      </div>

      <div className="reservas-lista">
        {cargando ? (
          <p className="reservas-empty-msg">Cargando reservas...</p>
        ) : reservas.length === 0 ? (
          <p className="reservas-empty-msg">Todavía no creaste ninguna reserva.</p>
        ) : (
          reservas.map(r => {
            const saldoActual = Number(r.saldo_actual);
            const objetivo = r.monto_objetivo ? Number(r.monto_objetivo) : null;
            const progreso = objetivo ? Math.min(100, (saldoActual / objetivo) * 100) : null;

            return (
              <div key={r.id_reserva} className="reservas-item-card">
                <div className="reservas-item-header">
                  <strong>{r.nombre}</strong>
                  <div className="reservas-item-header-derecha">
                    <span className="reservas-item-saldo">{formatearMoneda(saldoActual)}</span>
                    <button
                      onClick={() => handleEliminar(r.id_reserva)}
                      disabled={procesandoId === r.id_reserva || saldoActual > 0}
                      className="btn-res-eliminar"
                      title={saldoActual > 0 ? 'Retirá el saldo antes de eliminarla' : 'Eliminar reserva'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {objetivo && (
                  <>
                    <div className="reservas-progress-bar">
                      <div className="reservas-progress-fill" style={{ width: `${progreso}%` }} />
                    </div>
                    <span className="reservas-progress-label">
                      {formatearMoneda(saldoActual)} de {formatearMoneda(objetivo)} ({progreso.toFixed(0)}%)
                      {r.fecha_meta ? ` · Meta: ${new Date(r.fecha_meta).toLocaleDateString('es-AR')}` : ''}
                    </span>
                  </>
                )}

                <div className="reservas-item-actions">
                  <input
                    type="number"
                    placeholder="Monto"
                    value={montoInputs[r.id_reserva] || ''}
                    onChange={(e) => setMontoInputs(prev => ({ ...prev, [r.id_reserva]: e.target.value }))}
                    disabled={procesandoId === r.id_reserva}
                    className="reservas-input-monto-item"
                  />
                  <button
                    onClick={() => handleMovimiento(r.id_reserva, 'aportar')}
                    disabled={procesandoId === r.id_reserva}
                    className="btn-res-aportar"
                  >
                    {procesandoId === r.id_reserva ? '...' : 'Aportar'}
                  </button>
                  <button
                    onClick={() => handleMovimiento(r.id_reserva, 'retirar')}
                    disabled={procesandoId === r.id_reserva || saldoActual <= 0}
                    className="btn-res-retirar"
                  >
                    {procesandoId === r.id_reserva ? '...' : 'Retirar'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button onClick={alCancelar} className="btn-res-volver">
        Volver al Inicio
      </button>
      </div>

      <div className="reservas-info-panel">
        <h4>Resumen</h4>
        <span className="reservas-info-label">Saldo disponible en tu cuenta</span>
        <p className="reservas-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>
        <span className="reservas-info-label">Total ahorrado en reservas</span>
        <p className="reservas-info-dato">{formatearMoneda(reservas.reduce((acc, r) => acc + Number(r.saldo_actual), 0))}</p>
        <span className="reservas-info-label">Reservas activas</span>
        <p className="reservas-info-dato">{reservas.length}</p>
      </div>
      </div>
    </div>
  );
}
