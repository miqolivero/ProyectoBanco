import React, { useState, useEffect, useRef } from 'react';
import { useClerk } from '@clerk/clerk-react';
import logo from "../../assets/LogoMinimalista.png"; 
import Transferencias from '../Transferencia/Transferencias'; 
import Depositar from '../Depositar/Depositar'; // 🎯 Importamos tu nuevo componente de depósitos
import './InicioBanco.css';

export default function InicioBanco({ datosUsuario, actualizarDatosBase }) {
  const { signOut } = useClerk();
  
  const [vistaActual, setVistaActual] = useState('inicio');
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoMovs, setCargandoMovs] = useState(true);
  const [triggerRecarga, setTriggerRecarga] = useState(0);
  const [saldoEspejo, setSaldoEspejo] = useState(0);
  const [filtoMonto, setFiltroMonto] = useState('');

  // Estados para Alias
  const [editandoAlias, setEditandoAlias] = useState(false);
  const [inputAlias, setInputAlias] = useState('');
  const [errorAlias, setErrorAlias] = useState('');
  const [guardandoAlias, setGuardandoAlias] = useState(false);

  // 🎯 NUEVOS ESTADOS: Control del Ojo de Saldo y Dropdown de Perfil
  const [mostrarSaldo, setMostrarSaldo] = useState(true);
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);
  const menuPerfilRef = useRef(null);

  useEffect(() => {
    if (datosUsuario?.saldo) {
      setSaldoEspejo(Number(datosUsuario.saldo));
    }
  }, [datosUsuario?.saldo]);

  useEffect(() => {
    if (datosUsuario?.alias) {
      setInputAlias(datosUsuario.alias);
    }
  }, [datosUsuario?.alias]);

  // Cierre automático de la ventanita de perfil al clickear afuera
  useEffect(() => {
    function clickAfuera(event) {
      if (menuPerfilRef.current && !menuPerfilRef.current.contains(event.target)) {
        setMenuPerfilAbierto(false);
      }
    }
    document.addEventListener("mousedown", clickAfuera);
    return () => document.removeEventListener("mousedown", clickAfuera);
  }, []);

  // 🎯 MÁSCARA INTELIGENTE: Formatea u oculta el saldo dinámicamente según el ojo
  const formatearMoneda = (valor) => {
    if (!mostrarSaldo) return "$ *******";
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
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
    } catch (e) {
      return '---';
    }
  };

 useEffect(() => {
  const cargarYPollearHistorial = async () => {
    if (!datosUsuario?.cbu) return;
    
    const miCbuLimpio = String(datosUsuario.cbu).trim();
    
    try {
      setCargandoMovs(true);
      
      const response = await fetch(`http://localhost:3001/api/movimientos/historial?cbu=${miCbuLimpio}`);
      const data = await response.json();

      if (response.ok && Array.isArray(data)) {
        const misMovimientos = data.filter(t => {
          const origen = String(t.cbu_origen || t.cbuOrigen || '').trim();
          const destino = String(t.cbu_destino || t.cbuDestino || '').trim();
          return origen === miCbuLimpio || destino === miCbuLimpio;
        });
        
        misMovimientos.sort((a, b) => {
          const idA = a.id_movimiento || a.id || 0;
          const idB = b.id_movimiento || b.id || 0;
          return idB - idA;
        });
        
        setMovimientos(misMovimientos);
      }
      setCargandoMovs(false); 

      fetch(`http://localhost:3001/api/movimientos/sincronizar?minutos=30&cbu=${miCbuLimpio}`)
        .then(res => {
          if (res.ok) {
            // 🎯 SOLUCIÓN AL BUG: Invocamos la recarga del saldo en el backend al procesar transferencias externas recibidas
            if (actualizarDatosBase) {
              actualizarDatosBase();
            }
            
            fetch(`http://localhost:3001/api/movimientos/historial?cbu=${miCbuLimpio}`)
              .then(r => r.json())
              .then(newData => {
                if (Array.isArray(newData)) {
                  const misMovsActualizados = newData.filter(t => {
                    const origen = String(t.cbu_origen || t.cbuOrigen || '').trim();
                    const destino = String(t.cbu_destino || t.cbuDestino || '').trim();
                    return origen === miCbuLimpio || destino === miCbuLimpio;
                  });

                  misMovsActualizados.sort((a, b) => {
                    const idA = a.id_movimiento || a.id || 0;
                    const idB = b.id_movimiento || b.id || 0;
                    return idB - idA;
                  });

                  setMovimientos(misMovsActualizados);
                }
              });
          }
        })
        .catch(e => console.error("Sincronización en segundo plano falló:", e));

    } catch (err) {
      console.error("❌ Error cargando historial unificado:", err);
      setCargandoMovs(false);
    }
  };

  cargarYPollearHistorial();
}, [datosUsuario?.cbu, triggerRecarga, vistaActual]);

  const handleGuardarAlias = async () => {
    const aliasLimpio = inputAlias.trim().toLowerCase();
    if (!aliasLimpio) { setErrorAlias("El alias no puede estar vacío."); return; }

    const regexAlias = /^[a-z0-9.-]+$/;
    if (!regexAlias.test(aliasLimpio)) { setErrorAlias("Solo letras, números, puntos (.) y guiones (-)."); return; }

    try {
      setErrorAlias(''); setGuardandoAlias(true);
      const response = await fetch(`http://localhost:3001/api/personas/${datosUsuario.cbu}/alias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevoAlias: aliasLimpio })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "El alias ya se encuentra ocupado.");
      if (actualizarDatosBase) await actualizarDatosBase();
      setEditandoAlias(false);
      alert("🎉 ¡Alias actualizado exitosamente!");
    } catch (err) {
      setErrorAlias(err.message);
    } finally {
      setGuardandoAlias(false);
    }
  };

  const handleTransferenciaExitosa = (montoRestar) => {
    setSaldoEspejo(prev => prev - montoRestar);
    setTriggerRecarga(prev => prev + 1);
  };

  // 🎯 MANEJADOR PARA DEPÓSITO: Suma el dinero al saldo espejo localmente y recarga la lista
  const handleDepositoExitoso = (montoSumar) => {
    setSaldoEspejo(prev => prev + montoSumar);
    setTriggerRecarga(prev => prev + 1);
  };

  const handleVolverAlInicio = () => {
    if (actualizarDatosBase) { actualizarDatosBase(); }
    setTriggerRecarga(prev => prev + 1);
    setVistaActual('inicio'); 
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
            🏠 Inicio
          </button>
          <button className={`menu-item ${vistaActual === 'transferencias' ? 'active' : ''}`} onClick={() => setVistaActual('transferencias')}>
            💸 Transferencias
          </button>
          {/* 🎯 Agregamos la clase active dinámicamente para depósitos */}
          <button className={`menu-item ${vistaActual === 'depositar' ? 'active' : ''}`} onClick={() => setVistaActual('depositar')}>
            💳 Depósitos
          </button>
          <button className={`menu-item ${vistaActual === 'historial' ? 'active' : ''}`} onClick={() => setVistaActual('historial')}>
            📜 Historial
          </button>
          <button className="menu-item disabled">⚙️ Ajustes</button>
        </nav>

        <div className="sidebar-user" onClick={() => signOut()}>
          <div className="user-avatar">{datosUsuario?.nombre?.charAt(0).toUpperCase()}</div>
          <div className="user-info">
            <p className="user-name">{datosUsuario?.nombre} {datosUsuario?.apellido}</p>
            <span className="user-status">Cerrar Sesión 🔓</span>
          </div>
        </div>
      </aside>

      {/* 💻 CONTENIDO DINÁMICO */}
      <main className="main-content">
        
        {/* 🎯 DETALLE MODIFICADO: Estructura del Header Re-Alineada en la misma línea visual que el saludo */}
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
            {vistaActual === 'historial' && <h2>Historial General</h2>}
          </div>
          
          <div className="header-actions">
            {/* 🎯 BOTÓN DEL OJO: Permite ocultar el saldo */}

            <div className="header-balance-indicator">
              <span>SALDO TOTAL</span>
              <strong>{formatearMoneda(saldoEspejo)}</strong>
            </div>

            {/* 🎯 CONTENEDOR DE PERFIL DROPDOWN */}
            <div style={{ position: 'relative' }} ref={menuPerfilRef}>
              <div 
                className="top-avatar" 
                onClick={() => setMenuPerfilAbierto(!menuPerfilAbierto)}
                style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
              >
                {datosUsuario?.nombre?.charAt(0).toUpperCase()}
              </div>

              {menuPerfilAbierto && (
                <div style={{
                  position: 'absolute',
                  top: '50px',
                  right: '0',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  width: '280px',
                  padding: '20px',
                  zIndex: 999,
                  animation: 'fadeIn 0.2s ease'
                }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0f3424', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px', fontSize: '15px' }}>
                    👤 Datos de Perfil
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#374151' }}>
                    <p style={{ margin: 0 }}><strong>Nombre:</strong> <span style={{textTransform: 'capitalize'}}>{datosUsuario?.nombre} {datosUsuario?.apellido}</span></p>
                    <p style={{ margin: 0 }}><strong>DNI:</strong> {datosUsuario?.dni || '---'}</p>
                    <p style={{ margin: 0 }}><strong>Email:</strong> {datosUsuario?.email || '---'}</p>
                    <p style={{ margin: 0 }}><strong>Teléfono:</strong> {datosUsuario?.telefono || '---'}</p>
                    <p style={{ margin: 0 }}><strong>Dirección:</strong> {datosUsuario?.direccion || '---'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 1. VISTA INICIO */}
        {vistaActual === 'inicio' && (
          <>
            <div className="dashboard-grid">
              <div className="grid-left">
                
                <div className="balance-card">
                  <div className="balance-header">
                    <span>SALDO TOTAL DISPONIBLE</span>
                    <button 
                      onClick={() => setMostrarSaldo(!mostrarSaldo)} 
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '0',
                        color: 'white',
                        opacity: '0.8',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '1'}
                      onMouseLeave={(e) => e.target.style.opacity = '0.8'}
                      title={mostrarSaldo ? "Ocultar saldo" : "Mostrar saldo"}
                    >
                      {mostrarSaldo ? "👁️" : "🙈"}
                    </button>
                  </div>
                  <h2 className="balance-amount">{formatearMoneda(saldoEspejo)}</h2>
                  <div className="balance-details">
                    <p><strong>CBU:</strong> <span className="mono-text">{datosUsuario?.cbu}</span></p>
                    
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
                            <button onClick={handleGuardarAlias} disabled={guardandoAlias} style={{ background: '#2e7d32', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                              {guardandoAlias ? '...' : '✔'}
                            </button>
                            <button onClick={() => { setEditandoAlias(false); setErrorAlias(''); setInputAlias(datosUsuario?.alias || ''); }} disabled={guardandoAlias} style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                              ✖
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="mono-text" style={{ fontSize: '14px' }}>{datosUsuario?.alias || 'sin.alias.registrado'}</span>
                            <button onClick={() => setEditandoAlias(true)} style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', color: '#fff', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              ✏️ Editar
                            </button>
                          </>
                        )}
                      </div>
                      {errorAlias && <span style={{ color: '#ffcdd2', fontSize: '11px', backgroundColor: 'rgba(211, 47, 47, 0.4)', padding: '2px 8px', borderRadius: '4px', marginTop: '2px' }}>⚠️ {errorAlias}</span>}
                    </div>
                  </div>
                </div>

                <div className="actions-container">
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('transferencias')}>
                    <div className="action-icon">🚀</div>
                    <span>Transferencias</span>
                  </button>
                  {/* 🎯 HABILITADO: Botón Cargar Dinero abre el módulo de Depósitos */}
                  <button className="action-card btn-transferencia" onClick={() => setVistaActual('depositar')}>
                    <div className="action-icon">📥</div>
                    <span>Cargar Dinero</span>
                  </button>
                  <button className="action-card disabled"><div className="action-icon">🧾</div><span>Pago de Servicios</span></button>
                </div>

                <div className="transactions-section">
                  <div className="transactions-header">
                    <h3>Movimientos recientes</h3>
                    <button className="btn-see-all" onClick={() => setVistaActual('historial')}>Ver todos</button>
                  </div>

                  <div className="transactions-list">
                    {cargandoMovs ? (
                      <p className="tx-empty-msg">Actualizando con el Central...</p>
                    ) : movimientos.length === 0 ? (
                      <p className="tx-empty-msg">No registrás movimientos en tu cuenta aún.</p>
                    ) : (
                      movimientos.slice(0, 3).map((tx) => {
                        const destino = tx.cbu_destino || tx.cbuDestino;
                        const esIngreso = String(destino).trim() === String(datosUsuario.cbu).trim();
                        const montoFinal = tx.importe || tx.monto;

                        return (
                          <div className="transaction-item" key={tx.id_movimiento || tx.id}>
                            <div className={`tx-icon-container ${esIngreso ? 'tx-in' : 'tx-out'}`}>
                              {esIngreso ? '📥' : '💸'}
                            </div>
                            <div className="tx-info">
                              <p className="tx-description">{tx.descripcion || (esIngreso ? 'Transferencia Recibida' : 'Transferencia Enviada')}</p>
                              <span className="tx-date">{formatearFecha(tx.fecha_movimiento || tx.fecha)}</span>
                            </div>
                            <span className={`tx-amount ${esIngreso ? 'positive' : 'negative'}`}>
                              {esIngreso ? '+' : ''}{formatearMoneda(montoFinal)}
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
                  <div className="bank-product-badge">
                    <span className="badge-icon">💼</span>
                    <div>
                      <strong>Cuenta Corriente</strong>
                      <p>Activa • Calamuchita Bank</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 2. VISTA FORMULARIO TRANSFERENCIA */}
        {vistaActual === 'transferencias' && (
          <Transferencias 
            datosUsuario={{...datosUsuario, saldo: saldoEspejo}} 
            alTransferirExitosa={handleTransferenciaExitosa}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 🎯 3. VISTA FORMULARIO DEPÓSITOS */}
        {vistaActual === 'depositar' && (
          <Depositar 
            datosUsuario={datosUsuario}
            alDepositarExitoso={handleDepositoExitoso}
            alCancelar={handleVolverAlInicio}
          />
        )}

        {/* 4. VISTA HISTORIAL COMPLETO */}
        {vistaActual === 'historial' && (
          <div className="history-page-container">
            <div className="history-header-layout">
              <div>
                <p className="subtitle-gray">Controla tus finanzas con la claridad de las aguas de Calamuchita.</p>
              </div>
              <div className="history-actions-top">
                <button className="btn-export-alt" disabled>📥 Exportar</button>
                <button className="btn-new-payment-alt" onClick={() => setVistaActual('transferencias')}>+ Nueva Transferencia</button>
              </div>
            </div>

            <div className="filters-card-box">
              <div className="filter-field"><label>Rango de fecha</label><input type="text" value="Últimos 30 días" disabled className="filter-input" /></div>
              <div className="filter-field"><label>Categoría</label><select className="filter-input"><option>Todas</option></select></div>
              <div className="filter-field">
                <label>Monto mínimo</label>
                <input type="number" placeholder="$ 0" value={filtoMonto} onChange={(e) => setFiltroMonto(e.target.value)} className="filter-input" />
              </div>
              <button className="btn-apply-filters">Aplicar Filtros</button>
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
                  {movimientos.length === 0 ? (
                    <tr><td colSpan="4" className="table-empty-row">No se encontraron movimientos registrados en la red.</td></tr>
                  ) : (
                    movimientos
                      .filter(m => !filtoMonto || Math.abs(m.monto || m.importe || 0) >= Number(filtoMonto))
                      .map((tx, index) => {
                        const destino = tx.cbu_destino || tx.cbuDestino;
                        const esIngreso = String(destino).trim() === String(datosUsuario.cbu).trim();
                        const totalImporte = Math.abs(Number(tx.monto || tx.importe || 0));
                        const tableRowKey = tx.id_movimiento || tx.id || `table-row-${index}`;

                        return (
                          <tr key={tableRowKey}>
                            <td className="date-cell">{formatearFecha(tx.fecha_movimiento || tx.fecha)}</td>
                            <td>
                              <div className="detail-cell-info">
                                <strong>{tx.descripcion || (esIngreso ? 'Transferencia recibida' : 'Transferencia enviada')}</strong>
                                <span>{esIngreso ? `Origen: CBU ${tx.cbu_origen || tx.cbuOrigen}` : `Destino: CBU ${destino}`}</span>
                              </div>
                            </td>
                            <td>
                              <span className="badge-category-table">
                                {tx.monto > 0 && !tx.id_transaccion_central ? 'DEPÓSITO' : 'TRANSFERENCIA'}
                              </span>
                            </td>
                            <td className={`text-right font-bold-amount ${esIngreso ? 'positive-color' : 'negative-color'}`}>
                              {esIngreso ? '+ ' : '- '}{formatearMoneda(totalImporte)}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
              <div className="table-footer-pagination">
                <span>Mostrando 1-{movimientos.length} de {movimientos.length} movimientos</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}