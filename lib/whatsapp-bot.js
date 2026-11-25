// Asistente de WhatsApp de Pasión Fútbol.
// - Recibe los mensajes desde WhatsApp Cloud API (Meta) en /whatsapp/webhook.
// - Responde con Claude usando el catálogo real, las tarifas de envío y el estado de los pedidos.
// - Si no sabe algo o el cliente pide una persona, pausa el bot en esa conversación y avisa por correo.
// - Panel en /admin/whatsapp para leer las conversaciones, responder a mano y reactivar el bot.
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";

const MODEL = "claude-opus-5-5";
const HISTORY_LIMIT = 40;               // mensajes recientes que recibe Claude
const HISTORY_MAX_AGE = 14 * 86400000;  // se olvida lo anterior a 14 días
const DEBOUNCE_MS = 4000;               // espera para juntar mensajes seguidos del cliente
const MAX_TOOL_ROUNDS = 6;

let anthropic;
let tablesReady;

// ---------- Base de datos ----------

function ensureTables(env) {
  tablesReady ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, role TEXT NOT NULL,
      author TEXT NOT NULL, content TEXT NOT NULL, wa_id TEXT, created_at INTEGER NOT NULL)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS whatsapp_messages_phone ON whatsapp_messages (phone, id)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id ON whatsapp_messages (wa_id) WHERE wa_id IS NOT NULL"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      phone TEXT PRIMARY KEY NOT NULL, name TEXT, paused_until INTEGER NOT NULL DEFAULT 0,
      pause_reason TEXT, updated_at INTEGER NOT NULL)`)
  ]).catch(error => { tablesReady = undefined; throw error; });
  return tablesReady;
}

async function saveMessage(env, {phone, role, author, content, waId = null}) {
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO whatsapp_messages (phone, role, author, content, wa_id, created_at) VALUES (?,?,?,?,?,?)"
  ).bind(phone, role, author, content, waId, Date.now()).run();
  return result.meta.changes ? result.meta.last_row_id : null;
}

async function touchContact(env, phone, name) {
  await env.DB.prepare(`INSERT INTO whatsapp_contacts (phone, name, updated_at) VALUES (?,?,?)
    ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, whatsapp_contacts.name), updated_at = excluded.updated_at`)
    .bind(phone, name || null, Date.now()).run();
}

async function setPause(env, phone, until, reason) {
  await env.DB.prepare(`INSERT INTO whatsapp_contacts (phone, paused_until, pause_reason, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(phone) DO UPDATE SET paused_until = excluded.paused_until, pause_reason = excluded.pause_reason, updated_at = excluded.updated_at`)
    .bind(phone, until, reason || null, Date.now()).run();
}

function pauseHours(env) {
  const hours = Number(env.WHATSAPP_PAUSA_HORAS);
  return Number.isFinite(hours) && hours > 0 ? hours : 12;
}

// ---------- WhatsApp Cloud API ----------

const graph = env => `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v23.0"}`;

async function graphRequest(env, path, body) {
  const response = await fetch(`${graph(env)}/${path}`, {
    method: "POST",
    headers: {Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json"},
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`WhatsApp API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

function markReadAndTyping(env, messageId) {
  return graphRequest(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: {type: "text"}
  }).catch(error => console.error("typing", error.message));
}

export async function sendText(env, to, text) {
  const result = await graphRequest(env, `${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
    text: {body: text.slice(0, 4000), preview_url: /https?:\/\//.test(text)}
  });
  return result.messages?.[0]?.id || null;
}

async function downloadImage(env, mediaId) {
  const metaResponse = await fetch(`${graph(env)}/${mediaId}`, {headers: {Authorization: `Bearer ${env.WHATSAPP_TOKEN}`}});
  if (!metaResponse.ok) return null;
  const meta = await metaResponse.json();
  const type = String(meta.mime_type || "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) || Number(meta.file_size) > 5 * 1024 * 1024) return null;
  const file = await fetch(meta.url, {headers: {Authorization: `Bearer ${env.WHATSAPP_TOKEN}`}});
  if (!file.ok) return null;
  return {media_type: type, data: Buffer.from(await file.arrayBuffer()).toString("base64")};
}

async function validSignature(env, rawBody, header) {
  if (!env.WHATSAPP_APP_SECRET || !/^sha256=[a-f0-9]{64}$/.test(header || "")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WHATSAPP_APP_SECRET),
    {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const digest = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = Buffer.from(header.slice(7), "hex");
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}

// Convierte un mensaje entrante en texto para el historial (+ imagen para el turno actual).
function describeIncoming(message) {
  switch (message.type) {
    case "text": return message.text?.body || "";
    case "button": return message.button?.text || "";
    case "interactive": return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
    case "image": return `[El cliente envió una foto]${message.image?.caption ? " " + message.image.caption : ""}`;
    case "audio": return "[El cliente envió un audio de voz. No puedes escucharlo.]";
    case "video": return "[El cliente envió un video. No puedes verlo.]";
    case "sticker": return "[El cliente envió un sticker]";
    case "location": return `[El cliente envió una ubicación: ${message.location?.name || ""} ${message.location?.address || ""}]`;
    case "document": return `[El cliente envió un documento: ${message.document?.filename || ""}]`;
    case "reaction": return null;
    default: return `[El cliente envió un mensaje de tipo ${message.type}]`;
  }
}

// ---------- Claude ----------

function storeUrl(env) {
  return (env.WHATSAPP_TIENDA_URL || "https://pasionfutbol.lat").replace(/\/$/, "");
}

const INSTRUCTIONS = `Eres parte del equipo de atención de Pasión Fútbol (pasionfutbol.lat), una tienda online chilena de camisetas de fútbol. Atiendes a los clientes por WhatsApp.

Cómo escribes
- Escribe como una persona real del equipo chateando por WhatsApp: cercano, buena onda, en español de Chile (tutea, puedes usar "dale", "súper", "te cuento"), sin sonar forzado ni exagerar los chilenismos.
- Mensajes cortos: normalmente 1 a 3 frases. Nada de listas largas, títulos ni formato de documento. Para destacar usa *así* (negrita de WhatsApp), con moderación.
- Emojis: como mucho uno de vez en cuando (⚽🔥🙌), nunca en cada mensaje.
- Si necesitas mandar más de un mensaje (por ejemplo, un link aparte), sepáralos con una línea que diga solo ---. Máximo 3 mensajes.
- Responde exactamente lo que te preguntan. No repitas el saludo en cada mensaje ni cierres siempre con "¿algo más?".
- Si el cliente escribe con faltas o en mayúsculas, no lo corrijas: entiende la intención.
- No digas que eres un bot ni una inteligencia artificial por iniciativa propia. Pero si el cliente pregunta en serio si está hablando con una persona o con un bot, no mientas: dile con naturalidad que eres el asistente virtual de la tienda y ofrécele que lo atienda una persona del equipo.

Qué haces
- Ayudas a elegir camisetas, resuelves dudas de tallas, precios, envíos, pagos, cambios y devoluciones, y ayudas a cerrar la compra.
- Para vender, manda el link de la camiseta (aparece en el catálogo). La compra y el pago se hacen en la web: el cliente elige la talla, la agrega al carrito y paga ahí. Tú no tomas pedidos ni recibes pagos por chat, ni das datos bancarios.
- Si preguntan por una camiseta que no está en el catálogo, dilo honestamente y sugiere las más parecidas que sí hay.
- Si mandan una foto de una camiseta, compárala con el catálogo y di si la tenemos.
- Usa la herramienta cotizar_envio cuando pregunten cuánto sale el envío a una comuna (fuera de la Región Metropolitana).
- Usa consultar_pedido cuando pregunten por un pedido y te den el número (empieza con PF). Si no lo tienen, diles que viene en la confirmación del pago y en el correo.
- Usa pasar_a_humano cuando: el cliente pida hablar con una persona; haya un reclamo, un problema con un pago o un envío, o un cambio o devolución concreto que gestionar; pidan el número de seguimiento; pregunten algo que no puedes responder con la información que tienes; o el cliente esté molesto. Después de usarla, dile en una frase que alguien del equipo le va a escribir por aquí, sin prometer una hora exacta.
- Nunca inventes datos: stock, plazos, precios, descuentos o políticas que no estén aquí. Si no sabes, pasa a humano.

Información de la tienda
- Precios en pesos chilenos (CLP), IVA incluido. Las tallas disponibles de cada camiseta están en el catálogo.
- Packs de diciembre (hasta el 31 de diciembre de 2026): 2 camisetas por $24.990, 3 por $36.990 y 4 por $44.990. El carrito aplica solo la combinación más barata; el envío se cobra aparte. Cada camiseta suelta cuesta $22.990.
- Envío gratis a toda la Región Metropolitana. Al resto de Chile el costo depende del peso y la comuna, y se ve antes de pagar (usa cotizar_envio).
- Empresas: Blue Express, Starken o Correos de Chile (el cliente elige). Plazos: Santiago 1 a 3 días hábiles; regiones 1 a 8 días hábiles según destino y empresa.
- Pagos: Flow (Webpay crédito y débito, también en 3, 6 y 12 cuotas, Khipu, ETPay, Banca.me, Onepay y Mach) o Mercado Pago (dinero en cuenta y tarjetas). Los datos de pago se ingresan en Flow o Mercado Pago, nunca en la tienda.
- Cada pedido pagado trae de regalo la revista oficial de fútbol de la tienda, que aparece en la pantalla de confirmación.
- Cambios y devoluciones: garantía legal de 6 meses si la prenda nueva tiene una falla (cambio, reparación gratis o devolución del dinero); derecho a retracto dentro de 10 días desde que llega, si no fue usada. Para gestionarlo, pasa a humano.
- Contacto alternativo: ramcochile@gmail.com.`;

function catalogText(env, products) {
  const base = storeUrl(env);
  const lines = products.map(item =>
    `- ${item.name} | $${item.price.toLocaleString("es-CL")} | tallas ${item.sizes.join(", ")} | ${item.categories.join(", ")} | ${item.description} | ${base}/?producto=${item.id}`);
  return `Catálogo actual (solo esto está a la venta; nombre | precio | tallas | categorías | descripción | link):\n${lines.join("\n")}`;
}

const tools = [
  {
    name: "cotizar_envio",
    description: "Calcula el costo y plazo de envío a una comuna de Chile para cierta cantidad de camisetas, con cada empresa de envío. Úsala cuando pregunten cuánto sale el envío fuera de la Región Metropolitana.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        comuna: {type: "string", description: "Nombre de la comuna, por ejemplo Viña del Mar o Temuco"},
        camisetas: {type: "integer", description: "Cantidad de camisetas del pedido (1 si no lo dijeron)"}
      },
      required: ["comuna", "camisetas"],
      additionalProperties: false
    }
  },
  {
    name: "consultar_pedido",
    description: "Busca un pedido por su número (PF seguido de 24 caracteres) y devuelve su estado de pago, productos, destino y empresa de envío.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {codigo: {type: "string", description: "Número de pedido, por ejemplo PF1a2b3c..."}},
      required: ["codigo"],
      additionalProperties: false
    }
  },
  {
    name: "pasar_a_humano",
    description: "Avisa a una persona del equipo para que siga la conversación y deja de responder automáticamente en este chat. Úsala para reclamos, problemas con pagos o envíos, cambios y devoluciones, seguimiento de envíos, si el cliente pide una persona, o si no sabes la respuesta.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        motivo: {type: "string", description: "Motivo en pocas palabras"},
        resumen: {type: "string", description: "Resumen de lo que necesita el cliente, para que la persona lo atienda sin preguntar todo de nuevo"}
      },
      required: ["motivo", "resumen"],
      additionalProperties: false
    }
  }
];

async function notifyOwners(env, phone, name, motivo, resumen) {
  if (!env.RESEND_API_KEY || !env.PEDIDOS_CORREO_DE || !env.PEDIDOS_CORREO_PARA) return false;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);
  const panel = `${storeUrl(env)}/admin/whatsapp?chat=${encodeURIComponent(phone)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json"},
    body: JSON.stringify({
      from: env.PEDIDOS_CORREO_DE,
      to: env.PEDIDOS_CORREO_PARA.split(",").map(value => value.trim()).filter(Boolean),
      subject: `WhatsApp: ${name || "+" + phone} necesita atención (${motivo})`.slice(0, 150),
      html: `<p><strong>Cliente:</strong> ${escape(name)} +${escape(phone)}</p><p><strong>Motivo:</strong> ${escape(motivo)}</p>
        <p><strong>Resumen:</strong> ${escape(resumen)}</p>
        <p>El asistente dejó de responder en este chat por ${pauseHours(env)} horas.</p>
        <p><a href="${escape(panel)}">Abrir la conversación y responder</a> · <a href="https://wa.me/${escape(phone)}">Abrir en WhatsApp</a></p>`
    })
  });
  if (!response.ok) console.error("resend", response.status, await response.text());
  return response.ok;
}

async function runTool(env, store, phone, name, block) {
  const input = block.input || {};
  try {
    if (block.name === "cotizar_envio") return JSON.stringify(store.botShippingQuote(input.comuna, input.camisetas));
    if (block.name === "consultar_pedido") return JSON.stringify(await store.botOrder(env, input.codigo));
    if (block.name === "pasar_a_humano") {
      await setPause(env, phone, Date.now() + pauseHours(env) * 3600000, input.motivo);
      const emailed = await notifyOwners(env, phone, name, input.motivo, input.resumen);
      return JSON.stringify({ok: true, avisado_por_correo: emailed, nota: "Un humano tomará la conversación. No vuelvas a escribir después de este mensaje."});
    }
    return JSON.stringify({error: "Herramienta desconocida"});
  } catch (error) {
    console.error("tool", block.name, error);
    return JSON.stringify({error: "No se pudo consultar en este momento."});
  }
}

// Historial alternado user/assistant listo para la API (junta mensajes seguidos del mismo lado).
function buildHistory(rows) {
  const messages = [];
  for (const row of rows) {
    const role = row.role === "user" ? "user" : "assistant";
    const text = row.author === "human" ? `[Respondió una persona del equipo]: ${row.content}` : row.content;
    const last = messages.at(-1);
    if (last?.role === role) last.content += "\n" + text;
    else messages.push({role, content: text});
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  return messages;
}

async function generateReply(env, store, phone, name, history, images) {
  anthropic ??= new Anthropic({apiKey: env.ANTHROPIC_API_KEY || undefined});
  const products = await store.botCatalog(env);
  const messages = history.map(message => ({...message}));
  // Las fotos del turno actual se agregan al último mensaje del cliente.
  if (images.length) {
    const last = messages.at(-1);
    last.content = [...images.map(source => ({type: "image", source: {type: "base64", ...source}})), {type: "text", text: last.content}];
  }
  const now = new Date().toLocaleString("es-CL", {timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short"});
  messages.push({role: "system", content: `Fecha y hora en Chile: ${now}. Nombre del cliente en WhatsApp: ${name || "desconocido"}.`});

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {effort: "low"},
      cache_control: {type: "ephemeral"},
      system: [
        {type: "text", text: INSTRUCTIONS},
        {type: "text", text: catalogText(env, products), cache_control: {type: "ephemeral"}}
      ],
      tools,
      messages
    });
    if (response.stop_reason === "refusal") return {text: null, handoff: "refusal"};
    const toolUses = response.content.filter(block => block.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const text = response.content.filter(block => block.type === "text").map(block => block.text).join("\n").trim();
      return {text};
    }
    messages.push({role: "assistant", content: response.content});
    const results = [];
    for (const block of toolUses) {
      results.push({type: "tool_result", tool_use_id: block.id, content: await runTool(env, store, phone, name, block)});
    }
    messages.push({role: "user", content: results});
  }
  return {text: null, handoff: "demasiadas consultas"};
}

// ---------- Procesamiento de un chat ----------

async function isPaused(env, phone) {
  const contact = await env.DB.prepare("SELECT paused_until FROM whatsapp_contacts WHERE phone = ?").bind(phone).first();
  return Number(contact?.paused_until || 0) > Date.now();
}

async function answerChat(env, store, phone, name, rowId, incoming) {
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS));
  // Si el cliente siguió escribiendo, responde la invocación del último mensaje (con todo junto).
  const latest = await env.DB.prepare("SELECT MAX(id) AS id FROM whatsapp_messages WHERE phone = ? AND role = 'user'").bind(phone).first("id");
  if (Number(latest) !== Number(rowId)) return;
  if (env.WHATSAPP_BOT_ACTIVO === "0" || await isPaused(env, phone)) return;

  const {results: rows} = await env.DB.prepare(
    "SELECT role, author, content FROM whatsapp_messages WHERE phone = ? AND created_at > ? ORDER BY id DESC LIMIT ?"
  ).bind(phone, Date.now() - HISTORY_MAX_AGE, HISTORY_LIMIT).all();
  const history = buildHistory(rows.reverse());
  if (!history.length || history.at(-1).role !== "user") return;

  // Solo las fotos de los mensajes que aún no tienen respuesta.
  const images = [];
  for (const message of incoming) {
    if (message.type === "image" && message.image?.id && images.length < 3) {
      const image = await downloadImage(env, message.image.id).catch(() => null);
      if (image) images.push(image);
    }
  }

  let reply;
  try {
    reply = await generateReply(env, store, phone, name, history, images);
  } catch (error) {
    console.error("claude", error);
    reply = {text: null, handoff: "error del asistente"};
  }
  if (!reply.text) {
    if (reply.handoff) {
      await setPause(env, phone, Date.now() + pauseHours(env) * 3600000, reply.handoff);
      await notifyOwners(env, phone, name, reply.handoff, "El asistente no pudo responder este chat. Revisa la conversación.");
      const text = "Déjame revisarlo con el equipo y te escribo por aquí 🙌";
      const waId = await sendText(env, phone, text);
      await saveMessage(env, {phone, role: "assistant", author: "bot", content: text, waId});
    }
    return;
  }
  // Si mientras pensaba llegó otro mensaje, no responde: lo hará la invocación nueva con todo el contexto.
  const newer = await env.DB.prepare("SELECT MAX(id) AS id FROM whatsapp_messages WHERE phone = ? AND role = 'user'").bind(phone).first("id");
  if (Number(newer) !== Number(rowId)) return;

  const parts = reply.text.split(/\n\s*---\s*\n/).map(part => part.trim()).filter(Boolean).slice(0, 3);
  for (const [index, part] of parts.entries()) {
    if (index) await new Promise(resolve => setTimeout(resolve, 1200));
    const waId = await sendText(env, phone, part);
    await saveMessage(env, {phone, role: "assistant", author: "bot", content: part, waId});
  }
}

async function handleWebhookPayload(env, store, payload) {
  await ensureTables(env);
  const jobs = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      // Mensajes que envía el dueño desde la app de WhatsApp Business (coexistencia): pausan el bot en ese chat.
      if (change.field === "smb_message_echoes") {
        for (const echo of value.message_echoes || []) {
          const text = describeIncoming(echo);
          if (!echo.to || text == null) continue;
          await saveMessage(env, {phone: echo.to, role: "assistant", author: "human", content: text, waId: echo.id});
          await setPause(env, echo.to, Date.now() + pauseHours(env) * 3600000, "respondió una persona");
        }
        continue;
      }
      if (change.field !== "messages" || !value.messages) continue;
      const names = Object.fromEntries((value.contacts || []).map(contact => [contact.wa_id, contact.profile?.name]));
      const byPhone = new Map();
      for (const message of value.messages) {
        const text = describeIncoming(message);
        if (text == null || !message.from) continue;
        const rowId = await saveMessage(env, {phone: message.from, role: "user", author: "customer", content: text, waId: message.id});
        if (!rowId) continue; // mensaje repetido (Meta reintenta los avisos)
        await touchContact(env, message.from, names[message.from]);
        const chat = byPhone.get(message.from) || {rowId, messages: []};
        chat.rowId = rowId;
        chat.messages.push(message);
        byPhone.set(message.from, chat);
        if (env.WHATSAPP_BOT_ACTIVO !== "0") markReadAndTyping(env, message.id);
      }
      for (const [phone, chat] of byPhone) {
        jobs.push(answerChat(env, store, phone, names[phone], chat.rowId, chat.messages)
          .catch(error => console.error("whatsapp chat", error)));
      }
    }
  }
  await Promise.all(jobs);
}

// ---------- Rutas HTTP ----------

export async function handleWhatsAppWebhook(request, env, store, waitUntil) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN &&
      url.searchParams.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN;
    return new Response(ok ? url.searchParams.get("hub.challenge") || "" : "Token inválido", {status: ok ? 200 : 403});
  }
  if (request.method !== "POST") return new Response("Método no permitido", {status: 405});
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_APP_SECRET) {
    return new Response("WhatsApp no está configurado", {status: 503});
  }
  const raw = await request.text();
  if (raw.length > 1_000_000 || !await validSignature(env, raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", {status: 401});
  }
  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response("JSON inválido", {status: 400}); }
  // Meta exige responder rápido: el trabajo sigue en segundo plano.
  waitUntil(handleWebhookPayload(env, store, payload).catch(error => console.error("whatsapp", error)));
  return new Response("OK", {status: 200});
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);

function adminPage(title, body) {
  return new Response(`<!doctype html><html lang="es-CL"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Pasión Fútbol</title>
<style>body{background:#100b1f;color:#f5f2fa;font:16px/1.5 system-ui;margin:auto;padding:16px;max-width:900px}a{color:#9af7ff}
.chat{border:1px solid #4c4165;border-radius:12px;padding:10px 14px;margin:10px 0;display:block;text-decoration:none;color:inherit}
.msg{padding:8px 12px;border-radius:12px;margin:6px 0;max-width:80%;white-space:pre-wrap;overflow-wrap:anywhere}
.user{background:#2a2140}.assistant{background:#1d4b45;margin-left:auto}.human{background:#5a3d12;margin-left:auto}
small{opacity:.7}textarea{width:100%;box-sizing:border-box;min-height:80px;font:inherit;border-radius:8px;padding:8px}
button{font:inherit;padding:8px 14px;border-radius:8px;border:0;cursor:pointer;margin:6px 6px 0 0}.tag{background:#5a3d12;border-radius:6px;padding:0 6px}</style>
<main>${body}</main></html>`, {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
}

export async function handleWhatsAppAdmin(request, env, store) {
  if (!await store.botIsAdmin(request, env)) return new Response(null, {status: 303, headers: {Location: "/admin", "Cache-Control": "no-store"}});
  await ensureTables(env);
  const url = new URL(request.url);
  const phone = (url.searchParams.get("chat") || "").replace(/\D/g, "");

  if (request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin || !phone) return new Response("Origen inválido", {status: 403});
    const form = await request.formData();
    const action = form.get("action");
    if (action === "reply") {
      const text = String(form.get("text") || "").trim().slice(0, 4000);
      if (text) {
        const waId = await sendText(env, phone, text);
        await saveMessage(env, {phone, role: "assistant", author: "human", content: text, waId});
        await setPause(env, phone, Date.now() + pauseHours(env) * 3600000, "respondió una persona");
      }
    } else if (action === "resume") {
      await setPause(env, phone, 0, null);
    } else if (action === "pause") {
      await setPause(env, phone, Date.now() + 30 * 86400000, "pausado a mano");
    }
    return new Response(null, {status: 303, headers: {Location: `/admin/whatsapp?chat=${phone}`, "Cache-Control": "no-store"}});
  }

  if (phone) {
    const contact = await env.DB.prepare("SELECT * FROM whatsapp_contacts WHERE phone = ?").bind(phone).first();
    const {results} = await env.DB.prepare("SELECT * FROM whatsapp_messages WHERE phone = ? ORDER BY id DESC LIMIT 200").bind(phone).all();
    const paused = Number(contact?.paused_until || 0) > Date.now();
    const bubbles = results.reverse().map(row => `<div class="msg ${row.author === "human" ? "human" : row.role}">${escapeHtml(row.content)}<br><small>${row.author === "customer" ? "Cliente" : row.author === "human" ? "Equipo" : "Asistente"} · ${new Date(row.created_at).toLocaleString("es-CL", {timeZone: "America/Santiago"})}</small></div>`).join("");
    return adminPage("WhatsApp", `<p><a href="/admin/whatsapp">← Conversaciones</a></p>
      <h1>${escapeHtml(contact?.name || "Cliente")} <small>+${escapeHtml(phone)}</small></h1>
      <p>${paused ? `<span class="tag">Asistente en pausa</span> hasta ${new Date(contact.paused_until).toLocaleString("es-CL", {timeZone: "America/Santiago"})}${contact.pause_reason ? " · " + escapeHtml(contact.pause_reason) : ""}` : "Asistente activo en este chat"}</p>
      ${bubbles || "<p>Sin mensajes.</p>"}
      <form method="post"><input type="hidden" name="action" value="reply"><textarea name="text" placeholder="Escribe tu respuesta (pausa el asistente en este chat)"></textarea><button>Enviar</button></form>
      <form method="post" style="display:inline"><input type="hidden" name="action" value="${paused ? "resume" : "pause"}"><button>${paused ? "Reactivar asistente" : "Pausar asistente"}</button></form>
      <p><small>WhatsApp solo deja enviar mensajes libres hasta 24 horas después del último mensaje del cliente.</small></p>`);
  }

  const {results} = await env.DB.prepare(`SELECT c.phone, c.name, c.paused_until, c.pause_reason,
      (SELECT content FROM whatsapp_messages m WHERE m.phone = c.phone ORDER BY id DESC LIMIT 1) AS last,
      (SELECT created_at FROM whatsapp_messages m WHERE m.phone = c.phone ORDER BY id DESC LIMIT 1) AS last_at
    FROM whatsapp_contacts c ORDER BY last_at DESC LIMIT 100`).all();
  const chats = results.map(row => `<a class="chat" href="/admin/whatsapp?chat=${escapeHtml(row.phone)}"><strong>${escapeHtml(row.name || "+" + row.phone)}</strong>
      ${Number(row.paused_until) > Date.now() ? ` <span class="tag">necesita persona${row.pause_reason ? ": " + escapeHtml(row.pause_reason) : ""}</span>` : ""}
      <br><small>${escapeHtml(String(row.last || "").slice(0, 120))}</small></a>`).join("");
  return adminPage("WhatsApp", `<p><a href="/admin">← Productos</a></p><h1>Conversaciones de WhatsApp</h1>
    <p>${env.WHATSAPP_BOT_ACTIVO === "0" ? "El asistente está <strong>apagado</strong> (WHATSAPP_BOT_ACTIVO=0)." : "El asistente responde solo. Cuando un chat necesita una persona, se marca aquí y llega un correo."}</p>
    ${chats || "<p>Todavía no hay conversaciones.</p>"}`);
}
