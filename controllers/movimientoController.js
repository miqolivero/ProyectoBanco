const Movimiento = require('../models/movimientoModel');

// 1. REALIZAR TRANSFERENCIA (Soporta CBU o Alias automáticamente)
exports.realizarTransferencia = async (req, res) => {
    const { cbu_origen, cbu_destino, monto } = req.body;

    if (!cbu_origen || !cbu_destino || !monto) {
        return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    try {
        // Validar saldo disponible localmente
        const saldoDisponible = await Movimiento.obtenerSaldo(cbu_origen);
        
        if (saldoDisponible === null) {
            return res.status(404).json({ error: "Cuenta de origen no encontrada localmente" });
        }
        
        if (Number(saldoDisponible) < Number(monto)) {
            return res.status(400).json({ error: "Saldo insuficiente", disponible: saldoDisponible });
        }

        // Variable para almacenar el CBU real de destino final
        let cbuDestinoFinal = cbu_destino.trim();

        // 🔍 DETECTOR INTELIGENTE: Si NO son exactamente 22 dígitos numéricos, es un ALIAS
        const esAlias = !/^\d{22}$/.test(cbuDestinoFinal);

        if (esAlias) {
            console.log(`🔍 El destino ingresado es un Alias: [${cbuDestinoFinal}]. Traduciendo a CBU...`);
            
            // 📡 Consultamos a la API del Profesor para buscar la persona por alias
            const respuestaAlias = await fetch(`https://centralbank.brocoly.cc/api/persons/alias/${cbuDestinoFinal}`, {
                method: 'GET',
                headers: {
                    'x-environment': 'test',
                    'x-api-key': '71d9a899-d4a3-4754-908a-77752e3fa1c3'
                }
            });

            const datosPersona = await respuestaAlias.json();

            if (!respuestaAlias.ok) {
                console.error("⚠️ Error al buscar alias en el Central:", datosPersona);
                return res.status(404).json({ 
                    error: "El Alias ingresado no pertenece a ningún usuario registrado en la red central." 
                });
            }

            // Si la consulta fue exitosa, extraemos su CBU real
            if (datosPersona && datosPersona.cbu) {
                cbuDestinoFinal = datosPersona.cbu.trim();
                console.log(`🎯 Alias traducido con éxito. Destinatario CBU: ${cbuDestinoFinal}`);
            } else {
                return res.status(400).json({ error: "El Central respondió pero no devolvió un CBU válido para ese alias." });
            }
        }

        // 2. 🚀 ENVIAR TRANSFERENCIA AL CENTRAL BANK
        console.log(`📡 Enviando transaccion al central: Origen ${cbu_origen} -> Destino ${cbuDestinoFinal}`);
        const responseBCRA = await fetch('https://centralbank.brocoly.cc/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-environment': 'test',
                'x-api-key': '71d9a899-d4a3-4754-908a-77752e3fa1c3'
            },
            body: JSON.stringify({
                cbuOrigen: cbu_origen.trim(),
                cbuDestino: cbuDestinoFinal, 
                importe: Number(monto),
                saldoOrigen: Number(saldoDisponible)
            })
        });

        const dataBCRA = await responseBCRA.json();

        if (responseBCRA.status === 201 || responseBCRA.status === 200) {
            const idFinal = dataBCRA._id || dataBCRA.id;
            
            // 3. Guarda localmente el registro del movimiento usando los CBUs definitivos
            await Movimiento.registrarTransferenciaLocal(cbu_origen.trim(), cbuDestinoFinal, monto, idFinal);
            
            res.status(201).json({ message: "¡Transferencia exitosa!", id: idFinal });
        } else {
            console.error("⚠️ El Central rechazó la transacción final:", dataBCRA);
            res.status(responseBCRA.status).json({ error: "Rechazo del Central", detalle: dataBCRA });
        }
    } catch (error) {
        console.error("❌ Error en realizarTransferencia:", error.message);
        res.status(500).json({ error: "Error interno en el servidor", detalle: error.message });
    }
};

