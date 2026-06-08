import React, { useState } from 'react';
import './Transferencias.css';

export default function Transferencias({ datosUsuario, alTransferirExitosa, alCancelar }) {
  const [cbuDestino, setCbuDestino] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('Varios');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [transferenciaExitosaId, setTransferenciaExitosaId] = useState(null);
  const [montoEnviado, setMontoEnviado] = useState(0);

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const handleTransferir = async (e) => {
    e.preventDefault();
    
    if (!cbuDestino || !monto || Number(monto) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Por favor, completa todos los campos obligatorios.' });
      return;
    }

    if (Number(monto) > Number(datosUsuario?.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo actual es de ${formatearMoneda(datosUsuario?.saldo)}` });
      return;
    }

    setMensaje({ tipo: '', texto: '' });
    setCargando(true);

    try {
      const response = await fetch('http://localhost:3001/api/movimientos/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu_origen: datosUsuario.cbu,
          cbu_destino: cbuDestino.trim(),
          monto: Number(monto)
        })
      });

      const data = await response.json();

      if (response.status === 201 || response.status === 200) {
        setMontoEnviado(Number(monto));
        // Guardamos el ID que viene en tu controlador (data.id)
        setTransferenciaExitosaId(data.id || 'Generando ID...');
        
        // Avisamos al padre pasándole el monto para que descuente el saldo visual inmediatamente
        if (alTransferirExitosa) alTransferirExitosa(Number(monto));
        
        setCbuDestino('');
        setMonto('');
      } else {
        const errorMostrar = data.error || 'Ocurrió un problema con la transferencia.';
        setMensaje({ tipo: 'error', texto: errorMostrar });
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: 'Error de red: No se pudo conectar con el servidor.' });
    } finally {
      setCargando(false);
    }
  };

  // PANTALLA INTERMEDIA DE ÉXITO
  if (transferenciaExitosaId) {
    return (
      <div className="success-screen-container">
        <div className="success-card">
          <div className="success-icon-circle">✓</div>
          <h2>¡Transferencia Realizada!</h2>
          <p className="success-subtitle">Los fondos se acreditarán de manera inmediata.</p>
          
          <div className="success-details-box">
            <div className="success-row">
              <span>Monto enviado:</span>
              <strong>{formatearMoneda(montoEnviado)}</strong>
            </div>
            <div className="success-row">
              <span>Comprobante ID:</span>
              <span className="mono-text-id">{transferenciaExitosaId}</span>
            </div>
          </div>

          <button className="btn-success-return" onClick={alCancelar}>
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="transfer-container">
      <div className="transfer-header-title">
        <h2>Nueva Transferencia</h2>
        <p>Mueve tus fondos con la fluidez del agua entre cuentas y beneficiarios.</p>
      </div>

      <div className="transfer-grid">
        <form className="transfer-form-card" onSubmit={handleTransferir}>
          <div className="form-section">
            <label className="section-label">Cuenta de origen</label>
            <div className="account-selector-card selected">
              <div className="account-info-main">
                <span>Cuenta Corriente $ ...{datosUsuario?.cbu?.slice(-4)}</span>
                <span className="check-icon">✓</span>
              </div>
              <p className="account-balance-display">{formatearMoneda(datosUsuario?.saldo)}</p>
            </div>
          </div>

          <div className="form-section">
            <label className="section-label">Destino de la transferencia</label>
            <div className="destination-type-toggle">
              <button type="button" className="toggle-btn active">👤 Nuevo destinatario</button>
              <button type="button" className="toggle-btn" onClick={alCancelar}>❌ Cancelar</button>
            </div>
          </div>

          <div className="form-section">
            <label className="section-label">CBU / CVU o Alias de destino</label>
            <input 
              type="text" 
              className="form-input-text"
              placeholder="Ingresa los 22 números o el alias"
              value={cbuDestino}
              onChange={(e) => setCbuDestino(e.target.value)}
              required
            />
          </div>

          <div className="form-inline-group">
            <div className="form-section flex-1">
              <label className="section-label">Monto a transferir</label>
              <div className="amount-input-wrapper">
                <span className="currency-symbol">$</span>
                <input 
                  type="number" 
                  step="any"
                  className="form-input-text amount-input"
                  placeholder="0,00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-section flex-1">
              <label className="section-label">Concepto (Opcional)</label>
              <select className="form-input-text" value={concepto} onChange={(e) => setConcepto(e.target.value)}>
                <option value="Varios">Varios</option>
                <option value="Alquiler">Alquiler</option>
                <option value="Facturas">Facturas</option>
                <option value="Préstamos">Préstamos</option>
              </select>
            </div>
          </div>

          {mensaje.texto && <div className={`form-alert ${mensaje.tipo}`}>{mensaje.texto}</div>}

          <button type="submit" className="btn-submit-transfer" disabled={cargando}>
            {cargando ? 'Procesando con el Central...' : 'Confirmar Transferencia'}
          </button>
        </form>

        <div className="transfer-sidebar-right">
          <div className="security-banner-card">
            <h4>Seguridad Natural</h4>
            <p>Tus transferencias están protegidas por encriptación de grado bancario vinculada al BCRA.</p>
          </div>
        </div>
      </div>
    </div>
  );
}