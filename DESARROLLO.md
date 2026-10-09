# 🏦 Sistema de Homebanking — Calamuchita Bank

Este documento es la **bitácora del proyecto**: cómo fue creciendo fase por fase, qué problema
nos obligó a cada cambio y qué se rompió en el camino. Está escrito en orden cronológico, así
que leerlo de arriba hacia abajo cuenta la historia completa del desarrollo.

- Si buscás **qué es y cómo correrlo** → [README.md](README.md)
- Si buscás **por qué está construido así** → [docs/DECISIONES.md](docs/DECISIONES.md)
- Si buscás **cómo se usa** → [docs/MANUAL-USUARIO.md](docs/MANUAL-USUARIO.md)

---

## Qué construimos

Una plataforma digital de homebanking para un banco chico. Permite a los clientes gestionar sus
cuentas, transferir dinero en tiempo real **a cuentas de otros bancos de la red del curso**,
registrar depósitos y operar con productos financieros (tarjetas, préstamos, plazos fijos,
seguros e inversiones).

El sistema está construido con una **arquitectura desacoplada** que separa el Frontend (React)
del Backend (Node.js/Express), sobre una base de datos relacional (PostgreSQL).

---

## 🏗️ Arquitectura del Backend (MVC)

El servidor está estructurado dividiendo las responsabilidades en tres capas:

- **Routes** — definen los caminos (endpoints) por los que el frontend se comunica con el
  servidor, y declaran qué endpoints exigen sesión válida.
- **Controllers** — contienen la validación de los datos entrantes, los chequeos de autorización
  y la coordinación con las APIs externas.
- **Models** — manejan exclusivamente la conexión con PostgreSQL mediante `pg.Pool`, ejecutando
  las consultas SQL y las transacciones (`BEGIN` / `COMMIT` / `ROLLBACK`).

Esta separación se respetó **sin excepciones** en todas las features que se agregaron después, de
modo que entender una operación alcanza para entender cómo están hechas las demás.

---

# PRIMER CUATRIMESTRE

## ⏳ Fase 1: Estructura base

- Se montó el servidor inicial con Express y se vinculó la base de datos local PostgreSQL, que
  usamos para almacenar los datos.
- Usamos como punto de partida el repositorio que dejó el profesor en GitHub, que traía un DER y
  una estructura de base de datos que fuimos modificando para cubrir nuestras necesidades.

## 🔹 Fase 2: Consultas locales e historial

- Se crearon las tablas `Cuentas_Bancarias` y `Movimientos` en PostgreSQL.
- Se implementaron los primeros endpoints de lectura, empezando por
  `GET /api/movimientos/historial` (usa `Movimiento.obtenerTodos(cbu)`).

**Desafío resuelto:** el historial no aparecía en la grilla. El problema estaba en el mapeo de
propiedades del frontend, que no coincidía con el nombre real de la columna de la base
(`fecha_movimiento`). Corregirlo hizo que el historial impactara prolijamente en la vista.

## 🔹 Fase 3: Integración con la red central (API externa)

**El gran salto:** conectamos nuestro banco local con el ecosistema del *Central Bank* del
profesor.

**Desafío:** enviar los datos del registro de una persona nueva al Banco Central y recibir el CBU
que le asignaba, todo de forma simultánea. Lo resolvimos en el `personaController`: hace el POST
a la API central y guarda la información de registro a través del modelo de persona, en una sola
operación.

**EL HITO:** nos comunicamos con el mundo externo. Con la API del Central empezamos a poder hacer
y recibir transferencias de los demás bancos. Le enviamos al Central la transferencia que
queremos hacer indicando el CBU, y el Central la redirige al banco correspondiente (identificado
por los primeros 3 números del CBU). Internamente nosotros manejamos el descuento del dinero y la
acreditación cuando recibimos una transferencia.

Además modificamos el controlador de transferencias para darle soporte inteligente:

