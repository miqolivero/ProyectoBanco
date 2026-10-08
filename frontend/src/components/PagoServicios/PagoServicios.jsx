import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, Zap, CalendarClock } from 'lucide-react';
import './PagoServicios.css';
import { API_URL } from '../../config/api';

export default function PagoServicios({ datosUsuario, alPagarExitoso, alCancelar }) {
  const [empresas, setEmpresas] = useState([]);
  const [idEmpresa, setIdEmpresa] = useState('');
  const [numeroCliente, setNumeroCliente] = useState('');
  const [facturas, setFacturas] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  // Servicios agendados
  const [agendas, setAgendas] = useState([]);
  const [cargandoAgendas, setCargandoAgendas] = useState(true);
  const [mostrarFormAgenda, setMostrarFormAgenda] = useState(false);
  const [nuevaAgenda, setNuevaAgenda] = useState({
    id_empresa: '', numero_cliente: '', alias: '', tieneMontoFijo: false, monto_fijo: '', dia_vencimiento: '15', debito_automatico: false
  });
  const [creandoAgenda, setCreandoAgenda] = useState(false);
  const [procesandoAgendaId, setProcesandoAgendaId] = useState(null);
  const [debitando, setDebitando] = useState(false);

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
  };

  const cargarAgendas = async () => {
    try {
      const response = await fetch(`${API_URL}/api/servicios/agendados?idPersona=${datosUsuario.id}`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) setAgendas(data);
    } catch {
      // silencioso: el resto de la pantalla (consultar/pagar) sigue funcionando igual
    } finally {
      setCargandoAgendas(false);
    }
  };

  useEffect(() => {
    fetch(`${API_URL}/api/servicios/empresas`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEmpresas(data);
          if (data.length > 0) {
            setIdEmpresa(String(data[0].id_empresa));
            setNuevaAgenda(prev => ({ ...prev, id_empresa: String(data[0].id_empresa) }));
          }
        }
      })
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudo cargar el listado de empresas.' }));
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!cancelado && datosUsuario?.id) await cargarAgendas();
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosUsuario?.id]);

  const handleConsultar = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });
    setFacturas(null);

    if (!idEmpresa || !numeroCliente.trim()) {
      setMensaje({ tipo: 'error', texto: 'Elegí una empresa e ingresá tu número de cliente.' });
      return;
    }

    try {
      setConsultando(true);
      const response = await fetch(
        `${API_URL}/api/servicios/empresas/${idEmpresa}/deuda?numero_cliente=${encodeURIComponent(numeroCliente.trim())}`
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo consultar la deuda.');

      setFacturas(data);
      if (data.length === 0) {
        setMensaje({ tipo: 'exito', texto: 'No encontramos facturas pendientes para ese número de cliente.' });
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setConsultando(false);
    }
  };

  const handlePagar = async (factura, alSaldarActualizarAgendas = false) => {
    if (Number(factura.importe) > Number(datosUsuario?.saldo)) {
      setMensaje({ tipo: 'error', texto: `Saldo insuficiente. Tu saldo actual es de ${formatearMoneda(datosUsuario?.saldo)}` });
      return;
    }

    setMensaje({ tipo: '', texto: '' });

    try {
      setPagando(true);
      const response = await fetch(`${API_URL}/api/servicios/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_factura: factura.id_factura, cbu: datosUsuario.cbu })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo procesar el pago.');

      setMensaje({ tipo: 'exito', texto: `¡Listo! Pagaste ${formatearMoneda(factura.importe)}.` });
      setFacturas(prev => prev ? prev.filter(f => f.id_factura !== factura.id_factura) : prev);
      if (alSaldarActualizarAgendas) await cargarAgendas();

      if (alPagarExitoso) alPagarExitoso(Number(factura.importe));
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setPagando(false);
    }
  };

  const handleCrearAgenda = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    if (!nuevaAgenda.id_empresa || !nuevaAgenda.numero_cliente.trim()) {
      setMensaje({ tipo: 'error', texto: 'Elegí una empresa e ingresá el número de cliente a agendar.' });
      return;
    }
    if (nuevaAgenda.tieneMontoFijo && (!nuevaAgenda.monto_fijo || Number(nuevaAgenda.monto_fijo) <= 0)) {
      setMensaje({ tipo: 'error', texto: 'Ingresá el monto fijo mensual (mayor a cero).' });
      return;
    }

    try {
      setCreandoAgenda(true);
      const response = await fetch(`${API_URL}/api/servicios/agendados`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPersona: datosUsuario.id,
          id_empresa: Number(nuevaAgenda.id_empresa),
          numero_cliente: nuevaAgenda.numero_cliente.trim(),
          alias: nuevaAgenda.alias.trim() || null,
          monto_fijo: nuevaAgenda.tieneMontoFijo ? Number(nuevaAgenda.monto_fijo) : null,
          dia_vencimiento: nuevaAgenda.tieneMontoFijo ? Number(nuevaAgenda.dia_vencimiento) : null,
          debito_automatico: nuevaAgenda.tieneMontoFijo && nuevaAgenda.debito_automatico
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo agendar el servicio.');

      setMensaje({ tipo: 'exito', texto: '¡Servicio agendado!' });
      setNuevaAgenda({
        id_empresa: empresas[0] ? String(empresas[0].id_empresa) : '',
        numero_cliente: '', alias: '', tieneMontoFijo: false, monto_fijo: '', dia_vencimiento: '15', debito_automatico: false
      });
      setMostrarFormAgenda(false);
      await cargarAgendas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setCreandoAgenda(false);
    }
  };

  const handleEliminarAgenda = async (idAgenda) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setProcesandoAgendaId(idAgenda);
      const response = await fetch(`${API_URL}/api/servicios/agendados/${idAgenda}?idPersona=${datosUsuario.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo desagendar el servicio.');

      setMensaje({ tipo: 'exito', texto: 'Servicio desagendado.' });
      await cargarAgendas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setProcesandoAgendaId(null);
    }
  };

  const handleToggleDebito = async (agenda) => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setProcesandoAgendaId(agenda.id_agenda);
      const response = await fetch(`${API_URL}/api/servicios/agendados/${agenda.id_agenda}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPersona: datosUsuario.id,
          alias: agenda.alias,
          monto_fijo: agenda.monto_fijo,
          dia_vencimiento: agenda.dia_vencimiento,
          debito_automatico: !agenda.debito_automatico
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el servicio.');
      await cargarAgendas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setProcesandoAgendaId(null);
    }
  };

  const handleEjecutarDebitos = async () => {
    setMensaje({ tipo: '', texto: '' });
    try {
      setDebitando(true);
      const response = await fetch(`${API_URL}/api/servicios/agendados/debitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPersona: datosUsuario.id, cbu: datosUsuario.cbu })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo procesar el débito automático.');

      const totalPagado = data.pagados.reduce((acc, p) => acc + Number(p.importe), 0);
      if (data.pagados.length === 0 && data.errores.length === 0) {
        setMensaje({ tipo: 'exito', texto: 'No había nada pendiente para debitar este mes.' });
      } else if (data.errores.length > 0) {
        setMensaje({ tipo: 'error', texto: `Se pagaron ${data.pagados.length} servicio(s) por ${formatearMoneda(totalPagado)}, pero ${data.errores.length} falló (revisá tu saldo).` });
      } else {
        setMensaje({ tipo: 'exito', texto: `¡Listo! Se debitaron ${data.pagados.length} servicio(s) por un total de ${formatearMoneda(totalPagado)}.` });
      }
      if (alPagarExitoso && totalPagado > 0) alPagarExitoso(totalPagado);
      await cargarAgendas();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setDebitando(false);
    }
  };

  const hayDebitosAutomaticosPendientes = agendas.some(
    a => a.debito_automatico && a.facturaDelMes && a.facturaDelMes.estado === 'PENDIENTE'
  );

  return (
    <div className="servicios-container">
      <div className="servicios-header-box">
        <span className="servicios-eyebrow">Tus cuentas en orden, con la tranquilidad del valle</span>
        <h2>Pago de Servicios</h2>
        <p>Consultá y pagá tus facturas de luz, gas, agua e internet — o agendalas para no tener que buscarlas cada mes.</p>
      </div>

      <div className="servicios-layout">
      <div className="servicios-main">
      <div className="servicios-card">
        <h3 className="servicios-subtitulo">Consultar y pagar una factura</h3>
        <form onSubmit={handleConsultar} className="servicios-form">
          <div className="servicios-row">
            <div className="servicios-field">
              <label>Empresa</label>
              <select
                value={idEmpresa}
                onChange={(e) => setIdEmpresa(e.target.value)}
                disabled={consultando || empresas.length === 0}
                className="servicios-input-select"
              >
                {empresas.map(emp => (
                  <option key={emp.id_empresa} value={emp.id_empresa}>{emp.nombre} ({emp.rubro})</option>
                ))}
              </select>
            </div>

            <div className="servicios-field">
              <label>Número de cliente</label>
              <input
                type="text"
                placeholder="Ej. 12345"
                value={numeroCliente}
                onChange={(e) => setNumeroCliente(e.target.value)}
                disabled={consultando}
                className="servicios-input-text"
              />
            </div>
          </div>

          <button type="submit" disabled={consultando} className="btn-serv-consultar">
            {consultando ? 'Consultando...' : 'Consultar Deuda'}
          </button>
        </form>

        {mensaje.texto && (
          <div className={`servicios-alert ${mensaje.tipo}`}>
            {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
          </div>
        )}

        {facturas && facturas.length > 0 && (
          <div className="servicios-facturas-list">
            {facturas.map(f => (
              <div key={f.id_factura} className="servicios-factura-item">
                <div>
                  <p className="servicios-factura-importe">{formatearMoneda(f.importe)}</p>
                  <span className="servicios-factura-vencimiento">Vence: {new Date(f.vencimiento).toLocaleDateString('es-AR')}</span>
                </div>
                <button
                  onClick={() => handlePagar(f)}
                  disabled={pagando}
                  className="btn-serv-pagar"
                >
                  {pagando ? 'Procesando...' : 'Pagar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="servicios-card">
        <div className="servicios-agenda-head">
          <div>
            <h3 className="servicios-subtitulo">Servicios agendados</h3>
            <p className="servicios-agenda-lead">Guardalos para no tener que volver a tipear el número de cliente, o fijales un monto mensual para que el banco te arme la factura solo.</p>
          </div>
          <button onClick={() => setMostrarFormAgenda(v => !v)} className="btn-serv-toggle-agenda">
            {mostrarFormAgenda ? 'Cancelar' : '+ Agendar servicio'}
          </button>
        </div>

        {mostrarFormAgenda && (
          <form onSubmit={handleCrearAgenda} className="servicios-form servicios-form-agenda">
            <div className="servicios-row">
              <div className="servicios-field">
                <label>Empresa</label>
                <select
                  value={nuevaAgenda.id_empresa}
                  onChange={(e) => setNuevaAgenda(prev => ({ ...prev, id_empresa: e.target.value }))}
                  disabled={creandoAgenda || empresas.length === 0}
                  className="servicios-input-select"
                >
                  {empresas.map(emp => (
                    <option key={emp.id_empresa} value={emp.id_empresa}>{emp.nombre} ({emp.rubro})</option>
                  ))}
                </select>
              </div>
              <div className="servicios-field">
                <label>Número de cliente</label>
                <input
                  type="text"
                  placeholder="Ej. 12345"
                  value={nuevaAgenda.numero_cliente}
                  onChange={(e) => setNuevaAgenda(prev => ({ ...prev, numero_cliente: e.target.value }))}
                  disabled={creandoAgenda}
                  className="servicios-input-text"
                />
              </div>
            </div>

            <div className="servicios-field">
              <label>Alias (opcional)</label>
              <input
                type="text"
                placeholder="Ej. Internet de casa"
                value={nuevaAgenda.alias}
                onChange={(e) => setNuevaAgenda(prev => ({ ...prev, alias: e.target.value }))}
                disabled={creandoAgenda}
                className="servicios-input-text"
              />
            </div>

            <label className="servicios-checkbox-row">
              <input
                type="checkbox"
                checked={nuevaAgenda.tieneMontoFijo}
                onChange={(e) => setNuevaAgenda(prev => ({ ...prev, tieneMontoFijo: e.target.checked }))}
                disabled={creandoAgenda}
              />
              Tiene un monto fijo todos los meses (ej. un abono)
            </label>

            {nuevaAgenda.tieneMontoFijo && (
              <>
                <div className="servicios-row">
                  <div className="servicios-field">
                    <label>Monto mensual</label>
                    <input
                      type="number"
                      placeholder="$ 0"
                      value={nuevaAgenda.monto_fijo}
                      onChange={(e) => setNuevaAgenda(prev => ({ ...prev, monto_fijo: e.target.value }))}
                      disabled={creandoAgenda}
                      className="servicios-input-text"
                    />
                  </div>
                  <div className="servicios-field">
                    <label>Día de vencimiento</label>
                    <select
                      value={nuevaAgenda.dia_vencimiento}
                      onChange={(e) => setNuevaAgenda(prev => ({ ...prev, dia_vencimiento: e.target.value }))}
                      disabled={creandoAgenda}
                      className="servicios-input-select"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>Día {d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="servicios-checkbox-row">
                  <input
                    type="checkbox"
                    checked={nuevaAgenda.debito_automatico}
                    onChange={(e) => setNuevaAgenda(prev => ({ ...prev, debito_automatico: e.target.checked }))}
                    disabled={creandoAgenda}
                  />
                  Pagarlo solo todos los meses (débito automático)
                </label>
              </>
            )}

            <button type="submit" disabled={creandoAgenda} className="btn-serv-consultar">
              {creandoAgenda ? 'Agendando...' : 'Agendar servicio'}
            </button>
          </form>
        )}

        {cargandoAgendas ? (
          <p className="servicios-agenda-empty">Cargando servicios agendados...</p>
        ) : agendas.length === 0 ? (
          <p className="servicios-agenda-empty">Todavía no agendaste ningún servicio.</p>
        ) : (
          <div className="servicios-agendas-list">
            {agendas.map(a => (
              <div key={a.id_agenda} className="servicios-agenda-item">
                <div className="servicios-agenda-item-top">
                  <div>
                    <strong>{a.alias || a.nombre_empresa}</strong>
                    <span className="servicios-agenda-item-sub">{a.nombre_empresa} · Cliente {a.numero_cliente}</span>
                  </div>
                  <button
                    onClick={() => handleEliminarAgenda(a.id_agenda)}
                    disabled={procesandoAgendaId === a.id_agenda}
                    className="btn-serv-eliminar-agenda"
                    title="Desagendar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {a.monto_fijo ? (
                  <div className="servicios-agenda-item-monto">
                    <span className="servicios-agenda-item-fijo">
                      <CalendarClock size={13} /> {formatearMoneda(a.monto_fijo)} / mes · vence el {a.dia_vencimiento}
                    </span>
                    <label className="servicios-checkbox-row servicios-checkbox-chico">
                      <input
                        type="checkbox"
                        checked={a.debito_automatico}
                        onChange={() => handleToggleDebito(a)}
                        disabled={procesandoAgendaId === a.id_agenda}
                      />
                      <Zap size={12} /> Débito automático
                    </label>
                  </div>
                ) : (
                  <span className="servicios-agenda-item-sin-monto">Acceso rápido, sin monto fijo</span>
                )}

                {a.facturaDelMes && a.facturaDelMes.estado === 'PENDIENTE' && (
                  <div className="servicios-agenda-item-factura">
                    <span>Factura de este mes: {formatearMoneda(a.facturaDelMes.importe)}</span>
                    <button
                      onClick={() => handlePagar(a.facturaDelMes, true)}
                      disabled={pagando}
                      className="btn-serv-pagar"
                    >
                      {pagando ? '...' : 'Pagar ahora'}
                    </button>
                  </div>
                )}
                {a.facturaDelMes && a.facturaDelMes.estado === 'PAGADA' && (
                  <span className="servicios-agenda-item-pagada"><CheckCircle2 size={13} /> Ya pagado este mes</span>
                )}
              </div>
            ))}
          </div>
        )}

        {agendas.some(a => a.debito_automatico) && (
          <button
            onClick={handleEjecutarDebitos}
            disabled={debitando || !hayDebitosAutomaticosPendientes}
            className="btn-serv-debitar"
          >
            <Zap size={15} /> {debitando ? 'Procesando...' : hayDebitosAutomaticosPendientes ? 'Pagar débitos automáticos del mes' : 'Débitos automáticos al día'}
          </button>
        )}
      </div>

      <button onClick={alCancelar} className="btn-serv-volver">
        Volver al Inicio
      </button>
      </div>

      <div className="servicios-info-panel">
        <h4>Tu cuenta</h4>
        <span className="servicios-info-label">Saldo actual</span>
        <p className="servicios-info-saldo">{formatearMoneda(datosUsuario?.saldo)}</p>

        <span className="servicios-info-label">Empresas disponibles</span>
        <div className="servicios-info-empresas">
          {empresas.map(emp => (
            <div key={emp.id_empresa} className="servicios-info-empresa-item">
              <span>{emp.nombre}</span>
              <span className="servicios-info-empresa-rubro">{emp.rubro}</span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
