-- =============================================================================
-- MIGRACIÓN 04 — Cobrar con QR, eventos con promociones y bonificación por provincia
--
-- Se corre sobre una base que YA tiene 01_schema.sql (y opcionalmente datos reales): no borra
-- ni reescribe nada, solo agrega columnas y tablas nuevas. Es idempotente — correrla dos veces
-- no rompe nada (todo usa IF NOT EXISTS o chequea antes de crear).
--
--   psql -U postgres -d banco_db -f backend/init/04_cobros_eventos.sql
--
-- Nada de esto se registra en la API del Banco Central: cobros, eventos y adhesiones viven
-- solo en esta base. La plata se mueve únicamente con el flujo de transferencias existente.
-- =============================================================================

BEGIN;

-- 1. PROVINCIA Y BONIFICACIÓN DE MANTENIMIENTO EN PERSONAS
-- provincia queda NULL para las cuentas que ya existían: el frontend les pide completarla en
-- el próximo ingreso. Las cuentas nuevas no pueden crearse sin ella (lo valida el backend).
-- La bonificación solo se registra y se muestra: hoy no se cobra mantenimiento a nadie.
ALTER TABLE Personas ADD COLUMN IF NOT EXISTS provincia VARCHAR(60);
ALTER TABLE Personas ADD COLUMN IF NOT EXISTS bonif_mantenimiento_desde DATE;
ALTER TABLE Personas ADD COLUMN IF NOT EXISTS bonif_mantenimiento_hasta DATE;

-- Lista cerrada de las 24 jurisdicciones (misma que backend/utils/provincias.js). La valida
-- también el backend; esto es la última línea de defensa si algo escribe directo en la base.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_personas_provincia') THEN
        ALTER TABLE Personas ADD CONSTRAINT chk_personas_provincia CHECK (provincia IS NULL OR provincia IN (
            'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut',
            'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
            'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis',
            'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
            'Tierra del Fuego, Antártida e Islas del Atlántico Sur', 'Tucumán'
        ));
    END IF;
END $$;

-- 2. EVENTOS (fiestas regionales con descuento para quien paga con QR a un comercio adherido)
-- Las fechas son DATE y se comparan contra "hoy" en America/Argentina/Cordoba: un evento que
-- termina el 8 de febrero vale todo ese día en Córdoba, no hasta las 21 h (medianoche UTC).
CREATE TABLE IF NOT EXISTS Eventos (
    id_evento SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    lugar VARCHAR(150),
    provincia VARCHAR(60) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    -- < 100: con un 100% el cobro quedaría en $0 y no habría transferencia que hacer.
    porcentaje_descuento NUMERIC(5, 2) NOT NULL CHECK (porcentaje_descuento > 0 AND porcentaje_descuento < 100),
    tope_descuento NUMERIC(15, 2) NOT NULL CHECK (tope_descuento > 0), -- máximo de descuento POR CLIENTE sumando todas sus compras del evento, en pesos
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (fecha_fin >= fecha_inicio)
);

-- 3. ADHESIONES: un comercio se suma a UN evento puntual, no a todos. Solo las APROBADAS
-- aplican descuento. El descuento lo financia íntegramente el comercio.
CREATE TABLE IF NOT EXISTS Adhesiones_Evento (
    id_adhesion SERIAL PRIMARY KEY,
    id_cuenta INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    id_evento INTEGER NOT NULL REFERENCES Eventos(id_evento),
    nombre_comercial VARCHAR(120) NOT NULL,
    rubro VARCHAR(80) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'SUSPENDIDA')),
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_aprobacion TIMESTAMPTZ,
    UNIQUE (id_cuenta, id_evento)
);

