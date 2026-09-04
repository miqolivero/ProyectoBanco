import { useState, useEffect, useRef } from 'react';
import { useClerk } from '@clerk/clerk-react';
import {
  Home, ArrowLeftRight, Wallet, Smartphone, Receipt, PiggyBank, CreditCard,
  TrendingUp, Landmark, Shield, BarChart3, History, Settings, User, LogOut,
  Eye, EyeOff, Pencil, Check, X, DollarSign, Send, Download, Briefcase, Plus
} from 'lucide-react';
import logo from "../../assets/LogoMinimalista.png";
import Transferencias from '../Transferencia/Transferencias';
import Depositar from '../Depositar/Depositar';
import Recargas from '../Recargas/Recargas';
import PagoServicios from '../PagoServicios/PagoServicios';
import Reservas from '../Reservas/Reservas';
import Tarjeta from '../Tarjeta/Tarjeta';
import PlazoFijo from '../PlazoFijo/PlazoFijo';
import Prestamos from '../Prestamos/Prestamos';
import Seguros from '../Seguros/Seguros';
import Cedears from '../Cedears/Cedears';
import SelectorCuenta from '../SelectorCuenta/SelectorCuenta';
import './InicioBanco.css';

export default function InicioBanco({ datosUsuario, actualizarDatosBase }) {
  const { signOut } = useClerk();
  
  const [vistaActual, setVistaActual] = useState('inicio');
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoMovs, setCargandoMovs] = useState(true);
  const [triggerRecarga, setTriggerRecarga] = useState(0);
  const [saldoEspejo, setSaldoEspejo] = useState(() => Number(datosUsuario?.saldo || 0));
  const [filtoMonto, setFiltroMonto] = useState('');

  // 🎯 NUEVOS ESTADOS PARA FILTROS DE FECHA (Historial)
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // Estados para Alias
  const [editandoAlias, setEditandoAlias] = useState(false);
  const [inputAlias, setInputAlias] = useState(datosUsuario?.alias || '');
  const [errorAlias, setErrorAlias] = useState('');
  const [guardandoAlias, setGuardandoAlias] = useState(false);

  const [mostrarSaldo, setMostrarSaldo] = useState(true);
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false);
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);
  const menuPerfilRef = useRef(null);

  // 🎯 CUENTA EN USD: vive acá (no en una pantalla aparte) para que Depositar y Transferencias
  // puedan operar sobre ella con el mismo formulario que usan para la cuenta en ARS, en vez de
  // duplicar un depósito/transferencia propios para USD.
  const [cuentaUSD, setCuentaUSD] = useState(null);
  const [abriendoCuentaUSD, setAbriendoCuentaUSD] = useState(false);
  const [saldoEspejoUSD, setSaldoEspejoUSD] = useState(0);
  const [monedaActiva, setMonedaActiva] = useState('ARS');
  const [movimientosUSD, setMovimientosUSD] = useState([]);
  const [cargandoMovsUSD, setCargandoMovsUSD] = useState(false);

  useEffect(() => {
    if (!datosUsuario?.id) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/personas/${datosUsuario.id}/cuenta-usd`);
        const data = await res.json();
        if (!cancelado && res.ok && data) {
          setCuentaUSD(data);
          setSaldoEspejoUSD(Number(data.saldo));
        }
      } catch (err) {
        console.error('❌ Error consultando la cuenta en USD:', err);
      }
    })();
    return () => { cancelado = true; };
  }, [datosUsuario?.id]);

  const handleAbrirCuentaUSD = async () => {
    try {
      setAbriendoCuentaUSD(true);
      const res = await fetch(`http://localhost:3001/api/personas/${datosUsuario.id}/cuenta-usd`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir la cuenta en USD.');
      setCuentaUSD(data);
      setSaldoEspejoUSD(Number(data.saldo));
      setMonedaActiva('USD');
    } catch (err) {
      alert(err.message);
    } finally {
      setAbriendoCuentaUSD(false);
    }
  };

  // Cuentas disponibles para el selector de Depositar/Transferencias: ARS siempre, USD si ya la abrió.
  const cuentasDisponibles = [
    { moneda: 'ARS', cbu: datosUsuario?.cbu, alias: datosUsuario?.alias, saldo: saldoEspejo },
    ...(cuentaUSD ? [{ moneda: 'USD', cbu: cuentaUSD.cbu, alias: cuentaUSD.alias, saldo: saldoEspejoUSD }] : [])
  ];

  // 🎯 Cuenta que se está visualizando en el dashboard de Inicio (saldo, CBU, alias, movimientos
  // recientes) — cambia con el mismo selector de "Mis Productos" / SelectorCuenta que el resto de la app.
  const cuentaVista = cuentasDisponibles.find(c => c.moneda === monedaActiva) || cuentasDisponibles[0];

  // Sincronizan saldoEspejo/inputAlias cuando cambia el dato real que llega por props,
  // sin pasar por un useEffect (setState en efecto dispara un render extra de más);
  // siguiendo el patrón recomendado por React de "ajustar estado durante el render"
  // cuando cambia una prop: https://react.dev/learn/you-might-not-need-an-effect
  const [ultimoSaldoProp, setUltimoSaldoProp] = useState(datosUsuario?.saldo);
  if (datosUsuario?.saldo != null && datosUsuario.saldo !== ultimoSaldoProp) {
    setUltimoSaldoProp(datosUsuario.saldo);
    setSaldoEspejo(Number(datosUsuario.saldo));
  }

  const [ultimoAliasProp, setUltimoAliasProp] = useState(datosUsuario?.alias);
  if (datosUsuario?.alias && datosUsuario.alias !== ultimoAliasProp) {
    setUltimoAliasProp(datosUsuario.alias);
    setInputAlias(datosUsuario.alias);
  }

  useEffect(() => {
    function clickAfuera(event) {
      if (menuPerfilRef.current && !menuPerfilRef.current.contains(event.target)) {
        setMenuPerfilAbierto(false);
      }
    }
    document.addEventListener("mousedown", clickAfuera);
    return () => document.removeEventListener("mousedown", clickAfuera);
  }, []);

  const formatearMoneda = (valor, moneda = 'ARS') => {
    if (!mostrarSaldo) return moneda === 'USD' ? "US$ *******" : "$ *******";
    return new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-AR', { style: 'currency', currency: moneda }).format(valor || 0);
  };

  const formatearFecha = (stringFecha) => {
    if (!stringFecha) return '---';
    try {
      const fecha = new Date(stringFecha);
      if (isNaN(fecha.getTime())) return '---';
      
      const opciones = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      return new Intl.DateTimeFormat('es-AR', opciones).format(fecha);
    } catch {
      return '---';
    }
  };

  useEffect(() => {
    if (!datosUsuario?.cbu) return;

    const miCbuLimpio = String(datosUsuario.cbu).trim();
    let cancelado = false;

    // El backend (Movimiento.obtenerTodos) ya filtra por CBU y ordena por fecha descendente,
    // así que acá solo pedimos y guardamos: no hace falta repetir ese trabajo en el cliente.
    const cargarHistorial = async () => {
      const response = await fetch(`http://localhost:3001/api/movimientos/historial?cbu=${miCbuLimpio}`);
      const data = await response.json();
      if (!cancelado && response.ok && Array.isArray(data)) {
        setMovimientos(data);
      }
    };

    // Pega contra la API del Banco Central (compartida entre todos los bancos del curso) para
    // traer transferencias recibidas de otros bancos. Se llama en segundo plano cada 30s, no en
    // cada click del sidebar, para no recargar de pedidos una API que usan los demás grupos.
    const sincronizarConCentral = async () => {
      try {
        const resSync = await fetch(`http://localhost:3001/api/movimientos/sincronizar?minutos=30&cbu=${miCbuLimpio}`);
        if (!cancelado && resSync.ok) {
          if (actualizarDatosBase) actualizarDatosBase();
          await cargarHistorial();
        }
      } catch (err) {
        console.error("❌ Error sincronizando con el Central:", err);
      }
    };

    const cargaInicial = async () => {
      try {
        setCargandoMovs(true);
        await cargarHistorial();
        if (!cancelado) setCargandoMovs(false);
        await sincronizarConCentral();
      } catch (err) {
        console.error("❌ Error cargando historial unificado:", err);
        if (!cancelado) setCargandoMovs(false);
      }
    };

    cargaInicial();

    // Heartbeat cada 30s: mantiene el saldo/historial al día sin depender de a qué pantalla
    // esté navegando el usuario.
    const intervalo = setInterval(sincronizarConCentral, 30000);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [datosUsuario?.cbu, triggerRecarga]);

  // Historial de la cuenta en USD, aparte del de ARS de arriba (misma API, otro CBU). La
  // sincronización con el Central de arriba ya no filtra por cbu (trae todo el pool de
  // transacciones y acredita localmente la que corresponda), así que acá solo hace falta
  // volver a pedir el historial de este CBU cuando cambia algo.
  useEffect(() => {
    if (!cuentaUSD?.cbu) return;
    let cancelado = false;

    const cargarHistorialUSD = async () => {
      try {
        setCargandoMovsUSD(true);
        const response = await fetch(`http://localhost:3001/api/movimientos/historial?cbu=${cuentaUSD.cbu}`);
        const data = await response.json();
        if (!cancelado && response.ok && Array.isArray(data)) {
          setMovimientosUSD(data);
        }
      } catch (err) {
        console.error("❌ Error cargando historial de la cuenta en USD:", err);
      } finally {
        if (!cancelado) setCargandoMovsUSD(false);
      }
    };

    cargarHistorialUSD();
    const intervalo = setInterval(cargarHistorialUSD, 30000);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [cuentaUSD?.cbu, triggerRecarga]);

  const handleGuardarAlias = async () => {
    const aliasLimpio = inputAlias.trim().toLowerCase();
    if (!aliasLimpio) { setErrorAlias("El alias no puede estar vacío."); return; }

    const regexAlias = /^[a-z0-9.-]+$/;
    if (!regexAlias.test(aliasLimpio)) { setErrorAlias("Solo letras, números, puntos (.) y guiones (-)."); return; }

    try {
      setErrorAlias(''); setGuardandoAlias(true);
      const response = await fetch(`http://localhost:3001/api/personas/${cuentaVista.cbu}/alias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevoAlias: aliasLimpio })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "El alias ya se encuentra ocupado.");

      // La cuenta ARS refresca desde la base (viene por props); la de USD se guarda solo acá,
      // así que la actualizamos directo en el estado local.
      if (monedaActiva === 'USD') {
        setCuentaUSD(prev => ({ ...prev, alias: aliasLimpio }));
      } else if (actualizarDatosBase) {
        await actualizarDatosBase();
      }
      setEditandoAlias(false);
      alert("¡Alias actualizado exitosamente!");
    } catch (err) {
      setErrorAlias(err.message);
    } finally {
      setGuardandoAlias(false);
    }
  };

  const handleTransferenciaExitosa = (montoRestar, moneda = 'ARS') => {
    if (moneda === 'USD') {
      setSaldoEspejoUSD(prev => prev - montoRestar);
    } else {
      setSaldoEspejo(prev => prev - montoRestar);
    }
    setTriggerRecarga(prev => prev + 1);
  };

  const handleDepositoExitoso = (montoSumar, moneda = 'ARS') => {
    if (moneda === 'USD') {
      setSaldoEspejoUSD(prev => prev + montoSumar);
    } else {
      setSaldoEspejo(prev => prev + montoSumar);
    }
    setTriggerRecarga(prev => prev + 1);
  };

  const handleRecargaExitosa = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handlePagoServicioExitoso = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleMovimientoReserva = (monto, tipo) => {
    setSaldoEspejo(prev => tipo === 'aportar' ? prev - monto : prev + monto);
    setTriggerRecarga(prev => prev + 1);
  };

  const handlePagoTarjetaExitoso = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleConstituirPFExitoso = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleLiquidarPFExitoso = (montoSumar) => {
    setSaldoEspejo(prev => prev + montoSumar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleSolicitarPrestamoExitoso = (montoSumar) => {
    setSaldoEspejo(prev => prev + montoSumar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handlePagarCuotaPrestamoExitoso = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleContratarSeguroExitoso = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleOrdenCedearExitosa = (importe, tipoOrden) => {
    setSaldoEspejo(prev => tipoOrden === 'COMPRA' ? prev - importe : prev + importe);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleVolverAlInicio = () => {
    if (actualizarDatosBase) { actualizarDatosBase(); }
    setTriggerRecarga(prev => prev + 1);
    setVistaActual('inicio'); 
  };

  // 🎯 Historial de la cuenta que esté activa en el selector (ARS o USD) — el mismo selector
  // que se usa en Depositar/Transferencias, para que "cambiar de cuenta" sea coherente en toda la app.
  const movimientosActivos = monedaActiva === 'USD' ? movimientosUSD : movimientos;
  const cargandoMovsActivos = monedaActiva === 'USD' ? cargandoMovsUSD : cargandoMovs;

  // Categorías disponibles para el filtro: se arman a partir de los movimientos que realmente
  // llegaron (no hardcodeadas), así el combo se mantiene correcto cuando se sumen tipos nuevos.
  const categoriasDisponibles = [...new Set(movimientosActivos.map(m => m.tipo_movimiento).filter(Boolean))].sort();

  // 🎯 LÓGICA DE FILTRADO COMPLETA (Monto + Fechas + Categoría)
  const movimientosFiltrados = movimientosActivos.filter(m => {
    const montoMov = Math.abs(Number(m.monto || m.importe || 0));

    // Filtro de monto
    if (filtoMonto && montoMov < Number(filtoMonto)) return false;

    // Filtro de categoría
    if (filtroCategoria && m.tipo_movimiento !== filtroCategoria) return false;

    // Filtro de fechas
    const fechaMov = new Date(m.fecha_movimiento || m.fecha);
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00');
      if (fechaMov < desde) return false;
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59');
      if (fechaMov > hasta) return false;
    }

    return true;
  });

  // 🎯 CÓMPUTO DEL REPORTE DE INGRESOS Y EGRESOS (Basado en los movimientos que se están mostrando)
  const reporte = movimientosFiltrados.reduce((acc, m) => {
    const valor = Number(m.monto || m.importe || 0);
    if (valor > 0) {
      acc.ingresos += valor;
    } else {
      acc.egresos += Math.abs(valor);
    }
    return acc;
  }, { ingresos: 0, egresos: 0 });

  // 🎯 DESGLOSE POR CATEGORÍA (usa tipo_movimiento que ahora devuelve el backend)
  const resumenPorCategoria = movimientosFiltrados.reduce((acc, m) => {
    const categoria = m.tipo_movimiento || 'OTRO';
    const valor = Math.abs(Number(m.monto || m.importe || 0));
    acc[categoria] = (acc[categoria] || 0) + valor;
    return acc;
  }, {});

  const exportarCSV = () => {
    const encabezado = ['Fecha', 'Categoria', 'Detalle', 'Monto'];
    const filas = movimientosFiltrados.map(m => {
      const fecha = formatearFecha(m.fecha_movimiento || m.fecha);
      const categoria = m.tipo_movimiento || 'OTRO';
      const detalle = (m.descripcion || '').replace(/"/g, '""');
      const monto = Number(m.monto || m.importe || 0);
      return [fecha, categoria, `"${detalle}"`, monto].join(',');
    });
    const csv = [encabezado.join(','), ...filas].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimientos_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="dashboard-layout">
      {/* 🧭 SIDEBAR IZQUIERDA */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="Calamuchita Bank" className="sidebar-logo" />
          <div>
            <h3>Calamuchita BANK</h3>
            <span>WEALTH & SERENITY</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          <button className={`menu-item ${vistaActual === 'inicio' ? 'active' : ''}`} onClick={() => setVistaActual('inicio')}>
            <Home size={18} /> Inicio
          </button>
          <button className={`menu-item ${vistaActual === 'transferencias' ? 'active' : ''}`} onClick={() => setVistaActual('transferencias')}>
            <ArrowLeftRight size={18} /> Transferencias
          </button>
          <button className={`menu-item ${vistaActual === 'depositar' ? 'active' : ''}`} onClick={() => setVistaActual('depositar')}>
            <Wallet size={18} /> Depósitos
          </button>
          <button className={`menu-item ${vistaActual === 'recargas' ? 'active' : ''}`} onClick={() => setVistaActual('recargas')}>
            <Smartphone size={18} /> Recargas
          </button>
          <button className={`menu-item ${vistaActual === 'servicios' ? 'active' : ''}`} onClick={() => setVistaActual('servicios')}>
            <Receipt size={18} /> Pago de Servicios
          </button>
          <button className={`menu-item ${vistaActual === 'reservas' ? 'active' : ''}`} onClick={() => setVistaActual('reservas')}>
            <PiggyBank size={18} /> Reservas y Ahorros
          </button>
          <button className={`menu-item ${vistaActual === 'tarjeta' ? 'active' : ''}`} onClick={() => setVistaActual('tarjeta')}>
            <CreditCard size={18} /> Tarjeta de Crédito
          </button>
          <button className={`menu-item ${vistaActual === 'plazo-fijo' ? 'active' : ''}`} onClick={() => setVistaActual('plazo-fijo')}>
            <TrendingUp size={18} /> Plazo Fijo
          </button>
          <button className={`menu-item ${vistaActual === 'prestamos' ? 'active' : ''}`} onClick={() => setVistaActual('prestamos')}>
            <Landmark size={18} /> Préstamos
          </button>
          <button className={`menu-item ${vistaActual === 'seguros' ? 'active' : ''}`} onClick={() => setVistaActual('seguros')}>
            <Shield size={18} /> Seguros
          </button>
          <button className={`menu-item ${vistaActual === 'cedears' ? 'active' : ''}`} onClick={() => setVistaActual('cedears')}>
            <BarChart3 size={18} /> CEDEARs
          </button>
          <button className={`menu-item ${vistaActual === 'historial' ? 'active' : ''}`} onClick={() => setVistaActual('historial')}>
            <History size={18} /> Historial
          </button>
          <button className="menu-item disabled"><Settings size={18} /> Ajustes</button>
        </nav>

        <div className="profile-popup-wrapper" ref={menuPerfilRef}>
          {menuPerfilAbierto && (
            <div className="profile-popup">
              <h4><User size={16} /> Datos de Perfil</h4>
              <div className="profile-popup-fields">
                <p><strong>Nombre:</strong> <span className="profile-popup-nombre">{datosUsuario?.nombre} {datosUsuario?.apellido}</span></p>
                <p><strong>DNI:</strong> {datosUsuario?.dni || '---'}</p>
                <p><strong>Email:</strong> {datosUsuario?.email || '---'}</p>
                <p><strong>Teléfono:</strong> {datosUsuario?.telefono || '---'}</p>
                <p><strong>Dirección:</strong> {datosUsuario?.direccion || '---'}</p>
              </div>
              <button onClick={() => signOut()} className="btn-cerrar-sesion">
                <LogOut size={14} /> Cerrar Sesión
              </button>
            </div>
          )}

          <div className="sidebar-user" onClick={() => setMenuPerfilAbierto(!menuPerfilAbierto)}>
            <div className="user-avatar">{datosUsuario?.nombre?.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <p className="user-name">{datosUsuario?.nombre} {datosUsuario?.apellido}</p>
              <span className="user-status">Ver perfil</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 💻 CONTENIDO DINÁMICO */}
      <main className="main-content">
        
        <header className="main-header" style={{ marginBottom: '32px' }}>
          <div className="main-header-left">
            {vistaActual === 'inicio' && (
              <div className="welcome-section" style={{ margin: 0 }}>
                <h1 style={{ fontSize: '24px', margin: 0 }}>¡Hola de nuevo, {datosUsuario?.nombre}!</h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px' }}>Gestiona tu serenidad financiera hoy.</p>
              </div>
            )}
            {vistaActual === 'transferencias' && <h2>Módulo de Transferencias</h2>}
            {vistaActual === 'depositar' && <h2>Módulo de Depósitos</h2>}
            {vistaActual === 'recargas' && <h2>Recarga de Celular</h2>}
            {vistaActual === 'servicios' && <h2>Pago de Servicios</h2>}
            {vistaActual === 'reservas' && <h2>Reservas y Ahorros</h2>}
            {vistaActual === 'tarjeta' && <h2>Tarjeta de Crédito</h2>}
            {vistaActual === 'plazo-fijo' && <h2>Plazo Fijo</h2>}
            {vistaActual === 'prestamos' && <h2>Préstamos</h2>}
            {vistaActual === 'seguros' && <h2>Seguros</h2>}
            {vistaActual === 'cedears' && <h2>Inversiones en CEDEARs</h2>}
            {vistaActual === 'historial' && <h2>Historial General</h2>}
          </div>
          
          <div className="header-actions">
            <div className="header-balance-indicator">
              <span>SALDO {cuentaVista?.moneda === 'USD' ? '(USD)' : 'TOTAL'}</span>
              <strong>{formatearMoneda(cuentaVista?.saldo, cuentaVista?.moneda)}</strong>
            </div>
          </div>
        </header>

        {/* 1. VISTA INICIO (DISEÑO INTACTO, SOLO CORREGIDA LA VARIABLE DE TEXTO) */}
        {vistaActual === 'inicio' && (
          <>
            <div className="dashboard-grid">
              <div className="grid-left">
                
                <div className="balance-card">
                  <div className="balance-header">
                    <span>SALDO {cuentaVista?.moneda === 'USD' ? 'EN USD' : 'TOTAL DISPONIBLE'}</span>
                    <button
                      onClick={() => setMostrarSaldo(!mostrarSaldo)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0',
                        color: 'white',
                        opacity: '0.8',
                        transition: 'opacity 0.2s',
                        display: 'flex'
                      }}
                      title={mostrarSaldo ? "Ocultar saldo" : "Mostrar saldo"}
                    >
                      {mostrarSaldo ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <h2 className="balance-amount">{formatearMoneda(cuentaVista?.saldo, cuentaVista?.moneda)}</h2>
                  <div className="balance-details">
                    <p><strong>CBU:</strong> <span className="mono-text">{cuentaVista?.cbu}</span></p>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexDirection: 'column', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <strong>Alias:</strong>
                        {editandoAlias ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="text"
                              value={inputAlias}
                              onChange={(e) => setInputAlias(e.target.value)}
                              disabled={guardandoAlias}
                              style={{ color: '#333', padding: '3px 8px', borderRadius: '4px', border: 'none', fontSize: '13px', outline: 'none', width: '180px' }}
                            />
                            <button onClick={handleGuardarAlias} disabled={guardandoAlias} style={{ display: 'flex', background: '#2e7d32', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                              {guardandoAlias ? '...' : <Check size={14} />}
                            </button>
                            <button onClick={() => { setEditandoAlias(false); setErrorAlias(''); setInputAlias(cuentaVista?.alias || ''); }} disabled={guardandoAlias} style={{ display: 'flex', background: '#d32f2f', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="mono-text" style={{ fontSize: '14px' }}>{cuentaVista?.alias || 'sin.alias.registrado'}</span>
                            <button onClick={() => { setInputAlias(cuentaVista?.alias || ''); setEditandoAlias(true); }} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.2)', border: 'none', color: '#fff', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              <Pencil size={11} /> Editar
                            </button>
                          </>
                        )}
                      </div>
                      {errorAlias && <span style={{ color: '#ffcdd2', fontSize: '11px', backgroundColor: 'rgba(211, 47, 47, 0.4)', padding: '2px 8px', borderRadius: '4px', marginTop: '2px' }}>{errorAlias}</span>}
                    </div>
                  </div>
                </div>

                <div className="actions-container">
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('transferencias')}>
                    <div className="action-icon"><Send size={24} /></div>
                    <span>Transferencias</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('depositar')}>
                    <div className="action-icon"><Download size={24} /></div>
                    <span>Cargar Dinero</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('recargas')}>
                    <div className="action-icon"><Smartphone size={24} /></div>
                    <span>Recarga de Celular</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('servicios')}>
                    <div className="action-icon"><Receipt size={24} /></div>
                    <span>Pago de Servicios</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('reservas')}>
                    <div className="action-icon"><PiggyBank size={24} /></div>
                    <span>Reservas y Ahorros</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('tarjeta')}>
                    <div className="action-icon"><CreditCard size={24} /></div>
                    <span>Tarjeta de Crédito</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('plazo-fijo')}>
                    <div className="action-icon"><TrendingUp size={24} /></div>
                    <span>Plazo Fijo</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('prestamos')}>
                    <div className="action-icon"><Landmark size={24} /></div>
                    <span>Préstamos</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('seguros')}>
                    <div className="action-icon"><Shield size={24} /></div>
                    <span>Seguros</span>
                  </button>
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('cedears')}>
                    <div className="action-icon"><BarChart3 size={24} /></div>
                    <span>CEDEARs</span>
                  </button>
                </div>

                <div className="transactions-section">
                  <div className="transactions-header">
                    <h3>Movimientos recientes {cuentaVista?.moneda === 'USD' ? '(USD)' : ''}</h3>
                    <button className="btn-see-all" onClick={() => setVistaActual('historial')}>Ver todos</button>
                  </div>

                  <div className="transactions-list">
                    {cargandoMovsActivos ? (
                      <p className="tx-empty-msg">Actualizando con el Central...</p>
                    ) : movimientosActivos.length === 0 ? (
                      <p className="tx-empty-msg">No registrás movimientos en esta cuenta aún.</p>
                    ) : (
                      movimientosActivos.slice(0, 3).map((tx) => {
                        const valorMonto = Number(tx.monto || tx.importe || 0);
                        const esIngreso = valorMonto > 0;

                        return (
                          <div className="transaction-item" key={tx.id_movimiento || tx.id}>
                            <div className={`tx-icon-container ${esIngreso ? 'tx-in' : 'tx-out'}`}>
                              {esIngreso ? <Download size={16} /> : <Send size={16} />}
                            </div>
                            <div className="tx-info">
                              <p className="tx-description">
                                {tx.descripcion || tx.desc || (esIngreso ? 'Transferencia Recibida' : 'Transferencia Enviada')}
                              </p>
                              <span className="tx-date">{formatearFecha(tx.fecha_movimiento || tx.fecha)}</span>
                            </div>
                            <span className={`tx-amount ${esIngreso ? 'positive' : 'negative'}`}>
                              {esIngreso ? '+' : ''}{formatearMoneda(valorMonto, cuentaVista?.moneda)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="grid-right">
                <div className="cards-panel">
                  <h4>Mis Productos</h4>
                  <div
                    className={`bank-product-badge clicable ${monedaActiva === 'ARS' ? 'activo' : ''}`}
                    onClick={() => setMonedaActiva('ARS')}
                  >
                    <span className="badge-icon"><Briefcase size={20} /></span>
                    <div>
                      <strong>Cuenta Corriente</strong>
                      <p>{formatearMoneda(saldoEspejo)}</p>
                    </div>
                  </div>

                  {cuentaUSD ? (
                    <div
                      className={`bank-product-badge clicable ${monedaActiva === 'USD' ? 'activo' : ''}`}
                      onClick={() => setMonedaActiva('USD')}
                    >
                      <span className="badge-icon"><DollarSign size={20} /></span>
                      <div>
                        <strong>Cuenta en USD</strong>
                        <p>{formatearMoneda(saldoEspejoUSD, 'USD')}</p>
                      </div>
                    </div>
                  ) : (
                    <button className="btn-abrir-usd-panel" onClick={handleAbrirCuentaUSD} disabled={abriendoCuentaUSD}>
                      {abriendoCuentaUSD ? 'Abriendo...' : (<><Plus size={14} /> Abrir Cuenta en USD</>)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 2. VISTA FORMULARIO TRANSFERENCIA */}
        {vistaActual === 'transferencias' && (
          <Transferencias
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            cuentas={cuentasDisponibles}
            monedaActiva={monedaActiva}
            onCambiarMoneda={setMonedaActiva}
            mostrarAbrirUSD={!cuentaUSD}
            onAbrirUSD={handleAbrirCuentaUSD}
            abriendoUSD={abriendoCuentaUSD}
            alTransferirExitosa={handleTransferenciaExitosa}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3. VISTA FORMULARIO DEPÓSITOS */}
        {vistaActual === 'depositar' && (
          <Depositar
            datosUsuario={datosUsuario}
            cuentas={cuentasDisponibles}
            monedaActiva={monedaActiva}
            onCambiarMoneda={setMonedaActiva}
            mostrarAbrirUSD={!cuentaUSD}
            onAbrirUSD={handleAbrirCuentaUSD}
            abriendoUSD={abriendoCuentaUSD}
            alDepositarExitoso={handleDepositoExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.5. VISTA FORMULARIO RECARGAS */}
        {vistaActual === 'recargas' && (
          <Recargas
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alRecargarExitoso={handleRecargaExitosa}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.6. VISTA PAGO DE SERVICIOS */}
        {vistaActual === 'servicios' && (
          <PagoServicios
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alPagarExitoso={handlePagoServicioExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.7. VISTA RESERVAS Y AHORROS */}
        {vistaActual === 'reservas' && (
          <Reservas
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alMovimientoExitoso={handleMovimientoReserva}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.8. VISTA TARJETA DE CRÉDITO */}
        {vistaActual === 'tarjeta' && (
          <Tarjeta
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alPagoExitoso={handlePagoTarjetaExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.9. VISTA PLAZO FIJO */}
        {vistaActual === 'plazo-fijo' && (
          <PlazoFijo
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alConstituirExitoso={handleConstituirPFExitoso}
            alLiquidarExitoso={handleLiquidarPFExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.10. VISTA PRÉSTAMOS */}
        {vistaActual === 'prestamos' && (
          <Prestamos
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alSolicitarExitoso={handleSolicitarPrestamoExitoso}
            alPagarExitoso={handlePagarCuotaPrestamoExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.11. VISTA SEGUROS */}
        {vistaActual === 'seguros' && (
          <Seguros
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alContratarExitoso={handleContratarSeguroExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.12. VISTA CEDEARS */}
        {vistaActual === 'cedears' && (
          <Cedears
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}}
            alOrdenExitosa={handleOrdenCedearExitosa}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 4. VISTA HISTORIAL COMPLETO (CON FILTROS DE FECHA Y REPORTES) */}
        {vistaActual === 'historial' && (
          <div className="history-page-container">

            {/* 🎯 Selector de cuenta: historial separado por ARS/USD, mismo selector que Depositar/Transferencias */}
            <SelectorCuenta
              cuentas={cuentasDisponibles}
              monedaActiva={monedaActiva}
              onCambiarMoneda={setMonedaActiva}
              mostrarAbrirUSD={!cuentaUSD}
              onAbrirUSD={handleAbrirCuentaUSD}
              abriendoUSD={abriendoCuentaUSD}
            />

            {/* 🎯 ESTADÍSTICAS: colapsable, no ocupa espacio fijo si no se quiere ver */}
            <div className="stats-collapsible">
              <button
                className="stats-toggle-header"
                onClick={() => setMostrarEstadisticas(!mostrarEstadisticas)}
              >
                <span className="stats-toggle-label"><BarChart3 size={16} /> Estadísticas del período</span>
                <span className={`stats-toggle-arrow ${mostrarEstadisticas ? 'open' : ''}`}>▾</span>
              </button>

              {mostrarEstadisticas && (
                <div className="stats-content">
                  <div className="stats-summary-grid">
                    <div className="stats-summary-card stats-ingresos">
                      <span>TOTAL INGRESOS (FILTRADO)</span>
                      <h3>{formatearMoneda(reporte.ingresos, monedaActiva)}</h3>
                    </div>
                    <div className="stats-summary-card stats-egresos">
                      <span>TOTAL EGRESOS (FILTRADO)</span>
                      <h3>{formatearMoneda(reporte.egresos, monedaActiva)}</h3>
                    </div>
                  </div>

                  {Object.keys(resumenPorCategoria).length > 0 && (
                    <div className="stats-category-grid">
                      {Object.entries(resumenPorCategoria).map(([categoria, monto]) => (
                        <div key={categoria} className="stats-category-card">
                          <span>{categoria.replace(/_/g, ' ')}</span>
                          <h4>{formatearMoneda(monto, monedaActiva)}</h4>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="history-header-layout">
              <div>
                <p className="subtitle-gray">Controla tus finanzas con la claridad de las aguas de Calamuchita.</p>
              </div>
              <div className="history-actions-top">
                <button className="btn-export-alt" onClick={exportarCSV} disabled={movimientosFiltrados.length === 0}><Download size={14} /> Exportar</button>
                <button className="btn-new-payment-alt" onClick={() => setVistaActual('transferencias')}>+ Nueva Transferencia</button>
              </div>
            </div>

            {/* 🎯 PANEL DE FILTROS (FECHAS, MONTO Y CATEGORÍA) */}
            <div className="filters-card-box">
              <div className="filter-field">
                <label>Desde fecha</label>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="filter-input filter-input-date" />
              </div>
              <div className="filter-field">
                <label>Hasta fecha</label>
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="filter-input filter-input-date" />
              </div>
              <div className="filter-field">
                <label>Monto mínimo</label>
                <input type="number" placeholder="$ 0" value={filtoMonto} onChange={(e) => setFiltroMonto(e.target.value)} className="filter-input" />
              </div>
              <div className="filter-field">
                <label>Categoría</label>
                <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="filter-input">
                  <option value="">Todas</option>
                  {categoriasDisponibles.map(cat => (
                    <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              {/* Botón para limpiar de golpe los filtros */}
              <button className="btn-clear-filters" onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroMonto(''); setFiltroCategoria(''); }}>
                Limpiar Filtros
              </button>
            </div>

            <div className="history-table-wrapper">
              <table className="history-table-element">
                <thead>
                  <tr>
                    <th>Fecha / Info</th>
                    <th>Detalle</th>
                    <th>Categoría</th>
                    <th className="text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoMovsActivos && movimientosActivos.length === 0 ? (
                    <tr><td colSpan="4" className="table-empty-row">Cargando movimientos...</td></tr>
                  ) : movimientosFiltrados.length === 0 ? (
                    <tr><td colSpan="4" className="table-empty-row">No se encontraron movimientos registrados en este período.</td></tr>
                  ) : (
                    movimientosFiltrados.map((tx, index) => {
                      const valorMonto = Number(tx.monto || tx.importe || 0);
                      const esIngreso = valorMonto > 0;
                      const tableRowKey = tx.id_movimiento || tx.id || `table-row-${index}`;

                      return (
                        <tr key={tableRowKey}>
                          <td className="date-cell">{formatearFecha(tx.fecha_movimiento || tx.fecha)}</td>
                          <td>
                            <div className="detail-cell-info">
                              {/* 🎯 CORRECCIÓN CLAVE: Muestra la descripción exacta de Postgres */}
                              <strong>{tx.descripcion || tx.desc || (esIngreso ? 'Transferencia recibida' : 'Transferencia enviada')}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="badge-category-table">
                              {tx.tipo_movimiento ? tx.tipo_movimiento.replace(/_/g, ' ') : (esIngreso ? 'INGRESO' : 'EGRESO')}
                            </span>
                          </td>
                          <td className={`text-right font-bold-amount ${esIngreso ? 'positive-color' : 'negative-color'}`}>
                            {esIngreso ? '+ ' : '- '}{formatearMoneda(Math.abs(valorMonto), monedaActiva)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <div className="table-footer-pagination">
                <span>Mostrando {movimientosFiltrados.length} de {movimientosActivos.length} movimientos totales</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}