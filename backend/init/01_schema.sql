-- 1. TABLAS MAESTRAS (Reemplazan a los ENUM)
CREATE TABLE IF NOT EXISTS Tipos_Producto (
    id_tipo_producto SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL -- 'CAJA_AHORRO', 'TARJETA_CREDITO', etc.
);

CREATE TABLE IF NOT EXISTS Estados_Producto (
    id_estado_producto SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL -- 'ACTIVO', 'BLOQUEADO', etc.
);

-- 2. TABLA DE PERSONAS
CREATE TABLE IF NOT EXISTS Personas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    apellido VARCHAR(255) NOT NULL,
    dni VARCHAR(20) UNIQUE NOT NULL,
    direccion VARCHAR(255),
    email VARCHAR(255),
    telefono VARCHAR(50),
    fecha_nac DATE,
    clerk_id VARCHAR(255) -- ID de usuario de Clerk (auth), vinculado al registrarse
);

-- 3. TABLA DE ROLES
CREATE TABLE IF NOT EXISTS Roles (
    id_rol SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA INTERMEDIA ROLES_X_PERSONAS
CREATE TABLE IF NOT EXISTS Roles_x_Personas (
    id_persona INTEGER NOT NULL,
    id_rol INTEGER NOT NULL,
    PRIMARY KEY (id_persona, id_rol),
    FOREIGN KEY (id_persona) REFERENCES Personas(id) ON DELETE CASCADE,
    FOREIGN KEY (id_rol) REFERENCES Roles(id_rol) ON DELETE CASCADE
);

-- 5. TABLA MAESTRA DE PRODUCTOS (Ahora usa Foreign Keys en vez de ENUM)
CREATE TABLE IF NOT EXISTS Productos (
    id_producto SERIAL PRIMARY KEY,
    id_persona INTEGER NOT NULL,
    id_tipo_producto INTEGER NOT NULL,
    id_estado_producto INTEGER NOT NULL,
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_persona) REFERENCES Personas(id),
    FOREIGN KEY (id_tipo_producto) REFERENCES Tipos_Producto(id_tipo_producto),
    FOREIGN KEY (id_estado_producto) REFERENCES Estados_Producto(id_estado_producto)
);

-- 6. TABLA DE CUENTAS BANCARIAS
CREATE TABLE IF NOT EXISTS Cuentas_Bancarias (
    id_cuenta SERIAL PRIMARY KEY,
    id_producto INTEGER NOT NULL UNIQUE,
    cbu VARCHAR(22) UNIQUE NOT NULL,
    alias VARCHAR(50) UNIQUE,
    moneda VARCHAR(10) DEFAULT 'ARS',
    saldo DECIMAL(15, 2) DEFAULT 0.00,
    FOREIGN KEY (id_producto) REFERENCES Productos(id_producto)
);

-- 7. TABLA DE TARJETAS DE CRÉDITO
CREATE TABLE IF NOT EXISTS Tarjetas_Credito (
    id_tarjeta SERIAL PRIMARY KEY,
    id_producto INTEGER NOT NULL UNIQUE,
    numero_tarjeta VARCHAR(16) UNIQUE NOT NULL,
    marca VARCHAR(50),
    fecha_vencimiento DATE NOT NULL,
    limite_compra DECIMAL(15, 2) NOT NULL,
    dia_cierre INTEGER CHECK (dia_cierre BETWEEN 1 AND 31),
    FOREIGN KEY (id_producto) REFERENCES Productos(id_producto)
);

-- 8. POBLAR TABLAS MAESTRAS (Datos iniciales)
INSERT INTO Tipos_Producto (nombre) VALUES ('CAJA_AHORRO'), ('CUENTA_CORRIENTE'), ('TARJETA_CREDITO');
INSERT INTO Estados_Producto (nombre) VALUES ('ACTIVO'), ('BLOQUEADO'), ('CERRADO');

-- 9. TABLA MAESTRA DE TIPOS DE MOVIMIENTO
CREATE TABLE IF NOT EXISTS Tipos_Movimiento (
    id_tipo_movimiento SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL -- 'DEPOSITO', 'EXTRACCION', 'TRANSFERENCIA', etc.
);

-- 10. TABLA DE MOVIMIENTOS
CREATE TABLE IF NOT EXISTS Movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    id_cuenta INTEGER NOT NULL,
    id_tipo_movimiento INTEGER NOT NULL,
    monto DECIMAL(15, 2) NOT NULL,
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    descripcion VARCHAR(255),
    -- CBU origen/destino y el ID de transacción del Banco Central: se completan en transferencias
    -- interbancarias; en movimientos 100% locales (depósito, recarga) cbu_origen = cbu_destino y
    -- id_transaccion_central queda NULL.
    cbu_origen VARCHAR(22),
    cbu_destino VARCHAR(22),
    id_transaccion_central VARCHAR(100),
    -- Relacionamos con la cuenta bancaria
    FOREIGN KEY (id_cuenta) REFERENCES Cuentas_Bancarias(id_cuenta) ON DELETE CASCADE,
    -- Relacionamos con el tipo de movimiento
    FOREIGN KEY (id_tipo_movimiento) REFERENCES Tipos_Movimiento(id_tipo_movimiento)
);

