// 🎯 El QR de un cobro lleva solo un link con el id: https://<la app>/?cobro=<uuid>. Nunca el
// monto ni el descuento — eso lo calcula y lo guarda el backend, así no se puede manipular.
//
// La app no tiene router, y quien escanea el QR muchas veces no está logueado: pasa por la
// pantalla de Clerk (y a veces por el onboarding) antes de llegar al dashboard. Por eso el id
// se guarda en sessionStorage apenas carga la página y se saca de la URL; InicioBanco lo
// levanta cuando por fin se monta y abre directo la pantalla de pago.
import { parametroDemoParaLink } from './demo';

const CLAVE = 'calamuchita.cobroPendiente';
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function armarLinkCobro(idCobro) {
  // En la demo el link lleva también el token de la demo (ver config/demo.js).
  return `${window.location.origin}/?cobro=${idCobro}${parametroDemoParaLink()}`;
}

// Se llama una vez, en main.jsx, antes de montar la app.
export function capturarCobroDeUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('cobro');
  if (!id) return;
  if (PATRON_UUID.test(id)) {
    try { sessionStorage.setItem(CLAVE, id); } catch { /* modo privado: se pierde el link, no rompe */ }
  }
  params.delete('cobro');
  const resto = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}${window.location.hash}`);
}

export function leerCobroPendiente() {
  try { return sessionStorage.getItem(CLAVE); } catch { return null; }
}

export function limpiarCobroPendiente() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* nada que limpiar */ }
}
