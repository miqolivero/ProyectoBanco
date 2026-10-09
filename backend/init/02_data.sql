-- =============================================================================
-- DATOS DE EJEMPLO — Calamuchita Bank
--
-- Volumen: 11 clientes, 14 cuentas (ARS y USD) y 113 movimientos
-- repartidos entre febrero y octubre de 2026, con los 17 tipos de operación que maneja el
-- sistema. Es deliberadamente más que un par de filas de prueba: estos datos son la base
-- sobre la que se pueden hacer reportes y análisis reales (ver docs/MANUAL-USUARIO.md).
--
-- EJECUTAR UNA SOLA VEZ, sobre una base recién creada con 01_schema.sql. El bloque de
-- control de abajo aborta el script si ya hay clientes cargados, para no duplicar datos ni
-- pisar información real.
--
-- Los saldos de las cuentas NO están escritos a mano: se calculan al final del script como la
-- suma de los movimientos de cada cuenta. Así es imposible que queden descuadrados respecto
-- del historial, que es justamente lo que un banco nunca puede permitirse.
-- =============================================================================

BEGIN;

-- Control de seguridad: este script es solo para una base vacía.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM Personas) THEN
        RAISE EXCEPTION 'La tabla Personas ya tiene datos: 02_data.sql está pensado para una base recién creada. Si querés recargar los datos de ejemplo, borrá la base y volvé a correr 01_schema.sql.';
    END IF;
END $$;

-- 1. ROLES
INSERT INTO Roles (id_rol, nombre_rol, descripcion) VALUES
(1, 'Cliente Premium', 'Usuarios con beneficios y límites altos'),
(2, 'Cliente Regular', 'Usuarios estándar del banco'),
(3, 'Empleado', 'Personal administrativo del banco');

-- 2. CLIENTES (11) — edades repartidas a propósito: la prima de los seguros se
-- calcula por franja etaria (18-30, 31-45, 46-60, 61-75, 75+), así que con un solo rango no se
-- podría probar el cotizador completo.
INSERT INTO Personas (id, nombre, apellido, dni, direccion, email, telefono, fecha_nac) VALUES
(1, 'Juan', 'Pérez', '35123456', 'Av. San Martín 450, Villa General Belgrano', 'juan.perez@email.com', '3546441122', '1990-05-15'),
(2, 'María', 'García', '28999888', 'Los Aromos 128, Santa Rosa de Calamuchita', 'm.garcia@email.com', '3546442233', '1982-10-20'),
(3, 'Ricardo', 'Fort', '20111222', 'Costanera 1000, Embalse', 'elcomandante@email.com', '3571443344', '1968-11-25'),
(4, 'Lucía', 'Benítez', '38777111', 'Belgrano 77, Villa Rumipal', 'lucia.benitez@email.com', '3546445566', '1995-03-08'),
(5, 'Mateo', 'Ferreyra', '42555333', 'Sarmiento 315, La Cruz', 'mateo.ferreyra@email.com', '3576446677', '2000-07-22'),
(6, 'Sofía', 'Rinaldi', '31222444', 'Las Heras 820, Río de los Sauces', 'sofia.rinaldi@email.com', '3546447788', '1985-01-30'),
(7, 'Diego', 'Moyano', '25888777', 'Rivadavia 56, Amboy', 'diego.moyano@email.com', '3546448899', '1976-09-12'),
(8, 'Camila', 'Suárez', '45111999', 'Mitre 940, Villa Yacanto', 'camila.suarez@email.com', '3546449900', '2003-11-05'),
(9, 'Héctor', 'Villalba', '14666555', 'Maipú 212, Los Reartes', 'hector.villalba@email.com', '3546451011', '1958-04-18'),
(10, 'Valentina', 'Ocampo', '40333222', 'Güemes 1340, Villa Ciudad Parque', 'valen.ocampo@email.com', '3546452122', '1998-12-01'),
(11, 'Olga', 'Zalazar', '08999111', 'Urquiza 18, Villa General Belgrano', 'olga.zalazar@email.com', '3546453233', '1947-06-30');

-- 3. ROLES POR CLIENTE
INSERT INTO Roles_x_Personas (id_persona, id_rol) VALUES
(1, 2), (2, 2), (3, 1), (4, 2), (5, 2), (6, 1), (7, 2), (8, 2), (9, 2), (10, 2), (11, 2);

-- 4. PRODUCTOS (el contrato entre un cliente y un producto financiero)
--    Tipos: 1=CAJA_AHORRO, 3=TARJETA_CREDITO | Estado: 1=ACTIVO
INSERT INTO Productos (id_producto, id_persona, id_tipo_producto, id_estado_producto) VALUES
(1, 1, 1, 1),
(2, 2, 1, 1),
(3, 3, 1, 1),
(4, 4, 1, 1),
(5, 5, 1, 1),
(6, 6, 1, 1),
(7, 7, 1, 1),
(8, 8, 1, 1),
(9, 9, 1, 1),
(10, 10, 1, 1),
(11, 11, 1, 1),
(12, 1, 1, 1),
(13, 3, 1, 1),
(14, 6, 1, 1),
(15, 1, 3, 1),
(16, 3, 3, 1),
(17, 10, 3, 1);

