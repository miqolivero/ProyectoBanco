import { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Loader2, Sparkles } from 'lucide-react';
import './Asistente.css';
import { API_URL } from '../../config/api';

// Preguntas de ejemplo para que la persona sepa qué puede preguntar sin tener que adivinar.
const SUGERENCIAS = [
  '¿Cuál es mi saldo?',
  '¿Cuánto tengo disponible en mi tarjeta?',
  '¿Cuánto transferí este mes?',
  '¿Tengo cuotas de préstamo pendientes?'
];

// Defensa en profundidad: el system prompt ya le pide a la IA que no use markdown, pero no hay
// garantía de que lo respete siempre — esto limpia los símbolos más comunes (negrita, títulos,
// viñetas con *) antes de mostrar el texto, en vez de interpretarlos como HTML (evita cualquier
// riesgo de inyección si algún día una respuesta llegara a citar texto de un tercero, como el
// nombre de un destinatario de una transferencia).
const limpiarMarkdown = (texto) => texto
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/^[*-]\s+/gm, '• ')
  .replace(/^---+$/gm, '');

export default function Asistente() {
  const [mensajes, setMensajes] = useState([
    { rol: 'asistente', texto: 'Hola, soy Calamuchita IA. Puedo responderte preguntas sobre tu propia cuenta: saldo, movimientos, tarjeta, préstamos, plazos fijos, reservas y seguros. ¿En qué te ayudo?' }
  ]);
  const [entrada, setEntrada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const interactionIdRef = useRef(null);
  const finMensajesRef = useRef(null);

  useEffect(() => {
    finMensajesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, enviando]);

  const enviarMensaje = async (texto) => {
    const contenido = texto.trim();
    if (!contenido || enviando) return;

    setMensajes(prev => [...prev, { rol: 'usuario', texto: contenido }]);
    setEntrada('');
    setError('');
    setEnviando(true);

    try {
      const response = await fetch(`${API_URL}/api/asistente/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: contenido,
          interactionId: interactionIdRef.current
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo procesar la consulta.');
      }

      interactionIdRef.current = data.interactionId || interactionIdRef.current;
      setMensajes(prev => [...prev, { rol: 'asistente', texto: data.respuesta }]);
    } catch (err) {
      setError(err.message || 'No se pudo conectar con el asistente.');
    } finally {
      setEnviando(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    enviarMensaje(entrada);
  };

  return (
    <div className="asistente-container">
      <div className="asistente-header-box">
        <span className="asistente-eyebrow">Tan atento como las sierras, tan preciso como el agua que sabe su cauce</span>
        <h2>Calamuchita IA</h2>
        <p>Consultá tu cuenta en lenguaje simple — solo responde con tus propios datos, nunca inventa ni opera.</p>
      </div>

      <div className="asistente-chat-card">
        <div className="asistente-mensajes">
          {mensajes.map((m, i) => (
            <div key={i} className={`asistente-mensaje-fila ${m.rol}`}>
              <div className="asistente-avatar">
                {m.rol === 'asistente' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className="asistente-burbuja">{m.rol === 'asistente' ? limpiarMarkdown(m.texto) : m.texto}</div>
            </div>
          ))}

          {enviando && (
            <div className="asistente-mensaje-fila asistente">
              <div className="asistente-avatar"><Bot size={16} /></div>
              <div className="asistente-burbuja asistente-burbuja-cargando">
                <Loader2 size={14} className="asistente-spin" /> Pensando...
              </div>
            </div>
          )}
          <div ref={finMensajesRef} />
        </div>

        {mensajes.length <= 1 && (
          <div className="asistente-sugerencias">
            {SUGERENCIAS.map(s => (
              <button key={s} type="button" className="asistente-chip" onClick={() => enviarMensaje(s)} disabled={enviando}>
                <Sparkles size={12} /> {s}
              </button>
            ))}
          </div>
        )}

        {error && <div className="asistente-error">{error}</div>}

        <form className="asistente-input-row" onSubmit={handleSubmit}>
          <input
            type="text"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="Preguntame sobre tu cuenta, tarjeta, movimientos..."
            disabled={enviando}
            className="asistente-input"
          />
          <button type="submit" className="asistente-btn-enviar" disabled={enviando || !entrada.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
