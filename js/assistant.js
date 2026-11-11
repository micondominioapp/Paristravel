// Asistente de viaje con Claude (API de Anthropic) directamente desde el navegador.
// La clave de la API se guarda solo en este dispositivo (nunca se sincroniza ni se comparte).
const SDK_URL = './vendor/anthropic-sdk-1.3.0.js';
const KEY = 'paristravel.anthropicKey';
const CHAT = 'paristravel.chat';
export const MODEL = 'claude-opus-5-5';

let sdk = null;
const loadSDK = async () => (sdk ||= await import(SDK_URL));

export const getApiKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setApiKey = (k) => { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch { /* */ } };

// Instrucciones fijas: no cambian durante la conversación (requisito del modelo para el historial).
export const SYSTEM = `Eres el asistente de viaje de la app «París a mi ritmo». Ayudas a un viajero hispanohablante durante su viaje a París.

Cómo responder:
- En español, breve y práctico: frases cortas y viñetas; nada de introducciones largas.
- Para ir de un sitio a otro: da la opción más económica que sea razonable y una alternativa más cómoda, con línea/medio, dónde tomarlo, qué billete comprar, precio y tiempo aproximado.
- Ten en cuenta la hora (de madrugada no hay RER ni metro), el equipaje, cuántas personas son (para 3-4 personas el taxi de precio fijo puede salir a cuenta) y la seguridad (taxis solo en paradas oficiales; cuidado con carteristas en RER B y metro).
- Cada mensaje del viajero empieza con un bloque «Contexto actual» que genera la app (hora en París, ubicación, alojamiento, llegada, plan del día y opciones de traslado ya calculadas). Úsalo; no lo repitas entero.
- Usa la búsqueda web cuando la respuesta dependa de algo que cambia: huelgas («grève»), obras o cortes de líneas, horarios del día, precios actuales, eventos o cierres. Di de qué fecha es la información.
- No inventes precios ni horarios: si no estás seguro, da un aproximado y di que lo confirme en la app de Île-de-France Mobilités, RATP o la web oficial.
- Si te pide algo fuera del viaje, ayúdale igualmente con brevedad.`;

const TOOLS = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }];

// Conversación: en memoria con los bloques completos (se reenvían sin tocar); en el dispositivo solo el texto.
let live = null; // [{role, content}] tal cual los devuelve la API
export function loadTranscript() {
  try { return JSON.parse(localStorage.getItem(CHAT)) || []; } catch { return []; }
}
function saveTranscript(t) { try { localStorage.setItem(CHAT, JSON.stringify(t.slice(-40))); } catch { /* */ } }
export function clearChat() { live = null; saveTranscript([]); }

function historyFromTranscript(t) {
  // Tras recargar: solo texto (sin bloques de razonamiento ni de búsqueda), que el modelo acepta como historial nuevo.
  return t.map((m) => ({ role: m.role, content: [{ type: 'text', text: m.apiText || m.text }] }));
}

export function friendlyApiError(e, Anthropic) {
  if (!navigator.onLine) return 'Sin conexión a internet.';
  if (Anthropic && e instanceof Anthropic.AuthenticationError) return 'La clave de la API no es válida. Revísala o crea una nueva.';
  if (Anthropic && e instanceof Anthropic.PermissionDeniedError) return 'Esta clave no tiene permiso para usar Claude.';
  if (Anthropic && e instanceof Anthropic.RateLimitError) return 'Demasiadas preguntas seguidas: espera un minuto.';
  if (Anthropic && e instanceof Anthropic.APIError) {
    if (/credit balance/i.test(e.message)) return 'Tu cuenta de la API no tiene saldo: añade crédito en platform.claude.com → Billing.';
    if (e.status >= 500) return 'Claude está saturado en este momento; vuelve a intentarlo en un rato.';
    return `Error de la API (${e.status ?? ''}): ${e.message}`;
  }
  if (e?.name === 'AbortError') return 'Pregunta cancelada.';
  return `No se pudo contactar con Claude (${e?.message || 'error'}).`;
}

/**
 * Envía una pregunta. context: texto «Contexto actual» generado por la app.
 * onText(delta) recibe el texto a medida que llega. Devuelve { text, refused, searched }.
 */
export async function ask(question, context, { onText = () => {}, onStatus = () => {}, signal } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Falta la clave de la API');
  const mod = await loadSDK();
  const Anthropic = mod.default;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const transcript = loadTranscript();
  if (!live) live = historyFromTranscript(transcript);
  const apiText = `Contexto actual (generado por la app):\n${context}\n\nPregunta:\n${question}`;
  const messages = [...live, { role: 'user', content: [{ type: 'text', text: apiText }] }];
  let text = '';
  let searched = false;
  let final;
  try {
    for (let round = 0; round < 4; round++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      }, { signal });
      stream.on('text', (d) => { text += d; onText(d); });
      stream.on('contentBlock', (b) => { if (b.type === 'server_tool_use') { searched = true; onStatus('🔎 Buscando información actual…'); } });
      final = await stream.finalMessage();
      messages.push({ role: 'assistant', content: final.content });
      if (final.stop_reason !== 'pause_turn') break; // pause_turn: la búsqueda siguió en el servidor; se reanuda reenviando
    }
  } catch (e) {
    throw new Error(friendlyApiError(e, Anthropic));
  }
  const refused = final?.stop_reason === 'refusal';
  if (refused) text ||= 'Claude no puede responder a esa pregunta.';
  live = messages; // historial completo, sin modificar, para la siguiente pregunta
  transcript.push({ role: 'user', text: question, apiText }, { role: 'assistant', text, apiText: text });
  saveTranscript(transcript);
  return { text, refused, searched };
}
