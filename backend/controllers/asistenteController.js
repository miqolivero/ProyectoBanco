const { GoogleGenAI } = require('@google/genai');
const { SYSTEM_PROMPT, HERRAMIENTAS, ejecutarHerramienta } = require('../config/asistenteIA');

// Mismo patrón que middlewares/auth.js con Clerk: si falta la key no instanciamos el cliente
// (evita comportamiento ambiguo de la librería con una config incompleta) — el endpoint
// simplemente responde 503 hasta que se complete GEMINI_API_KEY en .env.
const GEMINI_LISTO = Boolean(process.env.GEMINI_API_KEY);
if (!GEMINI_LISTO) {
    console.warn(
        '⚠️  Falta GEMINI_API_KEY — el asistente con IA va a responder 503 hasta que se complete ' +
        'en .env (conseguí una gratis en https://aistudio.google.com/apikey).'
    );
}
const ai = GEMINI_LISTO ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// 🎯 "gemini-flash-latest" resuelve hoy a gemini-3.8-flash, cuyo tier gratis es de solo 20
// requests/día — y cada pregunta consume 1 llamada inicial + 1 por cada ronda de herramientas,
// así que se agotaba en 2-3 preguntas. "gemini-flash-lite-latest" apunta a la variante "Lite",
// pensada para este tipo de uso de alto volumen/bajo costo — cuota gratis mucho más generosa, y
// sigue siendo un alias (no un modelo con fecha) para que no haya que tocar esto cuando Google
// libere la siguiente versión.
const MODELO = 'gemini-flash-lite-latest';
// Tope de ida y vuelta con herramientas por consulta — una pregunta normal resuelve en 1-2
// llamadas; esto es solo un techo de seguridad para no quedar en un loop caro ante una
// respuesta rara del modelo.
const MAX_VUELTAS_HERRAMIENTAS = 5;

exports.chat = async (req, res) => {
    if (!GEMINI_LISTO) {
        return res.status(503).json({ error: 'El asistente no está configurado todavía.' });
    }

    const { mensaje, interactionId } = req.body;
    if (!mensaje || !String(mensaje).trim()) {
        return res.status(400).json({ error: 'Falta el mensaje.' });
    }

    // 🎯 persona SIEMPRE sale de la sesión verificada por requireAuth, nunca del body — ver el
    // comentario de seguridad en config/asistenteIA.js. Es lo único que hace que sea seguro
    // dejar que un LLM arme las llamadas a estas herramientas.
    const persona = req.personaAutenticada;

    try {
        let interaction = await ai.interactions.create({
            model: MODELO,
            system_instruction: SYSTEM_PROMPT,
            input: String(mensaje).trim(),
            tools: HERRAMIENTAS,
            ...(interactionId ? { previous_interaction_id: interactionId } : {})
        });

        let vueltas = 0;
        // 🎯 El campo real de la respuesta es `steps` (no `outputs`, como sugería la doc
        // consultada) — confirmado probando contra la API real, no solo contra la
        // documentación. Cada "paso" puede ser de razonamiento (`thought`) o una llamada a
        // herramienta (`function_call`); solo nos interesan estos últimos.
        let llamadas = (interaction.steps || []).filter(s => s.type === 'function_call');

        while (llamadas.length > 0 && vueltas < MAX_VUELTAS_HERRAMIENTAS) {
            const resultados = [];
            for (const llamada of llamadas) {
                let resultado;
                try {
                    resultado = await ejecutarHerramienta(llamada.name, llamada.arguments, persona);
                } catch (error) {
                    resultado = { error: error.message };
                }
                resultados.push({
                    type: 'function_result',
                    name: llamada.name,
                    call_id: llamada.id,
                    result: JSON.stringify(resultado)
                });
            }

            interaction = await ai.interactions.create({
                model: MODELO,
                previous_interaction_id: interaction.id,
                input: resultados,
                tools: HERRAMIENTAS
            });

            vueltas++;
            llamadas = (interaction.steps || []).filter(s => s.type === 'function_call');
        }

        res.json({
            respuesta: interaction.output_text || 'No pude generar una respuesta, probá reformular la pregunta.',
            interactionId: interaction.id
        });
    } catch (error) {
        console.error('❌ Error en el asistente IA:', error.message);
        res.status(500).json({ error: 'No se pudo procesar la consulta. Probá de nuevo en un momento.' });
    }
};
