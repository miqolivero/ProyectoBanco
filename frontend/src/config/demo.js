// 🎯 Cuenta demo: se entra sin registrarse y nada de lo que se hace queda guardado (el backend
// corre todo en una transacción que deshace al salir, ver backend/config/sandboxDemo.js).
//
// La sesión de demo vive en sessionStorage (por pestaña) y viaja al backend en dos headers que
// agrega el fetch parcheado de config/api.js: x-demo-token (qué demo) y x-demo-usuario (con cuál
// de las personas demo se está operando). Mientras hay sesión de demo, la app no usa Clerk.
const CLAVE = 'calamuchita.demo';

// Lee la URL base sin importar config/api.js (que importa este módulo).
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function leerDemo() {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

export function enDemo() {
  return Boolean(leerDemo());
}

function guardarDemo(datos) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* modo privado: la demo dura lo que la pestaña */ }
}

export function limpiarDemo() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* nada que limpiar */ }
}

// Botón "Probar la cuenta demo" del login.
export async function entrarADemo() {
  const res = await fetch(`${API}/api/demo/sesion`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo abrir la demo.');
  guardarDemo(data);
  return data;
}

// Cambia la persona demo con la que se opera (cliente ↔ comercio), dentro de la misma demo.
export function cambiarUsuarioDemo(usuario) {
  const actual = leerDemo();
  if (!actual) return;
  guardarDemo({ ...actual, usuario });
  window.location.reload();
}

export async function salirDeDemo() {
  const actual = leerDemo();
  limpiarDemo();
  if (actual) {
    try {
      await fetch(`${API}/api/demo/salir`, { method: 'POST', headers: { 'x-demo-token': actual.token } });
    } catch { /* si falla, la demo se cierra sola por inactividad */ }
  }
  window.location.href = '/';
}

// Para el QR: el link de un cobro generado en la demo lleva el token, así quien lo escanea
// (por ejemplo, con el celular) entra a la MISMA demo y puede pagarlo.
export function parametroDemoParaLink() {
  const actual = leerDemo();
  return actual ? `&demo=${encodeURIComponent(actual.token)}` : '';
}

// Se llama en main.jsx al cargar: si la URL trae ?demo=<token> (se escaneó un QR de la demo),
// se suma a esa demo como la persona que no generó el cobro. Devuelve una promesa que main.jsx
// espera antes de montar la app.
export async function capturarDemoDeUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('demo');
  if (!token) return;
  const idCobro = params.get('cobro');
  params.delete('demo');
  const resto = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}${window.location.hash}`);
  try {
    const res = await fetch(`${API}/api/demo/unirse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-demo-token': token },
      body: JSON.stringify({ idCobro })
    });
    if (res.ok) guardarDemo(await res.json());
  } catch { /* demo vencida o sin conexión: se sigue como un link de cobro común */ }
}