-- 5. CUENTAS BANCARIAS (el saldo se calcula al final, ver paso 15)
--    CBU = 004 (código de Calamuchita Bank en la red del Banco Central) + 0001 + 5 + DNI + 6 dígitos
INSERT INTO Cuentas_Bancarias (id_cuenta, id_producto, cbu, alias, moneda, saldo) VALUES
(1, 1, '0040001535123456000101', 'juan.perez.ars', 'ARS', 0),
(2, 2, '0040001528999888000102', 'maria.garcia.ars', 'ARS', 0),
(3, 3, '0040001520111222000103', 'ricardo.fort.ars', 'ARS', 0),
(4, 4, '0040001538777111000104', 'lucia.benitez.ars', 'ARS', 0),
(5, 5, '0040001542555333000105', 'mateo.ferreyra.ars', 'ARS', 0),
(6, 6, '0040001531222444000106', 'sofia.rinaldi.ars', 'ARS', 0),
(7, 7, '0040001525888777000107', 'diego.moyano.ars', 'ARS', 0),
(8, 8, '0040001545111999000108', 'camila.suarez.ars', 'ARS', 0),
(9, 9, '0040001514666555000109', 'hector.villalba.ars', 'ARS', 0),
(10, 10, '0040001540333222000110', 'valentina.ocampo.ars', 'ARS', 0),
(11, 11, '0040001508999111000111', 'olga.zalazar.ars', 'ARS', 0),
(12, 12, '0040001535123456000201', 'juan.perez.usd', 'USD', 0),
(13, 13, '0040001520111222000203', 'ricardo.fort.usd', 'USD', 0),
(14, 14, '0040001531222444000206', 'sofia.rinaldi.usd', 'USD', 0);

-- 6. TARJETAS DE CRÉDITO
INSERT INTO Tarjetas_Credito (id_tarjeta, id_producto, numero_tarjeta, marca, fecha_vencimiento, limite_compra, dia_cierre) VALUES
(1, 15, '4507123456789012', 'Visa', '2030-12-01', 1500000.00, 20),
(2, 16, '5324987612340005', 'Mastercard', '2029-06-01', 2500000.00, 15),
(3, 17, '4507998877665544', 'Visa', '2031-03-01', 600000.00, 25);

