import { Briefcase, DollarSign, Plus } from 'lucide-react';
import './SelectorCuenta.css';

// Selector de cuenta reutilizable: se usa tanto en Depositar como en Transferencias para elegir
// contra qué cuenta (ARS o USD) operar, en vez de tener una pantalla de Cuenta USD aparte con
// su propio formulario de depósito duplicado.
export default function SelectorCuenta({ cuentas, monedaActiva, onCambiarMoneda, mostrarAbrirUSD, onAbrirUSD, abriendoUSD }) {
  const formatear = (valor, moneda) => {
    return new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-AR', { style: 'currency', currency: moneda }).format(valor || 0);
  };

  return (
    <div className="selector-cuenta">
      {cuentas.map((cuenta) => (
        <button
          key={cuenta.moneda}
          type="button"
          className={`selector-cuenta-opcion ${monedaActiva === cuenta.moneda ? 'activa' : ''}`}
          onClick={() => onCambiarMoneda(cuenta.moneda)}
        >
          <span className="selector-cuenta-nombre">
            {cuenta.moneda === 'USD' ? <DollarSign size={14} /> : <Briefcase size={14} />}
            {cuenta.moneda === 'USD' ? 'Cuenta en USD' : 'Cuenta Corriente'}
          </span>
          <span className="selector-cuenta-saldo">{formatear(cuenta.saldo, cuenta.moneda)}</span>
        </button>
      ))}

      {mostrarAbrirUSD && (
        <button type="button" className="selector-cuenta-abrir-usd" onClick={onAbrirUSD} disabled={abriendoUSD}>
          {abriendoUSD ? 'Abriendo...' : (<><Plus size={14} /> Abrir cuenta en USD</>)}
        </button>
      )}
    </div>
  );
}
