# Base de datos

Referencia del modelo de datos: las 22 tablas, el diagrama de entidad-relación y los datos de
ejemplo que carga el seed.

Para entender **por qué** el modelo está así (y en particular por qué `Productos` es la tabla
central), ver [DECISIONES.md](DECISIONES.md). Para los comandos de creación, ver
[README → Cómo levantar el proyecto](../README.md#cómo-levantar-el-proyecto).

---

## Índice

1. [Esquema](#esquema)
2. [Diagrama de entidad-relación (DER)](#diagrama-de-entidad-relación-der)
3. [Datos de ejemplo](#datos-de-ejemplo)

---

## Esquema

Definido en [`backend/init/01_schema.sql`](../backend/init/01_schema.sql). Son **22 tablas**: 8 del
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

El diagrama está en [`files/DER.png`](../files/DER.png). Para generarlo o modificarlo podés importar
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

## Datos de ejemplo

Definidos en [`backend/init/02_data.sql`](../backend/init/02_data.sql). El volumen es deliberado: son
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

## Para seguir leyendo

- [README](../README.md) — qué es el sistema, arquitectura e instalación
- [DECISIONES.md](DECISIONES.md) — por qué el modelo de datos está así
- [API.md](API.md) — los endpoints que consultan y escriben estas tablas
