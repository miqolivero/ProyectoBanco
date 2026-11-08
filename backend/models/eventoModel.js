const pool = require('../config/db');
const { SQL_HOY } = require('../utils/fechas');

class Evento {
    // Calendario de beneficios: eventos activos que todavía no terminaron (vigentes primero,
    // después los próximos por fecha), cada uno con sus comercios adheridos APROBADOS y, si
    // la persona que consulta pidió sumarse, el estado de su adhesión.
    static async listarVigentesYProximos(idPersona) {
        const res = await pool.query(
            `SELECT e.id_evento, e.nombre, e.ciudad, e.lugar, e.provincia,
                    e.fecha_inicio::text AS fecha_inicio, e.fecha_fin::text AS fecha_fin,
                    e.porcentaje_descuento, e.tope_descuento,
                    (${SQL_HOY} BETWEEN e.fecha_inicio AND e.fecha_fin) AS vigente,
                    COALESCE((
                        SELECT json_agg(json_build_object('nombre_comercial', a.nombre_comercial, 'rubro', a.rubro)
                                        ORDER BY a.nombre_comercial)
                        FROM Adhesiones_Evento a
                        WHERE a.id_evento = e.id_evento AND a.estado = 'APROBADA'
                    ), '[]'::json) AS adheridos,
                    (
                        SELECT a.estado
                        FROM Adhesiones_Evento a
                        JOIN Cuentas_Bancarias c ON c.id_cuenta = a.id_cuenta
                        JOIN Productos pr ON pr.id_producto = c.id_producto
                        WHERE a.id_evento = e.id_evento AND pr.id_persona = $1
                        ORDER BY a.fecha_solicitud DESC
                        LIMIT 1
                    ) AS mi_adhesion
             FROM Eventos e
             WHERE e.activo AND e.fecha_fin >= ${SQL_HOY}
             ORDER BY vigente DESC, e.fecha_inicio, e.id_evento`,
            [idPersona]
        );
        return res.rows;
    }

    // El evento vigente que se destaca en Inicio ("Hoy: 15% en ..."). Si hay más de uno a la
    // vez, el de mayor descuento.
    static async destacado() {
        const res = await pool.query(
            `SELECT id_evento, nombre, ciudad, porcentaje_descuento, tope_descuento,
                    fecha_fin::text AS fecha_fin
             FROM Eventos
             WHERE activo AND ${SQL_HOY} BETWEEN fecha_inicio AND fecha_fin
             ORDER BY porcentaje_descuento DESC, fecha_fin, id_evento
             LIMIT 1`
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    static async obtenerPorId(idEvento) {
        const res = await pool.query(
            `SELECT id_evento, nombre, provincia, activo, (fecha_fin >= ${SQL_HOY}) AS no_terminado
             FROM Eventos WHERE id_evento = $1`,
            [idEvento]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // "Quiero sumarme": queda PENDIENTE hasta que el banco la apruebe. La UNIQUE (cuenta, evento)
    // de la tabla es la que impide pedirla dos veces — el controller traduce ese error (23505).
    static async solicitarAdhesion(idCuenta, idEvento, nombreComercial, rubro) {
        const res = await pool.query(
            `INSERT INTO Adhesiones_Evento (id_cuenta, id_evento, nombre_comercial, rubro)
             VALUES ($1, $2, $3, $4)
             RETURNING id_adhesion, estado, fecha_solicitud`,
            [idCuenta, idEvento, nombreComercial, rubro]
        );
        return res.rows[0];
    }
}

module.exports = Evento;