- **Detector de alias:** si el usuario escribe texto en lugar de 22 números, el controlador
  consulta a la API central para traducir el alias a CBU.
- **Sincronización en segundo plano (polling):** creamos el endpoint
  `GET /api/movimientos/sincronizar`, que consulta periódicamente los movimientos aprobados en la
  red externa para impactar los saldos locales y registrar de forma permanente el dinero que nos
  envían terceros.

## 🔹 Fase 4: Autenticación segura (login)

> **El banco necesita que nadie pueda ver la información de los otros clientes.**

Para manejar el login y la creación de cuentas de forma segura implementamos **Clerk**, que nos
dio esa estructura ya armada y, sobre todo, significa que **el banco nunca almacena contraseñas**.

Para la implementación agregamos a la tabla `Personas` una columna nueva: `clerk_id`. Guarda el
identificador que asigna el servicio de Clerk cuando un cliente se registra, y es el que se
valida cuando inicia sesión.

> ⚠️ **Importante:** en esta fase Clerk protegía la *interfaz*, pero el backend todavía confiaba
> en los datos que le mandaba el navegador. Eso se descubrió y se corrigió en la Fase 9, y es uno
> de los aprendizajes más grandes del proyecto.

## 🔹 Fase 5: Depósitos locales e interfaz avanzada

**Necesidad:** el enunciado requería registrar depósitos en efectivo, que no pasan por la red del
Banco Central.

- **Backend:** creamos `Movimiento.registrarDepositoLocal` y su endpoint
  `POST /api/movimientos/depositar`.
- **Frontend:** desarrollamos un módulo exclusivo `Depositar.jsx` para simular la carga por
  terminales de autoservicio.

**Desafío resuelto:** el saldo no se actualizaba "en vivo" después de depositar. Lo solucionamos
reconectando la función de refresco (`actualizarDatosBase`) con los procesos de sincronización en
segundo plano.

---

# SEGUNDO CUATRIMESTRE

El segundo cuatrimestre sumó nueve funcionalidades financieras, la autenticación real en el
backend, un asistente con inteligencia artificial y el despliegue a producción.

## 🔹 Fase 6: Sincronizar el esquema versionado con la base real

Antes de agregar una sola tabla nueva, hubo que arreglar algo que venía arrastrándose.

**El problema:** `init/01_schema.sql` (el script versionado en Git) ya **no reflejaba la base de
datos real**. A la base le habíamos agregado columnas a mano durante el primer cuatrimestre
(`cbu_origen`, `cbu_destino`, `id_transaccion_central`, `clerk_id`) que nunca volvieron al script.
También diferían los datos iniciales de `Tipos_Movimiento`.

**Por qué importaba:** cada feature nueva iba a agregar tablas. Si seguíamos escribiendo
migraciones a mano sin actualizar el script, en pocas semanas nadie iba a poder recrear la base
desde cero — ni nosotros, ni la cátedra si lo pedía.

**La regla que adoptamos desde acá:** toda modificación del esquema se aplica **en los dos
lugares** (la base real y el script versionado) en el mismo commit. Se respetó durante todo el
resto del proyecto.

## 🔹 Fase 7: Las nueve funcionalidades financieras

Se implementaron de a una, en orden de complejidad creciente, para validar el patrón completo
(tabla → modelo → controlador → ruta → pantalla) con lo más simple antes de encarar lo que tenía
más superficie.

| # | Funcionalidad | Lo interesante |
|---|---|---|
| 1 | Recargas de celular | La más simple: sirvió para validar el patrón de punta a punta |
| 2 | Reportes y estadísticas | Se resolvió en el cliente agregando los movimientos que ya se traían, sin endpoint nuevo |
| 3 | Pago de servicios | Catálogo propio del banco con facturas y, después, servicios agendados con débito automático |
| 4 | Reservas y ahorros | "Bolsillos" dentro de la misma cuenta |
| 5 | Tarjetas de crédito | Activó `Tarjetas_Credito`, que estaba en el esquema pero sin usar |
| 6 | Plazos fijos | Primera integración con tasas reales de mercado |
| 7 | Préstamos | Amortización francesa + situación crediticia compartida de la red |
| 8 | Seguros | Cotización por franja etaria |
| 9 | Inversiones en CEDEARs | Cotizaciones en vivo y portafolio calculado |

