import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './Recargas.css';

const OPERADORAS = ['Movistar', 'Personal', 'Claro', 'Tuenti'];

export default function Recargas({ datosUsuario, alRecargarExitoso, alCancelar }) {
  const [operadora, setOperadora] = useState(OPERADORAS[0]);
  const [numero, setNumero] = useState('');
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const handleMontoChange = (e) => {
    const value = e.target.value;
    if (value === '' || (Number(value) >= 0 && !isNaN(value))) {
      setMonto(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Por favor, ingrese un monto mayor a cero.' });
      return;
    }
    if (!numero.trim()) {
      setMensaje({ tipo: 'error', texto: 'Por favor, ingrese el número de celular a recargar.' });
      return;
    }
    if (montoNum > Number(datosUsuario?.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo actual es de ${formatearMoneda(datosUsuario?.saldo)}` });
      return;
    }

    try {
      setCargando(true);
      const response = await fetch('http://localhost:3001/api/movimientos/recargar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu: datosUsuario.cbu,
          monto: montoNum,
          operadora,
          numero: numero.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo procesar la recarga.');
      }

      setMensaje({ tipo: 'exito', texto: `¡Listo! Recargaste ${formatearMoneda(montoNum)} a tu línea de ${operadora}.` });
      setMonto('');
      setNumero('');

      if (alRecargarExitoso) {
        alRecargarExitoso(montoNum);
      }

    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="recargas-container">
      <div className="recargas-header-box">
        <h2>Recarga de Celular</h2>
        <p>Recargá saldo prepago en la operadora que elijas, al instante.</p>
      </div>

      <div className="recargas-layout">
      <div className="recargas-card">
        <form onSubmit={handleSubmit} className="recargas-form">
          <div className="recargas-field">
            <label>Cuenta de Origen (Tu Cuenta)</label>
            <input
              type="text"
              value={`${datosUsuario?.nombre} ${datosUsuario?.apellido} (CBU: ${datosUsuario?.cbu})`}
              disabled
              className="recargas-input-disabled"
            />
          </div>

          <div className="recargas-row">
            <div className="recargas-field">
              <label>Operadora</label>
              <select
                value={operadora}
                onChange={(e) => setOperadora(e.target.value)}
                disabled={cargando}
                className="recargas-input-select"
              >
                {OPERADORAS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>

            <div className="recargas-field">
              <label>Número de celular</label>
              <input
                type="text"
                placeholder="3534123456"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                disabled={cargando}
                className="recargas-input-text"
                required
              />
            </div>
          </div>

          <div className="recargas-field">
            <label>Monto a Recargar (ARS)</label>
            <div className="input-monto-wrapper">
              <span className="currency-prefix">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={monto}
                onChange={handleMontoChange}
                disabled={cargando}
                className="recargas-input-monto"
                required
              />
            </div>
          </div>

          {mensaje.texto && (
            <div className={`recargas-alert ${mensaje.tipo}`}>
              {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
            </div>
          )}

          <div className="recargas-actions">
            <button
              type="button"
              onClick={alCancelar}
              disabled={cargando}
              className="btn-rec-cancelar"
            >
              Volver al Inicio
            </button>
            <button
              type="submit"
              disabled={cargando || !monto || !numero}
              className="btn-rec-confirmar"
            >
              {cargando ? 'Procesando...' : 'Confirmar Recarga'}
            </button>
          </div>
        </form>
      </div>

      <div className="recargas-info-panel">
        <h4>Tu cuenta</h4>
        <span className="recargas-info-label">Saldo actual</span>
        <p className="recargas-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>

        <span className="recargas-info-label">Operadoras disponibles</span>
        <div className="recargas-info-operadoras">
          {OPERADORAS.map(op => <span key={op} className="recargas-info-operadora-chip">{op}</span>)}
        </div>
      </div>
      </div>
    </div>
  );
}
