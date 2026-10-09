# Despliegue a producción

Guía paso a paso para poner el sistema en línea. Para correrlo en tu máquina, ver
[README → Cómo levantar el proyecto](../README.md#cómo-levantar-el-proyecto).

**Arquitectura del despliegue:** base de datos en **Supabase**, backend en **Render**, frontend
en **Vercel**.

El orden importa: cada servicio necesita la URL del anterior, así que hay que hacerlo de abajo
hacia arriba (base → backend → frontend) y al final volver a Render para cerrar el círculo del
CORS.

## 1. Base de datos — Supabase

1. Crear un proyecto nuevo en [supabase.com](https://supabase.com) y **guardar la contraseña de
   la base** que se genera (después no se puede volver a ver, solo resetear).
2. En el **SQL Editor** del dashboard, pegar y ejecutar el contenido de los scripts **en este
   orden**:
   - `backend/init/01_schema.sql` (tablas + datos maestros)
   - `backend/init/02_data.sql` (datos de ejemplo)

3. Copiar la cadena de conexión: botón **Connect** del dashboard (o *Project Settings →
   Database*) → pestaña **Session pooler**.

   Tiene esta forma, con puerto **5432** y host `pooler.supabase.com`:

   ```
   postgresql://postgres.<project-ref>:<TU-PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   **Por qué el Session pooler y no las otras dos opciones:**

   | Opción | Puerto | Problema |
   |---|---|---|
   | Direct connection | 5432 (`db.<ref>.supabase.co`) | Es **IPv6 only**, y Render no tiene IPv6 saliente → falla con `ENOTFOUND` |
   | Transaction pooler | 6543 | No soporta estado de sesión; este proyecto usa transacciones explícitas `BEGIN/COMMIT` y `SELECT ... FOR UPDATE` en todas las operaciones que mueven plata |
   | **Session pooler** | **5432** (`pooler`) | ✅ Es IPv4 y se comporta igual que una conexión directa |

   No hace falta agregarle `?sslmode=` ni `?pgbouncer=true`: `backend/config/db.js` ya activa SSL
   automáticamente cuando la base no es `localhost`.

## 2. Backend — Render

1. *New → Web Service* → conectar el repositorio.
2. Configuración:
   - **Root Directory**: `backend` ← el backend no está en la raíz del repo
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. Variables de entorno (*Environment*) — las mismas de `backend/.env.example`, **menos `PORT`**
   (Render inyecta el suyo y `app.js` ya lo lee):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la cadena del Session pooler del paso 1 |
   | `CENTRAL_BANK_API_KEY` | la key de la API de la cátedra |
   | `CLERK_SECRET_KEY` | `sk_...` (del dashboard de Clerk) |
   | `CLERK_PUBLISHABLE_KEY` | `pk_...` (la misma que usa el frontend) |
   | `GEMINI_API_KEY` | la key de Google AI Studio |
   | `FRONTEND_URL` | *(se completa en el paso 4)* |

4. Verificar el deploy entrando a `https://<tu-app>.onrender.com/api/health`. Tiene que devolver:

   ```json
   { "ok": true, "db": "ok" }
   ```

   Si devuelve `{"ok": false, "db": "error"}`, el servidor levantó pero no llega a Supabase →
   revisar que `DATABASE_URL` sea la del **Session pooler** y que la contraseña esté bien.

   > El plan gratuito de Render duerme el servicio después de ~15 minutos sin tráfico: el primer
   > request después de eso puede tardar ~50 segundos en responder.

## 3. Frontend — Vercel

1. *Add New → Project* → importar el repositorio.
2. Configuración:
   - **Root Directory**: `frontend` ← importante, el frontend no está en la raíz del repo
   - Framework Preset: **Vite** (se detecta solo), Build Command `npm run build`, Output
     Directory `dist`
3. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | `https://<tu-app>.onrender.com` (**sin barra final**) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_...` |

   > ⚠️ Vite incrusta las variables `VITE_*` en el bundle **en tiempo de build**, no las lee en
   > runtime: si cambiás una, hay que volver a desplegar para que tome efecto.

## 4. Cerrar el círculo del CORS

Volver a Render y setear `FRONTEND_URL` con el dominio de Vercel (sin barra final), por ejemplo
`https://proyecto-banco.vercel.app`. Render redespliega solo al guardar.

Hasta que esto esté hecho, el front carga pero **todos los fetch fallan por CORS** (ver la lista
de orígenes permitidos en `backend/app.js`).

> Cada branch/PR en Vercel genera además su propia URL de preview, que **no** está en la lista de
> orígenes permitidos. Para probar en una preview hay que agregar ese dominio a `FRONTEND_URL`
> separado por coma, o probar directamente sobre el dominio de producción.

## Checklist post-deploy

- [ ] `/api/health` devuelve `{"ok": true, "db": "ok"}`
- [ ] Se puede iniciar sesión con Clerk y el onboarding crea la persona en la base
- [ ] Un depósito y una transferencia impactan en el saldo y aparecen en el historial
- [ ] El asistente (Calamuchita IA) responde una consulta de saldo con el dato real
- [ ] Una llamada a la API sin token devuelve `401` (ver
      [casos de prueba](MANUAL-USUARIO.md#seguridad-los-más-importantes))

## A tener en cuenta

- **Clerk**: las claves `pk_test_` / `sk_test_` son de una *instancia de desarrollo*. Funcionan en
  Vercel, pero muestran el cartel de "development mode" y tienen tope de usuarios. Para un
  despliegue "de verdad" hay que crear una instancia de producción en Clerk (claves `pk_live_`) y
  registrar ahí el dominio de Vercel.
- **Secretos**: `.env` está en `.gitignore` y no debe commitearse nunca — las claves van
  únicamente en los paneles de Render y Vercel. Si alguna clave llegó a quedar en un commit,
  rotarla desde el panel del proveedor.
- **`DEMO_MODE`**: si el proyecto queda público, conviene activarlo (ver `backend/.env.example`)
  para que solo los CBU de prueba puedan generar transferencias y préstamos en la red compartida
  del Banco Central de la cátedra.
- **Despliegues cruzados**: los dos servicios salen del mismo repositorio, así que por defecto un
  push que solo toca el frontend igual dispara un redeploy del backend y viceversa. Si molesta, se
  puede filtrar: en Render con *Settings → Build Filters* (included path `backend/**`) y en Vercel
  con *Settings → Git → Ignored Build Step*.

---

## Para seguir leyendo

- [README](../README.md) — qué es el sistema, arquitectura e instalación local
- [BASE-DE-DATOS.md](BASE-DE-DATOS.md) — esquema y datos de ejemplo que se cargan en Supabase
- [DECISIONES.md](DECISIONES.md) — por qué se eligió este stack de despliegue
