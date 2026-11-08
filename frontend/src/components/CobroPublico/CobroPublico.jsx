import { useState, useEffect } from 'react';
import { BadgeCheck, Store, Tag, XCircle } from 'lucide-react';
import logo from "../../assets/LogoMinimalista.png";
import './CobroPublico.css';
import { API_URL } from '../../config/api';

// 🎯 Lo que ve quien abre el link de un cobro SIN sesión iniciada (todavía no es cliente, o no
// entró). En vez de un error: el detalle del cobro y la invitación a abrir la cuenta o
// iniciar sesión. El id del cobro sigue guardado (config/linkCobro.js), así que después del
// login —o del registro y el onboarding— la app abre directo la pantalla de pago de este cobro.
export default function CobroPublico({ idCobro, alIniciarSesion, alRegistrarse }) {
  const [cobro, setCobro] = useState(null);
  const [error, setError] = useState('');

  const formatearMoneda = (valor) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor) || 0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/cobros/${idCobro}/publico`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar el cobro.');
        if (!cancelado) setCobro(data);
      } catch (err) {
        if (!cancelado) setError(err.message);
      }
    })();
    return () => { cancelado = true; };
  }, [idCobro]);

  const cerrado = cobro && (cobro.estado === 'PAGADO' || cobro.estado === 'CANCELADO');

  return (
    <div className="cobro-publico-container">
      <div className="cobro-publico-card">
        <img src={logo} alt="Calamuchita Bank" className="cobro-publico-logo" />

        {error && (
          <div className="cobro-publico-estado">
            <XCircle size={30} />
            <h2>No encontramos este cobro</h2>
            <p>{error}</p>
          </div>
        )}

        {!cobro && !error && <p className="cobro-publico-cargando">Cargando el cobro...</p>}

        {cobro && cerrado && (
          <div className="cobro-publico-estado">
            <XCircle size={30} />
            <h2>{cobro.estado === 'PAGADO' ? 'Este cobro ya fue pagado' : 'Este cobro fue cancelado'}</h2>
            <p>Pedile al comercio que genere un QR nuevo.</p>
          </div>
        )}

        {cobro && !cerrado && (
          <>
            <span className="cobro-publico-eyebrow">Te están cobrando con QR</span>
            <div className="cobro-publico-comercio">
              <div className="cobro-publico-comercio-icono"><Store size={20} /></div>
              <div>
                <strong>{cobro.comercio.nombre || 'Un cliente de Calamuchita Bank'}</strong>
                {cobro.comercio.rubro && <span>{cobro.comercio.rubro}</span>}
              </div>
            </div>
            {cobro.comercio.adherido && (
              <p className="cobro-publico-adherido"><BadgeCheck size={15} /> Comercio adherido</p>
            )}
            {cobro.descripcion && <p className="cobro-publico-descripcion">{cobro.descripcion}</p>}

            <span className="cobro-publico-label">Precio</span>
            <p className="cobro-publico-precio">{formatearMoneda(cobro.precio)}</p>

            {cobro.promo && (
              <div className="cobro-publico-promo">
                <Tag size={16} />
                <div>
                  <strong>{Number(cobro.promo.porcentajeDescuento)}% de descuento · {cobro.promo.evento}</strong>
                  <span>Este descuento es para clientes de Calamuchita Bank. Abrí tu cuenta y aprovechalo.</span>
                </div>
              </div>
            )}
            {!cobro.promo && (
              <p className="cobro-publico-nota">Para pagar este cobro necesitás una cuenta en Calamuchita Bank.</p>
            )}
          </>
        )}

        <div className="cobro-publico-acciones">
          <button type="button" className="btn-cobro-publico-principal" onClick={alRegistrarse}>
            Abrir mi cuenta
          </button>
          <button type="button" className="btn-cobro-publico-secundario" onClick={alIniciarSesion}>
            Ya soy cliente, iniciar sesión
          </button>
        </div>
        {cobro && !cerrado && (
          <p className="cobro-publico-pie">Después de entrar, te traemos de vuelta a este cobro para pagarlo.</p>
        )}
      </div>
    </div>
  );
}
