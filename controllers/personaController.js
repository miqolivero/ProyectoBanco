const Persona = require('../models/personaModel');

exports.obtenerPersonas = async (req, res) => {
    try {
        const personas = await Persona.getAll();
        res.json(personas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// NUEVO MÉTODO: Para cuando el Front mande el ID de Clerk en los parámetros (/api/personas/clerk/:clerkId)
exports.obtenerPorClerk = async (req, res) => {
    try {
        const persona = await Persona.getByClerkId(req.params.clerkId);
        if (!persona) {
            return res.status(404).json({ error: "Usuario no registrado en la base de datos local" });
        }
        res.json(persona);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.obtenerRoles = async (req, res) => {
    try {
        const roles = await Persona.getRoles(req.params.id);
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.obtenerProductos = async (req, res) => {
    try {
        const productos = await Persona.getProductos(req.params.id);
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// MODIFICADO: Ahora le pasa el alias inicial al Central Bank durante el registro
// MODIFICADO: Registro inteligente con Alias Aleatorio y validaciones estrictas
exports.crearPersona = async (req, res) => {
    const { nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, alias, clerkId } = req.body;

    if (!clerkId || !dni || !nombre || !apellido) {
        return res.status(400).json({ error: "Faltan datos obligatorios (clerkId, dni, nombre, apellido)" });
    }

    try {
        // 1. Validar DNI localmente
        if (typeof Persona.getByDni === 'function') {
            const dniExistente = await Persona.getByDni(dni);
            if (dniExistente) {
                return res.status(400).json({ error: "El DNI ya se encuentra registrado localmente." });
            }
        }
    
        let aliasFinal = alias ? String(alias).trim().toLowerCase() : null;

        // 2. REGRESO O GENERACIÓN AUTOMÁTICA DE ALIAS
        if (!aliasFinal) {
            // Si no ingresó alias, generamos uno: nombre.apellido.numero (ej: miqueas.olivero.742)
            const numAleatorio = Math.floor(100 + Math.random() * 900);
            const nombreLimpio = nombre.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const apellidoLimpio = apellido.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            aliasFinal = `${nombreLimpio}.${apellidoLimpio}.${numAleatorio}`;
            console.log(`🎲 Alias no provisto. Generado automáticamente: ${aliasFinal}`);
        } else {
            // 3. VALIDACIÓN DE FORMATO (Solo letras, números, puntos y guiones)
            const regexAlias = /^[a-z0-9.-]+$/;
            if (!regexAlias.test(aliasFinal)) {
                return res.status(400).json({ 
                    error: "Formato de alias inválido", 
                    detalle: "El alias solo puede contener letras, números, puntos (.) y guiones (-)." 
                });
            }
        }

        // 4. Petición a la API del Profesor
        const responseBCRA = await fetch('https://centralbank.brocoly.cc/api/persons', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-environment': 'test',
                'x-api-key': process.env.CENTRAL_BANK_API_KEY
            },
            body: JSON.stringify({ 
                nombre, 
                apellido, 
                dni,
                alias: aliasFinal 
            })
        });

        const dataBCRA = await responseBCRA.json();
        console.log("👉 Respuesta del Central en Registro:", responseBCRA.status, dataBCRA);

        if (responseBCRA.status === 201 || responseBCRA.status === 200) {
            // 5. Guardar en Postgres mediante tu modelo
            await Persona.create({
                nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, 
                alias: aliasFinal, 
                cbu: dataBCRA.cbu,
                clerkId
            });
            return res.status(201).json({ message: "Registrado con éxito", cbu: dataBCRA.cbu, alias: aliasFinal });
        } else {
            // Atajamos de forma clara si el alias ya está duplicado en la red global (Status 409 u otros)
            console.error("⚠️ El Central rechazó el registro:", dataBCRA);
            const msgError = responseBCRA.status === 409 ? "El alias elegido ya está siendo usado por otro banco en la red." : "Error en el Banco Central";
            return res.status(responseBCRA.status).json({ error: msgError, detalle: dataBCRA });
        }
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN BACKEND:", error);
        return res.status(500).json({ error: "Error de servidor", detalle: error.message });
    }
};
// MODIFICADO: Manejo seguro de respuestas 204 (No Content) y normalización del alias
exports.cambiarAlias = async (req, res) => {
    const { cbu } = req.params; 
    const { nuevoAlias } = req.body; 

    if (!cbu || !nuevoAlias) {
        return res.status(400).json({ error: "El CBU y el nuevo alias son obligatorios" });
    }

    try {
        const cbuLimpio = String(cbu).trim();
        const aliasLimpio = String(nuevoAlias).trim().toLowerCase(); // Aseguramos formato limpio para el Central

        console.log(`🔄 Cambio de alias para CBU: ${cbuLimpio} -> Nuevo: ${aliasLimpio}`);

        const responseBCRA = await fetch(`https://centralbank.brocoly.cc/api/persons/${cbuLimpio}/alias`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-environment': 'test',
                'x-api-key': process.env.CENTRAL_BANK_API_KEY
            },
            body: JSON.stringify({ alias: aliasLimpio })
        });

        // 💡 CONTROL ANTICRASH: Solo leemos JSON si la API responde con contenido (evitamos romper en 204)
        let dataBCRA = {};
        if (responseBCRA.status !== 204) {
            dataBCRA = await responseBCRA.json().catch(() => ({}));
        }

        // Si devuelve 200 o 204, el Central aceptó con éxito el cambio
        if (responseBCRA.status === 200 || responseBCRA.status === 204) {
            // Impactamos la actualización en nuestra base de datos local de PostgreSQL
            const cuenta = await Persona.updateAlias(cbuLimpio, aliasLimpio);
            
            if (cuenta) {
                return res.status(200).json({ message: "Alias actualizado correctamente", alias: aliasLimpio });
            } else {
                return res.status(404).json({ error: "El CBU no existe registrado en la base de datos local" });
            }
        } else {
            console.error("⚠️ El Central rechazó el cambio de alias:", dataBCRA);
            return res.status(responseBCRA.status).json({ 
                error: "El Central rechazó el cambio", 
                detalle: dataBCRA.mensaje || dataBCRA.message || dataBCRA 
            });
        }
    } catch (error) {
        console.error("❌ Error en cambiarAlias:", error.message);
        return res.status(500).json({ error: "Error de servidor", detalle: error.message });
    }
};