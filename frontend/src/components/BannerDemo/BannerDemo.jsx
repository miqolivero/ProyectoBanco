import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FlaskConical, QrCode, Repeat, X, Smartphone } from 'lucide-react';
import { leerDemo, cambiarUsuarioDemo } from '../../config/demo';
import { armarLinkCobro } from '../../config/linkCobro';
import { COBROS_QR_HABILITADOS } from '../../config/funcionalidades';
import './BannerDemo.css';

const NOMBRES = { demo_cliente: 'Profe Demo (cliente)', demo_comercio: 'Kiosco del Lago (comercio)' };

// 🎯 Aviso fijo de la cuenta demo: deja claro que nada se guarda, permite cambiar entre las dos
// personas demo (cliente ↔ comercio) y muestra un QR de prueba para escanear con el celular.
export default function BannerDemo({ alPagarAca }) {
  const demo = leerDemo();
  const [qrAbierto, setQrAbierto] = useState(false);
  if (!demo) return null;

  const otro = demo.usuarios?.find(u => u !== demo.usuario);
  const esCliente = demo.usuario === 'demo_cliente';

  return (
    <>
      <div className="banner-demo">
        <span className="banner-demo-icono"><FlaskConical size={18} /></span>
        <div className="banner-demo-texto">
          <strong>Cuenta demo · {NOMBRES[demo.usuario] || demo.usuario}</strong>
          <span>
            Usala libremente: nada de lo que hagas se guarda ni sale al Banco Central. La demo se
            reinicia al salir o tras {demo.minutosInactividad || 15} minutos sin uso.
          </span>
        </div>
        <div className="banner-demo-acciones">
          {COBROS_QR_HABILITADOS && esCliente && demo.cobroEjemplo && (
            <button type="button" className="btn-banner-demo principal" onClick={() => setQrAbierto(true)}>
              <QrCode size={15} /> QR de prueba
            </button>
          )}
          {/* La persona "comercio" solo tiene sentido para probar el QR. */}
          {COBROS_QR_HABILITADOS && otro && (
            <button type="button" className="btn-banner-demo" onClick={() => cambiarUsuarioDemo(otro)}>
              <Repeat size={15} /> Ver como {otro === 'demo_comercio' ? 'comercio' : 'cliente'}
            </button>
          )}
        </div>
      </div>

      {qrAbierto && (
        <div className="banner-demo-overlay" onClick={() => setQrAbierto(false)}>
          <div className="banner-demo-modal" onClick={e => e.stopPropagation()}>
            <button type="button" className="banner-demo-cerrar" onClick={() => setQrAbierto(false)} aria-label="Cerrar">
              <X size={18} />
            </button>
            <h3>QR de prueba</h3>
            <p className="banner-demo-modal-sub">Kiosco del Lago (demo) · Café con medialunas · $ 3.500</p>
            <div className="banner-demo-qr">
              <QRCodeSVG value={armarLinkCobro(demo.cobroEjemplo)} size={210} level="M" marginSize={2} />
            </div>
            <p className="banner-demo-ayuda">
              <Smartphone size={14} /> Escanealo con la cámara del celular: se abre esta misma demo
              lista para pagar.
            </p>
            <button
              type="button"
              className="btn-banner-demo principal ancho"
              onClick={() => { setQrAbierto(false); alPagarAca(demo.cobroEjemplo); }}
            >
              Pagarlo desde esta pantalla
            </button>
            <p className="banner-demo-ayuda chica">
              Para probar el otro lado: "Ver como comercio" → Cobrar con QR → generá uno y escanealo.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