-- Constraint de última línea de defensa contra doble acreditación: dos pedidos concurrentes de
-- sincronización con el Banco Central (ej. el polling del frontend en dos pestañas/dispositivos)
-- podían pasar ambos el chequeo "¿ya existe?" (un SELECT sin bloqueo) antes de que cualquiera de
-- los dos insertara, acreditando la misma transferencia externa dos veces. El chequeo de
-- aplicación sigue estando (más rápido, evita el viaje a la base en el caso común), pero esto
-- es lo que realmente lo impide si la aplicación falla. Parcial (solo NOT NULL) porque los
-- movimientos 100% locales (depósito, recarga, etc.) dejan id_transaccion_central en NULL y no
-- deben competir entre sí por unicidad.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_id_transaccion_central_unico
    ON Movimientos (id_transaccion_central)
    WHERE id_transaccion_central IS NOT NULL;

-- 11. DATOS INICIALES PARA MOVIMIENTOS
INSERT INTO Tipos_Movimiento (nombre) VALUES
('DEBITO'),
('CREDITO'),
('TRANSFERENCIA_ENVIADA'),
('TRANSFERENCIA_RECIBIDA'),
('RECARGA'),
('PAGO_SERVICIO'),
('APORTE_RESERVA'),
('RETIRO_RESERVA'),
('PAGO_TARJETA'),
('PLAZO_FIJO_CONSTITUCION'),
('PLAZO_FIJO_LIQUIDACION'),
('PRESTAMO_OTORGADO'),
('PAGO_PRESTAMO'),
('PAGO_SEGURO'),
('COMPRA_CEDEAR'),
('VENTA_CEDEAR'),
('CAMBIO_DIVISA');

-- 11.1 PAGO DE SERVICIOS (catálogo propio del banco, mock local: no hay API real de empresas de servicios)
CREATE TABLE IF NOT EXISTS Empresas_Servicio (
    id_empresa SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    rubro VARCHAR(50)
);