**Desafíos resueltos en el camino:**

- **Reportes:** descubrimos que transferencias viejas estaban mal categorizadas como `DEBITO`
  genérico en vez de `TRANSFERENCIA_ENVIADA`/`RECIBIDA`, así que el desglose por categoría daba
  mal. Hubo que corregir 33 filas históricas por ID exacto.
- **Pago de servicios:** al renombrar las empresas del catálogo usamos `UPDATE` en vez de
  `DELETE` + `INSERT`, para no romper la clave foránea de las facturas ya vinculadas.
- **Tarjetas:** probamos dos APIs públicas de datos falsos para generar números de tarjeta. Una
  devolvía error 502 y la otra tenía el dominio dado de baja, así que decidimos no depender de un
  tercero: los generamos localmente con dígito verificador de Luhn válido.
- **Plazos fijos:** la API de tasas no devuelve "una" tasa de referencia, sino la de cada uno de
  ~30 bancos. Usamos el promedio, documentado en el código como simplificación deliberada.
- **Préstamos:** el usuario detectó que **no había ningún tope de monto** — una cuenta recién
  creada podía pedir una cifra exorbitante y se aprobaba igual, porque solo se validaba que el
  monto fuera positivo. Se agregó el tope de endeudamiento (5× el saldo, con piso de $100.000),
  sumando el capital pendiente de todos los préstamos activos para que no se pudiera eludir
  pidiendo varios chicos.
- **CEDEARs:** la API devolvía 963 símbolos, incluyendo las variantes dólar-cable y MEP de cada
  papel (`AAPLD`, `AAPLC`). Elegir entre 963 nombres casi idénticos era peor para el usuario que
  elegir entre 20 conocidos, así que curamos el catálogo. La cotización sigue siendo en vivo.
- **Exportación a Excel:** la última versión de la librería `xlsx` publicada en npm tiene
  vulnerabilidades conocidas. Se instala desde el paquete oficial de SheetJS, que ya las tiene
  corregidas.

## 🔹 Fase 8: Cuenta en dólares y cambio de divisa

Esta fase estuvo bloqueada un tiempo esperando que la cátedra publicara el endpoint para abrir
cuentas en otras monedas. Cuando apareció, resultó casi un calco del registro de personas: una
caja en dólares es un segundo `Producto` del mismo tipo con su propia `Cuenta_Bancaria`, así que
el modelo de datos lo soportaba **sin cambios**.

Lo mejor de esta fase es lo que **no** hubo que hacer: los depósitos y el historial funcionaron
sobre la cuenta nueva sin tocar una línea, porque esos endpoints ya operaban por CBU sin asumir
la moneda. Una señal de que las decisiones anteriores habían sido razonables.

**Desafío resuelto:** probando la apertura, el Banco Central estaba caído y devolvía una página
HTML de error en vez de JSON. El código hacía `response.json()` sin más y explotaba con un error
incomprensible (`Unexpected token '<'`). Se agregó manejo del caso, devolviendo un `502` claro:
"El Banco Central no está disponible".

## 🔹 Fase 9: Auditoría de seguridad — la fase más importante

Pedimos una revisión buscando bugs de dinero ("dinero infinito, transferencias erróneas") y lo
que apareció fue bastante peor de lo esperado. Esta fase no agregó ninguna funcionalidad nueva,
pero es la que más cambió el proyecto.

### Problema 1: el backend confiaba en el navegador

**Lo que encontramos:** Clerk protegía la interfaz, pero el backend recibía el `cbu` o el
`idPersona` en el body de la request y los usaba sin verificar nada. Llamando la API directamente
con `curl`, **sin pasar por la pantalla**, cualquiera podía consultar el historial de otro
cliente o transferir desde una cuenta ajena.

