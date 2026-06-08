const pool = require('../config/db');

class Persona {
    static async getAll() {
        const res = await pool.query('SELECT * FROM Personas');
        return res.rows;
    }

    // NUEVO MÉTODO: Para buscar los datos del usuario logueado usando su ID de Clerk
    static async getByClerkId(clerkId) {
        const query = `
            SELECT p.*, cb.cbu, cb.alias, cb.saldo 
            FROM Personas p
            JOIN Productos prod ON prod.id_persona = p.id
            JOIN Cuentas_Bancarias cb ON cb.id_producto = prod.id_producto
            WHERE p.clerk_id = $1
        `;
        const res = await pool.query(query, [clerkId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    static async getRoles(id) {
        const res = await pool.query('SELECT * FROM Roles_Personas WHERE id_persona = $1', [id]);
        return res.rows;
    }

    static async getProductos(id) {
        const res = await pool.query('SELECT * FROM Productos WHERE id_persona = $1', [id]);
        return res.rows;
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
}

module.exports = Persona;