import { API_URL } from './api';

// La lista de las 24 jurisdicciones vive en el backend (utils/provincias.js), que es quien la
// valida. Se pide una sola vez por carga de la app y se reutiliza en el registro, Ajustes y la
// pantalla de "completá tu provincia". Si el pedido falla, se descarta la promesa guardada
// para que el próximo intento vuelva a pedirla.
let pedido = null;

export function obtenerProvincias() {
  if (!pedido) {
    pedido = fetch(`${API_URL}/api/personas/provincias`)
      .then(res => {
        if (!res.ok) throw new Error('No se pudo cargar la lista de provincias.');
        return res.json();
      })
      .catch(err => {
        pedido = null;
        throw err;
      });
  }
  return pedido;
}