**La lección:** proteger la interfaz no es proteger el sistema. El navegador es "mentiroso",
como dice la consigna, y la única validación que cuenta es la del servidor.

**La solución:** `backend/middlewares/auth.js`, con `requireAuth` para validar el JWT de Clerk y
`exigirCbuPropio` / `exigirPersonaPropia` para verificar a nivel de fila que el recurso sea del
titular de la sesión. Se aplicó en los ~40 endpoints que tocan datos de alguien.

**Desafío técnico:** la librería `@clerk/express` necesita **las dos** claves (secreta y
publicable), y con configuración incompleta se comportaba de forma impredecible — a veces dejaba
pasar la request sin autenticar en lugar de cortar. Lo resolvimos no instanciándola si falta
alguna clave: en ese caso los endpoints protegidos responden `503`. **Falla cerrado, no abierto.**

### Problema 2: la race condition del saldo

Era exactamente el riesgo que la consigna anticipaba. El código leía el saldo, decidía, y después
escribía:

```js
const saldo = await obtenerSaldo(cbu);       // 1. leer
if (saldo < monto) throw new Error('...');    // 2. decidir
await actualizarSaldo(cbu, saldo - monto);    // 3. escribir
```

Entre el paso 1 y el 3 hay una ventana. Dos transferencias simultáneas leían el mismo saldo,
las dos pasaban la validación y las dos descontaban.

**La solución** fue mover la condición **dentro** del `UPDATE`, para que verificar y descontar
sean una sola operación atómica que resuelve la base:

```sql
UPDATE Cuentas_Bancarias SET saldo = saldo - $2 WHERE cbu = $1 AND saldo >= $2
```

**Verificado:** se lanzaron dos reservas grandes simultáneas con `Promise.all`. Solo una tuvo
éxito y el saldo quedó exacto. Antes del cambio pasaban las dos.

### Problema 3: la doble acreditación

El proceso que trae las transferencias entrantes verificaba "¿ya la registré?" con un `SELECT` y
después insertaba. Si el proceso corría dos veces en paralelo (la app abierta en dos pestañas),
las dos pasaban el chequeo antes de que cualquiera insertara: **la misma transferencia acreditada
dos veces**. Dinero creado de la nada.

**La solución:** un índice único parcial en la base sobre `id_transaccion_central`, y el código
captura el error de unicidad (`23505`) tratándolo como éxito idempotente.

**La lección más valiosa del proyecto:** una validación escrita en código de aplicación **no
puede** proteger una invariante entre procesos concurrentes. Eso solo lo puede garantizar una
restricción en la base de datos.

### Problema 4: un IDOR en los consumos de tarjeta

`registrarConsumo` recibía un `id_tarjeta` y lo usaba sin verificar de quién era la tarjeta. Con
el id de la tarjeta de otra persona se le podían cargar consumos. Se corrigió exigiendo el
`idPersona` de la sesión y validándolo contra el titular real.

### Y además: validación de edad

En la misma fase se agregó el requisito de **18 años** para abrir cuenta, calculado en el servidor
(autoritativo) y también en el cliente (para avisar al instante). El sistema no tiene cuentas de
menor con representante legal, así que un menor no puede tener una cuenta válida.

## 🔹 Fase 10: Asistente con inteligencia artificial

Un chat para consultar la propia cuenta en lenguaje natural: saldo, límite de la tarjeta, cuánto
se transfirió a un CBU en un período, cuotas pendientes.

**La decisión de producto:** tenía que ser **gratis y sin suscripción**, porque el sistema va a
seguir en uso el año que viene. Se eligió Gemini, que tiene nivel gratuito permanente sin tarjeta.

**La decisión de seguridad, que es la importante:** un modelo de lenguaje con acceso a la base es
un riesgo evidente. Confiar en que el prompt le impida leer otras cuentas no es una defensa,
porque los prompts se pueden burlar.

