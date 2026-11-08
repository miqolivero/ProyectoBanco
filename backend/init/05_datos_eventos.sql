-- =============================================================================
-- DATOS DE PRUEBA — Eventos y comercios adheridos (después de 04_cobros_eventos.sql)
--
--   psql -U postgres -d banco_db -f backend/init/05_datos_eventos.sql
--
-- Idempotente: no duplica eventos ni adhesiones si se corre otra vez. No toca cuentas,
-- saldos ni movimientos.
--
-- Las adhesiones se atan a cuentas que YA existen, buscándolas por CBU. Una cuenta que no
-- esté en esta base se saltea con un NOTICE (no aborta el script). Para la base de
-- producción (Supabase), cambiar los CBU de la lista "comercios" por cuentas de prueba reales
-- de esa base — conviene que sean cuentas con login, para poder entrar y generar el QR.
-- =============================================================================

BEGIN;

-- 1. EVENTOS
-- Fechas aproximadas de las ediciones reales. La de Oktoberfest es la de 2027 porque la de
-- 2026 ya pasó (primeras dos semanas de octubre). "Semana de Nuestra Gente" es el evento de
-- demostración: vigente durante la semana de la presentación.
INSERT INTO Eventos (nombre, ciudad, lugar, provincia, fecha_inicio, fecha_fin, porcentaje_descuento, tope_descuento)
SELECT v.nombre, v.ciudad, v.lugar, 'Córdoba', v.inicio::date, v.fin::date, v.pct, v.tope
FROM (VALUES
    ('Semana de Nuestra Gente', 'Santa Rosa de Calamuchita', 'Costanera del Río Santa Rosa', '2026-10-26', '2026-11-08', 15.00, 10000.00),
    ('Festival de Peñas',       'Villa María',               'Anfiteatro Centenario',        '2027-02-03', '2027-02-07', 15.00, 10000.00),
    ('Oktoberfest',             'Villa General Belgrano',    'Parque Cervecero',             '2027-10-01', '2027-10-11', 10.00, 10000.00)
) AS v(nombre, ciudad, lugar, inicio, fin, pct, tope)
WHERE NOT EXISTS (
    SELECT 1 FROM Eventos e WHERE e.nombre = v.nombre AND e.fecha_inicio = v.inicio::date
);

-- El tope del evento es por cliente: $10.000 sumando todas sus compras del evento. Si estos
-- eventos ya estaban cargados de una corrida anterior (con el tope viejo, por compra), se
-- corrige acá. Solo toca estos tres eventos de prueba.
UPDATE Eventos SET tope_descuento = 10000.00
WHERE (nombre, fecha_inicio) IN (
    ('Semana de Nuestra Gente', DATE '2026-10-26'),
    ('Festival de Peñas', DATE '2027-02-03'),
    ('Oktoberfest', DATE '2027-10-01')
) AND tope_descuento <> 10000.00;

-- 2. ADHESIONES APROBADAS
DO $$
DECLARE
    c RECORD;
    v_id_cuenta INTEGER;
    v_id_evento INTEGER;
BEGIN
    FOR c IN
        SELECT * FROM (VALUES
            -- cbu,                       evento,                    nombre comercial,          rubro
            ('0040001532312312001002', 'Semana de Nuestra Gente', 'Parrilla El Algarrobo',    'Gastronomía'),
            ('0040001520202000001106', 'Semana de Nuestra Gente', 'Artesanías del Valle',     'Artesanías'),
            ('0040001545999888000800', 'Festival de Peñas',       'Empanadas Doña Rosa',      'Puesto de comidas'),
            ('0040001532312312001002', 'Festival de Peñas',       'Parrilla El Algarrobo',    'Gastronomía'),
            ('0040001520202000001106', 'Oktoberfest',             'Cervecería Los Reartes',   'Cervecería artesanal')
        ) AS t(cbu, evento, nombre_comercial, rubro)
    LOOP
        SELECT id_cuenta INTO v_id_cuenta FROM Cuentas_Bancarias WHERE cbu = c.cbu AND moneda = 'ARS';
        IF v_id_cuenta IS NULL THEN
            RAISE NOTICE 'Se saltea "%" (%): no existe una cuenta en pesos con CBU % en esta base.', c.nombre_comercial, c.evento, c.cbu;
            CONTINUE;
        END IF;

        SELECT id_evento INTO v_id_evento FROM Eventos WHERE nombre = c.evento ORDER BY fecha_inicio DESC LIMIT 1;

        INSERT INTO Adhesiones_Evento (id_cuenta, id_evento, nombre_comercial, rubro, estado, fecha_aprobacion)
        VALUES (v_id_cuenta, v_id_evento, c.nombre_comercial, c.rubro, 'APROBADA', now())
        ON CONFLICT (id_cuenta, id_evento) DO NOTHING;
    END LOOP;
END $$;

COMMIT;