-- 11.1.1 SERVICIOS AGENDADOS: guarda una empresa+numero_cliente como acceso rápido, con la
-- opción de fijarle un monto mensual (simula una factura de monto fijo, ej. un abono de
-- internet) y marcarlo para "débito automático" (se paga solo cuando el usuario ejecuta el
-- proceso de vencimientos del mes, en vez de tener que ir a pagar cada factura a mano). Va
-- antes que Facturas_Servicio porque esa tabla la referencia por FK (id_agenda).
CREATE TABLE IF NOT EXISTS Servicios_Agendados (
    id_agenda SERIAL PRIMARY KEY,
    id_persona INTEGER NOT NULL REFERENCES Personas(id),
    id_empresa INTEGER NOT NULL REFERENCES Empresas_Servicio(id_empresa),
    numero_cliente VARCHAR(50) NOT NULL,
    alias VARCHAR(100),                  -- nombre que le pone el usuario, ej. "Internet de casa"
    monto_fijo DECIMAL(15, 2),           -- NULL = solo acceso rápido, sin generación automática de facturas
    dia_vencimiento INTEGER CHECK (dia_vencimiento BETWEEN 1 AND 28),
    debito_automatico BOOLEAN NOT NULL DEFAULT false,
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Facturas_Servicio (
    id_factura SERIAL PRIMARY KEY,
    id_empresa INTEGER NOT NULL REFERENCES Empresas_Servicio(id_empresa),
    id_persona INTEGER REFERENCES Personas(id), -- informativo: a quién pertenece la factura originalmente
    numero_cliente VARCHAR(50) NOT NULL,        -- clave real de búsqueda/pago, no requiere ser el mismo usuario logueado
    importe DECIMAL(15, 2) NOT NULL,
    vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | PAGADA
    periodo VARCHAR(7),   -- 'YYYY-MM': solo se completa en facturas generadas por Servicios_Agendados,
                          -- para no generar dos veces la factura del mismo mes de un servicio agendado
    id_agenda INTEGER REFERENCES Servicios_Agendados(id_agenda)
);

-- 11.2 RESERVAS Y AHORROS ("bolsillos" dentro de la misma cuenta, estilo Mercado Pago)
CREATE TABLE IF NOT EXISTS Reservas (
    id_reserva SERIAL PRIMARY KEY,
    id_cuenta INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    nombre VARCHAR(100) NOT NULL,
    monto_objetivo DECIMAL(15, 2),
    saldo_actual DECIMAL(15, 2) DEFAULT 0,
    fecha_meta DATE
);

-- 11.3 CONSUMOS Y CUOTAS DE TARJETA DE CRÉDITO
CREATE TABLE IF NOT EXISTS Consumos_Tarjeta (
    id_consumo SERIAL PRIMARY KEY,
    id_tarjeta INTEGER NOT NULL REFERENCES Tarjetas_Credito(id_tarjeta),
    comercio VARCHAR(100) NOT NULL,
    monto_total DECIMAL(15, 2) NOT NULL,
    cantidad_cuotas INTEGER NOT NULL DEFAULT 1,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Cuotas_Tarjeta (
    id_cuota SERIAL PRIMARY KEY,
    id_consumo INTEGER NOT NULL REFERENCES Consumos_Tarjeta(id_consumo),
    numero_cuota INTEGER NOT NULL,
    monto DECIMAL(15, 2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' -- PENDIENTE | PAGADA
);

-- 11.4 PLAZOS FIJOS (tasa = referencia de mercado (ArgentinaDatos) - 200 bps de spread)
CREATE TABLE IF NOT EXISTS Plazos_Fijos (
    id_plazo_fijo SERIAL PRIMARY KEY,
    id_cuenta INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    capital DECIMAL(15, 2) NOT NULL,
    tna DECIMAL(6, 3) NOT NULL,
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' -- ACTIVO | VENCIDO
);

-- 11.5 PRÉSTAMOS (sistema francés, tasa = referencia de mercado (ArgentinaDatos) + 1000 bps de spread)
CREATE TABLE IF NOT EXISTS Prestamos (
    id_prestamo SERIAL PRIMARY KEY,
    id_persona INTEGER NOT NULL REFERENCES Personas(id),
    id_cuenta INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    monto DECIMAL(15, 2) NOT NULL,
    plazo_meses INTEGER NOT NULL,
    tna DECIMAL(6, 3) NOT NULL,
    cuota_fija DECIMAL(15, 2) NOT NULL,
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' -- ACTIVO | PAGADO
);

CREATE TABLE IF NOT EXISTS Cuotas_Prestamo (
    id_cuota SERIAL PRIMARY KEY,
    id_prestamo INTEGER NOT NULL REFERENCES Prestamos(id_prestamo),
    numero INTEGER NOT NULL,
    capital DECIMAL(15, 2) NOT NULL,
    interes DECIMAL(15, 2) NOT NULL,
    cuota DECIMAL(15, 2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | PAGADA
    -- Cuándo se pagó de verdad (NULL mientras esté PENDIENTE). Sin esto no había forma de saber
    -- si una cuota se pagó en término o tarde — solo si estaba pagada o no — y por lo tanto
    -- tampoco de premiar con mejor tasa a quien paga puntual (ver Prestamo.tieneBuenHistorial).
    fecha_pago TIMESTAMP
);

-- 11.6 SEGUROS (cotización con fórmula simplificada por edad, no es tabla actuarial real)
CREATE TABLE IF NOT EXISTS Productos_Seguro (
    id_producto_seguro SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS Polizas (
    id_poliza SERIAL PRIMARY KEY,
    id_persona INTEGER NOT NULL REFERENCES Personas(id),
    id_cuenta INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    id_producto_seguro INTEGER NOT NULL REFERENCES Productos_Seguro(id_producto_seguro),
    suma_asegurada DECIMAL(15, 2) NOT NULL,
    prima_mensual DECIMAL(15, 2) NOT NULL,
    beneficiarios VARCHAR(255),
    fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' -- ACTIVA | CANCELADA
);

-- 11.7 INVERSIONES EN CEDEARs (cotización en vivo de Data912, portafolio calculado agregando órdenes)
CREATE TABLE IF NOT EXISTS Ordenes_Cedear (
    id_orden SERIAL PRIMARY KEY,
    id_persona INTEGER NOT NULL REFERENCES Personas(id),
    id_cuenta INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    ticker VARCHAR(10) NOT NULL,
    cantidad DECIMAL(15, 4) NOT NULL,
    tipo VARCHAR(10) NOT NULL, -- COMPRA | VENTA
    precio DECIMAL(15, 2) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. VISTA DE MOVIMIENTOS DETALLADOS (útil para reportes: junta persona + cuenta + movimiento + tipo)
CREATE OR REPLACE VIEW vista_movimientos_detallados AS
SELECT
    p.id AS persona_id,
    (p.nombre || ' ' || p.apellido) AS cliente,
    c.id_cuenta,
    c.cbu,
    m.monto,
    tm.nombre AS operacion,
    m.fecha_movimiento,
    m.descripcion
FROM personas p
JOIN productos pr ON p.id = pr.id_persona
JOIN cuentas_bancarias c ON pr.id_producto = c.id_producto
JOIN movimientos m ON c.id_cuenta = m.id_cuenta
JOIN tipos_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento;