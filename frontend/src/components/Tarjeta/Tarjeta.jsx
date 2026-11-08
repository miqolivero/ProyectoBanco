import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, ShoppingBag, CalendarClock, Wallet } from 'lucide-react';
import './Tarjeta.css';
import { API_URL } from '../../config/api';

// 🎯 Paisaje serrano de la tarjeta: cerros en capas, pinos y un sol, todo en silueta. Los
// colores no están acá sino en Tarjeta.css (clases .paisaje-*), así cada marca tiene su paleta:
// verdes de las sierras para Visa y un atardecer para Mastercard.
function PaisajeSerrano() {
  // Pinos: [x de la base, y de la base, alto]
  const pinos = [
    [18, 132, 30], [34, 136, 22], [52, 134, 34], [70, 138, 20],
    [262, 134, 26], [282, 130, 36], [300, 136, 24], [318, 133, 30],
    [338, 137, 20], [356, 132, 32], [376, 136, 24], [392, 134, 28]
  ];
  return (
    <svg className="tarjeta-paisaje" viewBox="0 0 400 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle className="paisaje-sol" cx="300" cy="58" r="20" />
      <path className="paisaje-cerro-lejano" d="M0 92 L38 64 L70 82 L112 46 L150 74 L186 56 L222 80 L262 50 L300 76 L338 60 L372 78 L400 66 L400 150 L0 150 Z" />
      <path className="paisaje-cerro-medio" d="M0 108 L46 84 L84 102 L128 74 L170 98 L214 82 L250 100 L292 86 L336 104 L374 90 L400 98 L400 150 L0 150 Z" />
      <path className="paisaje-loma" d="M0 126 C 60 110, 110 112, 170 124 S 290 112, 400 120 L400 150 L0 150 Z" />
      {pinos.map(([x, y, h]) => (
        <path
          key={`${x}-${y}`}
          className="paisaje-pino"
          d={`M${x} ${y - h} L${x - h * 0.28} ${y - h * 0.45} L${x - h * 0.14} ${y - h * 0.45} L${x - h * 0.36} ${y - 2} L${x + h * 0.36} ${y - 2} L${x + h * 0.14} ${y - h * 0.45} L${x + h * 0.28} ${y - h * 0.45} Z M${x - 1.5} ${y - 2} h3 v6 h-3 Z`}
        />
      ))}
      <path className="paisaje-frente" d="M0 140 C 80 132, 160 136, 240 140 S 360 134, 400 138 L400 150 L0 150 Z" />
    </svg>
  );
}

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
  const formatearFecha = (fecha) => new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  const nombreTitular = `${datosUsuario?.nombre || ''} ${datosUsuario?.apellido || ''}`.trim().toUpperCase();

  // 🎯 idTarjetaConsumo ahora hace doble función: además de decirle al form de "Simular gasto"
  // sobre qué tarjeta operar, es la que decide cuál tarjeta se está mostrando — una a la vez,
  // con pestañas para cambiar, en vez de mostrar todas apiladas en un grid.
  const tarjetaActiva = tarjetas.find(t => String(t.id_tarjeta) === String(idTarjetaConsumo)) || tarjetas[0] || null;

  // Resumen de la tarjeta activa: cuánto del límite está usado y cuál es el próximo vencimiento
  // (la fecha más cercana entre las cuotas pendientes y cuánto vence ese día).
  const limite = Number(tarjetaActiva?.limite_compra || 0);
  const consumido = Number(tarjetaActiva?.consumido || 0);
  const porcentajeUso = limite > 0 ? Math.min(100, Math.round((consumido / limite) * 100)) : 0;
  const cuotasPendientes = tarjetaActiva?.cuotasPendientes || [];
  const totalPendiente = cuotasPendientes.reduce((acc, c) => acc + Number(c.monto), 0);
  const proximaFecha = cuotasPendientes.reduce((min, c) => (!min || new Date(c.fecha_vencimiento) < new Date(min) ? c.fecha_vencimiento : min), null);
  const montoProximo = proximaFecha
    ? cuotasPendientes
        .filter(c => new Date(c.fecha_vencimiento).toDateString() === new Date(proximaFecha).toDateString())
        .reduce((acc, c) => acc + Number(c.monto), 0)
    : 0;

  // Máximo 2 tarjetas por persona, una de cada marca (ver tarjetaModel.js).
  const marcasDisponibles = ['Visa', 'Mastercard'].filter(m => !tarjetas.some(t => t.marca === m));
  if (marcasDisponibles.length > 0 && !marcasDisponibles.includes(marcaElegida)) {
    setMarcaElegida(marcasDisponibles[0]);
  }

  const cargarTarjetas = async () => {
    try {
      const response = await fetch(`${API_URL}/api/tarjetas/persona/${datosUsuario.id}`);
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
    let cancelado = false;
    (async () => {
      if (!cancelado) await cargarTarjetas();
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.id]);

  const handleSolicitar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });
    try {
      setSolicitando(true);
      const response = await fetch(`${API_URL}/api/tarjetas/solicitar`, {
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
      const response = await fetch(`${API_URL}/api/tarjetas/consumos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_tarjeta: Number(idTarjetaConsumo),
          idPersona: datosUsuario.id,
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
      const response = await fetch(`${API_URL}/api/tarjetas/pagar`, {
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

  const formSolicitar = (compacto) => (
    <form onSubmit={handleSolicitar} className={compacto ? '' : 'tarjeta-form'}>
      {!compacto && <label className="tarjeta-label">Marca</label>}
      <select
        value={marcaElegida}
        onChange={(e) => setMarcaElegida(e.target.value)}
        disabled={solicitando}
        className="tarjeta-input-select"
      >
        {marcasDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="submit" disabled={solicitando} className={compacto ? 'btn-tarj-solicitar-compacto' : 'btn-tarj-solicitar'}>
        {solicitando ? 'Emitiendo...' : compacto ? 'Solicitar' : 'Solicitar Tarjeta'}
      </button>
    </form>
  );

  return (
    <div className="tarjeta-container">
      <div className="tarjeta-header-box">
        <span className="tarjeta-eyebrow">Firme como la piedra serrana</span>
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
      ) : tarjetas.length === 0 ? (
        <div className="tarjeta-bloque tarjeta-solicitar-vacio">
          <h3 className="tarjeta-subtitulo">Todavía no tenés ninguna tarjeta</h3>
          <p className="tarjeta-texto-suave">Pedí tu primera tarjeta: se emite al instante.</p>
          {formSolicitar(false)}
        </div>
      ) : (
        <>
          {tarjetas.length > 1 && (
            <div className="tarjeta-tabs">
              {tarjetas.map(t => (
                <button
                  key={t.id_tarjeta}
                  className={`tarjeta-tab ${tarjetaActiva?.id_tarjeta === t.id_tarjeta ? 'activa' : ''}`}
                  onClick={() => setIdTarjetaConsumo(String(t.id_tarjeta))}
                >
                  <span className={`tarjeta-tab-dot ${t.marca === 'Mastercard' ? 'mastercard' : 'visa'}`} />
                  {t.marca} •••• {t.numero_tarjeta.slice(-4)}
                </button>
              ))}
            </div>
          )}

          {tarjetaActiva && (
            <>
              {/* Fila 1: la tarjeta y su resumen, lado a lado */}
              <div className="tarjeta-fila-superior">
                <div className={`tarjeta-visual ${tarjetaActiva.marca === 'Mastercard' ? 'mastercard' : 'visa'}`}>
                  <PaisajeSerrano />
                  <div className="tarjeta-visual-top">
                    <div className="tarjeta-visual-banco">
                      <span className="tarjeta-visual-banco-nombre">Calamuchita</span>
                      <span className="tarjeta-visual-banco-sub">BANK</span>
                    </div>
                    <button
                      className="btn-tarj-toggle-numero"
                      onClick={() => setNumerosVisibles(prev => ({ ...prev, [tarjetaActiva.id_tarjeta]: !prev[tarjetaActiva.id_tarjeta] }))}
                      title={numerosVisibles[tarjetaActiva.id_tarjeta] ? 'Ocultar número' : 'Ver número completo'}
                    >
                      {numerosVisibles[tarjetaActiva.id_tarjeta] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  <span className="tarjeta-visual-chip" />

                  <span className="tarjeta-visual-numero">
                    {numerosVisibles[tarjetaActiva.id_tarjeta] ? formatearNumero(tarjetaActiva.numero_tarjeta) : enmascarar(tarjetaActiva.numero_tarjeta)}
                  </span>

                  <div className="tarjeta-visual-footer">
                    <div className="tarjeta-visual-dato">
                      <span className="tarjeta-visual-footer-label">Titular</span>
                      <span className="tarjeta-visual-footer-valor">{nombreTitular || '—'}</span>
                    </div>
                    <div className="tarjeta-visual-dato">
                      <span className="tarjeta-visual-footer-label">Vence</span>
                      <span className="tarjeta-visual-footer-valor">{formatearVencimientoCorto(tarjetaActiva.fecha_vencimiento)}</span>
                    </div>
                    {tarjetaActiva.marca === 'Mastercard' ? (
                      <div className="tarjeta-visual-logo-mc" title="Mastercard">
                        <span className="mc-circle mc-circle-a" />
                        <span className="mc-circle mc-circle-b" />
                      </div>
                    ) : (
                      <span className="tarjeta-visual-logo-visa">VISA</span>
                    )}
                  </div>
                </div>

                <div className="tarjeta-bloque tarjeta-resumen">
                  <span className="tarjeta-resumen-etiqueta"><Wallet size={14} /> Disponible para comprar</span>
                  <strong className="tarjeta-resumen-disponible">{formatearMoneda(tarjetaActiva.disponible)}</strong>

                  <div className="tarjeta-uso">
                    <progress
                      className={`tarjeta-uso-barra ${porcentajeUso >= 80 ? 'alto' : porcentajeUso >= 50 ? 'medio' : ''}`}
                      value={porcentajeUso}
                      max="100"
                      aria-label={`Usaste el ${porcentajeUso}% del límite`}
                    />
                    <div className="tarjeta-uso-leyenda">
                      <span>Usaste {formatearMoneda(consumido)}</span>
                      <span>{porcentajeUso}% de {formatearMoneda(limite)}</span>
                    </div>
                  </div>

                  <div className="tarjeta-resumen-datos">
                    <div className="tarjeta-resumen-dato">
                      <span>Próximo vencimiento</span>
                      <strong>{proximaFecha ? formatearFecha(proximaFecha) : 'Sin cuotas'}</strong>
                      {proximaFecha && <em>{formatearMoneda(montoProximo)}</em>}
                    </div>
                    <div className="tarjeta-resumen-dato">
                      <span>Cierre</span>
                      <strong>{tarjetaActiva.dia_cierre ? `Día ${tarjetaActiva.dia_cierre}` : '—'}</strong>
                      <em>de cada mes</em>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fila 2: cuotas a pagar y simular un gasto */}
              <div className="tarjeta-fila-inferior">
                <div className="tarjeta-bloque">
                  <div className="tarjeta-bloque-encabezado">
                    <h3 className="tarjeta-subtitulo"><CalendarClock size={17} /> Cuotas a pagar</h3>
                    {cuotasPendientes.length > 0 && (
                      <span className="tarjeta-total-pendiente">Total {formatearMoneda(totalPendiente)}</span>
                    )}
                  </div>
                  {cuotasPendientes.length === 0 ? (
                    <p className="tarjeta-empty-msg-chica">No tenés cuotas pendientes. 🎉</p>
                  ) : (
                    <ul className="tarjeta-cuotas-lista">
                      {cuotasPendientes.map(c => (
                        <li key={c.id_cuota} className="tarjeta-cuota-item">
                          <span className="tarjeta-cuota-icono"><ShoppingBag size={16} /></span>
                          <div className="tarjeta-cuota-info">
                            <strong>{c.comercio}</strong>
                            <span>Cuota {c.numero_cuota} de {c.cantidad_cuotas} · vence {formatearFecha(c.fecha_vencimiento)}</span>
                          </div>
                          <span className="tarjeta-cuota-monto">{formatearMoneda(c.monto)}</span>
                          <button
                            onClick={() => handlePagarCuota(c.id_cuota, c.monto)}
                            disabled={pagandoId === c.id_cuota}
                            className="btn-tarj-pagar"
                          >
                            {pagandoId === c.id_cuota ? '...' : 'Pagar'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="tarjeta-bloque">
                  <h3 className="tarjeta-subtitulo">Simular gasto</h3>
                  <p className="tarjeta-texto-suave">
                    Se registra en tu {tarjetaActiva.marca} •••• {tarjetaActiva.numero_tarjeta.slice(-4)}.
                  </p>
                  <form onSubmit={handleRegistrarConsumo} className="tarjeta-form">
                    <div className="tarjeta-field">
                      <label className="tarjeta-label">Comercio</label>
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
                        <label className="tarjeta-label">Monto</label>
                        <input
                          type="number"
                          placeholder="$ 0"
                          value={montoConsumo}
                          onChange={(e) => setMontoConsumo(e.target.value)}
                          disabled={registrandoConsumo}
                          className="tarjeta-input-text"
                        />
                      </div>
                      <div className="tarjeta-field tarjeta-field-cuotas">
                        <label className="tarjeta-label">Cuotas</label>
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
                      {registrandoConsumo ? 'Registrando...' : 'Registrar consumo'}
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}

          {marcasDisponibles.length > 0 && (
            <div className="tarjeta-solicitar-compacta">
              <span>¿Querés una tarjeta {marcasDisponibles.join(' o ')} también?</span>
              {formSolicitar(true)}
            </div>
          )}
        </>
      )}

      <button onClick={alCancelar} className="btn-tarj-volver">Volver al Inicio</button>
    </div>
  );
}
