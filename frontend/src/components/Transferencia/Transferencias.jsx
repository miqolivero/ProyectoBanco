import { useState } from 'react';
import { AlertTriangle, Check, FileText } from 'lucide-react';
import SelectorCuenta from '../SelectorCuenta/SelectorCuenta';
import AdvertenciaCbuNuevo from '../AdvertenciaCbuNuevo/AdvertenciaCbuNuevo';
import './Transferencias.css';
import { API_URL } from '../../config/api';

export default function Transferencias({ datosUsuario, cuentas, monedaActiva, onCambiarMoneda, mostrarAbrirUSD, onAbrirUSD, abriendoUSD, alTransferirExitosa, alCancelar }) {
  const [cbuDestino, setCbuDestino] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('Varios');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [comprobante, setComprobante] = useState(null);
  // Advertencia de CBU nuevo: el backend respondió 409 y espera que el usuario confirme.
  const [advertencia, setAdvertencia] = useState(null);

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
    await enviarTransferencia(false);
  };

  // confirmarCbuNuevo = true solo cuando el usuario ya vio la advertencia y eligió continuar.
  const enviarTransferencia = async (confirmarCbuNuevo) => {
    setCargando(true);

    try {
      const response = await fetch(`${API_URL}/api/movimientos/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbu_origen: cuentaOrigen.cbu,
          cbu_destino: cbuDestino.trim(),
          monto: Number(monto),
          concepto,
          confirmar_cbu_nuevo: confirmarCbuNuevo
        })
      });

      const data = await response.json();

      if (response.status === 409 && data.requiereConfirmacion) {
        setAdvertencia({ mensaje: data.error, nombreDestino: data.nombreDestino });
        return;
      }
      setAdvertencia(null);

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
      setAdvertencia(null);
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
      <div className="transfer-header-box">
        <span className="transfer-eyebrow">De cuenta a cuenta, con la calma del valle</span>
        <h2>Transferencias</h2>
        <p>Enviá dinero a cualquier CBU, CVU o alias de la red bancaria, al instante.</p>
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

      <div className="transfer-layout">
        <div className="transfer-card">
          <form className="transfer-form" onSubmit={handleTransferir}>
            <div className="transfer-field">
              <label>CBU, CVU o alias de destino</label>
              <input
                type="text"
                className="transfer-input"
                placeholder="22 números o el alias"
                value={cbuDestino}
                onChange={(e) => setCbuDestino(e.target.value)}
                disabled={cargando}
                required
              />
            </div>

            <div className="transfer-field">
              <label>Monto a transferir ({cuentaOrigen?.moneda || 'ARS'})</label>
              <div className="transfer-monto-wrapper">
                <span className="transfer-currency-prefix">{cuentaOrigen?.moneda === 'USD' ? 'US$' : '$'}</span>
                <input
                  type="number"
                  step="any"
                  className="transfer-input-monto"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  disabled={cargando}
                  required
                />
              </div>
            </div>

            <div className="transfer-field">
              <label>Concepto (opcional)</label>
              <select className="transfer-input" value={concepto} onChange={(e) => setConcepto(e.target.value)} disabled={cargando}>
                <option value="Varios">Varios</option>
                <option value="Alquiler">Alquiler</option>
                <option value="Facturas">Facturas</option>
                <option value="Préstamos">Préstamos</option>
              </select>
            </div>

            {mensaje.texto && (
              <div className={`transfer-alert ${mensaje.tipo}`}>
                <AlertTriangle size={16} /> {mensaje.texto}
              </div>
            )}

            <div className="transfer-actions">
              <button type="button" onClick={alCancelar} disabled={cargando} className="btn-transfer-cancelar">
                Volver al Inicio
              </button>
              <button type="submit" disabled={cargando || !monto || !cbuDestino} className="btn-transfer-confirmar">
                {cargando ? 'Procesando...' : 'Confirmar Transferencia'}
              </button>
            </div>
          </form>
        </div>

        {/* Tus propios datos, por si necesitás compartirlos */}
        <div className="transfer-info-panel">
          <h4>Tu cuenta</h4>
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

      {advertencia && (
        <AdvertenciaCbuNuevo
          mensaje={advertencia.mensaje}
          nombreDestino={advertencia.nombreDestino}
          procesando={cargando}
          alConfirmar={() => enviarTransferencia(true)}
          alCancelar={() => setAdvertencia(null)}
        />
      )}
    </div>
  );
}