-- 7. MOVIMIENTOS (113) — el tipo se resuelve por nombre y la cuenta por CBU, para que
--    el script no dependa del orden en que quedaron los IDs de las tablas maestras.
--    Signo: negativo = sale plata de la cuenta, positivo = entra.
INSERT INTO Movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion, cbu_origen, cbu_destino, id_transaccion_central)
SELECT c.id_cuenta, tm.id_tipo_movimiento, v.monto, v.fecha::timestamp, v.descripcion, v.cbu_origen, v.cbu_destino, v.id_central
FROM (VALUES
    ('0040001535123456000101', 'CREDITO', 850000.00::decimal(15,2), '2026-02-05 09:12', 'Depósito en efectivo - Sucursal Villa General Belgrano', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PRESTAMO_OTORGADO', 300000.00::decimal(15,2), '2026-03-10 11:30', 'Préstamo personal acreditado (6 cuotas de $61008.30)', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_SERVICIO', -18500.00::decimal(15,2), '2026-03-14 16:05', 'Pago de servicio: Epec (cliente 12345)', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'TRANSFERENCIA_RECIBIDA', 120000.00::decimal(15,2), '2026-03-20 10:41', 'Transferencia recibida de GARCIA MARIA', '0040001528999888000102', '0040001535123456000101', 'CB-2026-0003201'),
    ('0040001535123456000101', 'PAGO_PRESTAMO', -61008.30::decimal(15,2), '2026-04-08 09:55', 'Pago cuota 1/6 de préstamo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'CREDITO', 910000.00::decimal(15,2), '2026-04-30 08:02', 'Acreditación de sueldo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_PRESTAMO', -61008.30::decimal(15,2), '2026-05-07 10:12', 'Pago cuota 2/6 de préstamo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'CAMBIO_DIVISA', -154500.00::decimal(15,2), '2026-05-12 12:20', 'Compra de USD 100.00 a $1545.00 (dólar Oficial)', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000201', 'CAMBIO_DIVISA', 100.00::decimal(15,2), '2026-05-12 12:20', 'Compra de USD 100.00 a $1545.00 (dólar Oficial)', '0040001535123456000201', '0040001535123456000201', NULL),
    ('0040001535123456000101', 'APORTE_RESERVA', -150000.00::decimal(15,2), '2026-05-18 19:30', 'Aporte a reserva "Vacaciones 2027"', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'RECARGA', -5000.00::decimal(15,2), '2026-05-25 21:14', 'Recarga Movistar (3546441122)', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_PRESTAMO', -61008.30::decimal(15,2), '2026-06-09 11:48', 'Pago cuota 3/6 de préstamo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'TRANSFERENCIA_ENVIADA', -45000.00::decimal(15,2), '2026-06-15 15:33', 'Transferencia a MOYANO DIEGO', '0040001535123456000101', '0040001525888777000107', 'CB-2026-0061502'),
    ('0040001535123456000101', 'PAGO_TARJETA', -41666.67::decimal(15,2), '2026-06-18 10:05', 'Pago cuota 1/3 - Visa ****9012', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_PRESTAMO', -61008.30::decimal(15,2), '2026-07-08 09:21', 'Pago cuota 4/6 de préstamo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_TARJETA', -41666.67::decimal(15,2), '2026-07-17 18:40', 'Pago cuota 2/3 - Visa ****9012', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'CREDITO', 950000.00::decimal(15,2), '2026-07-31 08:05', 'Acreditación de sueldo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_PRESTAMO', -61008.30::decimal(15,2), '2026-08-07 10:33', 'Pago cuota 5/6 de préstamo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_SERVICIO', -22300.00::decimal(15,2), '2026-08-13 17:52', 'Pago de servicio: Ecogas (cliente 67890)', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_PRESTAMO', -61011.70::decimal(15,2), '2026-09-08 09:02', 'Pago cuota 6/6 de préstamo', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'PAGO_SEGURO', -12000.00::decimal(15,2), '2026-09-15 12:00', 'Prima mensual de seguro de Vida', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001535123456000101', 'TRANSFERENCIA_ENVIADA', -80000.00::decimal(15,2), '2026-09-28 14:20', 'Transferencia a BENITEZ LUCIA', '0040001535123456000101', '0040001538777111000104', 'CB-2026-0092803'),
    ('0040001535123456000101', 'DEBITO', -70000.00::decimal(15,2), '2026-10-02 10:48', 'Extracción por cajero automático - Sucursal Centro', '0040001535123456000101', '0040001535123456000101', NULL),
    ('0040001528999888000102', 'CREDITO', 680000.00::decimal(15,2), '2026-03-02 10:15', 'Depósito en efectivo - Sucursal Santa Rosa', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'TRANSFERENCIA_ENVIADA', -120000.00::decimal(15,2), '2026-03-20 10:41', 'Transferencia a PEREZ JUAN', '0040001528999888000102', '0040001535123456000101', 'CB-2026-0003201-O'),
    ('0040001528999888000102', 'PLAZO_FIJO_CONSTITUCION', -200000.00::decimal(15,2), '2026-04-05 11:00', 'Constitución de plazo fijo a 90 días (TNA 68.952%)', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'CREDITO', 520000.00::decimal(15,2), '2026-04-28 08:10', 'Acreditación de sueldo', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'PAGO_SERVICIO', -15400.00::decimal(15,2), '2026-05-10 19:22', 'Pago de servicio: Aguas Villa Maria (cliente 55511)', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'APORTE_RESERVA', -90000.00::decimal(15,2), '2026-05-22 20:05', 'Aporte a reserva "Fondo de emergencia"', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'RECARGA', -3500.00::decimal(15,2), '2026-06-03 13:40', 'Recarga Personal (3546442233)', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'PLAZO_FIJO_LIQUIDACION', 234009.86::decimal(15,2), '2026-07-04 09:00', 'Liquidación de plazo fijo (capital + interés)', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'TRANSFERENCIA_ENVIADA', -60000.00::decimal(15,2), '2026-07-19 16:11', 'Transferencia a VILLALBA HECTOR', '0040001528999888000102', '0040001514666555000109', 'CB-2026-0071904'),
    ('0040001528999888000102', 'PAGO_SERVICIO', -17900.00::decimal(15,2), '2026-08-11 18:30', 'Pago de servicio: Fibertel (cliente 77821)', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'RETIRO_RESERVA', 40000.00::decimal(15,2), '2026-09-05 11:25', 'Retiro de reserva "Fondo de emergencia"', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001528999888000102', 'CREDITO', 540000.00::decimal(15,2), '2026-09-29 08:03', 'Acreditación de sueldo', '0040001528999888000102', '0040001528999888000102', NULL),
    ('0040001520111222000103', 'CREDITO', 4200000.00::decimal(15,2), '2026-02-14 11:11', 'Depósito en efectivo - Sucursal Embalse', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000203', 'CREDITO', 5000.00::decimal(15,2), '2026-02-14 11:20', 'Depósito en efectivo (USD) - Sucursal Embalse', '0040001520111222000203', '0040001520111222000203', NULL),
    ('0040001520111222000103', 'COMPRA_CEDEAR', -275000.00::decimal(15,2), '2026-03-05 14:02', 'Compra de 10.0000 CEDEAR AAPL a $27500.00', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'PAGO_SEGURO', -45000.00::decimal(15,2), '2026-03-15 12:00', 'Prima mensual de seguro de Hogar', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'TRANSFERENCIA_ENVIADA', -350000.00::decimal(15,2), '2026-04-02 17:45', 'Transferencia a RINALDI SOFIA', '0040001520111222000103', '0040001531222444000106', 'CB-2026-0040205'),
    ('0040001520111222000103', 'PAGO_TARJETA', -120000.00::decimal(15,2), '2026-04-14 10:30', 'Pago cuota 1/6 - Mastercard ****0005', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'COMPRA_CEDEAR', -143000.00::decimal(15,2), '2026-04-21 15:10', 'Compra de 50.0000 CEDEAR DISN a $2860.00', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'PAGO_TARJETA', -120000.00::decimal(15,2), '2026-05-14 10:28', 'Pago cuota 2/6 - Mastercard ****0005', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'PAGO_SEGURO', -45000.00::decimal(15,2), '2026-05-15 12:00', 'Prima mensual de seguro de Hogar', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'VENTA_CEDEAR', 84000.00::decimal(15,2), '2026-06-09 16:22', 'Venta de 3.0000 CEDEAR AAPL a $28000.00', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'PAGO_TARJETA', -120000.00::decimal(15,2), '2026-06-15 11:02', 'Pago cuota 3/6 - Mastercard ****0005', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000203', 'TRANSFERENCIA_ENVIADA', -800.00::decimal(15,2), '2026-06-24 13:15', 'Transferencia a RINALDI SOFIA (USD)', '0040001520111222000203', '0040001531222444000206', 'CB-2026-0062406'),
    ('0040001520111222000103', 'PAGO_TARJETA', -120000.00::decimal(15,2), '2026-07-14 10:44', 'Pago cuota 4/6 - Mastercard ****0005', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'APORTE_RESERVA', -500000.00::decimal(15,2), '2026-07-30 19:50', 'Aporte a reserva "Reforma de la casa"', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'PAGO_SERVICIO', -62000.00::decimal(15,2), '2026-08-12 18:05', 'Pago de servicio: Epec (cliente 20111)', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'PLAZO_FIJO_CONSTITUCION', -1500000.00::decimal(15,2), '2026-09-10 10:00', 'Constitución de plazo fijo a 180 días (TNA 68.952%)', '0040001520111222000103', '0040001520111222000103', NULL),
    ('0040001520111222000103', 'TRANSFERENCIA_RECIBIDA', 180000.00::decimal(15,2), '2026-09-22 12:33', 'Transferencia recibida de OCAMPO VALENTINA', '0040001540333222000110', '0040001520111222000103', 'CB-2026-0092207'),
    ('0040001538777111000104', 'CREDITO', 420000.00::decimal(15,2), '2026-04-10 09:30', 'Depósito en efectivo - Sucursal Villa Rumipal', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'COMPRA_CEDEAR', -57200.00::decimal(15,2), '2026-04-25 15:40', 'Compra de 20.0000 CEDEAR DISN a $2860.00', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'PAGO_SERVICIO', -14200.00::decimal(15,2), '2026-05-13 20:10', 'Pago de servicio: Flow (cliente 33412)', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'APORTE_RESERVA', -60000.00::decimal(15,2), '2026-06-01 11:15', 'Aporte a reserva "Notebook nueva"', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'RECARGA', -4000.00::decimal(15,2), '2026-06-20 18:55', 'Recarga Claro (3546445566)', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'CREDITO', 380000.00::decimal(15,2), '2026-07-29 08:20', 'Acreditación de sueldo', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'VENTA_CEDEAR', 29200.00::decimal(15,2), '2026-08-18 14:05', 'Venta de 10.0000 CEDEAR DISN a $2920.00', '0040001538777111000104', '0040001538777111000104', NULL),
    ('0040001538777111000104', 'TRANSFERENCIA_ENVIADA', -95000.00::decimal(15,2), '2026-09-02 16:48', 'Transferencia a FERREYRA MATEO', '0040001538777111000104', '0040001542555333000105', 'CB-2026-0090208'),
    ('0040001538777111000104', 'TRANSFERENCIA_RECIBIDA', 80000.00::decimal(15,2), '2026-09-28 14:20', 'Transferencia recibida de PEREZ JUAN', '0040001535123456000101', '0040001538777111000104', 'CB-2026-0092803-D'),
    ('0040001542555333000105', 'CREDITO', 180000.00::decimal(15,2), '2026-05-06 10:05', 'Depósito en efectivo - Sucursal La Cruz', '0040001542555333000105', '0040001542555333000105', NULL),
    ('0040001542555333000105', 'RECARGA', -2500.00::decimal(15,2), '2026-05-15 22:30', 'Recarga Tuenti (3576446677)', '0040001542555333000105', '0040001542555333000105', NULL),
    ('0040001542555333000105', 'PAGO_SERVICIO', -9800.00::decimal(15,2), '2026-06-11 19:40', 'Pago de servicio: Flow (cliente 42555)', '0040001542555333000105', '0040001542555333000105', NULL),
    ('0040001542555333000105', 'RECARGA', -2500.00::decimal(15,2), '2026-06-28 21:05', 'Recarga Tuenti (3576446677)', '0040001542555333000105', '0040001542555333000105', NULL),
    ('0040001542555333000105', 'CREDITO', 210000.00::decimal(15,2), '2026-07-30 08:15', 'Acreditación de sueldo', '0040001542555333000105', '0040001542555333000105', NULL),
    ('0040001542555333000105', 'TRANSFERENCIA_ENVIADA', -120000.00::decimal(15,2), '2026-08-05 13:22', 'Transferencia a SUAREZ CAMILA', '0040001542555333000105', '0040001545111999000108', 'CB-2026-0080509'),
    ('0040001542555333000105', 'TRANSFERENCIA_RECIBIDA', 95000.00::decimal(15,2), '2026-09-02 16:48', 'Transferencia recibida de BENITEZ LUCIA', '0040001538777111000104', '0040001542555333000105', 'CB-2026-0090208-D'),
    ('0040001542555333000105', 'RECARGA', -3000.00::decimal(15,2), '2026-09-24 20:11', 'Recarga Tuenti (3576446677)', '0040001542555333000105', '0040001542555333000105', NULL),
    ('0040001531222444000106', 'CREDITO', 1100000.00::decimal(15,2), '2026-03-18 11:40', 'Depósito en efectivo - Sucursal Río de los Sauces', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001531222444000106', 'TRANSFERENCIA_RECIBIDA', 350000.00::decimal(15,2), '2026-04-02 17:45', 'Transferencia recibida de FORT RICARDO', '0040001520111222000103', '0040001531222444000106', 'CB-2026-0040205-D'),
    ('0040001531222444000106', 'CAMBIO_DIVISA', -463500.00::decimal(15,2), '2026-04-20 12:05', 'Compra de USD 300.00 a $1545.00 (dólar Oficial)', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001531222444000206', 'CAMBIO_DIVISA', 300.00::decimal(15,2), '2026-04-20 12:05', 'Compra de USD 300.00 a $1545.00 (dólar Oficial)', '0040001531222444000206', '0040001531222444000206', NULL),
    ('0040001531222444000106', 'PAGO_SERVICIO', -28700.00::decimal(15,2), '2026-05-14 18:15', 'Pago de servicio: Ecogas (cliente 31222)', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001531222444000106', 'PLAZO_FIJO_CONSTITUCION', -400000.00::decimal(15,2), '2026-06-08 10:30', 'Constitución de plazo fijo a 60 días (TNA 68.952%)', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001531222444000206', 'TRANSFERENCIA_RECIBIDA', 800.00::decimal(15,2), '2026-06-24 13:15', 'Transferencia recibida de FORT RICARDO (USD)', '0040001520111222000203', '0040001531222444000206', 'CB-2026-0062406-D'),
    ('0040001531222444000106', 'PLAZO_FIJO_LIQUIDACION', 445329.73::decimal(15,2), '2026-08-07 09:10', 'Liquidación de plazo fijo (capital + interés)', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001531222444000106', 'PAGO_SEGURO', -19500.00::decimal(15,2), '2026-08-15 12:00', 'Prima mensual de seguro de Accidentes Personales', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001531222444000206', 'CAMBIO_DIVISA', -200.00::decimal(15,2), '2026-09-11 15:25', 'Venta de USD 200.00 a $1495.00 (dólar Oficial)', '0040001531222444000206', '0040001531222444000206', NULL),
    ('0040001531222444000106', 'CAMBIO_DIVISA', 299000.00::decimal(15,2), '2026-09-11 15:25', 'Venta de USD 200.00 a $1495.00 (dólar Oficial)', '0040001531222444000106', '0040001531222444000106', NULL),
    ('0040001525888777000107', 'CREDITO', 310000.00::decimal(15,2), '2026-05-04 10:50', 'Depósito en efectivo - Sucursal Amboy', '0040001525888777000107', '0040001525888777000107', NULL),
    ('0040001525888777000107', 'TRANSFERENCIA_RECIBIDA', 45000.00::decimal(15,2), '2026-06-15 15:33', 'Transferencia recibida de PEREZ JUAN', '0040001535123456000101', '0040001525888777000107', 'CB-2026-0061502-D'),
    ('0040001525888777000107', 'PRESTAMO_OTORGADO', 500000.00::decimal(15,2), '2026-08-12 11:05', 'Préstamo personal acreditado (12 cuotas de $62940.75)', '0040001525888777000107', '0040001525888777000107', NULL),
    ('0040001525888777000107', 'PAGO_SERVICIO', -21600.00::decimal(15,2), '2026-08-20 19:12', 'Pago de servicio: Epec (cliente 25888)', '0040001525888777000107', '0040001525888777000107', NULL),
    ('0040001525888777000107', 'PAGO_PRESTAMO', -62940.75::decimal(15,2), '2026-09-10 09:40', 'Pago cuota 1/12 de préstamo', '0040001525888777000107', '0040001525888777000107', NULL),
    ('0040001525888777000107', 'RECARGA', -4500.00::decimal(15,2), '2026-09-21 20:33', 'Recarga Movistar (3546448899)', '0040001525888777000107', '0040001525888777000107', NULL),
    ('0040001525888777000107', 'PAGO_PRESTAMO', -62940.75::decimal(15,2), '2026-10-06 10:15', 'Pago cuota 2/12 de préstamo', '0040001525888777000107', '0040001525888777000107', NULL),
    ('0040001545111999000108', 'CREDITO', 35000.00::decimal(15,2), '2026-08-02 12:00', 'Depósito en efectivo - Sucursal Villa Yacanto', '0040001545111999000108', '0040001545111999000108', NULL),
    ('0040001545111999000108', 'TRANSFERENCIA_RECIBIDA', 120000.00::decimal(15,2), '2026-08-05 13:22', 'Transferencia recibida de FERREYRA MATEO', '0040001542555333000105', '0040001545111999000108', 'CB-2026-0080509-D'),
    ('0040001545111999000108', 'RECARGA', -2000.00::decimal(15,2), '2026-08-28 21:45', 'Recarga Personal (3546449900)', '0040001545111999000108', '0040001545111999000108', NULL),
    ('0040001545111999000108', 'PAGO_SERVICIO', -8900.00::decimal(15,2), '2026-09-17 18:20', 'Pago de servicio: Flow (cliente 45111)', '0040001545111999000108', '0040001545111999000108', NULL),
    ('0040001514666555000109', 'CREDITO', 1250000.00::decimal(15,2), '2026-02-20 09:45', 'Depósito en efectivo - Sucursal Los Reartes', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'PLAZO_FIJO_CONSTITUCION', -800000.00::decimal(15,2), '2026-03-12 10:20', 'Constitución de plazo fijo a 365 días (TNA 68.952%)', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'PAGO_SEGURO', -60000.00::decimal(15,2), '2026-04-16 12:00', 'Prima mensual de seguro de Vida', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'PAGO_SERVICIO', -19800.00::decimal(15,2), '2026-05-19 17:30', 'Pago de servicio: Ecogas (cliente 14666)', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'CREDITO', 410000.00::decimal(15,2), '2026-06-05 08:40', 'Acreditación de haberes previsionales', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'TRANSFERENCIA_RECIBIDA', 60000.00::decimal(15,2), '2026-07-19 16:11', 'Transferencia recibida de GARCIA MARIA', '0040001528999888000102', '0040001514666555000109', 'CB-2026-0071904-D'),
    ('0040001514666555000109', 'PAGO_SEGURO', -60000.00::decimal(15,2), '2026-08-16 12:00', 'Prima mensual de seguro de Vida', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'CREDITO', 430000.00::decimal(15,2), '2026-09-05 08:35', 'Acreditación de haberes previsionales', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001514666555000109', 'DEBITO', -120000.00::decimal(15,2), '2026-09-26 11:05', 'Extracción por ventanilla - Sucursal Los Reartes', '0040001514666555000109', '0040001514666555000109', NULL),
    ('0040001540333222000110', 'CREDITO', 290000.00::decimal(15,2), '2026-06-12 11:20', 'Depósito en efectivo - Sucursal Villa Ciudad Parque', '0040001540333222000110', '0040001540333222000110', NULL),
    ('0040001540333222000110', 'COMPRA_CEDEAR', -28600.00::decimal(15,2), '2026-06-30 14:50', 'Compra de 10.0000 CEDEAR DISN a $2860.00', '0040001540333222000110', '0040001540333222000110', NULL),
    ('0040001540333222000110', 'PAGO_TARJETA', -85000.00::decimal(15,2), '2026-07-24 10:12', 'Pago cuota 1/1 - Visa ****5544', '0040001540333222000110', '0040001540333222000110', NULL),
    ('0040001540333222000110', 'CREDITO', 310000.00::decimal(15,2), '2026-08-28 08:25', 'Acreditación de sueldo', '0040001540333222000110', '0040001540333222000110', NULL),
    ('0040001540333222000110', 'PAGO_SERVICIO', -13100.00::decimal(15,2), '2026-09-16 19:05', 'Pago de servicio: Fibertel (cliente 40333)', '0040001540333222000110', '0040001540333222000110', NULL),
    ('0040001540333222000110', 'TRANSFERENCIA_ENVIADA', -180000.00::decimal(15,2), '2026-09-22 12:33', 'Transferencia a FORT RICARDO', '0040001540333222000110', '0040001520111222000103', 'CB-2026-0092207-O'),
    ('0040001508999111000111', 'CREDITO', 520000.00::decimal(15,2), '2026-03-25 10:10', 'Depósito en efectivo - Sucursal Villa General Belgrano', '0040001508999111000111', '0040001508999111000111', NULL),
    ('0040001508999111000111', 'PAGO_SERVICIO', -16200.00::decimal(15,2), '2026-04-18 16:40', 'Pago de servicio: Epec (cliente 08999)', '0040001508999111000111', '0040001508999111000111', NULL),
    ('0040001508999111000111', 'PAGO_SERVICIO', -17100.00::decimal(15,2), '2026-06-17 16:55', 'Pago de servicio: Epec (cliente 08999)', '0040001508999111000111', '0040001508999111000111', NULL),
    ('0040001508999111000111', 'CREDITO', 390000.00::decimal(15,2), '2026-07-03 09:15', 'Acreditación de haberes previsionales', '0040001508999111000111', '0040001508999111000111', NULL),
    ('0040001508999111000111', 'APORTE_RESERVA', -200000.00::decimal(15,2), '2026-08-09 11:30', 'Aporte a reserva "Regalos de fin de año"', '0040001508999111000111', '0040001508999111000111', NULL),
    ('0040001508999111000111', 'PAGO_SERVICIO', -18400.00::decimal(15,2), '2026-09-19 17:10', 'Pago de servicio: Epec (cliente 08999)', '0040001508999111000111', '0040001508999111000111', NULL),
    ('0040001508999111000111', 'DEBITO', -50000.00::decimal(15,2), '2026-10-03 09:50', 'Extracción por cajero automático - Sucursal Villa General Belgrano', '0040001508999111000111', '0040001508999111000111', NULL)
) AS v(cbu, tipo, monto, fecha, descripcion, cbu_origen, cbu_destino, id_central)
JOIN Cuentas_Bancarias c ON c.cbu = v.cbu
JOIN Tipos_Movimiento tm ON tm.nombre = v.tipo;

-- 8. RESERVAS ("bolsillos" de ahorro). El saldo_actual coincide con los aportes y retiros
--    registrados en Movimientos.
INSERT INTO Reservas (id_reserva, id_cuenta, nombre, monto_objetivo, saldo_actual, fecha_meta) VALUES
(1, 1, 'Vacaciones 2027', 600000.00, 150000.00, '2027-01-15'),
(2, 2, 'Fondo de emergencia', 300000.00, 50000.00, NULL),
(3, 3, 'Reforma de la casa', 2000000.00, 500000.00, '2027-06-30'),
(4, 4, 'Notebook nueva', 900000.00, 60000.00, '2027-03-01'),
(5, 11, 'Regalos de fin de año', 250000.00, 200000.00, '2026-12-15');

-- 9. CONSUMOS CON TARJETA
INSERT INTO Consumos_Tarjeta (id_consumo, id_tarjeta, comercio, monto_total, cantidad_cuotas, fecha) VALUES
(1, 1, 'Supermercado Cordiez', 125000.00, 3, '2026-06-02 18:30'),
(2, 1, 'Farmacia del Centro', 48000.00, 1, '2026-09-25 11:10'),
(3, 2, 'Electrodomésticos Fravega', 720000.00, 6, '2026-03-28 16:20'),
(4, 2, 'Hotel Portal del Lago', 180000.00, 3, '2026-09-12 13:45'),
(5, 3, 'Librería El Ateneo', 85000.00, 1, '2026-07-04 17:00');

-- 10. CUOTAS DE TARJETA (las PAGADA tienen su movimiento PAGO_TARJETA correspondiente)
INSERT INTO Cuotas_Tarjeta (id_cuota, id_consumo, numero_cuota, monto, fecha_vencimiento, estado) VALUES
(1, 1, 1, 41666.67, '2026-07-02', 'PAGADA'),
(2, 1, 2, 41666.67, '2026-08-02', 'PAGADA'),
(3, 1, 3, 41666.66, '2026-09-02', 'PENDIENTE'),
(4, 2, 1, 48000.00, '2026-10-25', 'PENDIENTE'),
(5, 3, 1, 120000.00, '2026-04-28', 'PAGADA'),
(6, 3, 2, 120000.00, '2026-05-28', 'PAGADA'),
(7, 3, 3, 120000.00, '2026-06-28', 'PAGADA'),
(8, 3, 4, 120000.00, '2026-07-28', 'PAGADA'),
(9, 3, 5, 120000.00, '2026-08-28', 'PENDIENTE'),
(10, 3, 6, 120000.00, '2026-09-28', 'PENDIENTE'),
(11, 4, 1, 60000.00, '2026-10-12', 'PENDIENTE'),
(12, 4, 2, 60000.00, '2026-11-12', 'PENDIENTE'),
(13, 4, 3, 60000.00, '2026-12-12', 'PENDIENTE'),
(14, 5, 1, 85000.00, '2026-08-04', 'PAGADA');

-- 11. PLAZOS FIJOS (dos ya liquidados y dos todavía activos, para poder probar ambos caminos)
INSERT INTO Plazos_Fijos (id_plazo_fijo, id_cuenta, capital, tna, fecha_alta, fecha_vencimiento, estado) VALUES
(1, 2, 200000.00, 68.952, '2026-04-05 11:00', '2026-07-04', 'VENCIDO'),
(2, 6, 400000.00, 68.952, '2026-06-08 10:30', '2026-08-07', 'VENCIDO'),
(3, 9, 800000.00, 68.952, '2026-03-12 10:20', '2027-03-12', 'ACTIVO'),
(4, 3, 1500000.00, 68.952, '2026-09-10 10:00', '2027-03-09', 'ACTIVO');

-- 12. PRÉSTAMOS (sistema francés). El de Juan Pérez está PAGADO y todas sus cuotas se
--     abonaron antes del vencimiento: es el caso que habilita la bonificación de tasa para
--     un préstamo nuevo (ver Prestamo.tieneBuenHistorial). El de Diego Moyano está en curso.
INSERT INTO Prestamos (id_prestamo, id_persona, id_cuenta, monto, plazo_meses, tna, cuota_fija, fecha_alta, estado) VALUES
(1, 1, 1, 300000.00, 6, 72, 61008.79, '2026-03-10 11:30', 'PAGADO'),
(2, 7, 7, 500000.00, 12, 84, 62950.99, '2026-08-12 11:05', 'ACTIVO');

-- 13. CUOTAS DE PRÉSTAMO (capital e interés calculados con amortización francesa; la última
--     cuota absorbe el redondeo para que la suma de capital cierre exactamente en el monto)
INSERT INTO Cuotas_Prestamo (id_cuota, id_prestamo, numero, capital, interes, cuota, fecha_vencimiento, estado, fecha_pago) VALUES
(1, 1, 1, 43008.79, 18000.00, 61008.79, '2026-04-10', 'PAGADA', '2026-04-08 09:55'),
(2, 1, 2, 45589.32, 15419.47, 61008.79, '2026-05-10', 'PAGADA', '2026-05-07 10:12'),
(3, 1, 3, 48324.68, 12684.11, 61008.79, '2026-06-10', 'PAGADA', '2026-06-09 11:48'),
(4, 1, 4, 51224.16, 9784.63, 61008.79, '2026-07-10', 'PAGADA', '2026-07-08 09:21'),
(5, 1, 5, 54297.61, 6711.18, 61008.79, '2026-08-10', 'PAGADA', '2026-08-07 10:33'),
(6, 1, 6, 57555.44, 3453.33, 61008.77, '2026-09-10', 'PAGADA', '2026-09-08 09:02'),
(7, 2, 1, 27950.99, 35000.00, 62950.99, '2026-09-12', 'PAGADA', '2026-09-10 09:40'),
(8, 2, 2, 29907.56, 33043.43, 62950.99, '2026-10-12', 'PAGADA', '2026-10-06 10:15'),
(9, 2, 3, 32001.09, 30949.90, 62950.99, '2026-11-12', 'PENDIENTE', NULL),
(10, 2, 4, 34241.16, 28709.83, 62950.99, '2026-12-12', 'PENDIENTE', NULL),
(11, 2, 5, 36638.05, 26312.94, 62950.99, '2027-01-12', 'PENDIENTE', NULL),
(12, 2, 6, 39202.71, 23748.28, 62950.99, '2027-02-12', 'PENDIENTE', NULL),
(13, 2, 7, 41946.90, 21004.09, 62950.99, '2027-03-12', 'PENDIENTE', NULL),
(14, 2, 8, 44883.18, 18067.81, 62950.99, '2027-04-12', 'PENDIENTE', NULL),
(15, 2, 9, 48025.00, 14925.99, 62950.99, '2027-05-12', 'PENDIENTE', NULL),
(16, 2, 10, 51386.75, 11564.24, 62950.99, '2027-06-12', 'PENDIENTE', NULL),
(17, 2, 11, 54983.83, 7967.16, 62950.99, '2027-07-12', 'PENDIENTE', NULL),
(18, 2, 12, 58832.78, 4118.29, 62951.07, '2027-08-12', 'PENDIENTE', NULL);

-- 14. SEGUROS: catálogo y pólizas contratadas
INSERT INTO Productos_Seguro (id_producto_seguro, nombre, descripcion) VALUES
(1, 'Vida', 'Cobertura por fallecimiento o invalidez total, con beneficiarios designados.'),
(2, 'Hogar', 'Cobertura de incendio, robo y daños en tu vivienda.'),
(3, 'Accidentes Personales', 'Indemnización por accidentes con incapacidad temporal o permanente.');

INSERT INTO Polizas (id_poliza, id_persona, id_cuenta, id_producto_seguro, suma_asegurada, prima_mensual, beneficiarios, fecha_alta, estado) VALUES
(1, 1, 1, 1, 15000000.00, 12000.00, 'Ana Pérez (cónyuge)', '2026-09-15 12:00', 'ACTIVA'),
(2, 3, 3, 2, 30000000.00, 45000.00, 'Marta Fort (hija)', '2026-03-15 12:00', 'ACTIVA'),
(3, 6, 6, 3, 24375000.00, 19500.00, NULL, '2026-08-15 12:00', 'ACTIVA'),
(4, 9, 9, 1, 20000000.00, 60000.00, 'Nieto: Tomás Villalba', '2026-04-16 12:00', 'ACTIVA'),
(5, 4, 4, 2, 8000000.00, 6400.00, NULL, '2026-05-20 12:00', 'CANCELADA');

-- 15. ÓRDENES DE CEDEARs (el portafolio se calcula agregando estas órdenes, no se guarda aparte)
INSERT INTO Ordenes_Cedear (id_orden, id_persona, id_cuenta, ticker, cantidad, tipo, precio, fecha) VALUES
(1, 3, 3, 'AAPL', 10, 'COMPRA', 27500.00, '2026-03-05 14:02'),
(2, 3, 3, 'DISN', 50, 'COMPRA', 2860.00, '2026-04-21 15:10'),
(3, 3, 3, 'AAPL', 3, 'VENTA', 28000.00, '2026-06-09 16:22'),
(4, 4, 4, 'DISN', 20, 'COMPRA', 2860.00, '2026-04-25 15:40'),
(5, 4, 4, 'DISN', 10, 'VENTA', 2920.00, '2026-08-18 14:05'),
(6, 10, 10, 'DISN', 10, 'COMPRA', 2860.00, '2026-06-30 14:50');

-- 16. PAGO DE SERVICIOS: catálogo de empresas, servicios agendados y facturas
INSERT INTO Empresas_Servicio (id_empresa, nombre, rubro) VALUES
(1, 'Epec', 'Electricidad'),
(2, 'Ecogas', 'Gas'),
(3, 'Aguas Villa Maria', 'Agua'),
(4, 'Fibertel', 'Internet'),
(5, 'Flow', 'TV');

INSERT INTO Servicios_Agendados (id_agenda, id_persona, id_empresa, numero_cliente, alias, monto_fijo, dia_vencimiento, debito_automatico) VALUES
(1, 1, 4, '77821', 'Internet de casa', 17900.00, 10, true),
(2, 1, 1, '12345', 'Luz', NULL, NULL, false),
(3, 3, 1, '20111', 'Luz de la casa del lago', 62000.00, 12, true),
(4, 11, 1, '08999', 'Luz', 18400.00, 18, false);

-- Facturas: las PAGADA se corresponden con movimientos PAGO_SERVICIO del historial; las
-- PENDIENTE vencen en octubre de 2026 para que haya deuda real para probar el pago.
INSERT INTO Facturas_Servicio (id_factura, id_empresa, id_persona, numero_cliente, importe, vencimiento, estado, periodo, id_agenda) VALUES
(1, 1, 1, '12345', 19600.00, '2026-10-18', 'PENDIENTE', NULL, NULL),
(2, 2, 1, '67890', 24100.00, '2026-10-13', 'PENDIENTE', NULL, NULL),
(3, 1, 1, '12345', 18500.00, '2026-03-14', 'PAGADA', NULL, NULL),
(4, 2, 1, '67890', 22300.00, '2026-08-13', 'PAGADA', NULL, NULL),
(5, 3, 2, '55511', 16800.00, '2026-10-20', 'PENDIENTE', NULL, NULL),
(6, 4, 2, '77821', 17900.00, '2026-08-11', 'PAGADA', NULL, NULL),
(7, 1, 3, '20111', 64500.00, '2026-10-12', 'PENDIENTE', '2026-10', 3),
(8, 5, 4, '33412', 15100.00, '2026-10-22', 'PENDIENTE', NULL, NULL),
(9, 5, 5, '42555', 10400.00, '2026-10-25', 'PENDIENTE', NULL, NULL),
(10, 2, 6, '31222', 30200.00, '2026-10-16', 'PENDIENTE', NULL, NULL),
(11, 1, 7, '25888', 22800.00, '2026-10-19', 'PENDIENTE', NULL, NULL),
(12, 5, 8, '45111', 9400.00, '2026-10-21', 'PENDIENTE', NULL, NULL),
(13, 2, 9, '14666', 20600.00, '2026-10-17', 'PENDIENTE', NULL, NULL),
(14, 4, 10, '40333', 13700.00, '2026-10-23', 'PENDIENTE', NULL, NULL),
(15, 1, 11, '08999', 19100.00, '2026-10-18', 'PENDIENTE', '2026-10', 4);

-- 17. SALDOS DERIVADOS DEL HISTORIAL
--     El saldo de cada cuenta es la suma de sus movimientos. Calcularlo en vez de escribirlo
--     a mano garantiza que el saldo que ve el cliente y su historial nunca se contradigan.
UPDATE Cuentas_Bancarias c
SET saldo = COALESCE((SELECT SUM(m.monto) FROM Movimientos m WHERE m.id_cuenta = c.id_cuenta), 0);

-- 18. SINCRONIZACIÓN DE SECUENCIAS
--     Los INSERT de arriba usan IDs explícitos, así que los contadores de las secuencias
--     quedaron en 1. Sin esto, el primer registro que cree la aplicación intentaría usar el
--     id 1 (ya ocupado) y fallaría con error de clave duplicada.
SELECT setval(pg_get_serial_sequence('roles', 'id_rol'), COALESCE((SELECT MAX(id_rol) FROM roles), 1));
SELECT setval(pg_get_serial_sequence('personas', 'id'), COALESCE((SELECT MAX(id) FROM personas), 1));
SELECT setval(pg_get_serial_sequence('productos', 'id_producto'), COALESCE((SELECT MAX(id_producto) FROM productos), 1));
SELECT setval(pg_get_serial_sequence('cuentas_bancarias', 'id_cuenta'), COALESCE((SELECT MAX(id_cuenta) FROM cuentas_bancarias), 1));
SELECT setval(pg_get_serial_sequence('tarjetas_credito', 'id_tarjeta'), COALESCE((SELECT MAX(id_tarjeta) FROM tarjetas_credito), 1));
SELECT setval(pg_get_serial_sequence('movimientos', 'id_movimiento'), COALESCE((SELECT MAX(id_movimiento) FROM movimientos), 1));
SELECT setval(pg_get_serial_sequence('reservas', 'id_reserva'), COALESCE((SELECT MAX(id_reserva) FROM reservas), 1));
SELECT setval(pg_get_serial_sequence('consumos_tarjeta', 'id_consumo'), COALESCE((SELECT MAX(id_consumo) FROM consumos_tarjeta), 1));
SELECT setval(pg_get_serial_sequence('cuotas_tarjeta', 'id_cuota'), COALESCE((SELECT MAX(id_cuota) FROM cuotas_tarjeta), 1));
SELECT setval(pg_get_serial_sequence('plazos_fijos', 'id_plazo_fijo'), COALESCE((SELECT MAX(id_plazo_fijo) FROM plazos_fijos), 1));
SELECT setval(pg_get_serial_sequence('prestamos', 'id_prestamo'), COALESCE((SELECT MAX(id_prestamo) FROM prestamos), 1));
SELECT setval(pg_get_serial_sequence('cuotas_prestamo', 'id_cuota'), COALESCE((SELECT MAX(id_cuota) FROM cuotas_prestamo), 1));
SELECT setval(pg_get_serial_sequence('productos_seguro', 'id_producto_seguro'), COALESCE((SELECT MAX(id_producto_seguro) FROM productos_seguro), 1));
SELECT setval(pg_get_serial_sequence('polizas', 'id_poliza'), COALESCE((SELECT MAX(id_poliza) FROM polizas), 1));
SELECT setval(pg_get_serial_sequence('ordenes_cedear', 'id_orden'), COALESCE((SELECT MAX(id_orden) FROM ordenes_cedear), 1));
SELECT setval(pg_get_serial_sequence('empresas_servicio', 'id_empresa'), COALESCE((SELECT MAX(id_empresa) FROM empresas_servicio), 1));
SELECT setval(pg_get_serial_sequence('servicios_agendados', 'id_agenda'), COALESCE((SELECT MAX(id_agenda) FROM servicios_agendados), 1));
SELECT setval(pg_get_serial_sequence('facturas_servicio', 'id_factura'), COALESCE((SELECT MAX(id_factura) FROM facturas_servicio), 1));

COMMIT;