Lo resolvimos de forma **estructural**: el modelo no consulta la base. Solo puede pedir la
ejecución de un conjunto cerrado de funciones de solo lectura, y **ninguna acepta un parámetro de
identidad** — la persona sale siempre de la sesión verificada. No es que esté prohibido pedir los
datos de otro: no hay dónde escribirlo. Se verificó con intentos reales de prompt injection.

**Desafíos resueltos:**

- **La documentación del SDK estaba equivocada.** Decía que las llamadas pendientes a herramientas
  venían en el campo `outputs`; en la práctica vienen en `steps`. Se descubrió volcando la
  respuesta cruda de la API. Ante una discrepancia entre la documentación y la realidad, gana lo
  que hace el sistema.
- **La cuota gratuita se agotaba en dos preguntas.** El modelo al que apuntaba el alias que
  usábamos tenía 20 requests por día, y cada pregunta consume una llamada más una por cada ronda
  de herramientas. Se cambió a la variante "lite", pensada para uso de alto volumen.
- **El asistente inventaba el saldo.** Este fue sutil: la herramienta `obtener_cuentas` devolvía
  solo el CBU y la moneda, sin el saldo. El modelo necesitaba el dato para responder, no lo
  tenía, y **lo inventaba** — devolvía montos y alias que no existían. Se corrigió haciendo que
  la herramienta traiga el saldo real. **La lección:** una herramienta incompleta es peor que una
  herramienta ausente, porque el modelo rellena el hueco en vez de admitir que no sabe.
- **Faltaba la cotización del dólar.** Ante "¿cuántos dólares puedo comprar con mi saldo?", el
  asistente contestaba que no tenía acceso a la cotización — aunque el sistema la usa en la
  pantalla de cambio de divisa. Se le agregó esa herramienta.

## 🔹 Fase 11: Rediseño de la interfaz

Con catorce pantallas, la navegación había quedado incómoda: un menú lateral con catorce ítems
sueltos y un encabezado que repetía información.

- El menú se **agrupó en categorías colapsables** (Movimientos, Pagos, Inversiones, Crédito), con
  un solo grupo abierto a la vez.
- Se unificó el **selector de cuenta** (pesos/dólares) para que cambiar de cuenta signifique lo
  mismo en todas las pantallas.
- El historial sumó **estadísticas colapsables** (resumen, desglose por categoría con barras de
  proporción, evolución mensual) y **exportación real a Excel** en tres hojas.
- La **sincronización con el Banco Central** pasó de reconsultar en cada cambio de pantalla a un
  heartbeat de 30 segundos en segundo plano. La API la usan todos los grupos del curso:
  recargarla con pedidos innecesarios es un problema de los demás, no solo nuestro.
- Se unificó el estilo de los mensajes del banco con el verde institucional y se rediseñaron las
  tarjetas de crédito y el popup de perfil.

## 🔹 Fase 12: Datos de ejemplo y preparación para producción

La última fase fue dejar el proyecto listo para desplegar y para que lo usen otros.

**El problema de los datos:** el script de datos de ejemplo sembraba 3 clientes, 3 cuentas y
**cero movimientos** — casi literalmente el ejemplo que la consigna marca como insuficiente. Una
base recién desplegada arrancaba con el historial vacío, así que no se podía demostrar ni usar
para generar reportes.

Se reescribió para sembrar **11 clientes, 14 cuentas y 113 movimientos** repartidos en 9 meses,
cubriendo los 17 tipos de operación, más tarjetas con cuotas, préstamos, plazos fijos, pólizas,
órdenes de CEDEARs y facturas.

Tres decisiones del script que vale la pena destacar:

- **Los saldos no están escritos a mano:** se calculan al final como la suma de los movimientos
  de cada cuenta. Así es imposible que el saldo y el historial se contradigan.
- **Las edades se reparten entre las cinco franjas** del cotizador de seguros, porque con un solo
  rango no se podía probar completo.
