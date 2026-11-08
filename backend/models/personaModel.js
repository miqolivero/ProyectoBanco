const pool = require('../config/db');
const { PROVINCIA_BONIFICADA } = require('../utils/provincias');
const { SQL_HOY } = require('../utils/fechas');
const { MANTENIMIENTO_NETO, IVA_PORCENTAJE } = require('../utils/costos');

// Nombre del rol (tabla Roles) que habilita el panel de gerencia.
const ROL_GERENTE = 'Gerente';

// 🎯 La bonificación de mantenimiento se decide UNA sola vez, al crear la cuenta (ver create):
// cambiar la provincia después no la quita ni la da. Ni quien se muda fuera de Córdoba la
// pierde, ni quien se muda a Córdoba (o completa la provincia de una cuenta vieja) la gana.
// Por eso actualizarDatosContacto y completarDomicilio tocan solo la provincia, nunca las
// columnas bonif_mantenimiento_*.

class Persona {
    // Sin clerk_id: es el identificador interno de autenticación, nadie lo necesita en un listado.
    static async getAll() {
        const res = await pool.query(
            `SELECT id, nombre, apellido, dni, direccion, email, telefono, fecha_nac
             FROM Personas ORDER BY apellido, nombre`
        );
        return res.rows;
    }

    // NUEVO MÉTODO: Para buscar los datos del usuario logueado usando su ID de Clerk
    // `es_gerente` viaja al frontend solo para decidir si mostrar el menú del panel: es una
    // pista de interfaz, no un permiso. Lo que protege los datos es requireGerente en el backend.
    static async getByClerkId(clerkId) {
        const query = `
            SELECT p.*, cb.cbu, cb.alias, cb.saldo,
                   EXISTS (
                       SELECT 1 FROM Roles_x_Personas rp
                       JOIN Roles r ON r.id_rol = rp.id_rol
                       WHERE rp.id_persona = p.id AND r.nombre_rol = $2 AND r.activo
                   ) AS es_gerente
            FROM Personas p
            JOIN Productos prod ON prod.id_persona = p.id
            JOIN Cuentas_Bancarias cb ON cb.id_producto = prod.id_producto
            WHERE p.clerk_id = $1
            ORDER BY (cb.moneda = 'ARS') DESC, cb.id_cuenta
            LIMIT 1
        `;
        // 🎯 El ORDER BY no es cosmético. Con cuenta en pesos y en dólares el JOIN devuelve dos
        // filas, y el frontend toma esta como la "cuenta principal" (datosUsuario.cbu, que usan
        // plazos fijos, préstamos, servicios, tarjetas...). Sin orden explícito, cuál sale primera
        // depende del plan que elija Postgres: hoy arranca por Productos y sale la de pesos, pero
        // con un hash join —el plan que elige cuando las tablas crecen— sale primero la de dólares.
        // Se comprobó forzando ese plan. La principal es siempre la de pesos.
        const res = await pool.query(query, [clerkId, ROL_GERENTE]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // 🎯 Fuente única de verdad de "¿esta persona puede ver el panel de gerencia?". La usan el
    // middleware requireGerente y getByClerkId — que el nombre del rol viva en una constante
    // evita que un lado diga 'Gerente' y el otro 'gerente' y el permiso deje de funcionar.
    static async esGerente(idPersona) {
        const res = await pool.query(
            `SELECT 1 FROM Roles_x_Personas rp
             JOIN Roles r ON r.id_rol = rp.id_rol
             WHERE rp.id_persona = $1 AND r.nombre_rol = $2 AND r.activo
             LIMIT 1`,
            [idPersona, ROL_GERENTE]
        );
        return res.rows.length > 0;
    }

    // 🎯 Usada por el middleware de autenticación (middlewares/auth.js): a diferencia de
    // getByClerkId (que hace un JOIN y devuelve una sola fila — se pierde la cuenta USD si la
    // persona tiene dos cajas de ahorro), esta trae TODOS los CBU que le pertenecen a la
    // persona, para poder validar "¿este CBU es realmente tuyo?" sin importar en qué moneda esté.
    static async getIdentidadCompleta(clerkId) {
        const resPersona = await pool.query(
            'SELECT id, dni, nombre, apellido FROM Personas WHERE clerk_id = $1',
            [clerkId]
        );
        if (resPersona.rows.length === 0) return null;
        const persona = resPersona.rows[0];

        const resCbus = await pool.query(
            `SELECT cb.cbu, cb.moneda
             FROM Cuentas_Bancarias cb
             JOIN Productos pr ON pr.id_producto = cb.id_producto
             WHERE pr.id_persona = $1`,
            [persona.id]
        );

        return { ...persona, cbus: resCbus.rows };
    }

    // Antes consultaba "Roles_Personas", una tabla que no existe (la real es Roles_x_Personas):
    // el endpoint GET /api/personas/:id/roles respondía siempre 500. Además devolvía solo los
    // ids — ahora trae el nombre del rol, que es lo que sirve.
    static async getRoles(id) {
        const res = await pool.query(
            `SELECT r.id_rol, r.nombre_rol, r.descripcion
             FROM Roles_x_Personas rp
             JOIN Roles r ON r.id_rol = rp.id_rol
             WHERE rp.id_persona = $1
             ORDER BY r.id_rol`,
            [id]
        );
        return res.rows;
    }

    static async getProductos(id) {
        const res = await pool.query('SELECT * FROM Productos WHERE id_persona = $1', [id]);
        return res.rows;
    }
    
    static async getById(id) {
        const res = await pool.query('SELECT * FROM Personas WHERE id = $1', [id]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    static async getByDni(dni) {
        const res = await pool.query('SELECT * FROM Personas WHERE dni = $1', [dni]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // MODIFICADO: Ahora recibe y guarda el clerkId
    static async create(datos) {
        const { nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, provincia, alias, cbu, clerkId } = datos;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Agregamos clerk_id al INSERT. Si la cuenta se abre con domicilio en Córdoba, la
            // bonificación de mantenimiento arranca hoy y dura 12 meses desde el alta.
            const queryPersona = `
                INSERT INTO Personas (nombre, apellido, dni, email, telefono, fecha_nac, direccion, clerk_id,
                                      provincia, bonif_mantenimiento_desde, bonif_mantenimiento_hasta)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar,
                        CASE WHEN $9::varchar = '${PROVINCIA_BONIFICADA}' THEN ${SQL_HOY} END,
                        CASE WHEN $9::varchar = '${PROVINCIA_BONIFICADA}' THEN (${SQL_HOY} + INTERVAL '12 months')::date END)
                RETURNING id;
            `;
            const resPersona = await client.query(queryPersona, [nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, clerkId, provincia]);
            const personaId = resPersona.rows[0].id;

            const resProducto = await client.query(
                'INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto, fecha_alta) VALUES ($1, 1, 1, CURRENT_TIMESTAMP) RETURNING id_producto',
                [personaId]
            );
            const productoId = resProducto.rows[0].id_producto;

            await client.query(
                'INSERT INTO Cuentas_Bancarias (id_producto, cbu, alias, moneda, saldo) VALUES ($1, $2, $3, \'ARS\', 0)',
                [productoId, cbu, alias]
            );
            await client.query('COMMIT');
            return { id: personaId, cbu };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Busca si la persona ya tiene una cuenta en una moneda dada (ej. USD)
    static async getCuentaPorMoneda(idPersona, moneda) {
        const res = await pool.query(
            `SELECT cb.id_cuenta, cb.cbu, cb.alias, cb.moneda, cb.saldo
             FROM Cuentas_Bancarias cb
             JOIN Productos pr ON pr.id_producto = cb.id_producto
             WHERE pr.id_persona = $1 AND cb.moneda = $2`,
            [idPersona, moneda]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // Crea una caja de ahorro adicional en otra moneda (ej. USD) para una persona que ya
    // tiene su cuenta en ARS. Mismo tipo de producto (CAJA_AHORRO), producto nuevo aparte.
    static async crearCuentaMoneda(idPersona, cbu, alias, moneda, saldoInicial = 0) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resTipoProducto = await client.query(
                "SELECT id_tipo_producto FROM Tipos_Producto WHERE nombre = 'CAJA_AHORRO'"
            );
            const resEstado = await client.query(
                "SELECT id_estado_producto FROM Estados_Producto WHERE nombre = 'ACTIVO'"
            );

            const resProducto = await client.query(
                'INSERT INTO Productos (id_persona, id_tipo_producto, id_estado_producto) VALUES ($1, $2, $3) RETURNING id_producto',
                [idPersona, resTipoProducto.rows[0].id_tipo_producto, resEstado.rows[0].id_estado_producto]
            );
            const idProducto = resProducto.rows[0].id_producto;

            const resCuenta = await client.query(
                `INSERT INTO Cuentas_Bancarias (id_producto, cbu, alias, moneda, saldo)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id_cuenta, cbu, alias, moneda, saldo`,
                [idProducto, cbu, alias || null, moneda, Number(saldoInicial) || 0]
            );

            await client.query('COMMIT');
            return resCuenta.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async updateAlias(cbu, nuevoAlias) {
        const query = `
            UPDATE Cuentas_Bancarias
            SET alias = $1
            WHERE cbu = $2
            RETURNING *;
        `;
        const res = await pool.query(query, [nuevoAlias, cbu]);
        return res.rows[0];
    }

    // Actualiza los datos de contacto de la persona (Ajustes de perfil). A propósito NO incluye
    // nombre/apellido/dni: esos están registrados en el Banco Central junto con el CBU, y
    // cambiarlos ahí requeriría sincronizar con la red — fuera de alcance de esta pantalla.
    // La provincia es parte del domicilio. Cambiarla no toca la bonificación (ver arriba).
    static async actualizarDatosContacto(id, { email, telefono, direccion, provincia }) {
        const query = `
            UPDATE Personas
            SET email = $1, telefono = $2, direccion = $3, provincia = $5
            WHERE id = $4
            RETURNING id, nombre, apellido, dni, email, telefono, direccion, provincia, fecha_nac;
        `;
        const res = await pool.query(query, [email, telefono, direccion, id, provincia]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // Para las cuentas creadas antes de que la provincia fuera obligatoria: la completan en el
    // próximo ingreso (pantalla CompletarProvincia), junto con la dirección si no la tenían.
    static async completarDomicilio(id, { direccion, provincia }) {
        const query = `
            UPDATE Personas
            SET direccion = COALESCE($2, direccion), provincia = $3
            WHERE id = $1
            RETURNING id, direccion, provincia;
        `;
        const res = await pool.query(query, [id, direccion, provincia]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // Fechas como texto ('YYYY-MM-DD'): pg convierte los DATE a un Date en la zona del servidor,
    // y eso puede correr el día. "vigente" se evalúa con la fecha de hoy en Córdoba.
    static async obtenerBonificacion(id) {
        const res = await pool.query(
            `SELECT provincia,
                    bonif_mantenimiento_desde::text AS desde,
                    bonif_mantenimiento_hasta::text AS hasta,
                    COALESCE(bonif_mantenimiento_hasta >= ${SQL_HOY}, false) AS vigente
             FROM Personas WHERE id = $1`,
            [id]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    // Mantenimiento mensual: neto + IVA, en NUMERIC. Es el mismo para todas las cuentas no
    // bonificadas (ver utils/costos.js).
    static async costoMantenimiento() {
        const res = await pool.query(
            `SELECT $1::numeric(15, 2) AS neto,
                    $2::numeric AS porcentaje_iva,
                    ROUND($1::numeric * $2::numeric / 100, 2)::numeric(15, 2) AS iva,
                    ($1::numeric + ROUND($1::numeric * $2::numeric / 100, 2))::numeric(15, 2) AS total`,
            [MANTENIMIENTO_NETO, IVA_PORCENTAJE]
        );
        return res.rows[0];
    }
}

module.exports = Persona;