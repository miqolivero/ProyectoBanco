import { useState, useEffect } from 'react';
import { AlertTriangle, CalendarDays, MapPin, Store, Tag } from 'lucide-react';
import './Calendario.css';
import { API_URL } from '../../config/api';

// Las fechas llegan como 'YYYY-MM-DD' (DATE de Postgres). Se arman al mediodía para que ninguna
// zona horaria las corra de día al formatearlas.
function formatearDia(fechaIso) {
  const fecha = new Date(`${fechaIso}T12:00:00`);
  if (isNaN(fecha.getTime())) return fechaIso;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(fecha);
}

function formatearRango(inicio, fin) {
  if (inicio === fin) return formatearDia(inicio);
  return `Del ${formatearDia(inicio)} al ${formatearDia(fin)} de ${fin.slice(0, 4)}`;
}

// 🎯 Calendario de beneficios: eventos vigentes y próximos, con su descuento, tope y los
// comercios adheridos aprobados. Todo viene armado del backend (GET /api/eventos).
// "Quiero sumarme" se muestra como próximamente: el endpoint de adhesión ya existe en el
// backend (POST /api/eventos/:id/adhesiones), pero todavía no se habilita desde la interfaz.
export default function Calendario({ alCancelar }) {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState('');

  const formatearMoneda = (valor) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(valor) || 0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/eventos`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar el calendario.');
        if (!cancelado) setEventos(data);
      } catch (err) {
        if (!cancelado) setError(err.message);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  return (
    <div className="calendario-container">
      <div className="calendario-header-box">
        <span className="calendario-eyebrow">De nuestra gente, para nuestra gente</span>
        <h2>Calendario de Beneficios</h2>
        <p>Pagá con QR en los comercios adheridos a las fiestas de la región y el descuento se aplica solo.</p>
      </div>

      {error && <div className="calendario-alert"><AlertTriangle size={16} /> {error}</div>}
      {!eventos && !error && <p className="calendario-vacio">Cargando eventos...</p>}
      {eventos && eventos.length === 0 && <p className="calendario-vacio">No hay eventos vigentes ni próximos por ahora.</p>}

      <div className="calendario-lista">
        {eventos?.map(ev => (
          <article key={ev.id_evento} className={`calendario-evento ${ev.vigente ? 'vigente' : ''}`}>
            <div className="calendario-evento-top">
              <span className={`calendario-chip ${ev.vigente ? 'vigente' : 'proximo'}`}>
                {ev.vigente ? 'Vigente hoy' : 'Próximo'}
              </span>
              <span className="calendario-descuento">
                <Tag size={14} /> {Number(ev.porcentaje_descuento)}% <em>hasta {formatearMoneda(ev.tope_descuento)} por persona</em>
              </span>
            </div>

            <h3>{ev.nombre}</h3>
            <p className="calendario-dato"><MapPin size={14} /> {ev.ciudad}{ev.lugar ? ` · ${ev.lugar}` : ''}</p>
            <p className="calendario-dato"><CalendarDays size={14} /> {formatearRango(ev.fecha_inicio, ev.fecha_fin)}</p>

            <div className="calendario-adheridos">
              <span className="calendario-adheridos-titulo">Comercios adheridos</span>
              {ev.adheridos.length === 0 ? (
                <p className="calendario-adheridos-vacio">Todavía no hay comercios adheridos.</p>
              ) : (
                <ul>
                  {ev.adheridos.map(a => (
                    <li key={`${a.nombre_comercial}-${a.rubro}`}>
                      <Store size={13} /> <strong>{a.nombre_comercial}</strong> <span>{a.rubro}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="button" className="btn-cal-sumarme" disabled title="Muy pronto vas a poder adherir tu comercio">
              Quiero sumarme <span className="calendario-pronto">Próximamente</span>
            </button>
          </article>
        ))}
      </div>

      <div className="calendario-volver">
        <button type="button" className="btn-cal-secundario" onClick={alCancelar}>Volver al Inicio</button>
      </div>
    </div>
  );
}
