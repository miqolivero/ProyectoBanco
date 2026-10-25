const pool = require('../config/db');

// Nombre del rol (tabla Roles) que habilita el panel de gerencia.
const ROL_GERENTE = 'Gerente';

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
        `;
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
        const { nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, alias, cbu, clerkId } = datos;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Agregamos clerk_id al INSERT
            const queryPersona = `
                INSERT INTO Personas (nombre, apellido, dni, email, telefono, fecha_nac, direccion, clerk_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                RETURNING id;
            `;
            const resPersona = await client.query(queryPersona, [nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, clerkId]);
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
    static async actualizarDatosContacto(id, { email, telefono, direccion }) {
        const query = `
            UPDATE Personas
            SET email = $1, telefono = $2, direccion = $3
            WHERE id = $4
            RETURNING id, nombre, apellido, dni, email, telefono, direccion, fecha_nac;
        `;
        const res = await pool.query(query, [email, telefono, direccion, id]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }
}

module.exports = Persona;