import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import './Tarjeta.css';

export default function Tarjeta({ datosUsuario, alPagoExitoso, alCancelar }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [numerosVisibles, setNumerosVisibles] = useState({});

  const [marcaElegida, setMarcaElegida] = useState('Visa');
  const [solicitando, setSolicitando] = useState(false);

  const [idTarjetaConsumo, setIdTarjetaConsumo] = useState('');
  const [comercio, setComercio] = useState('');
  const [montoConsumo, setMontoConsumo] = useState('');
  const [cuotasConsumo, setCuotasConsumo] = useState('1');
  const [registrandoConsumo, setRegistrandoConsumo] = useState(false);

  const [pagandoId, setPagandoId] = useState(null);

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const enmascarar = (numero) => `•••• •••• •••• ${numero.slice(-4)}`;
  const formatearNumero = (numero) => numero.replace(/(.{4})/g, '$1 ').trim();
  const formatearVencimientoCorto = (fecha) => {
    const d = new Date(fecha);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = String(d.getFullYear()).slice(-2);
    return `${mes}/${anio}`;
  };
  const nombreTitular = `${datosUsuario?.nombre || ''} ${datosUsuario?.apellido || ''}`.trim().toUpperCase();

  // Máximo 2 tarjetas por persona, una de cada marca (ver tarjetaModel.js).
  const marcasDisponibles = ['Visa', 'Mastercard'].filter(m => !tarjetas.some(t => t.marca === m));
  if (marcasDisponibles.length > 0 && !marcasDisponibles.includes(marcaElegida)) {
    setMarcaElegida(marcasDisponibles[0]);
  }

  const cargarTarjetas = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/tarjetas/persona/${datosUsuario.id}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setTarjetas(data);
        if (data.length > 0 && !idTarjetaConsumo) setIdTarjetaConsumo(String(data[0].id_tarjeta));
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar la información de las tarjetas.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarTarjetas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.id]);

  const handleSolicitar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });
    try {
      setSolicitando(true);
      const response = await fetch('http://localhost:3001/api/tarjetas/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPersona: datosUsuario.id, marca: marcaElegida })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo emitir la tarjeta.');

      setMensaje({ tipo: 'exito', texto: `¡Tarjeta ${marcaElegida} emitida con éxito!` });
      await cargarTarjetas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setSolicitando(false);
    }
  };

  const handleRegistrarConsumo = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    const monto = Number(montoConsumo);
    if (!idTarjetaConsumo || !comercio.trim() || !monto || monto <= 0) {
      setMensaje({ tipo: 'error', texto: 'Elegí la tarjeta, completá el comercio y un monto mayor a cero.' });
      return;
    }

    try {
      setRegistrandoConsumo(true);
      const response = await fetch('http://localhost:3001/api/tarjetas/consumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_tarjeta: Number(idTarjetaConsumo),
          comercio: comercio.trim(),
          monto_total: monto,
          cantidad_cuotas: Number(cuotasConsumo)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el consumo.');

      setMensaje({ tipo: 'exito', texto: `¡Consumo en ${comercio.trim()} registrado en ${cuotasConsumo} cuota(s)!` });
      setComercio('');
      setMontoConsumo('');
      setCuotasConsumo('1');
      await cargarTarjetas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setRegistrandoConsumo(false);
    }
  };

  const handlePagarCuota = async (idCuota, monto) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setPagandoId(idCuota);
      const response = await fetch('http://localhost:3001/api/tarjetas/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_cuota: idCuota, cbu: datosUsuario.cbu })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo pagar la cuota.');

      setMensaje({ tipo: 'exito', texto: `¡Cuota de ${formatearMoneda(monto)} pagada!` });
      await cargarTarjetas();
      if (alPagoExitoso) alPagoExitoso(Number(monto));
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setPagandoId(null);
    }
  };

  return (
    <div className="tarjeta-container">
      <div className="tarjeta-header-box">
        <h2>Tarjetas de Crédito</h2>
        <p>Gestioná tus tarjetas, registrá consumos en cuotas y pagá tus vencimientos.</p>
      </div>

      {mensaje.texto && (
        <div className={`tarjeta-alert tarjeta-alert-top ${mensaje.tipo}`}>
          {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
        </div>
      )}

      {cargando ? (
        <p className="tarjeta-empty-msg">Cargando...</p>
      ) : (
        <div className="tarjeta-grid-tarjetas">
          {tarjetas.map(t => (
            <div key={t.id_tarjeta} className="tarjeta-bloque">
              <div className={`tarjeta-visual ${t.marca === 'Mastercard' ? 'mastercard' : 'visa'}`}>
                <div className="tarjeta-visual-top">
                  <span className="tarjeta-visual-chip" />
                  <button
                    className="btn-tarj-toggle-numero"
                    onClick={() => setNumerosVisibles(prev => ({ ...prev, [t.id_tarjeta]: !prev[t.id_tarjeta] }))}
                    title={numerosVisibles[t.id_tarjeta] ? 'Ocultar número' : 'Ver número completo'}
                  >
                    {numerosVisibles[t.id_tarjeta] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <span className="tarjeta-visual-numero">
                  {numerosVisibles[t.id_tarjeta] ? formatearNumero(t.numero_tarjeta) : enmascarar(t.numero_tarjeta)}
                </span>

                <div className="tarjeta-visual-footer">
                  <div className="tarjeta-visual-titular">
                    <span className="tarjeta-visual-footer-label">Titular</span>
                    <span className="tarjeta-visual-footer-valor">{nombreTitular || '—'}</span>
                  </div>
                  <div className="tarjeta-visual-vencimiento">
                    <span className="tarjeta-visual-footer-label">Vence</span>
                    <span className="tarjeta-visual-footer-valor">{formatearVencimientoCorto(t.fecha_vencimiento)}</span>
                  </div>
                  {t.marca === 'Mastercard' ? (
                    <div className="tarjeta-visual-logo-mc" title="Mastercard">
                      <span className="mc-circle mc-circle-a" />
                      <span className="mc-circle mc-circle-b" />
                    </div>
                  ) : (
                    <span className="tarjeta-visual-logo-visa">VISA</span>
                  )}
                </div>
              </div>

              <div className="tarjeta-resumen-grid">
                <div className="tarjeta-resumen-card">
                  <span>LÍMITE</span>
                  <h3>{formatearMoneda(t.limite_compra)}</h3>
                </div>
                <div className="tarjeta-resumen-card tarjeta-consumido">
                  <span>CONSUMIDO</span>
                  <h3>{formatearMoneda(t.consumido)}</h3>
                </div>
                <div className="tarjeta-resumen-card tarjeta-disponible">
                  <span>DISPONIBLE</span>
                  <h3>{formatearMoneda(t.disponible)}</h3>
                </div>
              </div>

              <div className="tarjeta-cuotas-lista">
                {t.cuotasPendientes.length === 0 ? (
                  <p className="tarjeta-empty-msg-chica">Sin cuotas pendientes.</p>
                ) : (
                  t.cuotasPendientes.map(c => (
                    <div key={c.id_cuota} className="tarjeta-cuota-item">
                      <div>
                        <strong>{c.comercio}</strong>
                        <span className="tarjeta-cuota-detalle">Cuota {c.numero_cuota}/{c.cantidad_cuotas} · Vence {new Date(c.fecha_vencimiento).toLocaleDateString('es-AR')}</span>
                      </div>
                      <div className="tarjeta-cuota-accion">
                        <span className="tarjeta-cuota-monto">{formatearMoneda(c.monto)}</span>
                        <button
                          onClick={() => handlePagarCuota(c.id_cuota, c.monto)}
                          disabled={pagandoId === c.id_cuota}
                          className="btn-tarj-pagar"
                        >
                          {pagandoId === c.id_cuota ? '...' : 'Pagar'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          <div className="tarjeta-bloque tarjeta-bloque-panel">
            <h3 className="tarjeta-subtitulo">Solicitar nueva tarjeta</h3>
            {marcasDisponibles.length === 0 ? (
              <p className="tarjeta-empty-msg-chica">Ya tenés el máximo de 2 tarjetas (una Visa y una Mastercard).</p>
            ) : (
              <form onSubmit={handleSolicitar} className="tarjeta-form">
                <div className="tarjeta-field">
                  <label>Marca</label>
                  <select
                    value={marcaElegida}
                    onChange={(e) => setMarcaElegida(e.target.value)}
                    disabled={solicitando}
                    className="tarjeta-input-select"
                  >
                    {marcasDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={solicitando} className="btn-tarj-solicitar">
                  {solicitando ? 'Emitiendo...' : 'Solicitar Tarjeta'}
                </button>
              </form>
            )}

            {tarjetas.length > 0 && (
              <>
                <h3 className="tarjeta-subtitulo tarjeta-subtitulo-espaciado">Registrar consumo</h3>
                <form onSubmit={handleRegistrarConsumo} className="tarjeta-form">
                  <div className="tarjeta-field">
                    <label>Tarjeta</label>
                    <select
                      value={idTarjetaConsumo}
                      onChange={(e) => setIdTarjetaConsumo(e.target.value)}
                      disabled={registrandoConsumo}
                      className="tarjeta-input-select"
                    >
                      {tarjetas.map(t => (
                        <option key={t.id_tarjeta} value={t.id_tarjeta}>{t.marca} •••• {t.numero_tarjeta.slice(-4)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="tarjeta-field">
                    <label>Comercio</label>
                    <input
                      type="text"
                      placeholder="Ej. Supermercado"
                      value={comercio}
                      onChange={(e) => setComercio(e.target.value)}
                      disabled={registrandoConsumo}
                      className="tarjeta-input-text"
                    />
                  </div>
                  <div className="tarjeta-row">
                    <div className="tarjeta-field">
                      <label>Monto</label>
                      <input
                        type="number"
                        placeholder="$ 0"
                        value={montoConsumo}
                        onChange={(e) => setMontoConsumo(e.target.value)}
                        disabled={registrandoConsumo}
                        className="tarjeta-input-text"
                      />
                    </div>
                    <div className="tarjeta-field">
                      <label>Cuotas</label>
                      <select
                        value={cuotasConsumo}
                        onChange={(e) => setCuotasConsumo(e.target.value)}
                        disabled={registrandoConsumo}
                        className="tarjeta-input-select"
                      >
                        {[1, 3, 6, 12].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <button type="submit" disabled={registrandoConsumo} className="btn-tarj-solicitar">
                    {registrandoConsumo ? 'Registrando...' : 'Registrar Consumo'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <button onClick={alCancelar} className="btn-tarj-volver">Volver al Inicio</button>
    </div>
  );
}
