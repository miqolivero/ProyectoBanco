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
7. [Estructura del proyecto](#estructura-del-proyecto)
8. [Probar la API](#probar-la-api)

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

### El modelo de datos en una idea

`Productos` es la tabla central: una persona no tiene "cuentas" y "tarjetas" por separado, tiene
**productos contratados**, y cada producto se especializa en una tabla 1:1 (`Cuentas_Bancarias` o
`Tarjetas_Credito`). Gracias a eso, agregar la cuenta en dólares fue simplemente un `Producto`
más, **sin tocar el esquema**.

La otra decisión que lo define es que el saldo de una cuenta es exactamente la suma de sus
movimientos: el historial es la fuente de verdad, no un registro paralelo.

Las 22 tablas, el DER y los datos de ejemplo están en
**[docs/BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md)**.

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

Este README es la puerta de entrada: qué es el sistema, cómo está construido y cómo correrlo. Lo
demás vive en documentos propios, para que cada uno se pueda leer sin leer el resto.

| Documento | Qué contiene | Para quién |
|---|---|---|
| **[docs/DECISIONES.md](docs/DECISIONES.md)** | Por qué el sistema está hecho así: decisiones de negocio y técnicas, riesgos identificados y cómo se mitigaron, y lo que se decidió no hacer | Quien evalúa o va a modificar el proyecto |
| **[docs/MANUAL-USUARIO.md](docs/MANUAL-USUARIO.md)** | Cómo se usa cada pantalla, sin tecnicismos, con **43 casos de prueba documentados** y glosario | Quien usa el sistema |
| **[docs/API.md](docs/API.md)** | Referencia de los 55 endpoints: parámetros, respuestas y errores | Quien integra o prueba la API |
| **[docs/BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md)** | Las 22 tablas columna por columna, el DER y los datos de ejemplo | Quien consulta o modifica el modelo de datos |
| **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)** | Guía paso a paso para publicar en Supabase, Render y Vercel | Quien pone el sistema en línea |
| **[DESARROLLO.md](DESARROLLO.md)** | Bitácora fase por fase: qué se construyó, qué se rompió y cómo se resolvió | Quien quiere seguir el proceso |

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

El sistema se despliega en tres servicios: **base de datos en Supabase**, **backend en Render** y
**frontend en Vercel**. El orden importa, porque cada uno necesita la URL del anterior.

👉 **La guía paso a paso está en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**, incluyendo las
variables de entorno de cada servicio, el checklist post-deploy y el detalle de por qué hay que
usar el *Session pooler* de Supabase y no la conexión directa.


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
│   ├── MANUAL-USUARIO.md       # Cómo se usa + casos de prueba
│   ├── API.md                  # Referencia de los 55 endpoints
│   ├── BASE-DE-DATOS.md        # Las 22 tablas, el DER y los datos de ejemplo
│   └── DESPLIEGUE.md           # Guía de publicación (Supabase/Render/Vercel)
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
