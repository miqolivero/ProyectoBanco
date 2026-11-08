-- =============================================================================
-- CUENTA DEMO — para probar el banco sin registrarse (después de 04 y 05)
--
--   psql -U postgres -d banco_db -f backend/init/06_cuenta_demo.sql
--
-- Crea dos personas que se usan desde el botón "Probar la cuenta demo" del login:
--   - demo_cliente  → "Profe Demo": cuentas en ARS y USD, movimientos, tarjeta, plazo fijo y
--                     una reserva. Es con la que se entra.
--   - demo_comercio → "Kiosco del Lago (demo)": tiene un cobro con QR pendiente (id fijo,
--                     ver config/sandboxDemo.js → ID_COBRO_EJEMPLO) para probar el pago.
--
-- Estas filas son la "foto" inicial de la demo: lo que se hace DENTRO de la demo corre en una
-- transacción que se deshace al salir (ver backend/config/sandboxDemo.js), así que nunca
-- cambian. Las cuentas NO están registradas en el Banco Central: en la demo el Central se
-- simula.
--
-- Idempotente: si la persona demo_cliente ya existe, no hace nada.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_tipo_caja   INTEGER := (SELECT id_tipo_producto FROM Tipos_Producto WHERE nombre = 'CAJA_AHORRO');
    v_tipo_tc     INTEGER := (SELECT id_tipo_producto FROM Tipos_Producto WHERE nombre = 'TARJETA_CREDITO');
    v_activo      INTEGER := (SELECT id_estado_producto FROM Estados_Producto WHERE nombre = 'ACTIVO');
    v_cli         INTEGER;
    v_com         INTEGER;
    v_prod        INTEGER;
    v_ars         INTEGER;   -- cuenta ARS del cliente
    v_usd         INTEGER;   -- cuenta USD del cliente
    v_kio         INTEGER;   -- cuenta ARS del comercio
    v_tarjeta     INTEGER;
    v_consumo     INTEGER;
    c_ars CONSTANT VARCHAR := '0049999000000000000101';
    c_usd CONSTANT VARCHAR := '0049999000000000000201';
    c_kio CONSTANT VARCHAR := '0049999000000000000102';
    c_ext CONSTANT VARCHAR := '0070001500000000000777'; -- "otro banco" (solo como texto en el historial)
