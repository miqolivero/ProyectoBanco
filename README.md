# 🏦 Calamuchita Bank

**Sistema de homebanking** construido con Node.js + Express, PostgreSQL y React. Proyecto
integrador de la materia **Práctica Profesionalizante I** (Analista de Sistemas).

Permite a un cliente abrir su cuenta, ver su saldo en tiempo real, transferir dinero, pagar
servicios y operar con productos financieros: tarjetas de crédito, préstamos, plazos fijos,
seguros, inversiones en CEDEARs y cuentas en dólares. Incluye un asistente con IA para consultar
la cuenta en lenguaje natural.

> **Lo que lo distingue de un CRUD bancario:** no es un sistema cerrado. Está integrado a una red
> de bancos donde participan los sistemas de **otros equipos del curso**, a través de una API
> central provista por la cátedra. Una transferencia puede salir de Calamuchita Bank y llegar a
> una cuenta de otro banco, y el registro de deudores se comparte entre todos: la decisión de
> otorgar un préstamo depende de cómo se comportó el cliente en **otros** bancos, no solo en el
> nuestro.

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Funcionalidades](#funcionalidades)
3. [Decisiones técnicas destacadas](#decisiones-técnicas-destacadas)
4. [Documentación](#documentación)
5. [Cómo levantar el proyecto](#cómo-levantar-el-proyecto)
6. [Despliegue a producción](#despliegue-a-producción)
7. [Datos de ejemplo](#datos-de-ejemplo)
8. [Esquema de la base de datos](#esquema-de-la-base-de-datos)
9. [Diagrama de entidad-relación (DER)](#diagrama-de-entidad-relación-der)
10. [Estructura del proyecto](#estructura-del-proyecto)
11. [Probar la API](#probar-la-api)

---

## Arquitectura

Tres capas desacopladas, cada una con una responsabilidad clara:

```
┌──────────────────────┐     ┌───────────────────────┐     ┌──────────────┐
│   FRONTEND           │     │   BACKEND             │     │   BASE       │
│   React + Vite       │────>│   Node.js + Express   │────>│   PostgreSQL │
│                      │HTTP │                       │ SQL │              │
│  ¿qué ve el usuario? │JSON │  ¿se puede hacer?     │     │ ¿qué perdura?│
└──────────────────────┘     └───────────┬───────────┘     └──────────────┘
                                         │
         ┌───────────────────────────────┼────────────────────────────┐
         │                               │                            │
         v                               v                            v
  ┌─────────────┐              ┌──────────────────┐         ┌─────────────────┐
  │ Banco       │              │ APIs públicas    │         │ Clerk           │
  │ Central     │              │ DolarAPI         │         │ (identidad)     │
  │ (cátedra)   │              │ ArgentinaDatos   │         │                 │
  │             │              │ data912          │         │                 │
  │ transferen- │              │                  │         │ login, registro │
  │ cias entre  │              │ cotizaciones     │         │ y verificación  │
  │ bancos y    │              │ y tasas reales   │         │ de sesión       │
  │ deudores    │              │                  │         │                 │
  └─────────────┘              └──────────────────┘         └─────────────────┘
```

**La capa que decide es el backend.** El frontend valida para dar buena experiencia, pero nunca
es la autoridad: toda regla de negocio y toda verificación de permisos se resuelve en el
servidor. La base, además de guardar, impone las invariantes que no se pueden delegar al código
(unicidad, claves foráneas, atomicidad de las operaciones que mueven dinero).

El backend sigue **MVC sin framework extra**:

```
routes/  →  controllers/  →  models/  →  PostgreSQL
 ¿qué        valida la       el único
 ruta?       entrada y       lugar con
             autoriza        SQL
```

Ese patrón se respetó sin excepciones, así que entender una operación alcanza para entender cómo
están hechas las demás.

### Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | React 19 + Vite | SPA; Vite por el arranque y el build rápidos |
| Backend | Node.js + Express 5 | Un solo lenguaje en todo el stack |
| Base de datos | PostgreSQL | Relacional: el dinero necesita transacciones e integridad referencial |
| Acceso a datos | `pg` (SQL crudo) | Sin ORM, a propósito — ver [decisiones](docs/DECISIONES.md#transacciones-manuales-sin-orm) |
| Autenticación | Clerk | No almacenamos contraseñas |
| IA | Google Gemini | Nivel gratuito permanente, sin suscripción |

---

## Funcionalidades

### Núcleo bancario

- **Alta de cliente** con validación de edad mínima (18 años). El CBU lo asigna el Banco Central.
- **Consulta de saldo** y datos de la cuenta, con alias editable.
- **Transferencias** por CBU o alias, a cuentas propias, del mismo banco o **de otros bancos de
  la red**. Muestra el titular del destino antes de confirmar.
- **Acreditación de transferencias recibidas** desde otros bancos, sincronizando con el Central.
- **Depósitos** de efectivo, con tope diario.
- **Historial completo** con filtros por fecha, monto y categoría; estadísticas por categoría y
  evolución mensual; exportación a Excel en tres hojas; y comprobante de cada operación.
- **Cuenta en dólares** y compra/venta de divisa a cotización oficial.

### Productos financieros

| Producto | Qué hace |
|---|---|
| **Tarjetas de crédito** | Emisión, consumos en hasta 24 cuotas, resumen con límite/consumido/disponible, pago de cuotas |
| **Préstamos** | Amortización francesa, simulador, validación de situación crediticia en la red compartida, tope de endeudamiento y **bonificación de tasa a quien paga en término** |
| **Plazos fijos** | Tasa real de mercado, plazos de 30 a 180 días, liquidación al vencimiento |
| **Seguros** | Vida, Hogar y Accidentes Personales, con cotización por franja etaria |
| **Inversiones (CEDEARs)** | 20 papeles con cotización en vivo, portafolio con ganancia no realizada |
| **Reservas y ahorros** | "Bolsillos" dentro de la cuenta, con monto objetivo y fecha meta |
| **Pago de servicios** | Catálogo de empresas, consulta de deuda, servicios agendados con débito automático |
| **Recargas** | Carga de crédito en celular (4 operadoras) |

### Asistente con IA — "Calamuchita IA"

Un chat para consultar la propia cuenta en lenguaje natural: *"¿cuánto transferí este mes?"*,
*"¿cuánto límite me queda?"*, *"¿cuántos dólares puedo comprar con mi saldo?"*.

El modelo **no accede a la base**: solo puede invocar funciones de solo lectura, y ninguna acepta
un parámetro de identidad — la cuenta consultada sale siempre de la sesión verificada. No existe
forma de que una pregunta apunte a la cuenta de otra persona, ni de que el asistente mueva
dinero.

---

## Decisiones técnicas destacadas

Las decisiones completas, con su justificación y las alternativas descartadas, están en
**[docs/DECISIONES.md](docs/DECISIONES.md)**. Estas son las cuatro que más cambiaron el proyecto:

### 1. El saldo no puede quedar negativo, y lo garantiza la base

El patrón original era leer el saldo, decidir y escribir. Entre la lectura y la escritura hay una
ventana: dos transferencias simultáneas leían el mismo saldo, las dos pasaban la validación y las
dos descontaban. Es un **TOCTOU** clásico y no se arregla validando mejor.

La solución fue mover la condición **dentro** del `UPDATE`, para que verificar y descontar sean
una sola operación atómica:

```sql
UPDATE Cuentas_Bancarias SET saldo = saldo - $2 WHERE cbu = $1 AND saldo >= $2
```

Verificado lanzando dos reservas simultáneas con `Promise.all`: solo una tiene éxito. Antes
pasaban las dos.

### 2. El backend no confía en el frontend

Durante un tiempo Clerk protegía solo la *interfaz*: el backend recibía el `cbu` en el body y lo
usaba sin verificar. Llamando la API con `curl`, sin pasar por la pantalla, se podía leer el
historial de otro cliente o transferir desde una cuenta ajena.

Hoy cada endpoint valida el JWT de la sesión y compara el recurso pedido contra la identidad
**a nivel de fila**. Y si falta configuración de seguridad, el sistema responde `503` en vez de
quedar abierto: **falla cerrado**.

### 3. Una transferencia entrante no se puede acreditar dos veces

El proceso que trae las transferencias de otros bancos verificaba "¿ya la registré?" con un
`SELECT` y después insertaba. Con dos procesos en paralelo (la app abierta en dos pestañas), las
dos pasaban el chequeo antes de insertar: dinero creado de la nada.

Se resolvió con un **índice único parcial** sobre `id_transaccion_central` y tratando el error de
unicidad como éxito idempotente. La lección: una validación en código de aplicación no puede
proteger una invariante entre procesos concurrentes — eso solo lo puede hacer la base.

### 4. La seguridad del asistente IA es estructural, no un prompt

Pedirle a un modelo que "no muestre datos de otros" no es una defensa: los prompts se burlan. La
decisión fue que **ninguna de sus herramientas acepte un parámetro de identidad**. No es que esté
prohibido pedir la cuenta de otro: no hay dónde escribirlo. Verificado con intentos reales de
prompt injection.

---

## Documentación

| Documento | Qué contiene |
|---|---|
| **[docs/DECISIONES.md](docs/DECISIONES.md)** | Por qué el sistema está hecho así: decisiones de negocio y técnicas, riesgos identificados y cómo se mitigaron |
| **[docs/API.md](docs/API.md)** | Referencia de los 55 endpoints: parámetros, respuestas y errores |
| **[docs/MANUAL-USUARIO.md](docs/MANUAL-USUARIO.md)** | Cómo se usa el sistema, sin tecnicismos, con **43 casos de prueba documentados** y glosario |
| **[DESARROLLO.md](DESARROLLO.md)** | Bitácora del proyecto fase por fase: qué se construyó, qué se rompió y cómo se resolvió |

---

## Cómo levantar el proyecto

### Requisitos

- Node.js >= 20
- PostgreSQL >= 14

### Estructura del repositorio

El backend y el frontend son dos proyectos independientes, cada uno con su propio `package.json`,
para poder desplegarlos por separado:

```
.
├── backend/     # API REST (Node + Express)  → se despliega en Render
├── frontend/    # SPA (React + Vite)         → se despliega en Vercel
└── files/       # DER, colección de Postman, docs del Banco Central
```

### Configuración

Copiá `backend/.env.example` a `backend/.env` y completá los valores:

```bash
cp backend/.env.example backend/.env
```

```env
DATABASE_URL=postgres://postgres:admin123@localhost:5432/banco_db
CENTRAL_BANK_API_KEY=...
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
GEMINI_API_KEY=...
PORT=3001
```

Para el frontend, lo mismo con `frontend/.env.example` → `frontend/.env` (en local puede quedar
vacío: cae solo a `http://localhost:3001`).

> **Qué pasa si falta cada clave:** sin `DATABASE_URL` no arranca. Sin **las dos** claves de
> Clerk, los endpoints protegidos responden `503` (nunca quedan abiertos). Sin
> `CENTRAL_BANK_API_KEY` no se pueden hacer transferencias ni dar de alta clientes. Sin
> `GEMINI_API_KEY` el asistente responde `503` y el resto funciona normal.

### Instalación

Las dependencias se instalan por separado en cada proyecto:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Crear la base de datos

Desde la raíz del repositorio, en este orden:

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE banco_db;"

# Tablas + datos maestros
psql -U postgres -d banco_db -f backend/init/01_schema.sql

# Datos de ejemplo (11 clientes, 113 movimientos)
psql -U postgres -d banco_db -f backend/init/02_data.sql
```

> `02_data.sql` está pensado para una base **recién creada** y aborta de forma controlada si ya
> hay clientes cargados, para no duplicar datos ni pisar información real.

### Levantar el proyecto

Dos terminales, una por proyecto:

```bash
# Terminal 1 — API en http://localhost:3001
cd backend && npm run dev

# Terminal 2 — frontend en http://localhost:5173
cd frontend && npm run dev
```

Para verificar que el backend quedó bien conectado a la base:

```bash
curl http://localhost:3001/api/health
# {"ok":true,"db":"ok"}
```

---

## Despliegue a producción

Arquitectura del despliegue: **base de datos en Supabase**, **backend en Render**, **frontend en
Vercel**.

El orden importa: cada servicio necesita la URL del anterior, así que hay que hacerlo de abajo
hacia arriba (base → backend → frontend) y al final volver a Render para cerrar el círculo del
CORS.

### 1. Base de datos — Supabase

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

### 2. Backend — Render

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

### 3. Frontend — Vercel

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

### 4. Cerrar el círculo del CORS

Volver a Render y setear `FRONTEND_URL` con el dominio de Vercel (sin barra final), por ejemplo
`https://proyecto-banco.vercel.app`. Render redespliega solo al guardar.

Hasta que esto esté hecho, el front carga pero **todos los fetch fallan por CORS** (ver la lista
de orígenes permitidos en `backend/app.js`).

> Cada branch/PR en Vercel genera además su propia URL de preview, que **no** está en la lista de
> orígenes permitidos. Para probar en una preview hay que agregar ese dominio a `FRONTEND_URL`
> separado por coma, o probar directamente sobre el dominio de producción.

### Checklist post-deploy

- [ ] `/api/health` devuelve `{"ok": true, "db": "ok"}`
- [ ] Se puede iniciar sesión con Clerk y el onboarding crea la persona en la base
- [ ] Un depósito y una transferencia impactan en el saldo y aparecen en el historial
- [ ] El asistente (Calamuchita IA) responde una consulta de saldo con el dato real
- [ ] Una llamada a la API sin token devuelve `401` (ver
      [casos de prueba](docs/MANUAL-USUARIO.md#seguridad-los-más-importantes))

### A tener en cuenta

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

## Datos de ejemplo

Definidos en [`backend/init/02_data.sql`](backend/init/02_data.sql). El volumen es deliberado: son
la base sobre la que se pueden hacer reportes y análisis reales, no un par de filas para que la
pantalla no se vea vacía.

| Entidad | Cantidad | Detalle |
|---|---|---|
| Clientes | 11 | Edades repartidas entre las 5 franjas del cotizador de seguros |
| Cuentas | 14 | 11 en ARS y 3 en USD |
| **Movimientos** | **113** | Repartidos en 9 meses (feb–oct 2026), cubriendo los **17 tipos** de operación |
| Tarjetas de crédito | 3 | Con 5 consumos y 14 cuotas (algunas pagadas, otras pendientes) |
| Préstamos | 2 | Uno **pagado en término** y uno en curso, con 18 cuotas en total |
| Plazos fijos | 4 | Dos ya liquidados y dos activos |
| Pólizas de seguro | 5 | Cuatro activas y una cancelada |
| Órdenes de CEDEARs | 6 | Compras y ventas de AAPL y DISN |
| Reservas de ahorro | 5 | Con monto objetivo y fecha meta |
| Facturas de servicio | 15 | 12 pendientes (para probar el pago) y 3 ya pagadas |

### Tres decisiones del script que vale la pena conocer

**Los saldos no están escritos a mano.** Se calculan al final como la suma de los movimientos de
cada cuenta:

```sql
UPDATE Cuentas_Bancarias c
SET saldo = COALESCE((SELECT SUM(m.monto) FROM Movimientos m WHERE m.id_cuenta = c.id_cuenta), 0);
```

Así es **imposible** que el saldo y el historial se contradigan — que es justamente lo que un
banco no puede permitirse. Verificado: 0 cuentas descuadradas y 0 saldos negativos.

**Juan Pérez tiene un préstamo pagado en término.** Las 6 cuotas se abonaron antes del
vencimiento, que es el caso que habilita la **bonificación de tasa**. Sin esos datos la feature
no se podía demostrar.

**Las edades se reparten a propósito.** La prima de los seguros se calcula por franja etaria
(18-30, 31-45, 46-60, 61-75, 75+); con clientes de un solo rango no se podía probar el cotizador
completo.

### Algunos clientes de ejemplo

| Cliente | DNI | Perfil |
|---|---|---|
| Juan Pérez | 35123456 | El más completo: sueldo, tarjeta con cuotas, préstamo pagado, cuenta en USD, reserva |
| María García | 28999888 | Plazo fijo liquidado, reserva, pagos de servicios |
| Ricardo Fort | 20111222 | Cliente premium: montos altos, Mastercard en 6 cuotas, CEDEARs, cuenta en USD |
| Diego Moyano | 25888777 | Préstamo **activo** con 10 cuotas pendientes |
| Camila Suárez | 45111999 | Cliente reciente, pocos movimientos (caso borde) |
| Olga Zalazar | 08999111 | 79 años: franja etaria más alta del cotizador de seguros |

---

## Esquema de la base de datos

Definido en [`backend/init/01_schema.sql`](backend/init/01_schema.sql). Son **22 tablas**: 8 del
núcleo (documentadas en detalle abajo) más las de cada producto financiero.

### Tablas maestras (lookup)

Reemplazan a los `ENUM` para que los valores posibles sean datos y no estructura.

**`Tipos_Producto`** — tipos de producto financiero disponibles.

| Columna | Tipo | Descripción |
|---|---|---|
| id_tipo_producto | SERIAL PK | Identificador |
| nombre | VARCHAR(50) | `CAJA_AHORRO`, `CUENTA_CORRIENTE`, `TARJETA_CREDITO` |

**`Estados_Producto`** — estados posibles de un producto.

| Columna | Tipo | Descripción |
|---|---|---|
| id_estado_producto | SERIAL PK | Identificador |
| nombre | VARCHAR(50) | `ACTIVO`, `BLOQUEADO`, `CERRADO` |

**`Tipos_Movimiento`** — las 17 clases de operación que registra el sistema.

| Columna | Tipo | Descripción |
|---|---|---|
| id_tipo_movimiento | SERIAL PK | Identificador |
| nombre | VARCHAR(50) | `DEBITO`, `CREDITO`, `TRANSFERENCIA_ENVIADA`, `TRANSFERENCIA_RECIBIDA`, `RECARGA`, `PAGO_SERVICIO`, `APORTE_RESERVA`, `RETIRO_RESERVA`, `PAGO_TARJETA`, `PLAZO_FIJO_CONSTITUCION`, `PLAZO_FIJO_LIQUIDACION`, `PRESTAMO_OTORGADO`, `PAGO_PRESTAMO`, `PAGO_SEGURO`, `COMPRA_CEDEAR`, `VENTA_CEDEAR`, `CAMBIO_DIVISA` |

### Entidades principales

**`Personas`** — clientes del banco.

| Columna | Tipo | Restricción |
|---|---|---|
| id | SERIAL PK | |
| nombre | VARCHAR(255) | NOT NULL |
| apellido | VARCHAR(255) | NOT NULL |
| dni | VARCHAR(20) | UNIQUE NOT NULL |
| direccion | VARCHAR(255) | |
| email | VARCHAR(255) | |
| telefono | VARCHAR(50) | |
| fecha_nac | DATE | |
| clerk_id | VARCHAR(255) | Identificador del usuario en Clerk. **No guardamos contraseñas** |

**`Roles`** — roles que puede tener una persona.

| Columna | Tipo | Descripción |
|---|---|---|
| id_rol | SERIAL PK | |
| nombre_rol | VARCHAR(100) | Ej: `Cliente Premium` |
| descripcion | VARCHAR(255) | |
| activo | BOOLEAN | Default `TRUE` |
| fecha_creacion | TIMESTAMP | Default `CURRENT_TIMESTAMP` |

**`Roles_x_Personas`** — tabla intermedia N:M entre personas y roles.

| Columna | Tipo | FK a |
|---|---|---|
| id_persona | INTEGER | `Personas(id)` |
| id_rol | INTEGER | `Roles(id_rol)` |

**`Productos`** — el contrato entre una persona y un producto financiero.

| Columna | Tipo | FK a |
|---|---|---|
| id_producto | SERIAL PK | |
| id_persona | INTEGER | `Personas(id)` |
| id_tipo_producto | INTEGER | `Tipos_Producto(id_tipo_producto)` |
| id_estado_producto | INTEGER | `Estados_Producto(id_estado_producto)` |
| fecha_alta | TIMESTAMP | Default `CURRENT_TIMESTAMP` |

**`Movimientos`** — el libro mayor: toda operación que entra o sale de una cuenta.

| Columna | Tipo | Descripción |
|---|---|---|
| id_movimiento | SERIAL PK | |
| id_cuenta | INTEGER | FK → `Cuentas_Bancarias` |
| id_tipo_movimiento | INTEGER | FK → `Tipos_Movimiento` |
| monto | DECIMAL(15,2) | **Con signo**: negativo sale, positivo entra |
| fecha_movimiento | TIMESTAMP | Default `CURRENT_TIMESTAMP` |
| descripcion | VARCHAR(255) | |
| cbu_origen | VARCHAR(22) | En operaciones locales es el CBU propio |
| cbu_destino | VARCHAR(22) | En operaciones locales es el CBU propio |
| id_transaccion_central | VARCHAR(100) | Id de la transacción en el Banco Central. **Índice único parcial**: es lo que impide acreditar dos veces la misma transferencia entrante |

### Productos específicos

**`Cuentas_Bancarias`** — extiende un `Producto` de tipo cuenta (relación 1:1).

| Columna | Tipo | Descripción |
|---|---|---|
| id_cuenta | SERIAL PK | |
| id_producto | INTEGER UNIQUE | FK → `Productos` |
| cbu | VARCHAR(22) | UNIQUE NOT NULL. Lo asigna el Banco Central |
| alias | VARCHAR(50) | UNIQUE |
| moneda | VARCHAR(10) | Default `ARS`. Soporta `USD` |
| saldo | DECIMAL(15,2) | Default `0.00` |

**`Tarjetas_Credito`** — extiende un `Producto` de tipo tarjeta (relación 1:1).

| Columna | Tipo | Descripción |
|---|---|---|
| id_tarjeta | SERIAL PK | |
| id_producto | INTEGER UNIQUE | FK → `Productos` |
| numero_tarjeta | VARCHAR(16) | UNIQUE NOT NULL. Generado con dígito verificador de Luhn |
| marca | VARCHAR(50) | `Visa` o `Mastercard` |
| fecha_vencimiento | DATE | NOT NULL |
| limite_compra | DECIMAL(15,2) | NOT NULL |
| dia_cierre | INTEGER | Entre 1 y 31 |

### Tablas de los productos financieros

| Tabla | Para qué |
|---|---|
| `Empresas_Servicio` | Catálogo de empresas (Epec, Ecogas, Fibertel...) |
| `Servicios_Agendados` | Servicios guardados por el cliente, con monto fijo y débito automático opcionales |
| `Facturas_Servicio` | Facturas pendientes y pagadas, buscables por número de cliente |
| `Reservas` | "Bolsillos" de ahorro dentro de una cuenta |
| `Consumos_Tarjeta` | Cada compra con tarjeta, con su cantidad de cuotas |
| `Cuotas_Tarjeta` | Una fila por cuota, con vencimiento y estado |
| `Plazos_Fijos` | Capital, TNA, vencimiento y estado |
| `Prestamos` | Monto, plazo, TNA y cuota fija |
| `Cuotas_Prestamo` | Capital e interés de cada cuota, con `fecha_pago` para saber si se pagó **en término** |
| `Productos_Seguro` | Catálogo (Vida, Hogar, Accidentes Personales) |
| `Polizas` | Pólizas contratadas, con suma asegurada y prima |
| `Ordenes_Cedear` | Compras y ventas. **El portafolio se calcula agregando estas órdenes**, no se guarda aparte |

También hay una vista `vista_movimientos_detallados` que junta persona + cuenta + movimiento +
tipo, útil para reportes.

---

## Diagrama de entidad-relación (DER)

El diagrama está en [`files/DER.png`](files/DER.png). Para generarlo o modificarlo podés importar
el script en **[drawdb.app](https://drawdb.app)**:

1. Abrí [drawdb.app](https://drawdb.app)
2. Hacé clic en **Import SQL**
3. Seleccioná el DBMS: **PostgreSQL**
4. Pegá el contenido de `backend/init/01_schema.sql`
5. El diagrama se genera automáticamente

### Relaciones clave

```
Personas ──< Roles_x_Personas >── Roles
Personas ──< Productos
Productos >── Tipos_Producto
Productos >── Estados_Producto
Productos ──o Cuentas_Bancarias   (1:1)
Productos ──o Tarjetas_Credito    (1:1)
Cuentas_Bancarias ──< Movimientos >── Tipos_Movimiento
Cuentas_Bancarias ──< Reservas, Plazos_Fijos, Prestamos
Tarjetas_Credito  ──< Consumos_Tarjeta ──< Cuotas_Tarjeta
Prestamos         ──< Cuotas_Prestamo
Personas          ──< Polizas, Ordenes_Cedear
```

**La clave del modelo** es que `Productos` es la tabla central: una persona no tiene "cuentas" y
"tarjetas" por separado, tiene **productos contratados**, y cada producto se especializa en una
tabla 1:1. Gracias a eso, abrir una cuenta en dólares fue simplemente un `Producto` más, sin
tocar el esquema.

---

## Estructura del proyecto

```
.
├── backend/                    # API REST → Render
│   ├── app.js                  # Entry point: CORS, montaje de rutas, health check
│   ├── config/
│   │   ├── db.js               # Conexión a PostgreSQL (Pool), SSL automático
│   │   ├── centralBank.js      # Cliente de la API del Banco Central (cátedra)
│   │   ├── externalApis.js     # APIs públicas (DolarAPI, ArgentinaDatos, data912)
│   │   ├── asistenteIA.js      # Herramientas de solo-lectura del asistente IA
│   │   └── demoMode.js         # Restricción opcional para despliegue público
│   ├── controllers/            # Validación de entrada, autorización y respuesta JSON
│   ├── models/                 # Queries SQL crudas y transacciones
│   ├── routes/                 # Definición de endpoints
│   ├── middlewares/
│   │   └── auth.js             # Verificación de sesión Clerk + autorización por fila
│   ├── utils/
│   │   └── validaciones.js
│   ├── init/
│   │   ├── 01_schema.sql       # DDL: creación de tablas + datos maestros
│   │   ├── 02_data.sql         # DML: datos de ejemplo
│   │   └── 03_select.sql       # Query de consulta principal
│   ├── package.json
│   └── .env                    # Variables de entorno (no se commitea)
│
├── frontend/                   # SPA React + Vite → Vercel
│   ├── src/
│   │   ├── components/         # Una carpeta por pantalla (.jsx + .css)
│   │   └── config/api.js       # URL base del backend + token de Clerk en cada fetch
│   ├── package.json
│   └── .env                    # VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY
│
├── docs/
│   ├── DECISIONES.md           # Por qué el sistema está hecho así
│   ├── API.md                  # Referencia de los 55 endpoints
│   └── MANUAL-USUARIO.md       # Cómo se usa + casos de prueba
│
├── files/                      # DER, colección de Postman, docs del Banco Central
├── README.md
└── DESARROLLO.md               # Bitácora del proyecto, fase por fase
```

---

## Probar la API

La referencia completa está en **[docs/API.md](docs/API.md)**.

### Con la colección de Postman

El repositorio incluye [`files/postman.collection.json`](files/postman.collection.json). Para
usarla: *Import → Upload Files* y seleccionar el archivo.

Conviene crear una variable de entorno en Postman para no repetir la URL:

| Variable | Valor |
|---|---|
| `base_url` | `http://localhost:3001` |

Y usar las URLs así:

```
GET  {{base_url}}/api/health
GET  {{base_url}}/api/personas
POST {{base_url}}/api/movimientos/transferir
```

### Con `curl`

Los endpoints públicos se pueden probar directamente:

```bash
# Estado del servicio y de la base
curl http://localhost:3001/api/health

# Catálogo de empresas de servicios
curl http://localhost:3001/api/servicios/empresas

# Cotización oficial del dólar
curl http://localhost:3001/api/movimientos/cambio/cotizacion
```

Los demás necesitan el token de sesión de Clerk en el header `Authorization: Bearer <token>`. Sin
token responden `401`, y con un token de otra persona responden `403`:

```bash
# Sin token → 401
curl -i "http://localhost:3001/api/movimientos/historial?cbu=0040001535123456000101"
```

> Que esas dos llamadas fallen **es la prueba de que la autorización funciona**. Están
> documentadas junto al resto de los casos en
> [docs/MANUAL-USUARIO.md](docs/MANUAL-USUARIO.md#seguridad-los-más-importantes).
