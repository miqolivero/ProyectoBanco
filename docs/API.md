# Referencia de la API

API REST del backend de Calamuchita Bank. **55 endpoints** agrupados por recurso.

- **URL base en desarrollo:** `http://localhost:3001`
- **Formato:** JSON en request y response (`Content-Type: application/json`)
- **Colección de Postman:** [`files/postman.collection.json`](../files/postman.collection.json)

---

## Índice

1. [Autenticación](#1-autenticación)
2. [Códigos de respuesta](#2-códigos-de-respuesta)
3. [Personas y cuentas](#3-personas-y-cuentas) — `/api/personas`
4. [Movimientos](#4-movimientos) — `/api/movimientos`
5. [Pago de servicios](#5-pago-de-servicios) — `/api/servicios`
6. [Reservas y ahorros](#6-reservas-y-ahorros) — `/api/reservas`
7. [Tarjetas de crédito](#7-tarjetas-de-crédito) — `/api/tarjetas`
8. [Plazos fijos](#8-plazos-fijos) — `/api/plazos-fijos`
9. [Préstamos](#9-préstamos) — `/api/prestamos`
10. [Seguros](#10-seguros) — `/api/seguros`
11. [Inversiones en CEDEARs](#11-inversiones-en-cedears) — `/api/cedears`
12. [Asistente con IA](#12-asistente-con-ia) — `/api/asistente`
13. [Health check](#13-health-check)

---

## 1. Autenticación

Casi todos los endpoints exigen un **JWT de sesión de Clerk** en el header:

```
Authorization: Bearer <token>
```

En el frontend esto es automático: `frontend/src/config/api.js` lo agrega a toda request
dirigida al backend, así que los componentes no se ocupan del token.

No alcanza con estar autenticado: los endpoints que devuelven datos de una persona verifican
además que **el recurso pedido sea del titular de la sesión** (`exigirCbuPropio` /
`exigirPersonaPropia`). Pedir el historial del CBU de otra persona con un token válido devuelve
`403`, no los datos.

### Endpoints públicos

Estos se pueden llamar sin token, porque no exponen datos de nadie: devuelven datos de
referencia iguales para todo el mundo, o el estado del servicio.

| Endpoint | Qué devuelve |
|---|---|
| `GET /api/health` | Estado del servicio y de la conexión a la base |
| `GET /api/movimientos/cambio/cotizacion` | Cotización pública del dólar |
| `GET /api/plazos-fijos/tasa` | Tasa de referencia pública |
| `GET /api/servicios/empresas` | Catálogo de empresas de servicios |
| `GET /api/servicios/empresas/:idEmpresa/deuda` | Facturas impagas de un número de cliente |
| `GET /api/seguros/productos` | Catálogo de productos de seguro |
| `GET /api/cedears/catalogo` | Cotizaciones del mercado |

### Endpoints que exigen sesión pero no pasan por `requireAuth`

Son tres, y los tres son del alta de usuario. `requireAuth` no les sirve porque ese middleware
busca la fila local de la persona, que durante el registro todavía no existe. Pero **no son
públicos**: validan la sesión dentro del controlador y exigen que el `clerkId` de la URL o del
body sea exactamente el de la sesión que hace la request. Sin sesión, o con el `clerkId` de otro,
responden `401`.

| Endpoint | Por qué no usa `requireAuth` |
|---|---|
| `POST /api/personas` | Crea la fila local: todavía no hay nada que buscar |
| `GET /api/personas/clerk/:clerkId` | Consulta si el usuario de Clerk ya completó el onboarding |
| `GET /api/personas/verificar/:clerkId` | Igual que el anterior (alias histórico) |

Esa validación es la que evita que se usen como buscador de usuarios ajenos: sin ella,
cualquiera con un `clerkId` podría leer nombre, DNI, email y CBU de esa persona.

---

## 2. Códigos de respuesta

| Código | Significado |
|---|---|
| `200` | OK |
| `201` | Recurso creado / operación registrada |
| `400` | Faltan datos, el monto no es válido, o la regla de negocio rechaza la operación (saldo insuficiente, plazo no permitido, etc.) |
| `401` | No hay token o es inválido |
| `403` | El token es válido pero el recurso es de otra persona (o el modo demo bloquea la operación) |
| `404` | El recurso no existe (cuenta local, destinatario en la red central) |
| `409` | Conflicto: DNI o alias ya registrados |
| `500` | Error no controlado del servidor |
| `502` | El Banco Central no está disponible |
| `503` | El servicio no está configurado (faltan claves de Clerk o de Gemini) |

Los errores siempre devuelven `{ "error": "mensaje explicativo" }`.

---

## 3. Personas y cuentas

Base: `/api/personas`

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/` | ✅ | Lista de personas con su cuenta principal |
| `POST` | `/` | — | **Registro**: crea persona + producto + cuenta en ARS |
| `GET` | `/clerk/:clerkId` | — | Busca una persona por su id de Clerk |
| `GET` | `/verificar/:clerkId` | — | Indica si el usuario de Clerk ya completó el onboarding |
| `GET` | `/:id/roles` | ✅ | Roles asignados a la persona |
| `GET` | `/:id/productos` | ✅ | Productos contratados por la persona |
| `GET` | `/:id/cuenta-usd` | ✅ | Devuelve la cuenta en USD, si la tiene |
| `POST` | `/:id/cuenta-usd` | ✅ | Abre una caja de ahorro en USD |
| `PUT` | `/:cbu/alias` | ✅ | Cambia el alias de una cuenta |
| `PUT` | `/:id/perfil` | ✅ | Actualiza email, teléfono y dirección |

### `POST /api/personas` — Registro

Crea la persona en la base **y la registra en el Banco Central**, que es quien asigna el CBU.
Todo ocurre en una sola transacción: si el Central falla, no queda una persona a medio crear.

**Body:**

```json
{
  "nombre": "Juan",
  "apellido": "Pérez",
  "dni": "35123456",
  "email": "juan.perez@email.com",
  "telefono": "3546441122",
  "fecha_nacimiento": "1990-05-15",
  "direccion": "Av. San Martín 450",
  "alias": "juan.perez.ars",
  "clerkId": "user_2abc..."
}
```

**Validaciones:**
- Todos los campos salvo `alias` son obligatorios.
- **Edad mínima 18 años**, calculada sobre `fecha_nacimiento` en el servidor.
- `dni` y `alias` únicos (`409` si ya existen).

**Respuesta `201`:** la persona creada con su `cbu` y `alias` asignados.

### `PUT /api/personas/:cbu/alias`

```json
{ "nuevoAlias": "mi.alias.nuevo" }
```

Solo letras minúsculas, números, puntos y guiones. Devuelve `409` si el alias está ocupado.

---

## 4. Movimientos

Base: `/api/movimientos`

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/historial?cbu=...` | ✅ | Historial de movimientos de una cuenta |
| `POST` | `/transferir` | ✅ | Transferencia a otra cuenta (propia o de otro banco) |
| `GET` | `/sincronizar?minutos=30` | ✅ | Trae del Central las transferencias recibidas y las acredita |
| `POST` | `/depositar` | ✅ | Depósito de efectivo |
| `POST` | `/recargar` | ✅ | Recarga de celular |
| `GET` | `/validar-destino/:destino` | ✅ | Resuelve un CBU o alias y devuelve el titular |
| `GET` | `/cambio/cotizacion` | — | Cotización oficial del dólar (compra y venta) |
| `POST` | `/cambio` | ✅ | Compra o venta de dólares entre cuentas propias |

### `POST /api/movimientos/transferir`

```json
{
  "cbu_origen": "0040001535123456000101",
  "cbu_destino": "lucia.benitez.ars",
  "monto": 45000,
  "concepto": "Alquiler"
}
```

`cbu_destino` acepta un **CBU de 22 dígitos o un alias**: si no son 22 dígitos, se resuelve el
alias contra el Banco Central. El destino puede pertenecer a otro banco de la red del curso.

**Qué hace, en orden:**
1. Valida que `cbu_origen` exista y sea de la sesión.
2. Resuelve el alias y busca el nombre del titular destino (best effort).
3. **Reserva el saldo** de forma atómica. Si no hay fondos → `400`.
4. Envía la transferencia al Banco Central. Si la rechaza, **revierte la reserva**.
5. Registra el movimiento local.

**Errores:** `400` saldo insuficiente o monedas distintas · `403` el CBU de origen no es tuyo ·
`404` destinatario inexistente en la red central · `502` el Central no responde.

### `GET /api/movimientos/historial?cbu=...`

Devuelve los movimientos ordenados de más nuevo a más viejo, con el tipo de operación resuelto:

```json
[
  {
    "id_movimiento": 113,
    "monto": "-80000.00",
    "fecha_movimiento": "2026-09-28T14:20:00.000Z",
    "descripcion": "Transferencia a BENITEZ LUCIA",
    "cbu_origen": "0040001535123456000101",
    "cbu_destino": "0040001538777111000104",
    "id_transaccion_central": "CB-2026-0092803",
    "tipo_movimiento": "TRANSFERENCIA_ENVIADA"
  }
]
```

> **Detalle importante del filtro:** la query devuelve un movimiento solo si
> `(cbu_origen = cbu AND monto < 0)` o `(cbu_destino = cbu AND monto > 0)`. Así una transferencia
> entre dos cuentas del propio banco no aparece duplicada. La consecuencia es que **todo
> movimiento necesita `cbu_origen` y `cbu_destino` cargados** — en operaciones locales ambos son
> el CBU propio. Un movimiento con esos campos en `NULL` afecta el saldo pero no se ve en el
> historial.

### `POST /api/movimientos/depositar`

```json
{ "cbu": "0040001535123456000101", "monto": 250000 }
```

Es la única vía por la que entra dinero nuevo al sistema, así que tiene **tope diario**:
$10.000.000 para cuentas en ARS y US$5.000 para cuentas en USD, medido sobre los depósitos ya
acreditados ese día en esa cuenta.

### `POST /api/movimientos/recargar`

```json
{ "cbu": "...", "monto": 5000, "operadora": "Movistar", "numero": "3546441122" }
```

Operadoras: `Movistar`, `Personal`, `Claro`, `Tuenti`.

### `POST /api/movimientos/cambio`

```json
{ "cbu": "0040001535123456000101", "monto": 154500 }
```

La dirección se deduce de la moneda de la cuenta de origen: si es ARS **compra** dólares (usa la
cotización de venta), si es USD **vende** (usa la de compra). Requiere tener las dos cuentas
abiertas. Debita una y acredita la otra en la misma transacción.

---

## 5. Pago de servicios

Base: `/api/servicios`

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/empresas` | — | Catálogo de empresas (Epec, Ecogas, Aguas Villa Maria, Fibertel, Flow) |
| `GET` | `/empresas/:idEmpresa/deuda?numero_cliente=...` | — | Facturas pendientes de ese cliente |
| `POST` | `/pagar` | ✅ | Paga una factura |
| `GET` | `/agendados?idPersona=...` | ✅ | Servicios agendados de la persona |
| `POST` | `/agendados` | ✅ | Agenda un servicio |
| `PUT` | `/agendados/:idAgenda` | ✅ | Modifica un servicio agendado |
| `DELETE` | `/agendados/:idAgenda?idPersona=...` | ✅ | Elimina un servicio agendado |
| `POST` | `/agendados/debitar` | ✅ | Ejecuta los débitos automáticos del mes |

### `POST /api/servicios/pagar`

```json
{ "id_factura": 1, "cbu": "0040001535123456000101" }
```

Debita el saldo, marca la factura `PAGADA` y registra el movimiento, todo en una transacción.
Devuelve `400` si la factura ya estaba pagada o si no hay saldo.

### `POST /api/servicios/agendados`

```json
{
  "idPersona": 1,
  "id_empresa": 4,
  "numero_cliente": "77821",
  "alias": "Internet de casa",
  "monto_fijo": 17900,
  "dia_vencimiento": 10,
  "debito_automatico": true
}
```

`monto_fijo` en `null` deja el servicio como acceso rápido, sin generación automática de
facturas. `dia_vencimiento` va de 1 a 28.

---

## 6. Reservas y ahorros

Base: `/api/reservas`. **Todos requieren auth.**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/?cbu=...` | Reservas de la cuenta |
| `POST` | `/` | Crea una reserva |
| `POST` | `/aportar` | Mueve dinero de la cuenta a la reserva |
| `POST` | `/retirar` | Devuelve dinero de la reserva a la cuenta |
| `DELETE` | `/:idReserva` | Elimina una reserva (body: `{ cbu }`) |

```json
// POST /  — crear
{ "cbu": "...", "nombre": "Vacaciones 2027", "monto_objetivo": 600000, "fecha_meta": "2027-01-15" }

// POST /aportar  y  POST /retirar
{ "id_reserva": 1, "monto": 50000, "cbu": "..." }
```

Aportar **debita el saldo de la cuenta**, así que el saldo disponible que ve el cliente ya
excluye lo reservado sin ningún cálculo extra. Retirar más de lo que tiene la reserva devuelve
`400`.

---

## 7. Tarjetas de crédito

Base: `/api/tarjetas`. **Todos requieren auth.**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/persona/:idPersona` | Tarjetas de la persona con su resumen |
| `POST` | `/solicitar` | Emite una tarjeta nueva |
| `POST` | `/consumos` | Registra un consumo y genera sus cuotas |
| `POST` | `/pagar` | Paga una cuota |

### `POST /api/tarjetas/solicitar`

```json
{ "idPersona": 1, "marca": "Visa" }
```

Marcas: `Visa` o `Mastercard`, una de cada una por persona. El número se genera localmente con
prefijo de la marca y dígito verificador de Luhn válido. Límite inicial $500.000.

### `POST /api/tarjetas/consumos`

```json
{ "id_tarjeta": 1, "comercio": "Supermercado Cordiez", "monto_total": 125000, "cantidad_cuotas": 3, "idPersona": 1 }
```

Genera una fila por cuota con vencimiento mensual. `cantidad_cuotas` entre 1 y 24.

> `idPersona` es **obligatorio** y se valida contra el titular real de la tarjeta. Si no coincide
> devuelve "Esa tarjeta no te pertenece". Antes el endpoint aceptaba cualquier `id_tarjeta`, lo
> que permitía cargar consumos en la tarjeta de otra persona.

El resumen que devuelve `GET /persona/:idPersona` trae `limite_compra`, `consumido` (suma de
cuotas pendientes), `disponible` y el detalle de cuotas.

---

## 8. Plazos fijos

Base: `/api/plazos-fijos`

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/tasa` | — | Tasa vigente y plazos permitidos |
| `GET` | `/?cbu=...` | ✅ | Plazos fijos de la cuenta |
| `POST` | `/` | ✅ | Constituye un plazo fijo |
| `POST` | `/liquidar` | ✅ | Liquida uno vencido |

```json
// GET /tasa
{ "tasaReferencia": 70.952, "spreadBps": 200, "tnaOfrecida": 68.952, "plazosPermitidos": [30, 60, 90, 180] }

// POST /  — constituir
{ "cbu": "...", "capital": 200000, "plazo_dias": 90 }

// POST /liquidar
{ "id_plazo_fijo": 1, "cbu": "..." }
```

La tasa es el promedio de ~30 bancos que publica ArgentinaDatos **menos 200 bps**. El interés es
simple: `capital × tna/100 × días/365`.

**Liquidar antes del vencimiento devuelve `400`.** El mínimo de 30 días es una regulación real
del BCRA y no hay forma de saltearla desde la API.

---

## 9. Préstamos

Base: `/api/prestamos`. **Todos requieren auth** (la tasa es personalizada).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/tasa` | Tasa vigente para *esta* persona |
| `POST` | `/simular` | Cuota y tabla de amortización, sin guardar nada |
| `GET` | `/capacidad?cbu=...` | Cuánto puede pedir todavía |
| `GET` | `/?cbu=...` | Préstamos de la cuenta con sus cuotas |
| `POST` | `/` | Solicita un préstamo |
| `POST` | `/pagar` | Paga una cuota |

```json
// GET /tasa
{ "tasaReferencia": 70.952, "spreadBps": 0, "tnaOfrecida": 70.952,
  "plazosPermitidos": [6, 12, 18, 24, 36, 48], "bonificado": true }

// POST /simular
{ "monto": 300000, "plazo_meses": 6 }

// POST /  — solicitar
{ "cbu": "...", "monto": 300000, "plazo_meses": 6 }

// POST /pagar
{ "id_cuota": 1, "cbu": "..." }
```

**`bonificado: true`** significa que la persona ya pagó un préstamo completo sin ninguna cuota
fuera de término, y por eso se le ofrece la tasa de referencia **sin** el spread de 1000 bps.

**Qué valida antes de otorgar:**
1. El plazo está entre los permitidos.
2. La **situación crediticia** en `/central-deudores` del Banco Central no es 3 o peor (escala
   BCRA). Esto consulta lo informado por **todos los bancos del curso**, no solo por nosotros.
3. El endeudamiento total (capital pendiente de todos los préstamos activos + el nuevo monto) no
   supera `max(saldo × 5, $100.000)`.
4. No tiene ya 3 préstamos activos.

Al otorgarlo informa la deuda al Central, y cuando se paga la última cuota la informa en 0.

---

## 10. Seguros

Base: `/api/seguros`

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/productos` | — | Catálogo (Vida, Hogar, Accidentes Personales) |
| `POST` | `/cotizar` | ✅ | Calcula la prima, sin guardar nada |
| `POST` | `/contratar` | ✅ | Contrata y cobra la primera prima |
| `GET` | `/persona/:idPersona` | ✅ | Pólizas de la persona |
| `POST` | `/cancelar` | ✅ | Da de baja una póliza |

```json
// POST /cotizar
{ "idPersona": 1, "id_producto_seguro": 1, "suma_asegurada": 15000000 }

// POST /contratar
{ "cbu": "...", "id_producto_seguro": 1, "suma_asegurada": 15000000, "beneficiarios": "Ana Pérez (cónyuge)" }

// POST /cancelar
{ "id_poliza": 1, "idPersona": 1 }
```

`prima_mensual = suma_asegurada × factor / 1000`, con el factor según la edad: 0.5 (18-30),
0.8 (31-45), 1.5 (46-60), 3.0 (61-75), 5.0 (75+).

Contratar **debita la primera prima en el acto**. No hay cobro recurrente automático de las
primas siguientes.

---

## 11. Inversiones en CEDEARs

Base: `/api/cedears`

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/catalogo` | — | 20 CEDEARs con cotización en vivo |
| `POST` | `/ordenes` | ✅ | Registra una compra o venta |
| `GET` | `/persona/:idPersona/portafolio` | ✅ | Tenencias con ganancia no realizada |

```json
// POST /ordenes
{ "cbu": "...", "ticker": "AAPL", "cantidad": 10, "tipo": "COMPRA" }
```

El **precio no se envía**: lo toma el backend de la cotización en vivo al momento de la orden,
para que el cliente no pueda elegir a qué precio compra. `tipo` es `COMPRA` o `VENTA`.

El portafolio se **calcula agregando las órdenes** (cantidad neta = compras − ventas, precio
promedio ponderado sobre las compras); no hay tabla de tenencias que pueda desincronizarse.
Vender más de lo que se tiene devuelve `400`.

---

## 12. Asistente con IA

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `POST` | `/api/asistente/chat` | ✅ | Pregunta en lenguaje natural sobre la propia cuenta |

```json
// request
{ "mensaje": "¿Cuánto transferí este mes?", "interactionId": "v1_Ch..." }

// response
{ "respuesta": "En septiembre transferiste $125.000 en total...", "interactionId": "v1_Ch..." }
```

`interactionId` es opcional: enviándolo de vuelta se mantiene el hilo de la conversación.

El modelo **no consulta la base**: solo puede pedir la ejecución de 8 funciones de solo lectura,
y ninguna acepta un parámetro de identidad — la persona sale siempre de la sesión verificada. No
hay forma de que una pregunta apunte a la cuenta de otro, y el asistente no puede ejecutar
operaciones.

Devuelve `503` si falta `GEMINI_API_KEY`.

---

## 13. Health check

| Método | Ruta | Auth | Descripción |
|---|---|:--:|---|
| `GET` | `/api/health` | — | Estado del servicio y de la conexión a la base |

```json
{ "ok": true, "db": "ok" }
```

Devuelve `503` con `{ "ok": false, "db": "error" }` si el servidor está arriba pero no llega a la
base. Es lo primero que conviene mirar cuando algo no funciona después de desplegar.

---

## Para seguir leyendo

- [README](../README.md) — arquitectura, instalación y despliegue
- [DECISIONES.md](DECISIONES.md) — por qué la API está diseñada así
- [MANUAL-USUARIO.md](MANUAL-USUARIO.md) — qué hace cada pantalla y los casos de prueba