BEGIN
    IF EXISTS (SELECT 1 FROM Personas WHERE clerk_id = 'demo_cliente') THEN
        RAISE NOTICE 'La cuenta demo ya existe: no se hace nada.';
        RETURN;
    END IF;

    -- 1. PERSONAS (Córdoba → mantenimiento bonificado 12 meses, como cualquier alta en Córdoba)
    INSERT INTO Personas (nombre, apellido, dni, direccion, email, telefono, fecha_nac, clerk_id,
                          provincia, bonif_mantenimiento_desde, bonif_mantenimiento_hasta)
    VALUES ('Profe', 'Demo', '99000001', 'Av. Libertador 500, Santa Rosa de Calamuchita',
            'profe.demo@calamuchita.bank', '3546400000', '1980-05-10', 'demo_cliente',
            'Córdoba', CURRENT_DATE - 60, CURRENT_DATE + 305)
    RETURNING id INTO v_cli;

    INSERT INTO Personas (nombre, apellido, dni, direccion, email, telefono, fecha_nac, clerk_id,
                          provincia, bonif_mantenimiento_desde, bonif_mantenimiento_hasta)
    VALUES ('Kiosco del Lago', '(demo)', '99000002', 'Costanera 120, Villa Rumipal',
            'kiosco.demo@calamuchita.bank', '3546400001', '1985-09-01', 'demo_comercio',
            'Córdoba', CURRENT_DATE - 60, CURRENT_DATE + 305)
    RETURNING id INTO v_com;

    INSERT INTO Roles_x_Personas (id_persona, id_rol)
    SELECT p, id_rol FROM Roles, (VALUES (v_cli), (v_com)) AS x(p) WHERE nombre_rol = 'Cliente Regular';

    -- 2. CUENTAS (el saldo se calcula al final, como suma de los movimientos)
    INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto, fecha_alta)
    VALUES (v_cli, v_tipo_caja, v_activo, now() - INTERVAL '60 days') RETURNING id_producto INTO v_prod;
    INSERT INTO Cuentas_Bancarias (id_producto, cbu, alias, moneda, saldo)
    VALUES (v_prod, c_ars, 'profe.demo.calamuchita', 'ARS', 0) RETURNING id_cuenta INTO v_ars;

    INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto, fecha_alta)
    VALUES (v_cli, v_tipo_caja, v_activo, now() - INTERVAL '40 days') RETURNING id_producto INTO v_prod;
    INSERT INTO Cuentas_Bancarias (id_producto, cbu, alias, moneda, saldo)
    VALUES (v_prod, c_usd, 'profe.demo.usd', 'USD', 0) RETURNING id_cuenta INTO v_usd;

    INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto, fecha_alta)
    VALUES (v_com, v_tipo_caja, v_activo, now() - INTERVAL '60 days') RETURNING id_producto INTO v_prod;
    INSERT INTO Cuentas_Bancarias (id_producto, cbu, alias, moneda, saldo)
    VALUES (v_prod, c_kio, 'kiosco.demo.lago', 'ARS', 0) RETURNING id_cuenta INTO v_kio;

    -- 3. MOVIMIENTOS DEL CLIENTE (últimos ~2 meses)
    INSERT INTO Movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion, cbu_origen, cbu_destino, id_transaccion_central)
    SELECT v_ars, tm.id_tipo_movimiento, m.monto, now() - m.hace, m.descripcion, m.origen, m.destino, m.id_central
    FROM (VALUES
        ('CREDITO',                 850000.00, INTERVAL '58 days',  'Depósito en efectivo',                         c_ars, c_ars, NULL),
        ('TRANSFERENCIA_RECIBIDA',  920000.00, INTERVAL '35 days',  'Recibido de Sierras SRL (Banco Vecino) - Sueldo', c_ext, c_ars, 'demo-hist-01'),
        ('PAGO_SERVICIO',           -21450.00, INTERVAL '33 days',  'Pago de servicio: Epec (luz)',                 c_ars, NULL,  NULL),
        ('PAGO_SERVICIO',           -18900.00, INTERVAL '31 days',  'Pago de servicio: Ecogas (gas)',               c_ars, NULL,  NULL),
        ('RECARGA',                  -5000.00, INTERVAL '30 days',  'Recarga Personal - 3546400000',                c_ars, NULL,  NULL),
        ('TRANSFERENCIA_ENVIADA',  -180000.00, INTERVAL '28 days',  'Envío a Ana Vecina (Banco Vecino) - Alquiler', c_ars, c_ext, 'demo-hist-02'),
        ('PLAZO_FIJO_CONSTITUCION',-300000.00, INTERVAL '20 days',  'Constitución de plazo fijo a 60 días',         c_ars, NULL,  NULL),
        ('APORTE_RESERVA',          -60000.00, INTERVAL '18 days',  'Aporte a reserva: Vacaciones de verano',       c_ars, NULL,  NULL),
        ('CAMBIO_DIVISA',          -150000.00, INTERVAL '15 days',  'Compra de USD 120,00',                         c_ars, c_usd, NULL),
        ('TRANSFERENCIA_ENVIADA',    -4200.00, INTERVAL '9 days',   'Envío a Kiosco del Lago (demo) (Calamuchita Bank) - Compras', c_ars, c_kio, 'demo-hist-03'),
        ('PAGO_TARJETA',            -45000.00, INTERVAL '6 days',   'Pago cuota 1/3 tarjeta Visa - Supermercado Sierras', c_ars, NULL, NULL),
        ('TRANSFERENCIA_RECIBIDA',   35000.00, INTERVAL '3 days',   'Recibido de Kiosco del Lago (demo) (Calamuchita Bank) - Devolución', c_kio, c_ars, 'demo-hist-04'),
        ('RECARGA',                  -3000.00, INTERVAL '2 days',   'Recarga Claro - 3546400000',                   c_ars, NULL,  NULL),
        ('PAGO_SERVICIO',           -12800.00, INTERVAL '1 day',    'Pago de servicio: Aguas (agua)',               c_ars, NULL,  NULL)
    ) AS m(tipo, monto, hace, descripcion, origen, destino, id_central)
    JOIN Tipos_Movimiento tm ON tm.nombre = m.tipo;

    INSERT INTO Movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion, cbu_origen, cbu_destino)
    SELECT v_usd, id_tipo_movimiento, 120.00, now() - INTERVAL '15 days', 'Compra de USD 120,00', c_ars, c_usd
    FROM Tipos_Movimiento WHERE nombre = 'CAMBIO_DIVISA';
    INSERT INTO Movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion, cbu_origen, cbu_destino)
    SELECT v_usd, id_tipo_movimiento, 380.00, now() - INTERVAL '38 days', 'Depósito en efectivo (USD)', c_usd, c_usd
    FROM Tipos_Movimiento WHERE nombre = 'CREDITO';

    -- 4. MOVIMIENTOS DEL COMERCIO
    INSERT INTO Movimientos (id_cuenta, id_tipo_movimiento, monto, fecha_movimiento, descripcion, cbu_origen, cbu_destino, id_transaccion_central)
    SELECT v_kio, tm.id_tipo_movimiento, m.monto, now() - m.hace, m.descripcion, m.origen, m.destino, m.id_central
    FROM (VALUES
        ('CREDITO',                 150000.00, INTERVAL '55 days', 'Depósito en efectivo',                   c_kio, c_kio, NULL),
        ('TRANSFERENCIA_RECIBIDA',    4200.00, INTERVAL '9 days',  'Recibido de Profe Demo (Calamuchita Bank)', c_ars, c_kio, 'demo-hist-03'),
        ('TRANSFERENCIA_ENVIADA',   -35000.00, INTERVAL '3 days',  'Envío a Profe Demo (Calamuchita Bank) - Devolución', c_kio, c_ars, 'demo-hist-04')
    ) AS m(tipo, monto, hace, descripcion, origen, destino, id_central)
    JOIN Tipos_Movimiento tm ON tm.nombre = m.tipo;

    -- 5. PRODUCTOS DEL CLIENTE
    -- Plazo fijo vigente
    INSERT INTO Plazos_Fijos (id_cuenta, capital, tna, fecha_alta, fecha_vencimiento, estado)
    VALUES (v_ars, 300000.00, 32.500, now() - INTERVAL '20 days', CURRENT_DATE + 40, 'ACTIVO');

    -- Reserva
    INSERT INTO Reservas (id_cuenta, nombre, monto_objetivo, saldo_actual, fecha_meta)
    VALUES (v_ars, 'Vacaciones de verano', 400000.00, 60000.00, CURRENT_DATE + 75);

    -- Tarjeta Visa con un consumo en 3 cuotas (1 paga) y uno en 1 cuota
    INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto, fecha_alta)
    VALUES (v_cli, v_tipo_tc, v_activo, now() - INTERVAL '50 days') RETURNING id_producto INTO v_prod;
    INSERT INTO Tarjetas_Credito (id_producto, numero_tarjeta, marca, fecha_vencimiento, limite_compra, dia_cierre)
    VALUES (v_prod, '4507999900000101', 'Visa', (CURRENT_DATE + INTERVAL '4 years')::date, 800000.00, 20)
    RETURNING id_tarjeta INTO v_tarjeta;

    INSERT INTO Consumos_Tarjeta (id_tarjeta, comercio, monto_total, cantidad_cuotas, fecha)
    VALUES (v_tarjeta, 'Supermercado Sierras', 135000.00, 3, now() - INTERVAL '40 days') RETURNING id_consumo INTO v_consumo;
    INSERT INTO Cuotas_Tarjeta (id_consumo, numero_cuota, monto, fecha_vencimiento, estado) VALUES
        (v_consumo, 1, 45000.00, CURRENT_DATE - 6,  'PAGADA'),
        (v_consumo, 2, 45000.00, CURRENT_DATE + 24, 'PENDIENTE'),
        (v_consumo, 3, 45000.00, CURRENT_DATE + 54, 'PENDIENTE');

    INSERT INTO Consumos_Tarjeta (id_tarjeta, comercio, monto_total, cantidad_cuotas, fecha)
    VALUES (v_tarjeta, 'Farmacia del Valle', 23500.00, 1, now() - INTERVAL '4 days') RETURNING id_consumo INTO v_consumo;
    INSERT INTO Cuotas_Tarjeta (id_consumo, numero_cuota, monto, fecha_vencimiento, estado) VALUES
        (v_consumo, 1, 23500.00, CURRENT_DATE + 24, 'PENDIENTE');

    -- 6. COBROS CON QR DEL COMERCIO
    -- Quedan cargados para cuando se habilite el QR (hoy "Próximamente"): uno ya pagado...
    INSERT INTO Cobros (id_cuenta_cobradora, precio, descripcion, monto_pagado, estado,
                        id_cuenta_pagadora, id_transaccion_central, fecha_creacion, fecha_pago)
    VALUES (v_kio, 4200.00, 'Gaseosa y alfajores', 4200.00, 'PAGADO',
            v_ars, 'demo-hist-03', now() - INTERVAL '9 days', now() - INTERVAL '9 days');
    -- ...y uno PENDIENTE con id fijo: es el QR de ejemplo que muestra la demo para pagar.
    INSERT INTO Cobros (id_cobro, id_cuenta_cobradora, precio, descripcion, monto_pagado, estado, fecha_creacion)
    VALUES ('de300000-0000-4000-8000-000000000001', v_kio, 3500.00, 'Café con medialunas', 3500.00, 'PENDIENTE', now());

    -- 7. SALDOS = suma de los movimientos de cada cuenta
    UPDATE Cuentas_Bancarias c
    SET saldo = COALESCE((SELECT SUM(m.monto) FROM Movimientos m WHERE m.id_cuenta = c.id_cuenta), 0)
    WHERE c.id_cuenta IN (v_ars, v_usd, v_kio);

    RAISE NOTICE 'Cuenta demo creada (cliente id %, comercio id %).', v_cli, v_com;
END $$;

COMMIT;
