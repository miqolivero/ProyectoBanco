import { useState, useEffect, useRef } from 'react';
import { useClerk } from '@clerk/clerk-react';
import * as XLSX from 'xlsx';
import {
  Home, ArrowLeftRight, Receipt, CreditCard,
  TrendingUp, TrendingDown, Landmark, BarChart3, History, Settings, User, LogOut,
  Eye, EyeOff, Pencil, Check, X, DollarSign, Send, Download, Briefcase, Plus,
  ChevronDown, ChevronRight, Layers, CalendarRange, Hash, Bot
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
import CambioDivisa from '../CambioDivisa/CambioDivisa';
import Ajustes from '../Ajustes/Ajustes';
import SelectorCuenta from '../SelectorCuenta/SelectorCuenta';
import ComprobanteMovimiento from '../ComprobanteMovimiento/ComprobanteMovimiento';
import Asistente from '../Asistente/Asistente';
import './InicioBanco.css';
import { API_URL } from '../../config/api';

// 🎯 Sidebar agrupada en subcategorías: en vez de 14 items sueltos, los que comparten
// "familia" quedan dentro de un grupo colapsable. Historial queda suelto a propósito (no es
// "un movimiento", es la vista de todos ellos) y lo mismo Ajustes.
const GRUPOS_MENU = {
  movimientos: ['transferencias', 'depositar'],
  pagos: ['servicios', 'recargas', 'seguros'],
  inversiones: ['plazo-fijo', 'cedears', 'cambio', 'reservas'],
  credito: ['tarjeta', 'prestamos'],
};

function grupoDeVista(vista) {
  return Object.keys(GRUPOS_MENU).find(g => GRUPOS_MENU[g].includes(vista)) || null;
}

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

  // Comprobante virtual: se abre al hacer click en cualquier movimiento (tanto en "Movimientos
  // recientes" de Inicio como en la tabla completa de Historial).
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState(null);

  const [mostrarSaldo, setMostrarSaldo] = useState(true);
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false);
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);
  const menuPerfilRef = useRef(null);

  // Grupos colapsables de la sidebar — arrancan cerrados, y se abren solos si el usuario
  // llega a una vista de ese grupo desde otro lado (ej. una tarjeta del dashboard).
  // Un solo grupo abierto a la vez (acordeón): abrir uno cierra el que estuviera abierto antes.
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const toggleGrupoMenu = (grupo) => setGrupoAbierto(prev => (prev === grupo ? null : grupo));

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
        const res = await fetch(`${API_URL}/api/personas/${datosUsuario.id}/cuenta-usd`);
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
      const res = await fetch(`${API_URL}/api/personas/${datosUsuario.id}/cuenta-usd`, { method: 'POST' });
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

  // Si se llega a una vista agrupada desde otro lado (una tarjeta del dashboard, "Ver todos"
  // del historial, etc.) el grupo correspondiente se abre solo, para que el ítem activo de la
  // sidebar no quede escondido dentro de un grupo colapsado. Mismo patrón de "ajustar estado
  // durante el render" que saldoEspejo/inputAlias más abajo, en vez de un useEffect.
  const [ultimaVistaParaGrupo, setUltimaVistaParaGrupo] = useState(vistaActual);
  if (vistaActual !== ultimaVistaParaGrupo) {
    setUltimaVistaParaGrupo(vistaActual);
    const grupo = grupoDeVista(vistaActual);
    if (grupo) setGrupoAbierto(grupo);
  }

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
      const response = await fetch(`${API_URL}/api/movimientos/historial?cbu=${miCbuLimpio}`);
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
        const resSync = await fetch(`${API_URL}/api/movimientos/sincronizar?minutos=30&cbu=${miCbuLimpio}`);
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
  }, [datosUsuario?.cbu, triggerRecarga, actualizarDatosBase]);

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
        const response = await fetch(`${API_URL}/api/movimientos/historial?cbu=${cuentaUSD.cbu}`);
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
      const response = await fetch(`${API_URL}/api/personas/${cuentaVista.cbu}/alias`, {
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

  // Cambio de divisa toca las DOS cuentas a la vez: resta de la de origen, suma en la de destino.
  const handleCambioDivisaExitoso = (montoOrigen, monedaOrigen, montoDestino, monedaDestino) => {
    if (monedaOrigen === 'USD') setSaldoEspejoUSD(prev => prev - montoOrigen);
    else setSaldoEspejo(prev => prev - montoOrigen);

    if (monedaDestino === 'USD') setSaldoEspejoUSD(prev => prev + montoDestino);
    else setSaldoEspejo(prev => prev + montoDestino);

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
  const totalCategorizado = Object.values(resumenPorCategoria).reduce((a, b) => a + b, 0);
  const categoriasOrdenadas = Object.entries(resumenPorCategoria).sort((a, b) => b[1] - a[1]);
  const maxCategoria = categoriasOrdenadas.length > 0 ? categoriasOrdenadas[0][1] : 0;

  // 🎯 EVOLUCIÓN MENSUAL: agrupa ingresos/egresos por mes calendario (orden cronológico real,
  // no alfabético — se ordena por la clave "YYYY-MM" antes de formatear la etiqueta visible).
  const resumenMensual = (() => {
    const porMes = movimientosFiltrados.reduce((acc, m) => {
      const fecha = new Date(m.fecha_movimiento || m.fecha);
      if (isNaN(fecha.getTime())) return acc;
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[clave]) acc[clave] = { ingresos: 0, egresos: 0, fecha };
      const valor = Number(m.monto || m.importe || 0);
      if (valor > 0) acc[clave].ingresos += valor; else acc[clave].egresos += Math.abs(valor);
      return acc;
    }, {});
    return Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, datos]) => ({
        clave,
        etiqueta: new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' }).format(datos.fecha),
        ingresos: datos.ingresos,
        egresos: datos.egresos,
      }));
  })();
  const maxMensual = Math.max(1, ...resumenMensual.flatMap(m => [m.ingresos, m.egresos]));

  const cantidadMovimientos = movimientosFiltrados.length;
  const promedioMovimiento = cantidadMovimientos > 0
    ? (reporte.ingresos + reporte.egresos) / cantidadMovimientos
    : 0;

  // 🎯 Exportación real a Excel (.xlsx, 3 hojas) en vez del CSV plano anterior — mismos datos,
  // pero legibles directamente en Excel: encabezados con ancho fijo, montos numéricos (no texto)
  // y separados en pestañas por tipo de reporte en vez de todo apilado en una sola tabla.
  const exportarExcel = () => {
    const libro = XLSX.utils.book_new();

    const hojaMovimientos = XLSX.utils.json_to_sheet(movimientosFiltrados.map(m => ({
      Fecha: formatearFecha(m.fecha_movimiento || m.fecha),
      Categoría: (m.tipo_movimiento || 'OTRO').replace(/_/g, ' '),
      Detalle: m.descripcion || '',
      Monto: Number(m.monto || m.importe || 0),
    })));
    hojaMovimientos['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 40 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(libro, hojaMovimientos, 'Movimientos');

    const hojaCategorias = XLSX.utils.json_to_sheet(categoriasOrdenadas.map(([categoria, monto]) => ({
      Categoría: categoria.replace(/_/g, ' '),
      Monto: monto,
      '% del total': totalCategorizado > 0 ? Number(((monto / totalCategorizado) * 100).toFixed(1)) : 0,
    })));
    hojaCategorias['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(libro, hojaCategorias, 'Por categoría');

    const hojaMensual = XLSX.utils.json_to_sheet(resumenMensual.map(m => ({
      Mes: m.etiqueta,
      Ingresos: m.ingresos,
      Egresos: m.egresos,
      Balance: m.ingresos - m.egresos,
    })));
    hojaMensual['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(libro, hojaMensual, 'Resumen mensual');

    XLSX.writeFile(libro, `estadisticas_calamuchita_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          <button className={`menu-item menu-item-inicio ${vistaActual === 'inicio' ? 'active' : ''}`} onClick={() => setVistaActual('inicio')}>
            <Home size={18} /> Inicio
          </button>

          <div className="menu-group">
            <button
              className={`menu-group-header ${grupoDeVista(vistaActual) === 'movimientos' ? 'active' : ''}`}
              onClick={() => toggleGrupoMenu('movimientos')}
              aria-expanded={(grupoAbierto === 'movimientos')}
            >
              <span className="menu-group-label"><ArrowLeftRight size={18} /> Movimientos</span>
              {(grupoAbierto === 'movimientos') ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <div className={`menu-group-items ${(grupoAbierto === 'movimientos') ? 'abierto' : ''}`}>
              <button className={`menu-item sub ${vistaActual === 'transferencias' ? 'active' : ''}`} onClick={() => setVistaActual('transferencias')}>
                Transferencias
              </button>
              <button className={`menu-item sub ${vistaActual === 'depositar' ? 'active' : ''}`} onClick={() => setVistaActual('depositar')}>
                Depósitos
              </button>
            </div>
          </div>

          <button className={`menu-item ${vistaActual === 'historial' ? 'active' : ''}`} onClick={() => setVistaActual('historial')}>
            <History size={18} /> Historial
          </button>

          <div className="menu-group">
            <button
              className={`menu-group-header ${grupoDeVista(vistaActual) === 'pagos' ? 'active' : ''}`}
              onClick={() => toggleGrupoMenu('pagos')}
              aria-expanded={(grupoAbierto === 'pagos')}
            >
              <span className="menu-group-label"><Receipt size={18} /> Pagos</span>
              {(grupoAbierto === 'pagos') ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <div className={`menu-group-items ${(grupoAbierto === 'pagos') ? 'abierto' : ''}`}>
              <button className={`menu-item sub ${vistaActual === 'servicios' ? 'active' : ''}`} onClick={() => setVistaActual('servicios')}>
                Pago de Servicios
              </button>
              <button className={`menu-item sub ${vistaActual === 'recargas' ? 'active' : ''}`} onClick={() => setVistaActual('recargas')}>
                Recargas
              </button>
              <button className={`menu-item sub ${vistaActual === 'seguros' ? 'active' : ''}`} onClick={() => setVistaActual('seguros')}>
                Seguros
              </button>
            </div>
          </div>

          <div className="menu-group">
            <button
              className={`menu-group-header ${grupoDeVista(vistaActual) === 'inversiones' ? 'active' : ''}`}
              onClick={() => toggleGrupoMenu('inversiones')}
              aria-expanded={(grupoAbierto === 'inversiones')}
            >
              <span className="menu-group-label"><TrendingUp size={18} /> Inversiones</span>
              {(grupoAbierto === 'inversiones') ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <div className={`menu-group-items ${(grupoAbierto === 'inversiones') ? 'abierto' : ''}`}>
              <button className={`menu-item sub ${vistaActual === 'plazo-fijo' ? 'active' : ''}`} onClick={() => setVistaActual('plazo-fijo')}>
                Plazo Fijo
              </button>
              <button className={`menu-item sub ${vistaActual === 'cedears' ? 'active' : ''}`} onClick={() => setVistaActual('cedears')}>
                CEDEARs
              </button>
              <button className={`menu-item sub ${vistaActual === 'cambio' ? 'active' : ''}`} onClick={() => setVistaActual('cambio')}>
                Cambio de Divisa
              </button>
              <button className={`menu-item sub ${vistaActual === 'reservas' ? 'active' : ''}`} onClick={() => setVistaActual('reservas')}>
                Reservas y Ahorros
              </button>
            </div>
          </div>

          <div className="menu-group">
            <button
              className={`menu-group-header ${grupoDeVista(vistaActual) === 'credito' ? 'active' : ''}`}
              onClick={() => toggleGrupoMenu('credito')}
              aria-expanded={(grupoAbierto === 'credito')}
            >
              <span className="menu-group-label"><CreditCard size={18} /> Crédito</span>
              {(grupoAbierto === 'credito') ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <div className={`menu-group-items ${(grupoAbierto === 'credito') ? 'abierto' : ''}`}>
              <button className={`menu-item sub ${vistaActual === 'tarjeta' ? 'active' : ''}`} onClick={() => setVistaActual('tarjeta')}>
                Tarjeta de Crédito
              </button>
              <button className={`menu-item sub ${vistaActual === 'prestamos' ? 'active' : ''}`} onClick={() => setVistaActual('prestamos')}>
                Préstamos
              </button>
            </div>
          </div>

          <button className={`menu-item ${vistaActual === 'asistente' ? 'active' : ''}`} onClick={() => setVistaActual('asistente')}>
            <Bot size={18} /> Calamuchita IA
          </button>

          <button className={`menu-item ${vistaActual === 'ajustes' ? 'active' : ''}`} onClick={() => setVistaActual('ajustes')}>
            <Settings size={18} /> Ajustes
          </button>
        </nav>

        <div className="profile-popup-wrapper" ref={menuPerfilRef}>
          {menuPerfilAbierto && (
            <div className="profile-popup">
              <div className="profile-popup-banner">
                <span className="profile-popup-marca-agua" aria-hidden="true">C</span>
                <div className="profile-popup-avatar">{datosUsuario?.nombre?.charAt(0).toUpperCase()}</div>
                <div>
                  <strong className="profile-popup-nombre">{datosUsuario?.nombre} {datosUsuario?.apellido}</strong>
                  <span className="profile-popup-subtitulo"><User size={11} /> Datos de Perfil</span>
                </div>
              </div>
              <div className="profile-popup-fields">
                <div className="profile-popup-row">
                  <span className="profile-popup-label">DNI</span>
                  <span className="profile-popup-valor">{datosUsuario?.dni || '---'}</span>
                </div>
                <div className="profile-popup-row">
                  <span className="profile-popup-label">Email</span>
                  <span className="profile-popup-valor">{datosUsuario?.email || '---'}</span>
                </div>
                <div className="profile-popup-row">
                  <span className="profile-popup-label">Teléfono</span>
                  <span className="profile-popup-valor">{datosUsuario?.telefono || '---'}</span>
                </div>
                <div className="profile-popup-row">
                  <span className="profile-popup-label">Dirección</span>
                  <span className="profile-popup-valor">{datosUsuario?.direccion || '---'}</span>
                </div>
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
        
        {/* 🎯 El header fijo con el "saldo total" en una pill quedaba muy vacío en pantallas que
            no son Inicio (ese dato ya se repite en el balance-card / cards-panel de cada
            pantalla). Ahora el header completo es exclusivo de Inicio: solo el saludo. */}
        {vistaActual === 'inicio' && (
          <header className="main-header">
            <div className="welcome-section">
              <h1>¡Hola de nuevo, {datosUsuario?.nombre}!</h1>
              <p>Gestiona tu serenidad financiera hoy.</p>
            </div>
          </header>
        )}

        {/* 1. VISTA INICIO (DISEÑO INTACTO, SOLO CORREGIDA LA VARIABLE DE TEXTO) */}
        {vistaActual === 'inicio' && (
          <>
            <div className="dashboard-grid">
              <div className="grid-left">
                
                <div className="balance-card">
                  <span className="balance-marca-agua" aria-hidden="true">C</span>
                  <div className="balance-header">
                    <span>SALDO {cuentaVista?.moneda === 'USD' ? 'EN USD' : 'TOTAL DISPONIBLE'}</span>
                    <button
                      className="balance-toggle-btn"
                      onClick={() => setMostrarSaldo(!mostrarSaldo)}
                      title={mostrarSaldo ? "Ocultar saldo" : "Mostrar saldo"}
                    >
                      {mostrarSaldo ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <h2 className="balance-amount">{formatearMoneda(cuentaVista?.saldo, cuentaVista?.moneda)}</h2>
                  <div className="balance-details">
                    <div className="balance-detail-row">
                      <span className="balance-detail-label">CBU</span>
                      <span className="mono-text balance-detail-valor">{cuentaVista?.cbu}</span>
                    </div>

                    <div className="balance-detail-row">
                      <span className="balance-detail-label">Alias</span>
                      {editandoAlias ? (
                        <div className="balance-alias-edit-group">
                          <input
                            type="text"
                            value={inputAlias}
                            onChange={(e) => setInputAlias(e.target.value)}
                            disabled={guardandoAlias}
                            className="balance-alias-input"
                          />
                          <button onClick={handleGuardarAlias} disabled={guardandoAlias} className="btn-alias-save" title="Guardar">
                            {guardandoAlias ? '...' : <Check size={14} />}
                          </button>
                          <button onClick={() => { setEditandoAlias(false); setErrorAlias(''); setInputAlias(cuentaVista?.alias || ''); }} disabled={guardandoAlias} className="btn-alias-cancel" title="Cancelar">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="balance-alias-view">
                          <span className="mono-text balance-detail-valor">{cuentaVista?.alias || 'sin.alias.registrado'}</span>
                          <button onClick={() => { setInputAlias(cuentaVista?.alias || ''); setEditandoAlias(true); }} className="btn-alias-edit">
                            <Pencil size={11} /> Editar
                          </button>
                        </div>
                      )}
                    </div>
                    {errorAlias && <span className="balance-alias-error">{errorAlias}</span>}
                  </div>
                </div>

                <div className="actions-container">
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('transferencias')}>
                    <div className="action-icon"><Send size={24} /></div>
                    <span>Transferencias</span>
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
                          <div
                            className="transaction-item clicable"
                            key={tx.id_movimiento || tx.id}
                            onClick={() => setMovimientoSeleccionado(tx)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') setMovimientoSeleccionado(tx); }}
                          >
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

        {/* 3.12.1 VISTA CAMBIO DE DIVISA */}
        {vistaActual === 'cambio' && (
          <CambioDivisa
            datosUsuario={datosUsuario}
            cuentas={cuentasDisponibles}
            monedaActiva={monedaActiva}
            onCambiarMoneda={setMonedaActiva}
            mostrarAbrirUSD={!cuentaUSD}
            onAbrirUSD={handleAbrirCuentaUSD}
            abriendoUSD={abriendoCuentaUSD}
            alCambioExitoso={handleCambioDivisaExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 3.12.5. VISTA ASISTENTE IA — sin props: se autentica solo con el token de Clerk que
            ya manda el fetch parcheado (ver config/api.js), no hace falta pasarle datosUsuario. */}
        {vistaActual === 'asistente' && <Asistente />}

        {/* 3.13. VISTA AJUSTES DE PERFIL */}
        {vistaActual === 'ajustes' && (
          <Ajustes
            datosUsuario={datosUsuario}
            alActualizarExitoso={actualizarDatosBase}
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

                  {/* 1. RESUMEN GENERAL */}
                  <div className="stats-subsection">
                    <h4 className="stats-subsection-title"><Layers size={13} /> Resumen general</h4>
                    <div className="stats-summary-grid">
                      <div className="stats-summary-card stats-ingresos">
                        <span><TrendingUp size={12} /> INGRESOS</span>
                        <h3>{formatearMoneda(reporte.ingresos, monedaActiva)}</h3>
                      </div>
                      <div className="stats-summary-card stats-egresos">
                        <span><TrendingDown size={12} /> EGRESOS</span>
                        <h3>{formatearMoneda(reporte.egresos, monedaActiva)}</h3>
                      </div>
                      <div className={`stats-summary-card ${(reporte.ingresos - reporte.egresos) >= 0 ? 'stats-ingresos' : 'stats-egresos'}`}>
                        <span><DollarSign size={12} /> BALANCE NETO</span>
                        <h3>{formatearMoneda(reporte.ingresos - reporte.egresos, monedaActiva)}</h3>
                      </div>
                      <div className="stats-summary-card stats-neutral">
                        <span><Hash size={12} /> MOVIMIENTOS</span>
                        <h3>{cantidadMovimientos}</h3>
                      </div>
                      <div className="stats-summary-card stats-neutral">
                        <span><BarChart3 size={12} /> PROMEDIO / MOV.</span>
                        <h3>{formatearMoneda(promedioMovimiento, monedaActiva)}</h3>
                      </div>
                    </div>
                  </div>

                  {/* 2. POR CATEGORÍA */}
                  {categoriasOrdenadas.length > 0 && (
                    <div className="stats-subsection">
                      <h4 className="stats-subsection-title"><Receipt size={13} /> Por categoría</h4>
                      <div className="stats-category-list">
                        {categoriasOrdenadas.map(([categoria, monto]) => {
                          const porcentaje = totalCategorizado > 0 ? (monto / totalCategorizado) * 100 : 0;
                          return (
                            <div key={categoria} className="stats-category-row">
                              <div className="stats-category-row-top">
                                <span className="stats-category-nombre">{categoria.replace(/_/g, ' ')}</span>
                                <span className="stats-category-monto">{formatearMoneda(monto, monedaActiva)} <em>({porcentaje.toFixed(1)}%)</em></span>
                              </div>
                              <div className="stats-category-bar-track">
                                <div
                                  className="stats-category-bar-fill"
                                  style={{ width: `${maxCategoria > 0 ? (monto / maxCategoria) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. EVOLUCIÓN MENSUAL */}
                  {resumenMensual.length > 0 && (
                    <div className="stats-subsection">
                      <h4 className="stats-subsection-title"><CalendarRange size={13} /> Evolución mensual</h4>
                      <div className="stats-monthly-chart">
                        {resumenMensual.map(mes => (
                          <div key={mes.clave} className="stats-monthly-col">
                            <div className="stats-monthly-bars">
                              <div
                                className="stats-monthly-bar stats-monthly-bar-ingreso"
                                style={{ height: `${(mes.ingresos / maxMensual) * 100}%` }}
                                title={`Ingresos: ${formatearMoneda(mes.ingresos, monedaActiva)}`}
                              />
                              <div
                                className="stats-monthly-bar stats-monthly-bar-egreso"
                                style={{ height: `${(mes.egresos / maxMensual) * 100}%` }}
                                title={`Egresos: ${formatearMoneda(mes.egresos, monedaActiva)}`}
                              />
                            </div>
                            <span className="stats-monthly-label">{mes.etiqueta}</span>
                          </div>
                        ))}
                      </div>
                      <div className="stats-monthly-legend">
                        <span><i className="stats-monthly-bar-ingreso" /> Ingresos</span>
                        <span><i className="stats-monthly-bar-egreso" /> Egresos</span>
                      </div>
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
                <button className="btn-export-alt" onClick={exportarExcel} disabled={movimientosFiltrados.length === 0}><Download size={14} /> Exportar Excel</button>
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
                        <tr
                          key={tableRowKey}
                          className="clicable"
                          onClick={() => setMovimientoSeleccionado(tx)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') setMovimientoSeleccionado(tx); }}
                        >
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

      {movimientoSeleccionado && (
        <ComprobanteMovimiento
          movimiento={movimientoSeleccionado}
          moneda={cuentaVista?.moneda}
          formatearMoneda={formatearMoneda}
          alCerrar={() => setMovimientoSeleccionado(null)}
        />
      )}
    </div>
  );
}