- **Juan Pérez tiene un préstamo pagado en término**, que es el caso que habilita la bonificación
  de tasa. Antes esa feature no se podía demostrar con los datos de ejemplo.

**Desafío resuelto:** al probar el seed contra los modelos reales, el historial de un cliente
mostraba 3 movimientos de los 22 que le habíamos cargado. La causa: la query del historial filtra
por `(cbu_origen = cbu AND monto < 0) OR (cbu_destino = cbu AND monto > 0)` para no duplicar las
transferencias internas, y nosotros habíamos dejado esos campos en `NULL` en las operaciones
locales. Los movimientos existían y el saldo era correcto, pero **no aparecían en el historial ni
en los reportes** — justo el propósito del seed. Se corrigió siguiendo la convención del sistema
(en operaciones locales, origen y destino son el CBU propio).

**Preparación para producción:** se configuró el CORS para aceptar el dominio del frontend
desplegado, se activó SSL automático en la conexión a la base cuando no es local, se agregó un
endpoint de health check, y se separó el repositorio en `backend/` y `frontend/` para poder
desplegar cada uno por su cuenta.

---

## 📡 Endpoints principales

La referencia completa de los 55 endpoints está en [docs/API.md](docs/API.md). Estos son los del
núcleo del sistema:

| Método | Endpoint | Descripción | Componente frontend |
|:---|:---|:---|:---|
| `POST` | `/api/movimientos/transferir` | Valida saldo, resuelve alias y envía el dinero al Banco Central | `<Transferencias />` |
| `GET` | `/api/movimientos/historial` | Historial de la cuenta, filtrando origen/destino para no duplicar | Inicio e Historial |
| `GET` | `/api/movimientos/sincronizar` | Consulta la red central y acredita las transferencias recibidas | Tarea de fondo (cada 30s) |
| `POST` | `/api/movimientos/depositar` | Registra ingresos de efectivo | `<Depositar />` |
| `POST` | `/api/movimientos/cambio` | Compra y venta de dólares entre cuentas propias | `<CambioDivisa />` |
| `PUT` | `/api/personas/:cbu/alias` | Cambia el alias validando que no esté repetido | Tarjeta de saldo |
| `POST` | `/api/prestamos` | Otorga un préstamo tras validar situación crediticia y capacidad | `<Prestamos />` |
| `POST` | `/api/asistente/chat` | Consultas en lenguaje natural sobre la propia cuenta | `<Asistente />` |

---

## 🎓 Lo que aprendimos

Las cinco cosas que nos llevamos del proyecto, más allá del código:

1. **Proteger la pantalla no es proteger el sistema.** Durante meses creímos que el banco era
   seguro porque había login. La API estaba completamente abierta. Lo que vale es la validación
   del servidor; todo lo demás es comodidad para el usuario.

2. **Las validaciones en código no sirven contra la concurrencia.** "Leer, decidir, escribir"
   parece correcto y funciona en todas las pruebas manuales, porque a mano nunca se ejecutan dos
   operaciones en el mismo milisegundo. La garantía tiene que estar en la base de datos.

3. **El modelo de datos define qué reglas se pueden escribir.** Quisimos premiar a quien paga en
   término y no pudimos: solo guardábamos si la cuota estaba pagada, no *cuándo*. La feature era,
   en realidad, una columna que faltaba.

4. **Los datos duplicados se desincronizan.** Donde pudimos, calculamos en vez de guardar: el
   portafolio de CEDEARs se deriva de las órdenes y el saldo del seed se deriva de los
   movimientos. Un dato guardado dos veces es un dato que en algún momento va a estar mal en uno
   de los dos lugares.

5. **Hay que probar contra el sistema real, no contra lo que creemos que hace.** El asistente que
   inventaba saldos, la documentación del SDK que mencionaba un campo inexistente y el seed cuyo
   historial no se veía: los tres se encontraron ejecutando el código de verdad, y ninguno habría
   aparecido leyéndolo.
