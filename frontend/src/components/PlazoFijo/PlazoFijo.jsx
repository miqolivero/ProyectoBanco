import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './PlazoFijo.css';

export default function PlazoFijo({ datosUsuario, alConstituirExitoso, alLiquidarExitoso, alCancelar }) {
  const [tasa, setTasa] = useState(null);
  const [cargandoTasa, setCargandoTasa] = useState(true);

  const [plazosFijos, setPlazosFijos] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  const [capital, setCapital] = useState('');
  const [plazoDias, setPlazoDias] = useState('30');
  const [constituyendo, setConstituyendo] = useState(false);

  const [liquidandoId, setLiquidandoId] = useState(null);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const cargarTasa = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/plazos-fijos/tasa');
      const data = await response.json();
      if (response.ok) setTasa(data);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo obtener la tasa vigente.' });
    } finally {
      setCargandoTasa(false);
    }
  };

  const cargarLista = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/plazos-fijos?cbu=${datosUsuario.cbu}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) setPlazosFijos(data);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar el listado de plazos fijos.' });
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarTasa();
    cargarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.cbu]);

  const interesSimulado = (() => {
    if (!tasa || !capital || Number(capital) <= 0) return null;
    const interes = Number(capital) * (tasa.tnaOfrecida / 100) * (Number(plazoDias) / 365);
    return { interes, total: Number(capital) + interes };
  })();

  const handleConstituir = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    const capitalNum = Number(capital);
    if (!capitalNum || capitalNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un capital mayor a cero.' });
      return;
    }
    if (capitalNum > Number(datosUsuario.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo actual es de ${formatearMoneda(datosUsuario.saldo)}` });
      return;
    }

    try {
      setConstituyendo(true);
      const response = await fetch('http://localhost:3001/api/plazos-fijos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu: datosUsuario.cbu, capital: capitalNum, plazo_dias: Number(plazoDias) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo constituir el plazo fijo.');

      setMensaje({ tipo: 'exito', texto: `¡Plazo fijo constituido! Vence el ${new Date(data.fecha_vencimiento).toLocaleDateString('es-AR')}.` });
      setCapital('');
      await cargarLista();
      if (alConstituirExitoso) alConstituirExitoso(capitalNum);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setConstituyendo(false);
    }
  };

  const handleLiquidar = async (idPlazoFijo) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setLiquidandoId(idPlazoFijo);
      const response = await fetch('http://localhost:3001/api/plazos-fijos/liquidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_plazo_fijo: idPlazoFijo, cbu: datosUsuario.cbu })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo liquidar el plazo fijo.');

      setMensaje({ tipo: 'exito', texto: `¡Liquidado! Capital ${formatearMoneda(data.capital)} + interés ${formatearMoneda(data.interes)} = ${formatearMoneda(data.total)}` });
      await cargarLista();
      if (alLiquidarExitoso) alLiquidarExitoso(data.total);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setLiquidandoId(null);
    }
  };

  return (
    <div className="pf-container">
      <div className="pf-header-box">
        <h2>Plazo Fijo</h2>
        <p>Constituí un plazo fijo tradicional y ganá intereses sobre tu dinero.</p>
      </div>

      <div className="pf-tasa-banner">
        {cargandoTasa ? (
          <span>Consultando tasa vigente...</span>
        ) : tasa ? (
          <>
            <div>
              <span className="pf-tasa-label">TNA que ofrece el banco</span>
              <strong className="pf-tasa-valor">{tasa.tnaOfrecida}%</strong>
            </div>
            <span className="pf-tasa-detalle">
              Tasa de referencia de mercado: {tasa.tasaReferencia}% (promedio de ~30 bancos, ArgentinaDatos) − {tasa.spreadBps} bps
            </span>
          </>
        ) : (
          <span>No se pudo obtener la tasa vigente en este momento.</span>
        )}
      </div>

      <div className="pf-layout">
      <div className="pf-main">
      <div className="pf-card">
        <h3 className="pf-subtitulo">Constituir nuevo plazo fijo</h3>
        <form onSubmit={handleConstituir} className="pf-form">
          <div className="pf-row">
            <div className="pf-field">
              <label>Capital a depositar</label>
              <input
                type="number"
                placeholder="$ 0"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                disabled={constituyendo}
                className="pf-input-text"
              />
            </div>
            <div className="pf-field">
              <label>Plazo</label>
              <select
                value={plazoDias}
                onChange={(e) => setPlazoDias(e.target.value)}
                disabled={constituyendo}
                className="pf-input-select"
              >
                {(tasa?.plazosPermitidos || [30, 60, 90, 180, 365]).map(d => (
                  <option key={d} value={d}>{d} días</option>
                ))}
              </select>
            </div>
          </div>

          {interesSimulado && (
            <div className="pf-simulador">
              Al vencimiento vas a cobrar <strong>{formatearMoneda(interesSimulado.total)}</strong> (capital + {formatearMoneda(interesSimulado.interes)} de interés).
            </div>
          )}

          <button type="submit" disabled={constituyendo || !tasa} className="btn-pf-constituir">
            {constituyendo ? 'Constituyendo...' : 'Constituir Plazo Fijo'}
          </button>
        </form>

        {mensaje.texto && (
          <div className={`pf-alert ${mensaje.tipo}`}>
            {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
          </div>
        )}
      </div>

      <div className="pf-lista">
        <h3 className="pf-subtitulo">Mis plazos fijos</h3>
        {cargandoLista ? (
          <p className="pf-empty-msg">Cargando...</p>
        ) : plazosFijos.length === 0 ? (
          <p className="pf-empty-msg">Todavía no constituiste ningún plazo fijo.</p>
        ) : (
          plazosFijos.map(pf => (
            <div key={pf.id_plazo_fijo} className={`pf-item-card ${pf.estado !== 'ACTIVO' ? 'pf-item-liquidado' : ''}`}>
              <div className="pf-item-info">
                <strong>{formatearMoneda(pf.capital)}</strong>
                <span className="pf-item-detalle">
                  TNA {pf.tna}% · Vence {new Date(pf.fecha_vencimiento).toLocaleDateString('es-AR')}
                  {pf.estado === 'ACTIVO' && pf.diasRestantes > 0 && ` · Faltan ${pf.diasRestantes} día(s)`}
                </span>
                <span className="pf-item-interes">Interés estimado: {formatearMoneda(pf.interesEstimado)}</span>
              </div>
              {pf.estado === 'ACTIVO' ? (
                <button
                  onClick={() => handleLiquidar(pf.id_plazo_fijo)}
                  disabled={!pf.puedeLiquidar || liquidandoId === pf.id_plazo_fijo}
                  className="btn-pf-liquidar"
                  title={!pf.puedeLiquidar ? 'Todavía no llegó la fecha de vencimiento' : ''}
                >
                  {liquidandoId === pf.id_plazo_fijo ? '...' : pf.puedeLiquidar ? 'Liquidar' : 'Aún no disponible'}
                </button>
              ) : (
                <span className="pf-badge-liquidado">Liquidado</span>
              )}
            </div>
          ))
        )}
      </div>

      <button onClick={alCancelar} className="btn-pf-volver">Volver al Inicio</button>
      </div>

      <div className="pf-info-panel">
        <h4>Resumen</h4>
        <span className="pf-info-label">Saldo disponible en tu cuenta</span>
        <p className="pf-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>
        <span className="pf-info-label">Invertido en plazos activos</span>
        <p className="pf-info-dato">{formatearMoneda(plazosFijos.filter(pf => pf.estado === 'ACTIVO').reduce((acc, pf) => acc + Number(pf.capital), 0))}</p>
        <span className="pf-info-label">Interés estimado a cobrar</span>
        <p className="pf-info-dato">{formatearMoneda(plazosFijos.filter(pf => pf.estado === 'ACTIVO').reduce((acc, pf) => acc + Number(pf.interesEstimado), 0))}</p>
      </div>
      </div>
    </div>
  );
}
