import React, { useState } from 'react';
import './Depositar.css';

export default function Depositar({ datosUsuario, alDepositarExitoso, alCancelar }) {
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

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
          cbu: datosUsuario.cbu,
          monto: montoNum
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo procesar el depósito.');
      }

      setMensaje({ tipo: 'exito', texto: `¡Perfecto! Se acreditaron ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(montoNum)} en tu cuenta.` });
      setMonto('');
      
      // Notifica al componente padre para impactar el saldo y recargar el historial
      if (alDepositarExitoso) {
        alDepositarExitoso(montoNum);
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

      <div className="depositar-card">
        <form onSubmit={handleSubmit} className="depositar-form">
          <div className="depositar-field">
            <label>Cuenta de Destino (Tu Cuenta)</label>
            <input 
              type="text" 
              value={`${datosUsuario?.nombre} ${datosUsuario?.apellido} (CBU: ${datosUsuario?.cbu})`} 
              disabled 
              className="depositar-input-disabled"
            />
          </div>

          <div className="depositar-field">
            <label>Monto a Depositar (ARS)</label>
            <div className="input-monto-wrapper">
              <span className="currency-prefix">$</span>
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
              {mensaje.tipo === 'error' ? '⚠️' : '🎉'} {mensaje.texto}
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
    </div>
  );
}