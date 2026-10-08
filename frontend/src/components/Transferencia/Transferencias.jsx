import { useState } from 'react';
import { Check, FileText, UserPlus, X } from 'lucide-react';
import SelectorCuenta from '../SelectorCuenta/SelectorCuenta';
import './Transferencias.css';
import { API_URL } from '../../config/api';

export default function Transferencias({ datosUsuario, cuentas, monedaActiva, onCambiarMoneda, mostrarAbrirUSD, onAbrirUSD, abriendoUSD, alTransferirExitosa, alCancelar }) {
  const [cbuDestino, setCbuDestino] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('Varios');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [comprobante, setComprobante] = useState(null);

  const cuentaOrigen = cuentas?.find(c => c.moneda === monedaActiva) || cuentas?.[0] || datosUsuario;

  const formatearMoneda = (valor, moneda = cuentaOrigen?.moneda || 'ARS') => {
    return new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-AR', { style: 'currency', currency: moneda }).format(valor || 0);
  };

  const formatearFecha = (stringFecha) => {
    if (!stringFecha) return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
    const fecha = new Date(stringFecha);
    if (isNaN(fecha.getTime())) return '---';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(fecha);
  };

  const handleDescargarComprobante = () => {
    if (!comprobante) return;
    const lineas = [
      'CALAMUCHITA BANK — COMPROBANTE DE TRANSFERENCIA',
      '================================================',
      `Fecha: ${formatearFecha(comprobante.fecha)}`,
      `N° de operación: ${comprobante.idTransaccion}`,
      '',
      `Monto transferido: ${formatearMoneda(comprobante.monto, comprobante.moneda)}`,
      comprobante.concepto ? `Concepto: ${comprobante.concepto}` : null,
      '',
      'Origen',
      `  Titular: ${datosUsuario?.nombre || ''} ${datosUsuario?.apellido || ''}`.trimEnd(),
      `  CBU: ${comprobante.cbuOrigen}`,
      '',
      'Destino',
      `  Titular: ${comprobante.nombreDestino}`,
      `  CBU: ${comprobante.cbuDestino}`,
      `  Banco: ${comprobante.bancoDestino}`,
      '================================================'
    ].filter(Boolean).join('\n');

    const blob = new Blob([lineas], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobante_${comprobante.idTransaccion}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleTransferir = async (e) => {
    e.preventDefault();
   
    if (!cbuDestino || !monto || Number(monto) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Por favor, completa todos los campos obligatorios.' });
      return;
    }

    if (Number(monto) > Number(cuentaOrigen?.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo actual es de ${formatearMoneda(cuentaOrigen?.saldo)}` });
      return;
    }

    setMensaje({ tipo: '', texto: '' });
    setCargando(true);

    try {
      const response = await fetch(`${API_URL}/api/movimientos/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu_origen: cuentaOrigen.cbu,
          cbu_destino: cbuDestino.trim(),
          monto: Number(monto),
          concepto
        })
      });

      const data = await response.json();

      if (response.status === 201 || response.status === 200) {
        setComprobante({
          ...(data.comprobante || {
            idTransaccion: data.id || 'Generando ID...',
            fecha: new Date().toISOString(),
            monto: Number(monto),
            concepto: concepto !== 'Varios' ? concepto : null,
            cbuOrigen: cuentaOrigen.cbu,
            cbuDestino: cbuDestino.trim(),
            nombreDestino: 'Titular No Especificado',
            bancoDestino: '---'
          }),
          moneda: cuentaOrigen.moneda
        });
        if (alTransferirExitosa) alTransferirExitosa(Number(monto), cuentaOrigen.moneda);
        setCbuDestino('');
        setMonto('');
      } else {
        const errorMostrar = data.error || 'Ocurrió un problema con la transferencia.';
        setMensaje({ tipo: 'error', texto: errorMostrar });
      }
    } catch (error) {
      console.error('❌ Error de red al transferir:', error);
      setMensaje({ tipo: 'error', texto: 'Error de red: No se pudo conectar con el servidor.' });
    } finally {
      setCargando(false);
    }
  };

  if (comprobante) {
    return (
      <div className="success-screen-container">
        <div className="success-card">
          <div className="success-icon-circle"><Check size={28} /></div>
          <h2>¡Transferencia Realizada!</h2>
          <p className="success-subtitle">Los fondos se acreditarán de manera inmediata.</p>

          <div className="success-details-box">
            <div className="success-row destacada">
              <span>Monto enviado:</span>
              <strong>{formatearMoneda(comprobante.monto, comprobante.moneda)}</strong>
            </div>
            <div className="success-row">
              <span>Fecha:</span>
              <span>{formatearFecha(comprobante.fecha)}</span>
            </div>
            {comprobante.concepto && (
              <div className="success-row">
                <span>Concepto:</span>
                <span>{comprobante.concepto}</span>
              </div>
            )}
            <div className="success-row">
              <span>Destinatario:</span>
              <span>{comprobante.nombreDestino}</span>
            </div>
            <div className="success-row">
              <span>CBU destino:</span>
              <span className="mono-text-id">{comprobante.cbuDestino}</span>
            </div>
            <div className="success-row">
              <span>Banco destino:</span>
              <span>{comprobante.bancoDestino}</span>
            </div>
            <div className="success-row">
              <span>Comprobante N°:</span>
              <span className="mono-text-id">{comprobante.idTransaccion}</span>
            </div>
          </div>

          <div className="success-actions">
            <button className="btn-success-comprobante" onClick={handleDescargarComprobante}>
              <FileText size={16} /> Descargar comprobante
            </button>
            <button className="btn-success-return" onClick={alCancelar}>
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transfer-container">
      {/* 🎯 SE REMOVIÓ EL TITULO REDUNDANTE SUPERIOR PARA SIMPLIFICAR LA INTERFAZ */}
      <div className="transfer-grid">
        
        {/* COLUMNA IZQUIERDA: FORMULARIO */}
        <form className="transfer-form-card" onSubmit={handleTransferir}>
          <span className="transfer-eyebrow">De cuenta a cuenta, con la calma del valle</span>
          <h3 className="form-card-title">Formulario de Envío</h3>
          
          {cuentas?.length > 0 && (
            <div className="form-section">
              <label className="section-label">Cuenta de origen</label>
              <SelectorCuenta
                cuentas={cuentas}
                monedaActiva={monedaActiva}
                onCambiarMoneda={onCambiarMoneda}
                mostrarAbrirUSD={mostrarAbrirUSD}
                onAbrirUSD={onAbrirUSD}
                abriendoUSD={abriendoUSD}
              />
            </div>
          )}

          <div className="form-section">
            <label className="section-label">Destino de la transferencia</label>
            <div className="destination-type-toggle">
              {/* No es un botón: hoy solo existe esta única forma de transferir (por CBU/alias), así
                  que se muestra como una etiqueta de contexto, no como algo clickeable que no hace nada. */}
              <span className="toggle-btn active"><UserPlus size={14} /> Nuevo destinatario</span>
              <button type="button" className="toggle-btn cancel" onClick={alCancelar}><X size={14} /> Volver al Inicio</button>
            </div>
          </div>

          <div className="form-section">
            <label className="section-label">CBU / CVU o Alias de destino</label>
            <input
              type="text"
              className="form-input-text"
              placeholder="Ingresa los 22 números o el alias del beneficiario"
              value={cbuDestino}
              onChange={(e) => setCbuDestino(e.target.value)}
              required
            />
          </div>

          <div className="form-inline-group">
            <div className="form-section flex-1">
              <label className="section-label">Monto a transferir</label>
              <div className="amount-input-wrapper">
                <span className="currency-symbol">{cuentaOrigen?.moneda === 'USD' ? 'US$' : '$'}</span>
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

        {/* COLUMNA DERECHA: tus propios datos, por si necesitás compartirlos */}
        <div className="transfer-sidebar-right">
          <div className="security-banner-card">
            <h4>Tu cuenta {cuentaOrigen?.moneda === 'USD' ? '(USD)' : ''}</h4>
            <span className="transfer-info-label">Saldo disponible</span>
            <p className="transfer-info-saldo">{formatearMoneda(cuentaOrigen?.saldo)}</p>
            <span className="transfer-info-label">CBU</span>
            <p className="transfer-info-dato mono-text">{cuentaOrigen?.cbu}</p>
            {cuentaOrigen?.alias && (
              <>
                <span className="transfer-info-label">Alias</span>
                <p className="transfer-info-dato">{cuentaOrigen.alias}</p>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}