-- 4. COBROS CON QR
-- El QR lleva solo el id (UUID, no adivinable). Precio, descuento y monto final quedan fijados
-- acá al crear el cobro, calculados por el backend: el que paga no puede tocarlos.
-- monto_pagado es lo que paga el cliente y recibe el comercio (precio − descuento): una sola
-- transferencia, sin saldo pendiente.
-- PROCESANDO es un estado interno de pocos segundos: marca el cobro como "tomado" mientras se
-- hace la transferencia, para que dos personas no puedan pagarlo a la vez (ver cobroController).
CREATE TABLE IF NOT EXISTS Cobros (
    id_cobro UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_cuenta_cobradora INTEGER NOT NULL REFERENCES Cuentas_Bancarias(id_cuenta),
    precio NUMERIC(15, 2) NOT NULL CHECK (precio > 0),
    descripcion VARCHAR(140),
    id_evento INTEGER REFERENCES Eventos(id_evento),
    id_adhesion INTEGER REFERENCES Adhesiones_Evento(id_adhesion),
    porcentaje_descuento NUMERIC(5, 2) NOT NULL DEFAULT 0,
    descuento NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    tope_aplicado BOOLEAN NOT NULL DEFAULT FALSE,
    monto_pagado NUMERIC(15, 2) NOT NULL CHECK (monto_pagado > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'PROCESANDO', 'PAGADO', 'CANCELADO')),
    id_cuenta_pagadora INTEGER REFERENCES Cuentas_Bancarias(id_cuenta),
    id_transaccion_central VARCHAR(100),
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_pago TIMESTAMPTZ,
    CHECK (monto_pagado = precio - descuento)
);

CREATE INDEX IF NOT EXISTS idx_cobros_cobradora ON Cobros (id_cuenta_cobradora, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_cobros_pagadora ON Cobros (id_cuenta_pagadora, fecha_pago);

-- 5. "¿Ya le transferiste alguna vez a este CBU?" se responde con el historial de movimientos
-- (sin tabla aparte). Este índice evita recorrer toda la tabla en cada transferencia.
CREATE INDEX IF NOT EXISTS idx_movimientos_origen_destino ON Movimientos (cbu_origen, cbu_destino);

-- 6. COMISIÓN POR COBRAR CON QR (al comercio, nunca al que paga)
-- Gratis hasta $250.000 cobrados por mes; el cobro que hace pasar ese tope, y los siguientes,
-- pagan 2% + IVA sobre el total del cobro (ver cobroController). Se calcula al pagar y se
-- debita cuando el ingreso se acredita en la cuenta del comercio (ver Cobro.debitarComision).
ALTER TABLE Cobros ADD COLUMN IF NOT EXISTS comision NUMERIC(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE Cobros ADD COLUMN IF NOT EXISTS iva_comision NUMERIC(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE Cobros ADD COLUMN IF NOT EXISTS comision_debitada BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO Tipos_Movimiento (nombre)
SELECT 'COMISION_COBRO_QR'
WHERE NOT EXISTS (SELECT 1 FROM Tipos_Movimiento WHERE nombre = 'COMISION_COBRO_QR');

-- 7. 🐛 ÍNDICE ÚNICO DE id_transaccion_central: por cuenta, no global
-- En una transferencia entre dos cuentas de ESTE banco, la pata enviada y la recibida tienen el
-- mismo id del Central. Con el índice global (01_schema.sql) solo podía existir una de las dos:
-- si la sincronización acreditaba primero al destinatario, el registro del envío fallaba y al
-- que transfería se le reintegraba el saldo (la plata se duplicaba); en el orden inverso, el
-- destinatario no recibía nunca la plata. Pasó con transferencias reales de septiembre 2026.
-- La protección contra la doble acreditación se mantiene: no puede haber dos movimientos con el
-- mismo id en la MISMA cuenta.
DROP INDEX IF EXISTS idx_movimientos_id_transaccion_central_unico;
-- Algunas bases (al menos la local de desarrollo) tienen además una restricción UNIQUE global
-- sobre la misma columna, agregada a mano fuera de 01_schema.sql. Tiene el mismo problema.
ALTER TABLE Movimientos DROP CONSTRAINT IF EXISTS movimientos_id_transaccion_central_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_id_central_por_cuenta
    ON Movimientos (id_transaccion_central, id_cuenta)
    WHERE id_transaccion_central IS NOT NULL;

COMMIT;
