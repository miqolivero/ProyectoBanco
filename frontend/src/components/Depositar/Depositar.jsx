import React, { useState } from 'react';
import SelectorCuenta from '../SelectorCuenta/SelectorCuenta';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './Depositar.css';

export default function Depositar({ datosUsuario, cuentas, monedaActiva, onCambiarMoneda, mostrarAbrirUSD, onAbrirUSD, abriendoUSD, alDepositarExitoso, alCancelar }) {
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const cuentaSeleccionada = cuentas?.find(c => c.moneda === monedaActiva) || cuentas?.[0] || datosUsuario;

  const formatearMonedaSaldo = (valor, moneda = cuentaSeleccionada?.moneda || 'ARS') => {
    return new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-AR', { style: 'currency', currency: moneda }).format(valor || 0);
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

    try {
      setCargando(true);
      const response = await fetch('http://localhost:3001/api/movimientos/depositar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu: cuentaSeleccionada.cbu,
          monto: montoNum
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo procesar el depósito.');
      }

      setMensaje({ tipo: 'exito', texto: `¡Perfecto! Se acreditaron ${formatearMonedaSaldo(montoNum)} en tu cuenta.` });
      setMonto('');

      // Notifica al componente padre para impactar el saldo correcto (ARS o USD) y recargar el historial
      if (alDepositarExitoso) {
        alDepositarExitoso(montoNum, cuentaSeleccionada.moneda);
      }

    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="depositar-container">
      <div className="depositar-header-box">
        <h2>Cargar Dinero en Cuenta</h2>
        <p>Simulá un depósito en efectivo por terminales autoservicio e impactalo al instante.</p>
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

      <div className="depositar-layout">
      <div className="depositar-card">
        <form onSubmit={handleSubmit} className="depositar-form">
          <div className="depositar-field">
            <label>Cuenta de Destino (Tu Cuenta)</label>
            <input
              type="text"
              value={`${datosUsuario?.nombre} ${datosUsuario?.apellido} (CBU: ${cuentaSeleccionada?.cbu})`}
              disabled
              className="depositar-input-disabled"
            />
          </div>

          <div className="depositar-field">
            <label>Monto a Depositar ({cuentaSeleccionada?.moneda || 'ARS'})</label>
            <div className="input-monto-wrapper">
              <span className="currency-prefix">{cuentaSeleccionada?.moneda === 'USD' ? 'US$' : '$'}</span>
              <input
                type="number"
                placeholder="0.00"
                value={monto}
                onChange={handleMontoChange}
                disabled={cargando}
                className="depositar-input-monto"
                required
              />
            </div>
          </div>

          {mensaje.texto && (
            <div className={`depositar-alert ${mensaje.tipo}`}>
              {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
            </div>
          )}

          <div className="depositar-actions">
            <button
              type="button"
              onClick={alCancelar}
              disabled={cargando}
              className="btn-dep-cancelar"
            >
              Volver al Inicio
            </button>
            <button
              type="submit"
              disabled={cargando || !monto}
              className="btn-dep-confirmar"
            >
              {cargando ? 'Procesando...' : 'Confirmar Depósito'}
            </button>
          </div>
        </form>
      </div>

      <div className="depositar-info-panel">
        <h4>Tu cuenta</h4>
        <span className="depositar-info-label">Saldo actual</span>
        <p className="depositar-info-saldo">{formatearMonedaSaldo(cuentaSeleccionada?.saldo)}</p>
        <span className="depositar-info-label">CBU</span>
        <p className="depositar-info-dato mono-text">{cuentaSeleccionada?.cbu}</p>
        {cuentaSeleccionada?.alias && (
          <>
            <span className="depositar-info-label">Alias</span>
            <p className="depositar-info-dato">{cuentaSeleccionada.alias}</p>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
