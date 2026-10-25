import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Users, Wallet, DollarSign, Activity, AlertTriangle, CheckCircle2, RefreshCw, Download,
  Search, PiggyBank, CreditCard, Building2, ArrowUpRight, ArrowDownLeft, Globe, ShieldCheck
} from 'lucide-react';
import './PanelGerente.css';
import { API_URL } from '../../config/api';

// ─── Formato ────────────────────────────────────────────────────────────────────────────
// Postgres devuelve count/sum como texto (para no perder precisión), por eso todo pasa por Number.
const fmtARS = (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(v) || 0);
const fmtUSD = (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);
const fmtCompacto = (v) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1,
}).format(Number(v) || 0);
const fmtNum = (v) => new Intl.NumberFormat('es-AR').format(Number(v) || 0);
const fmtFecha = (f) => new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const etiquetaMes = (ym) => {
  const [anio, mes] = ym.split('-');
  return `${MESES[Number(mes) - 1]} ${anio.slice(2)}`;
};

const TIPOS = {
  DEBITO: 'Extracción', CREDITO: 'Depósito',
  TRANSFERENCIA_ENVIADA: 'Transferencia enviada', TRANSFERENCIA_RECIBIDA: 'Transferencia recibida',
  RECARGA: 'Recarga', PAGO_SERVICIO: 'Pago de servicio',
  APORTE_RESERVA: 'Aporte a reserva', RETIRO_RESERVA: 'Retiro de reserva',
  PAGO_TARJETA: 'Pago de tarjeta', PLAZO_FIJO_CONSTITUCION: 'Plazo fijo (alta)',
  PLAZO_FIJO_LIQUIDACION: 'Plazo fijo (cobro)', PRESTAMO_OTORGADO: 'Préstamo otorgado',
  PAGO_PRESTAMO: 'Pago de préstamo', PAGO_SEGURO: 'Pago de seguro',
  COMPRA_CEDEAR: 'Compra de CEDEAR', VENTA_CEDEAR: 'Venta de CEDEAR', CAMBIO_DIVISA: 'Cambio de divisa',
};
const etiquetaTipo = (t) => TIPOS[t] || t;

// Porcentaje seguro para las barras (evita dividir por cero cuando no hay datos).
const pct = (valor, maximo) => (maximo > 0 ? (Number(valor) / maximo) * 100 : 0);

// ─── Piezas chicas ──────────────────────────────────────────────────────────────────────
function Kpi({ icono: Icono, titulo, valor, detalle, variante = '' }) {
  return (
    <div className={`gerente-kpi ${variante}`}>
      <div className="gerente-kpi-icono"><Icono size={18} /></div>
      <span className="gerente-kpi-titulo">{titulo}</span>
      <strong className="gerente-kpi-valor">{valor}</strong>
      {detalle && <span className="gerente-kpi-detalle">{detalle}</span>}
    </div>
  );
}