// 2. OBTENER HISTORIAL LOCAL (Versión Ultra Protegida)
exports.obtenerTransacciones = async (req, res) => {
    try {
        const queryCbu = req.query ? req.query.cbu : null;
        const paramsCbu = req.params ? req.params.cbu : null;
        const bodyCbu = req.body ? req.body.cbu : null;

        const cbu = queryCbu || paramsCbu || bodyCbu;

        if (!cbu || cbu === "undefined" || cbu === "null" || String(cbu).trim() === "") {
            console.log("⏳ Historial: Petición recibida antes de que el frontend cargue el CBU. Esperando...");
            return res.status(200).json([]);
        }

        const cbuLimpio = String(cbu).trim();
        console.log(`⏳ Buscando historial limpio (Anti-duplicados) para CBU: ${cbuLimpio}`);
        
        const movimientosLocales = await Movimiento.obtenerTodos(cbuLimpio);
        return res.status(200).json(movimientosLocales);
    } catch (error) {
        console.error("❌ Error real al traer transacciones locales:", error.message);
        return res.status(500).json({ error: "Error de servidor al leer el historial", detalle: error.message });
    }
};

// 3. POLLEAR Y SINCRONIZAR TRANSFERENCIAS RECIBIDAS
exports.sincronizarTransferenciasRecibidas = async (req, res) => {
    try {
        const minutos = req.query.minutos || 30;
        const url = `https://centralbank.brocoly.cc/api/transactions?minutos=${minutos}`;
        
        console.log(`📡 Conectando a: ${url}`);
        
        const responseBCRA = await fetch(url, {
            method: 'GET',
            headers: {
                'x-environment': 'test',
                'x-api-key': '71d9a899-d4a3-4754-908a-77752e3fa1c3'
            }
        });

        const dataBCRA = await responseBCRA.json();

        if (responseBCRA.status === 200) {
            let procesadas = 0;

            if (!Array.isArray(dataBCRA)) {
                return res.status(200).json({ mensaje: "Sincronización abortada: no vino formato array." });
            }

            console.log(`🔍 Se encontraron ${dataBCRA.length} movimientos totales en el Central.`);

            for (const t of dataBCRA) {
                const idTransaccion = t._id || t.id;
                
                if (t.estado !== "aprobada") {
                    console.log(`❌ Transacción omitida (Estado: ${t.estado}): ID ${idTransaccion}`);
                    continue; 
                }

                if (t.cbuDestino && t.cbuDestino.startsWith('004')) {
                    const existe = await Movimiento.verificarExistenciaCentral(t); 
                    
                    if (!existe) {
                        await Movimiento.registrarIngresoExterno(t);
                        console.log(`   ✅ Ingreso guardado e impactado en saldo local: ID ${idTransaccion}`);
                        procesadas++;
                    } else {
                        console.log(`   ⏭️ Omitida (Ya existía localmente): ID ${idTransaccion}`);
                    }
                } else {
                    console.log(`   ⏭️ Omitida (Es una salida o movimiento ajeno): ID ${idTransaccion}`);
                }
            }
            res.status(200).json({ mensaje: `Sincronización completada. ${procesadas} nuevas acreditaciones.` });
        } else {
            res.status(responseBCRA.status).json({ error: "Error al sincronizar", detalle: dataBCRA });
        }
    } catch (error) {
        console.error("❌ ERROR EN SINCRONIZAR:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// 4. REALIZAR DEPÓSITO LOCAL
exports.realizarDeposito = async (req, res) => {
    const { cbu, monto } = req.body;

    if (!cbu || !monto || Number(monto) <= 0) {
        return res.status(400).json({ error: "El CBU y un monto válido son obligatorios." });
    }

    try {
        await Movimiento.registrarDepositoLocal(cbu, monto);
        res.status(201).json({ message: "¡Depósito acreditado con éxito!" });
    } catch (error) {
        console.error("❌ Error en realizarDeposito:", error.message);
        res.status(500).json({ error: "Error interno al procesar el depósito", detalle: error.message });
    }
};