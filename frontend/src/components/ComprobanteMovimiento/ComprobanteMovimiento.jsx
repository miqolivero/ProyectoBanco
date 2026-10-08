import { X, ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from 'lucide-react';
import './ComprobanteMovimiento.css';

// Comprobante virtual de un movimiento: se abre al hacer click en cualquier fila del
// historial (o de "Movimientos recientes" en Inicio). No pega a ningún endpoint nuevo — el
// propio objeto de la lista ya trae todo lo que hace falta mostrar (ver
// Movimiento.obtenerTodos en el backend: monto, fecha, descripción, cbu_origen/destino,
// id_transaccion_central, tipo_movimiento).
export default function ComprobanteMovimiento({ movimiento, moneda, formatearMoneda, alCerrar }) {
  if (!movimiento) return null;

  const valorMonto = Number(movimiento.monto || movimiento.importe || 0);
  const esIngreso = valorMonto > 0;
  const fecha = movimiento.fecha_movimiento || movimiento.fecha;

  const fechaCompleta = (() => {
    if (!fecha) return '---';
    try {
      const d = new Date(fecha);
      if (isNaN(d.getTime())) return '---';
      return new Intl.DateTimeFormat('es-AR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch {
      return '---';
    }
  })();

  const cbuOrigen = movimiento.cbu_origen;
  const cbuDestino = movimiento.cbu_destino;
  const mismoCbu = cbuOrigen && cbuDestino && cbuOrigen === cbuDestino;

  const tipoLegible = movimiento.tipo_movimiento
    ? movimiento.tipo_movimiento.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
    : (esIngreso ? 'Ingreso' : 'Egreso');

  return (
    <div className="comprobante-overlay" onClick={alCerrar}>
      <div className="comprobante-modal" onClick={(e) => e.stopPropagation()}>
        <button className="comprobante-cerrar" onClick={alCerrar} aria-label="Cerrar comprobante">
          <X size={18} />
        </button>

        <div className={`comprobante-icono ${esIngreso ? 'ingreso' : 'egreso'}`}>
          {esIngreso ? <ArrowDownCircle size={28} /> : <ArrowUpCircle size={28} />}
        </div>

        <span className="comprobante-tipo">{tipoLegible}</span>
        <strong className={`comprobante-monto ${esIngreso ? 'positive' : 'negative'}`}>
          {esIngreso ? '+' : '−'} {formatearMoneda(Math.abs(valorMonto), moneda)}
        </strong>
        <span className="comprobante-estado"><CheckCircle2 size={13} /> Confirmado</span>

        <div className="comprobante-detalle">
          <div className="comprobante-fila">
            <span>Descripción</span>
            <strong>{movimiento.descripcion || movimiento.desc || tipoLegible}</strong>
          </div>
          <div className="comprobante-fila">
            <span>Fecha y hora</span>
            <strong className="comprobante-fecha">{fechaCompleta}</strong>
          </div>

          {mismoCbu ? (
            <div className="comprobante-fila">
              <span>Cuenta</span>
              <strong className="mono-text">{cbuOrigen}</strong>
            </div>
          ) : (
            <>
              {cbuOrigen && (
                <div className="comprobante-fila">
                  <span>CBU origen</span>
                  <strong className="mono-text">{cbuOrigen}</strong>
                </div>
              )}
              {cbuDestino && (
                <div className="comprobante-fila">
                  <span>CBU destino</span>
                  <strong className="mono-text">{cbuDestino}</strong>
                </div>
              )}
            </>
          )}

          <div className="comprobante-fila">
            <span>N° de operación</span>
            <strong className="mono-text">
              {movimiento.id_transaccion_central || `LOCAL-${movimiento.id_movimiento || movimiento.id || '---'}`}
            </strong>
          </div>
        </div>

        <p className="comprobante-footer">Calamuchita Bank · Comprobante generado localmente</p>
      </div>
    </div>
  );
}
