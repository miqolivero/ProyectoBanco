# API Ejemplo Banco — Práctica Profesional 1

API REST construida con **Node.js + Express** y base de datos **PostgreSQL**, que modela un sistema bancario simple con personas, productos financieros, cuentas bancarias y tarjetas de crédito.

---

## Índice

1. [Esquema de la base de datos](#esquema-de-la-base-de-datos)
2. [Diagrama de entidad-relación (DER)](#diagrama-de-entidad-relación-der)
3. [Cómo levantar la base de datos](#cómo-levantar-la-base-de-datos)
4. [Despliegue a producción](#despliegue-a-producción)
5. [Datos de ejemplo](#datos-de-ejemplo)
6. [Endpoints](#endpoints)

---

## Esquema de la base de datos

El esquema está definido en `backend/init/01_schema.sql`. Se compone de **8 tablas**:

### Tablas maestras (lookup)

**`Tipos_Producto`** — Tipos de producto financiero disponibles.

| Columna          | Tipo        | Descripción                                               |
| ---------------- | ----------- | ---------------------------------------------------------- |
| id_tipo_producto | SERIAL PK   | Identificador                                              |
| nombre           | VARCHAR(50) | `CAJA_AHORRO`, `CUENTA_CORRIENTE`, `TARJETA_CREDITO` |

**`Estados_Producto`** — Estados posibles de un producto.

| Columna            | Tipo        | Descripción                           |
| ------------------ | ----------- | -------------------------------------- |
| id_estado_producto | SERIAL PK   | Identificador                          |
| nombre             | VARCHAR(50) | `ACTIVO`, `BLOQUEADO`, `CERRADO` |

---

### Entidades principales

**`Personas`** — Clientes del banco.

| Columna   | Tipo         | Restricción    |
| --------- | ------------ | --------------- |
| id        | SERIAL PK    |                 |
| nombre    | VARCHAR(255) | NOT NULL        |
| apellido  | VARCHAR(255) | NOT NULL        |
| dni       | VARCHAR(20)  | UNIQUE NOT NULL |
| direccion | VARCHAR(255) |                 |
| email     | VARCHAR(255) |                 |
| telefono  | VARCHAR(50)  |                 |
| fecha_nac | DATE         |                 |

**`Roles`** — Roles que puede tener una persona.

| Columna        | Tipo         | Descripción                  |
| -------------- | ------------ | ----------------------------- |
| id_rol         | SERIAL PK    |                               |
| nombre_rol     | VARCHAR(100) | Ej:`Cliente Premium`        |
| descripcion    | VARCHAR(255) |                               |
| activo         | BOOLEAN      | Default `TRUE`              |
| fecha_creacion | TIMESTAMP    | Default `CURRENT_TIMESTAMP` |

**`Roles_x_Personas`** — Tabla intermedia N:M entre personas y roles.

| Columna    | Tipo    | FK a              |
| ---------- | ------- | ----------------- |
| id_persona | INTEGER | `Personas(id)`  |
| id_rol     | INTEGER | `Roles(id_rol)` |

**`Productos`** — Contrato entre una persona y un producto financiero.

| Columna            | Tipo      | FK a                                     |
| ------------------ | --------- | ---------------------------------------- |
| id_producto        | SERIAL PK |                                          |
| id_persona         | INTEGER   | `Personas(id)`                         |
| id_tipo_producto   | INTEGER   | `Tipos_Producto(id_tipo_producto)`     |
| id_estado_producto | INTEGER   | `Estados_Producto(id_estado_producto)` |
| fecha_alta         | TIMESTAMP | Default `CURRENT_TIMESTAMP`            |

---

### Productos específicos

**`Cuentas_Bancarias`** — Extiende un `Producto` de tipo cuenta.

| Columna     | Tipo           | Descripción       |
| ----------- | -------------- | ------------------ |
| id_cuenta   | SERIAL PK      |                    |
| id_producto | INTEGER UNIQUE | FK →`Productos` |
| cbu         | VARCHAR(22)    | UNIQUE NOT NULL    |
| alias       | VARCHAR(50)    | UNIQUE             |
| moneda      | VARCHAR(10)    | Default `ARS`    |
| saldo       | DECIMAL(15,2)  | Default `0.00`   |

**`Tarjetas_Credito`** — Extiende un `Producto` de tipo tarjeta.

| Columna           | Tipo           | Descripción       |
| ----------------- | -------------- | ------------------ |
| id_tarjeta        | SERIAL PK      |                    |
| id_producto       | INTEGER UNIQUE | FK →`Productos` |
| numero_tarjeta    | VARCHAR(16)    | UNIQUE NOT NULL    |
| marca             | VARCHAR(50)    | Ej:`Visa`        |
| fecha_vencimiento | DATE           | NOT NULL           |
| limite_compra     | DECIMAL(15,2)  | NOT NULL           |
| dia_cierre        | INTEGER        | Entre 1 y 31       |

---

## Diagrama de entidad-relación (DER)

Para visualizar el DER podés importar el script `backend/init/01_schema.sql` en **[drawdb.app](https://drawdb.app)**:

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
```

---

## Cómo levantar la base de datos

### Requisitos

- Node.js >= 18
- PostgreSQL >= 14

### Estructura del repositorio

El backend y el frontend son dos proyectos independientes, cada uno con su propio `package.json`, para poder desplegarlos por separado:

```
.
├── backend/     # API REST (Node + Express)  → se despliega en Render
├── frontend/    # SPA (React + Vite)         → se despliega en Vercel
└── files/       # DER, colección de Postman, docs del Banco Central
```

### Configuración

Copiá `backend/.env.example` a `backend/.env` y completá los valores (como mínimo `DATABASE_URL`):

```bash
cp backend/.env.example backend/.env
```

```env
DATABASE_URL=postgres://postgres:admin123@localhost:5432/banco_db
```

Para el frontend, lo mismo con `frontend/.env.example` → `frontend/.env` (en local puede quedar vacío: cae solo a `http://localhost:3001`).

### Instalación

Hay que instalar las dependencias de cada proyecto por separado:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Crear la base de datos y ejecutar los scripts

Conectate a PostgreSQL y ejecutá los scripts en orden (desde la raíz del repo):

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE banco_db;"

# Ejecutar el schema (tablas + datos maestros)
psql -U postgres -d banco_db -f backend/init/01_schema.sql

# Cargar los datos de ejemplo
psql -U postgres -d banco_db -f backend/init/02_data.sql
```

### Levantar el proyecto

Dos terminales, una por proyecto:

```bash
# Terminal 1 — API en http://localhost:3001
cd backend && npm run dev

# Terminal 2 — frontend en http://localhost:5173
cd frontend && npm run dev
```

---

## Despliegue a producción

Arquitectura del despliegue: **base de datos en Supabase**, **backend en Render**, **frontend en Vercel**.

El orden importa: cada servicio necesita la URL del anterior, así que hay que hacerlo de abajo hacia arriba (base → backend → frontend) y al final volver a Render para cerrar el círculo del CORS.

### 1. Base de datos — Supabase

1. Crear un proyecto nuevo en [supabase.com](https://supabase.com) y **guardar la contraseña de la base** que se genera (después no se puede volver a ver, solo resetear).
2. En el **SQL Editor** del dashboard, pegar y ejecutar el contenido de los scripts **en este orden**:
   - `backend/init/01_schema.sql` (tablas + datos maestros)
   - `backend/init/02_data.sql` (datos de ejemplo)

   > ⚠️ `02_data.sql` no es idempotente (no tiene `ON CONFLICT`): si se corre dos veces falla por DNI/CBU duplicados. Correrlo una sola vez, sobre la base recién creada.

3. Copiar la cadena de conexión: botón **Connect** del dashboard (o *Project Settings → Database*) → pestaña **Session pooler**.

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

   No hace falta agregarle `?sslmode=` ni `?pgbouncer=true`: `config/db.js` ya activa SSL automáticamente cuando la base no es `localhost`.

### 2. Backend — Render

1. *New → Web Service* → conectar el repositorio.
2. Configuración:
   - **Root Directory**: `backend` ← el backend no está en la raíz del repo
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. Variables de entorno (*Environment*) — las mismas de `.env.example`, **menos `PORT`** (Render inyecta el suyo y `app.js` ya lo lee):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la cadena del Session pooler del paso 1 |
   | `CENTRAL_BANK_API_KEY` | la key de la API de la cátedra |
   | `CLERK_SECRET_KEY` | `sk_...` (del dashboard de Clerk) |
   | `CLERK_PUBLISHABLE_KEY` | `pk_...` (la misma que usa el frontend) |
   | `GEMINI_API_KEY` | la key de Google AI Studio |
   | `FRONTEND_URL` | *(se completa en el paso 4)* |

   Sin **las dos** claves de Clerk, todos los endpoints protegidos responden `503` (ver `middlewares/auth.js`).

4. Verificar el deploy entrando a `https://<tu-app>.onrender.com/api/health`. Tiene que devolver:

   ```json
   { "ok": true, "db": "ok" }
   ```

   Si devuelve `{"ok": false, "db": "error"}`, el servidor levantó pero no llega a Supabase → revisar que `DATABASE_URL` sea la del **Session pooler** y que la contraseña esté bien.

   > El plan gratuito de Render duerme el servicio después de ~15 minutos sin tráfico: el primer request después de eso puede tardar ~50 segundos en responder.

### 3. Frontend — Vercel

1. *Add New → Project* → importar el repositorio.
2. Configuración:
   - **Root Directory**: `frontend` ← importante, el frontend no está en la raíz del repo
   - Framework Preset: **Vite** (se detecta solo), Build Command `npm run build`, Output Directory `dist`
3. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | `https://<tu-app>.onrender.com` (**sin barra final**) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_...` |

   > ⚠️ Vite incrusta las variables `VITE_*` en el bundle **en tiempo de build**, no las lee en runtime: si cambiás una, hay que volver a desplegar para que tome efecto.

### 4. Cerrar el círculo del CORS

Volver a Render y setear `FRONTEND_URL` con el dominio de Vercel (sin barra final), por ejemplo `https://proyecto-banco.vercel.app`. Render redespliega solo al guardar.

Hasta que esto esté hecho, el front carga pero **todos los fetch fallan por CORS** (ver la lista de orígenes permitidos en `app.js`).

> Cada branch/PR en Vercel genera además su propia URL de preview, que **no** está en la lista de orígenes permitidos. Para probar en una preview hay que agregar ese dominio a `FRONTEND_URL` separado por coma, o probar directamente sobre el dominio de producción.

### Checklist post-deploy

- [ ] `/api/health` devuelve `{"ok": true, "db": "ok"}`
- [ ] Se puede iniciar sesión con Clerk y el onboarding crea la persona en la base
- [ ] Un depósito y una transferencia impactan en el saldo y aparecen en el historial
- [ ] El asistente (Calamuchita IA) responde una consulta de saldo con el dato real

### A tener en cuenta

- **Clerk**: las claves `pk_test_` / `sk_test_` son de una *instancia de desarrollo*. Funcionan en Vercel, pero muestran el cartel de "development mode" y tienen tope de usuarios. Para un despliegue "de verdad" hay que crear una instancia de producción en Clerk (claves `pk_live_`) y registrar ahí el dominio de Vercel.
- **Secretos**: `.env` está en `.gitignore` y no debe commitearse nunca — las claves van únicamente en los paneles de Render y Vercel. Si alguna clave llegó a quedar en un commit, rotarla desde el panel del proveedor.
- **`DEMO_MODE`**: si el proyecto queda público, conviene activarlo (ver `backend/.env.example`) para que solo los CBU de prueba puedan generar transferencias y préstamos en la red compartida del Banco Central de la cátedra.
- **Despliegues cruzados**: los dos servicios salen del mismo repositorio, así que por defecto un push que solo toca el frontend igual dispara un redeploy del backend y viceversa. Si molesta, se puede filtrar: en Render con *Settings → Build Filters* (included path `backend/**`) y en Vercel con *Settings → Git → Ignored Build Step*.

---

## Datos de ejemplo

Los datos de ejemplo están definidos en `backend/init/02_data.sql`.

### Roles cargados

| id_rol | nombre_rol      | descripción                             |
| ------ | --------------- | ---------------------------------------- |
| 1      | Cliente Premium | Usuarios con beneficios y límites altos |
| 2      | Cliente Regular | Usuarios estándar del banco             |
| 3      | Empleado        | Personal administrativo del banco        |

### Personas cargadas

| id | nombre  | apellido | DNI      | Email                  | Rol             |
| -- | ------- | -------- | -------- | ---------------------- | --------------- |
| 1  | Juan    | Pérez   | 35123456 | juan.perez@email.com   | Cliente Regular |
| 2  | María  | García  | 28999888 | m.garcia@email.com     | Cliente Regular |
| 3  | Ricardo | Fort     | 20111222 | elcomandante@email.com | Cliente Premium |

### Productos asignados

| id_producto | Persona | Tipo             | Estado | Detalle                     |
| ----------- | ------- | ---------------- | ------ | --------------------------- |
| 1           | Juan    | CAJA_AHORRO      | ACTIVO | Saldo ARS $15.000,50        |
| 2           | María  | CUENTA_CORRIENTE | ACTIVO | Saldo ARS $450.000,00       |
| 3           | Ricardo | CAJA_AHORRO      | ACTIVO | Saldo USD $99.999,99        |
| 4           | Ricardo | TARJETA_CREDITO  | ACTIVO | Visa, límite $2.500.000,00 |

### Resultado de la consulta principal (`backend/init/03_select.sql`)

| nombre  | apellido | producto         | estado | saldo_cuenta | limite_tarjeta |
| ------- | -------- | ---------------- | ------ | ------------ | -------------- |
| Juan    | Pérez   | CAJA_AHORRO      | ACTIVO | 15000.50     | null           |
| María  | García  | CUENTA_CORRIENTE | ACTIVO | 450000.00    | null           |
| Ricardo | Fort     | CAJA_AHORRO      | ACTIVO | 99999.99     | null           |
| Ricardo | Fort     | TARJETA_CREDITO  | ACTIVO | 0.00         | 2500000.00     |

---

## Endpoints

**Base URL:** `http://localhost:3001/api`

---

### GET /api/personas

Retorna todas las personas con sus productos, saldos y límites de tarjeta.

**Request**

```http
GET /api/personas
```

**Ejemplo con curl**

```bash
curl http://localhost:3001/api/personas
```

**Ejemplo con JavaScript (fetch)**

```js
const res = await fetch('http://localhost:3001/api/personas');
const personas = await res.json();
console.log(personas);
```

**Response exitoso — `200 OK`**

```json
[
  {
    "id": 1,
    "nombre": "Juan",
    "apellido": "Pérez",
    "dni": "35123456",
    "producto": "CAJA_AHORRO",
    "estado": "ACTIVO",
    "saldo": "15000.50",
    "limite_compra": null
  },
  {
    "id": 2,
    "nombre": "María",
    "apellido": "García",
    "dni": "28999888",
    "producto": "CUENTA_CORRIENTE",
    "estado": "ACTIVO",
    "saldo": "450000.00",
    "limite_compra": null
  },
  {
    "id": 3,
    "nombre": "Ricardo",
    "apellido": "Fort",
    "dni": "20111222",
    "producto": "CAJA_AHORRO",
    "estado": "ACTIVO",
    "saldo": "99999.99",
    "limite_compra": null
  },
  {
    "id": 3,
    "nombre": "Ricardo",
    "apellido": "Fort",
    "dni": "20111222",
    "producto": "TARJETA_CREDITO",
    "estado": "ACTIVO",
    "saldo": null,
    "limite_compra": "2500000.00"
  }
]
```

**Response de error — `500 Internal Server Error`**

```json
{
  "error": "mensaje de error de la base de datos"
}
```

---

### POST /api/personas

Crea una nueva persona en la base de datos.

**Request**

```http
POST /api/personas
Content-Type: application/json
```

**Body**

| Campo    | Tipo   | Requerido | Descripción         |
| -------- | ------ | --------- | -------------------- |
| nombre   | string | Si        | Nombre de la persona |
| apellido | string | Si        | Apellido             |
| dni      | string | Si        | DNI único           |
| email    | string | No        | Email de contacto    |

**Ejemplo con curl**

```bash
curl -X POST http://localhost:3001/api/personas \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Laura", "apellido": "Martínez", "dni": "41000000", "email": "laura.m@email.com"}'
```

**Ejemplo con JavaScript (fetch)**

```js
const res = await fetch('http://localhost:3001/api/personas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nombre: 'Laura',
    apellido: 'Martínez',
    dni: '41000000',
    email: 'laura.m@email.com'
  })
});
const nuevaPersona = await res.json();
console.log(nuevaPersona);
```

**Response exitoso — `201 Created`**

```json
{
  "id": 4,
  "nombre": "Laura",
  "apellido": "Martínez",
  "dni": "41000000",
  "direccion": null,
  "email": "laura.m@email.com",
  "telefono": null,
  "fecha_nac": null
}
```

**Response de error — `500 Internal Server Error`** (ej: DNI duplicado)

```json
{
  "error": "duplicate key value violates unique constraint \"personas_dni_key\""
}
```

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
│   ├── controllers/            # Validación de entrada + respuesta JSON
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
├── files/                      # DER, colección de Postman, docs del Banco Central
├── README.md
└── Notas.txt                   # Bitácora de cómo fue evolucionando el proyecto
```

---

## Ejemplos con Bruno y Postman

### Bruno

[Bruno](https://www.usebruno.com/) es un cliente REST open source que guarda las colecciones como archivos en tu proyecto.

#### GET /api/personas

Creá un archivo `requests/get_personas.bru` dentro de tu colección:

```
meta {
  name: Obtener Personas
  type: http
  seq: 1
}

get {
  url: http://localhost:3001/api/personas
  body: none
  auth: none
}
```

#### POST /api/personas

Creá un archivo `requests/crear_persona.bru`:

```
meta {
  name: Crear Persona
  type: http
  seq: 2
}

post {
  url: http://localhost:3001/api/personas
  body: json
  auth: none
}

body:json {
  {
    "nombre": "Laura",
    "apellido": "Martínez",
    "dni": "41000000",
    "email": "laura.m@email.com"
  }
}
```

---

### Postman

#### Importar como colección

Podés importar el siguiente JSON en Postman desde **File → Import → Raw text**:

```json
{
  "info": {
    "name": "API Banco",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Obtener Personas",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3001/api/personas",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3001",
          "path": ["api", "personas"]
        }
      }
    },
    {
      "name": "Crear Persona",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"nombre\": \"Laura\",\n  \"apellido\": \"Martínez\",\n  \"dni\": \"41000000\",\n  \"email\": \"laura.m@email.com\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "http://localhost:3001/api/personas",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3001",
          "path": ["api", "personas"]
        }
      }
    }
  ]
}
```

#### Usando variables de entorno en Postman

Para no hardcodear la URL base, podés crear un **Environment** en Postman con la variable `base_url`:

| Variable   | Value                     |
|------------|---------------------------|
| `base_url` | `http://localhost:3001`   |

Y usar las URLs así:

```
GET  {{base_url}}/api/personas
POST {{base_url}}/api/personas
GET  {{base_url}}/api/tablas/productos
GET  {{base_url}}/api/tablas/cuentas_bancarias
GET  {{base_url}}/api/tablas/tarjetas_credito
```
# LBZ-PP1_banco
