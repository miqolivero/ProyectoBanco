const Persona = require('../models/personaModel');
const { centralBankFetch } = require('../config/centralBank');
const { exigirCbuPropio, exigirPersonaPropia, obtenerUserIdSesion } = require('../middlewares/auth');

exports.obtenerPersonas = async (req, res) => {
    try {
        const personas = await Persona.getAll();
        res.json(personas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// NUEVO MÉTODO: Para cuando el Front mande el ID de Clerk en los parámetros (/api/personas/clerk/:clerkId)
// 🎯 Este endpoint se llama ANTES de que sepamos si la persona ya completó el onboarding (es
// justamente el que decide eso), así que no puede usar requireAuth (que exige que ya exista un
// registro local). En cambio se verifica acá mismo que el clerkId pedido sea el de la sesión
// actual — si no, cualquiera podría consultar (y ver CBU/saldo/alias de) otro usuario con solo
// saber su clerkId.
exports.obtenerPorClerk = async (req, res) => {
    try {
        const userId = obtenerUserIdSesion(req);
        if (!userId || userId !== req.params.clerkId) {
            return res.status(401).json({ error: "No autenticado." });
        }
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
    if (!exigirPersonaPropia(req, res, req.params.id)) return;
    try {
        const roles = await Persona.getRoles(req.params.id);
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.obtenerProductos = async (req, res) => {
    if (!exigirPersonaPropia(req, res, req.params.id)) return;
    try {
        const productos = await Persona.getProductos(req.params.id);
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// MODIFICADO: Ahora le pasa el alias inicial al Central Bank durante el registro
// MODIFICADO: Registro inteligente con Alias Aleatorio y validaciones estrictas
// Edad mínima para abrir una cuenta bancaria de forma autónoma (sin tutor). Coincide con lo
// que exigen los bancos reales para un titular único que gestiona su cuenta por sí mismo — acá
// no existe un flujo de "cuenta para menores" con padre/tutor como co-titular, así que la única
// opción consistente con cómo está armado el registro es exigir mayoría de edad.
const EDAD_MINIMA_REGISTRO = 18;

function calcularEdad(fechaNacimiento) {
    const nacimiento = new Date(fechaNacimiento);
    if (isNaN(nacimiento.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const noCumplioAunEsteAnio =
        hoy.getMonth() < nacimiento.getMonth() ||
        (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
    if (noCumplioAunEsteAnio) edad--;
    return edad;
}

exports.crearPersona = async (req, res) => {
    const { nombre, apellido, dni, email, telefono, fecha_nacimiento, direccion, alias, clerkId } = req.body;

    if (!clerkId || !dni || !nombre || !apellido || !fecha_nacimiento) {
        return res.status(400).json({ error: "Faltan datos obligatorios (clerkId, dni, nombre, apellido, fecha_nacimiento)" });
    }

    // 🎯 El registro todavía no puede pasar por requireAuth (la persona recién se está creando,
    // no existe fila local que buscar) — pero sí hay que confirmar que el clerkId que se está
    // registrando sea el de la sesión que hizo la request, si no cualquiera podría registrar
    // una persona local "pisando" el clerkId de otro usuario ya logueado en el sistema.
    const userId = obtenerUserIdSesion(req);
    if (!userId || userId !== clerkId) {
        return res.status(401).json({ error: "No autenticado." });
    }

    // Validamos la edad antes de tocar el DNI o pegarle al Central Bank: es la validación más
    // barata y evita registrar a un menor en la red externa para recién ahí rechazarlo local.
    const edad = calcularEdad(fecha_nacimiento);
    if (edad === null) {
        return res.status(400).json({ error: "Fecha de nacimiento inválida." });
    }
    if (edad < EDAD_MINIMA_REGISTRO) {
        return res.status(400).json({
            error: `Debés ser mayor de ${EDAD_MINIMA_REGISTRO} años para abrir una cuenta.`,
            detalle: "Calamuchita Bank no ofrece cuentas para menores de edad con tutor co-titular; solo cuentas individuales."
        });
    }

    try {
        // 1. Validar DNI localmente
        const dniExistente = await Persona.getByDni(dni);
        if (dniExistente) {
            return res.status(400).json({ error: "El DNI ya se encuentra registrado localmente." });
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
        const responseBCRA = await centralBankFetch('/persons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
// CONSULTAR si la persona ya tiene una caja de ahorro en USD
exports.obtenerCuentaUSD = async (req, res) => {
    if (!exigirPersonaPropia(req, res, req.params.id)) return;
    try {
        const cuenta = await Persona.getCuentaPorMoneda(req.params.id, 'USD');
        res.json(cuenta); // null si todavía no tiene
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ABRIR una caja de ahorro en USD contra el Banco Central (POST /accounts), y guardarla local
exports.abrirCuentaUSD = async (req, res) => {
    const idPersona = req.params.id;
    if (!exigirPersonaPropia(req, res, idPersona)) return;

    try {
        const persona = await Persona.getById(idPersona);
        if (!persona) {
            return res.status(404).json({ error: 'La persona no existe.' });
        }

        const existente = await Persona.getCuentaPorMoneda(idPersona, 'USD');
        if (existente) {
            return res.status(400).json({ error: 'Esta persona ya tiene una caja de ahorro en USD.' });
        }

        const responseBCRA = await centralBankFetch('/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni: persona.dni, moneda: 'USD' })
        });

        // El Central a veces devuelve una página de error HTML (caída, 502) en vez de JSON;
        // si .json() explota ahí, lo tratamos como "Central no disponible" en vez de un 500 críptico.
        let dataBCRA;
        try {
            dataBCRA = await responseBCRA.json();
        } catch {
            return res.status(502).json({ error: 'El Banco Central no está disponible en este momento. Probá de nuevo en unos minutos.' });
        }
        console.log('👉 Respuesta del Central al abrir cuenta USD:', responseBCRA.status, dataBCRA);

        if (responseBCRA.status !== 200 && responseBCRA.status !== 201) {
            return res.status(responseBCRA.status).json({
                error: 'El Banco Central rechazó la apertura de la cuenta en USD.',
                detalle: dataBCRA
            });
        }

        const cuenta = await Persona.crearCuentaMoneda(
            idPersona,
            dataBCRA.cbu,
            dataBCRA.alias || null,
            'USD',
            dataBCRA.saldo || 0
        );

        res.status(201).json(cuenta);
    } catch (error) {
        console.error('❌ Error abriendo cuenta USD:', error.message);
        res.status(500).json({ error: 'Error de servidor', detalle: error.message });
    }
};

// MODIFICADO: Manejo seguro de respuestas 204 (No Content) y normalización del alias
exports.cambiarAlias = async (req, res) => {
    const { cbu } = req.params; 
    const { nuevoAlias } = req.body; 

    if (!cbu || !nuevoAlias) {
        return res.status(400).json({ error: "El CBU y el nuevo alias son obligatorios" });
    }
    if (!exigirCbuPropio(req, res, cbu)) return;

    try {
        const cbuLimpio = String(cbu).trim();
        const aliasLimpio = String(nuevoAlias).trim().toLowerCase(); // Aseguramos formato limpio para el Central

        console.log(`🔄 Cambio de alias para CBU: ${cbuLimpio} -> Nuevo: ${aliasLimpio}`);

        const responseBCRA = await centralBankFetch(`/persons/${cbuLimpio}/alias`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

// ACTUALIZAR DATOS DE CONTACTO (pantalla de Ajustes): email, teléfono, dirección.
// A propósito no toca nombre/apellido/dni/alias/cbu — esos viven también en el Banco Central
// y cambiarlos ahí es una operación distinta (ver cambiarAlias), fuera de alcance acá.
exports.actualizarPerfil = async (req, res) => {
    const { id } = req.params;
    const { email, telefono, direccion } = req.body;

    if (!exigirPersonaPropia(req, res, id)) return;
    if (!email || !String(email).trim()) {
        return res.status(400).json({ error: "El email no puede estar vacío." });
    }
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regexEmail.test(String(email).trim())) {
        return res.status(400).json({ error: "El email no tiene un formato válido." });
    }

    try {
        const persona = await Persona.actualizarDatosContacto(id, {
            email: String(email).trim(),
            telefono: telefono ? String(telefono).trim() : null,
            direccion: direccion ? String(direccion).trim() : null
        });

        if (!persona) {
            return res.status(404).json({ error: "No se encontró la persona." });
        }

        return res.status(200).json({ message: "Datos actualizados correctamente", persona });
    } catch (error) {
        console.error("❌ Error en actualizarPerfil:", error.message);
        return res.status(500).json({ error: "Error de servidor", detalle: error.message });
    }
};