function Tarjeta({ titulo, subtitulo, children, className = '' }) {
  return (
    <section className={`gerente-card ${className}`}>
      <header className="gerente-card-header">
        <h3>{titulo}</h3>
        {subtitulo && <span>{subtitulo}</span>}
      </header>
      {children}
    </section>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────────────────
export default function PanelGerente() {
  const [pestania, setPestania] = useState('resumen');
  const [resumen, setResumen] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const [rResumen, rClientes, rMovs] = await Promise.all([
        fetch(`${API_URL}/api/admin/resumen`),
        fetch(`${API_URL}/api/admin/clientes`),
        fetch(`${API_URL}/api/admin/movimientos?limite=50`),
      ]);
      // El 403 no es un error de red: es el backend diciendo que esta cuenta no es de gerencia.
      if ([rResumen, rClientes, rMovs].some(r => r.status === 403)) {
        throw new Error('Tu cuenta no tiene permisos de gerencia.');
      }
      if (!rResumen.ok || !rClientes.ok || !rMovs.ok) {
        throw new Error('No se pudo cargar la información del banco.');
      }
      setResumen(await rResumen.json());
      setClientes(await rClientes.json());
      setMovimientos(await rMovs.json());
    } catch (e) {
      setError(e.message || 'No se pudo cargar la información del banco.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!cancelado) await cargar();
    })();
    return () => { cancelado = true; };
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c =>
      `${c.nombre} ${c.apellido}`.toLowerCase().includes(q) ||
      String(c.dni).includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  const exportarClientes = () => {
    const filas = clientesFiltrados.map(c => ({
      Apellido: c.apellido, Nombre: c.nombre, DNI: c.dni, Email: c.email, Telefono: c.telefono,
      Cuentas: Number(c.cuentas), 'Saldo ARS': Number(c.saldo_ars), 'Saldo USD': Number(c.saldo_usd),
      Tarjetas: Number(c.tarjetas), 'Prestamos activos': Number(c.prestamos_activos),
      'Acceso a la app': c.tiene_acceso ? 'Si' : 'No', Roles: c.roles,
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Clientes');
    XLSX.writeFile(libro, `Clientes_Calamuchita_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (cargando && !resumen) {
    return <div className="gerente-container"><p className="gerente-cargando">Cargando la información del banco...</p></div>;
  }

  if (error) {
    return (
      <div className="gerente-container">
        <div className="gerente-error">
          <AlertTriangle size={22} />
          <div>
            <strong>{error}</strong>
            <button onClick={cargar} className="gerente-btn-secundario">Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  const i = resumen.indicadores;
  const fondosArs = Number(i.saldo_ars) + Number(i.reservas_ars) + Number(i.plazos_fijos_ars);
  const totalMora = resumen.mora.reduce((acc, m) => acc + Number(m.monto), 0);
  const maxMensual = Math.max(0, ...resumen.actividadMensual.flatMap(m => [Number(m.ingresos), Number(m.egresos)]));
  const operaciones = resumen.operacionesPorTipo.slice(0, 8);
  const maxOperacion = Math.max(0, ...operaciones.map(o => Number(o.cantidad)));

  return (
    <div className="gerente-container">
      <div className="gerente-header-box">
        <div>
          <span className="gerente-eyebrow"><ShieldCheck size={13} /> Acceso exclusivo de gerencia</span>
          <h2>Panel de Gerencia</h2>
          <p>Información general del banco, actualizada al {new Date(resumen.generadoEn).toLocaleString('es-AR')}.</p>
        </div>
        <button onClick={cargar} className="gerente-btn-secundario" disabled={cargando}>
          <RefreshCw size={15} className={cargando ? 'gerente-girando' : ''} /> Actualizar
        </button>
      </div>

      <nav className="gerente-tabs">
        {[['resumen', 'Resumen'], ['clientes', `Clientes (${clientes.length})`], ['movimientos', 'Movimientos']].map(([id, texto]) => (
          <button key={id} className={`gerente-tab ${pestania === id ? 'activa' : ''}`} onClick={() => setPestania(id)}>
            {texto}
          </button>
        ))}
      </nav>

      {/* ═════════════════════════ RESUMEN ═════════════════════════ */}
      {pestania === 'resumen' && (
        <>
          <div className="gerente-kpis">
            <Kpi icono={Users} titulo="Clientes" valor={fmtNum(i.clientes)}
                 detalle={`${fmtNum(i.clientes_con_acceso)} con acceso a la app`} />
            <Kpi icono={Wallet} titulo="Depósitos en pesos" valor={fmtCompacto(i.saldo_ars)}
                 detalle={`${fmtNum(i.cuentas_ars)} cajas de ahorro`} />
            <Kpi icono={DollarSign} titulo="Depósitos en dólares" valor={fmtUSD(i.saldo_usd)}
                 detalle={`${fmtNum(i.cuentas_usd)} cajas de ahorro`} />
            <Kpi icono={Activity} titulo="Movimientos" valor={fmtNum(i.movimientos_total)}
                 detalle={`${fmtNum(i.movimientos_30d)} en los últimos 30 días`} />
          </div>

          {/* Alertas: mora e integridad son lo primero que hay que ver, por eso van arriba. */}
          <div className="gerente-alertas">
            <div className={`gerente-alerta ${resumen.mora.length ? 'roja' : 'verde'}`}>
              {resumen.mora.length ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              <div>
                <strong>{resumen.mora.length ? `${fmtARS(totalMora)} en mora` : 'Sin cuotas vencidas'}</strong>
                <span>
                  {resumen.mora.length
                    ? `${resumen.mora.length} ${resumen.mora.length === 1 ? 'cliente' : 'clientes'} con cuotas vencidas e impagas`
                    : 'Todos los préstamos y tarjetas están al día'}
                </span>
              </div>
            </div>
            <div className={`gerente-alerta ${resumen.cuentasDescuadradas.length ? 'roja' : 'verde'}`}>
              {resumen.cuentasDescuadradas.length ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              <div>
                <strong>
                  {resumen.cuentasDescuadradas.length
                    ? `${resumen.cuentasDescuadradas.length} ${resumen.cuentasDescuadradas.length === 1 ? 'cuenta descuadrada' : 'cuentas descuadradas'}`
                    : 'Saldos íntegros'}
                </strong>
                <span>
                  {resumen.cuentasDescuadradas.length
                    ? 'Hay saldos que no coinciden con la suma de sus movimientos'
                    : 'Cada saldo coincide con la suma de su historial'}
                </span>
              </div>
            </div>
          </div>

          <div className="gerente-grid-2">
            <Tarjeta titulo="Fondos de los clientes" subtitulo="En pesos · dónde está la plata">
              <strong className="gerente-total">{fmtARS(fondosArs)}</strong>
              <div className="gerente-composicion">
                <div className="gerente-seg disponible" style={{ width: `${pct(i.saldo_ars, fondosArs)}%` }} />
                <div className="gerente-seg reservas" style={{ width: `${pct(i.reservas_ars, fondosArs)}%` }} />
                <div className="gerente-seg plazos" style={{ width: `${pct(i.plazos_fijos_ars, fondosArs)}%` }} />
              </div>
              <ul className="gerente-leyenda">
                <li><i className="disponible" /> Disponible en cuenta <b>{fmtARS(i.saldo_ars)}</b></li>
                <li><i className="reservas" /> En reservas <b>{fmtARS(i.reservas_ars)}</b></li>
                <li><i className="plazos" /> En plazos fijos ({fmtNum(i.plazos_fijos_activos)}) <b>{fmtARS(i.plazos_fijos_ars)}</b></li>
              </ul>
            </Tarjeta>

            <Tarjeta titulo="Cartera de crédito" subtitulo="Lo que los clientes le deben al banco">
              <div className="gerente-filas">
                <div><span><Building2 size={15} /> Préstamos activos</span><b>{fmtNum(i.prestamos_activos)}</b></div>
                <div><span>Capital pendiente de cobro</span><b>{fmtARS(i.capital_prestado_pendiente)}</b></div>
                <div><span>Otorgado en total (histórico)</span><b>{fmtARS(i.prestamos_otorgados_historico)}</b></div>
                <div><span><CreditCard size={15} /> Tarjetas emitidas</span><b>{fmtNum(i.tarjetas)}</b></div>
                <div><span>Cuotas de tarjeta pendientes</span><b>{fmtARS(i.tarjetas_saldo_pendiente)}</b></div>
                <div><span><PiggyBank size={15} /> Pólizas activas</span><b>{fmtNum(i.polizas_activas)} · {fmtARS(i.primas_mensuales)}/mes</b></div>
                <div><span>Clientes que invierten en CEDEARs</span><b>{fmtNum(i.inversores_cedear)}</b></div>
              </div>
            </Tarjeta>
          </div>

          <Tarjeta titulo="Actividad mensual" subtitulo="Ingresos y egresos de los últimos 12 meses · en pesos">
            {resumen.actividadMensual.length === 0 ? (
              <p className="gerente-vacio">Todavía no hay movimientos en el período.</p>
            ) : (
              <>
                <div className="gerente-chart">
                  {resumen.actividadMensual.map(m => (
                    <div key={m.mes} className="gerente-chart-col" title={`${fmtNum(m.cantidad)} movimientos`}>
                      <div className="gerente-chart-barras">
                        <div className="gerente-barra ingreso" style={{ height: `${pct(m.ingresos, maxMensual)}%` }} />
                        <div className="gerente-barra egreso" style={{ height: `${pct(m.egresos, maxMensual)}%` }} />
                      </div>
                      <span className="gerente-chart-mes">{etiquetaMes(m.mes)}</span>
                      <span className="gerente-chart-cant">{fmtNum(m.cantidad)}</span>
                    </div>
                  ))}
                </div>
                <ul className="gerente-leyenda horizontal">
                  <li><i className="ingreso" /> Ingresos</li>
                  <li><i className="egreso" /> Egresos</li>
                  <li className="gerente-nota">El número debajo de cada mes es la cantidad de movimientos</li>
                </ul>
              </>
            )}
          </Tarjeta>

          <div className="gerente-grid-2">
            <Tarjeta titulo="Operaciones más usadas" subtitulo="Por cantidad, todas las monedas">
              <div className="gerente-ranking">
                {operaciones.map(o => (
                  <div key={o.tipo} className="gerente-ranking-fila">
                    <div className="gerente-ranking-texto">
                      <span>{etiquetaTipo(o.tipo)}</span>
                      <b>{fmtNum(o.cantidad)}</b>
                    </div>
                    <div className="gerente-ranking-pista">
                      <div className="gerente-ranking-barra" style={{ width: `${pct(o.cantidad, maxOperacion)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Tarjeta>

            <Tarjeta titulo="Clientes con mayor saldo" subtitulo="En pesos">
              <ol className="gerente-top">
                {resumen.topClientes.map((c, idx) => (
                  <li key={c.id}>
                    <span className="gerente-top-pos">{idx + 1}</span>
                    <span className="gerente-top-nombre">{c.nombre} {c.apellido}</span>
                    <b>{fmtARS(c.saldo_ars)}</b>
                  </li>
                ))}
              </ol>
            </Tarjeta>
          </div>

          <Tarjeta titulo="Interoperabilidad con la red" subtitulo="Transferencias por banco de la contraparte · Banco Central">
            <div className="gerente-tabla-wrap">
              <table className="gerente-tabla">
                <thead>
                  <tr><th>Banco</th><th>Enviadas</th><th>Recibidas</th><th>Enviado (ARS)</th><th>Recibido (ARS)</th></tr>
                </thead>
                <tbody>
                  {resumen.transferenciasPorBanco.map(t => (
                    <tr key={t.codigo}>
                      <td>
                        <span className="gerente-banco">
                          {t.propio ? <Building2 size={14} /> : <Globe size={14} />} {t.banco}
                          <small>{t.propio ? 'entre clientes propios' : `código ${t.codigo}`}</small>
                        </span>
                      </td>
                      <td><span className="gerente-dir salida"><ArrowUpRight size={13} />{fmtNum(t.enviadas)}</span></td>
                      <td><span className="gerente-dir entrada"><ArrowDownLeft size={13} />{fmtNum(t.recibidas)}</span></td>
                      <td>{fmtARS(t.enviado_ars)}</td>
                      <td>{fmtARS(t.recibido_ars)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          {resumen.mora.length > 0 && (
            <Tarjeta titulo="Detalle de mora" subtitulo="Clientes con cuotas vencidas e impagas" className="gerente-card-alerta">
              <div className="gerente-tabla-wrap">
                <table className="gerente-tabla">
                  <thead>
                    <tr><th>Cliente</th><th>DNI</th><th>Origen</th><th>Cuotas</th><th>Atraso máx.</th><th>Monto</th></tr>
                  </thead>
                  <tbody>
                    {resumen.mora.map(m => (
                      <tr key={m.id}>
                        <td>{m.nombre} {m.apellido}</td>
                        <td>{m.dni}</td>
                        <td>{[m.en_prestamos && 'Préstamo', m.en_tarjeta && 'Tarjeta'].filter(Boolean).join(' + ')}</td>
                        <td>{fmtNum(m.cuotas)}</td>
                        <td><span className="gerente-dias">{m.dias_max_atraso} días</span></td>
                        <td className="gerente-negativo">{fmtARS(m.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}

          {resumen.cuentasDescuadradas.length > 0 && (
            <Tarjeta titulo="Control de integridad" subtitulo="Saldos que no coinciden con la suma de sus movimientos" className="gerente-card-alerta">
              <div className="gerente-tabla-wrap">
                <table className="gerente-tabla">
                  <thead>
                    <tr><th>Titular</th><th>CBU</th><th>Saldo</th><th>Suma de movimientos</th><th>Diferencia</th></tr>
                  </thead>
                  <tbody>
                    {resumen.cuentasDescuadradas.map(c => {
                      const fmt = c.moneda === 'USD' ? fmtUSD : fmtARS;
                      return (
                        <tr key={c.id_cuenta}>
                          <td>{c.nombre} {c.apellido}</td>
                          <td className="gerente-mono">{c.cbu}</td>
                          <td>{fmt(c.saldo)}</td>
                          <td>{fmt(c.suma_movimientos)}</td>
                          <td className="gerente-negativo">{fmt(c.diferencia)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
        </>
      )}

      {/* ═════════════════════════ CLIENTES ═════════════════════════ */}
      {pestania === 'clientes' && (
        <Tarjeta titulo="Cartera de clientes" subtitulo={`${clientesFiltrados.length} de ${clientes.length}`}>
          <div className="gerente-toolbar">
            <label className="gerente-buscador">
              <Search size={15} />
              <input
                type="text"
                placeholder="Buscar por nombre, DNI o email"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </label>
            <button onClick={exportarClientes} className="gerente-btn-secundario" disabled={!clientesFiltrados.length}>
              <Download size={15} /> Exportar a Excel
            </button>
          </div>
          <div className="gerente-tabla-wrap">
            <table className="gerente-tabla">
              <thead>
                <tr>
                  <th>Cliente</th><th>DNI</th><th>Contacto</th><th>Cuentas</th>
                  <th>Saldo ARS</th><th>Saldo USD</th><th>Productos</th><th>App</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span className="gerente-cliente">
                        {c.nombre} {c.apellido}
                        {c.roles && <small className="gerente-rol">{c.roles}</small>}
                      </span>
                    </td>
                    <td>{c.dni}</td>
                    <td className="gerente-contacto">{c.email || '—'}<small>{c.telefono || ''}</small></td>
                    <td>{fmtNum(c.cuentas)}</td>
                    <td>{fmtARS(c.saldo_ars)}</td>
                    <td>{Number(c.saldo_usd) ? fmtUSD(c.saldo_usd) : '—'}</td>
                    <td className="gerente-productos">
                      {Number(c.tarjetas) > 0 && <span>{c.tarjetas} tarjeta{c.tarjetas === '1' ? '' : 's'}</span>}
                      {Number(c.prestamos_activos) > 0 && <span>{c.prestamos_activos} préstamo{c.prestamos_activos === '1' ? '' : 's'}</span>}
                      {!Number(c.tarjetas) && !Number(c.prestamos_activos) && '—'}
                    </td>
                    <td>
                      <span className={`gerente-acceso ${c.tiene_acceso ? 'si' : 'no'}`}>
                        {c.tiene_acceso ? 'Activo' : 'Sin acceso'}
                      </span>
                    </td>
                  </tr>
                ))}
                {clientesFiltrados.length === 0 && (
                  <tr><td colSpan={8} className="gerente-vacio">Ningún cliente coincide con "{busqueda}".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {/* ═════════════════════════ MOVIMIENTOS ═════════════════════════ */}
      {pestania === 'movimientos' && (
        <Tarjeta titulo="Últimos movimientos del banco" subtitulo={`Los ${movimientos.length} más recientes, de todos los clientes`}>
          <div className="gerente-tabla-wrap">
            <table className="gerente-tabla">
              <thead>
                <tr><th>Fecha</th><th>Cliente</th><th>Operación</th><th>Descripción</th><th>Monto</th></tr>
              </thead>
              <tbody>
                {movimientos.map(m => (
                  <tr key={m.id_movimiento}>
                    <td className="gerente-fecha">{fmtFecha(m.fecha_movimiento)}</td>
                    <td>{m.nombre} {m.apellido}</td>
                    <td>
                      {etiquetaTipo(m.tipo)}
                      {m.via_banco_central && <small className="gerente-red">Red BCRA</small>}
                    </td>
                    <td className="gerente-descripcion">{m.descripcion}</td>
                    <td className={Number(m.monto) < 0 ? 'gerente-negativo' : 'gerente-positivo'}>
                      {(m.moneda === 'USD' ? fmtUSD : fmtARS)(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
