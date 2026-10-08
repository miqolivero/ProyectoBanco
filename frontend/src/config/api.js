// URL base del backend. En desarrollo local no hace falta configurar nada: cae en
// localhost:3001 como siempre. En producción, se define VITE_API_URL en el host del
// frontend (Vercel, etc.) apuntando al backend ya desplegado — ver frontend/.env.example.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// 🎯 El backend ahora exige un JWT de Clerk válido en cada endpoint que toca cuentas/saldo (ver
// middlewares/auth.js) — antes confiaba ciegamente en el cbu/idPersona que mandara el body/query,
// sin verificar que la request viniera de verdad de esa persona. En vez de salir a tocar cada uno
// de los ~40 `fetch(...)` sueltos repartidos por los componentes para agregarles el header a
// mano (y arriesgarse a que se olvide alguno), se parchea `window.fetch` una única vez acá, al
// importar este módulo (que ya importa todo el mundo para leer API_URL): cualquier request que
// vaya al backend se le suma el `Authorization: Bearer <token>` automáticamente, leyendo el token
// de sesión actual de `window.Clerk` — el objeto global que el propio <ClerkProvider> deja
// disponible en toda la app, sin necesidad de pasarlo por props/contexto.
if (typeof window !== 'undefined' && !window.__fetchAutenticadoInstalado) {
    window.__fetchAutenticadoInstalado = true;
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (url && url.startsWith(API_URL)) {
            try {
                const token = await window.Clerk?.session?.getToken();
                if (token) {
                    init = {
                        ...init,
                        headers: {
                            ...(init.headers || {}),
                            Authorization: `Bearer ${token}`
                        }
                    };
                }
            } catch (err) {
                console.warn('No se pudo obtener el token de sesión de Clerk para la request:', err);
            }
        }
        return fetchOriginal(input, init);
    };
}
