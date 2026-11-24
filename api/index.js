import { createClient } from "@libsql/client/web";
import * as blob from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import worker, { botCatalog, botIsAdmin, botOrder, botShippingQuote } from "../dist/server/index.js";
import { createD1 } from "../lib/d1-libsql.js";
import { createR2 } from "../lib/r2-blob.js";
import { createHandler } from "../lib/vercel-handler.js";
import { handleWhatsAppAdmin, handleWhatsAppWebhook } from "../lib/whatsapp-bot.js";

const passthrough = [
  "CATALOG_SETUP_CODE", "ADMIN_COOKIE_EMBEDDED",
  "CATALOG_ADMIN_USER", "CATALOG_ADMIN_HASH", "CATALOG_ADMIN_SALT", "CATALOG_ADMIN_USERS",
  "FLOW_API_KEY", "FLOW_SECRET_KEY", "FLOW_SANDBOX", "GEOAPIFY_API_KEY",
  "MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET",
  "RESEND_API_KEY", "PEDIDOS_CORREO_DE", "PEDIDOS_CORREO_PARA", "PRUEBA_PRECIO", "META_PIXEL_ID",
  "ANTHROPIC_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET",
  "WHATSAPP_GRAPH_VERSION", "WHATSAPP_BOT_ACTIVO", "WHATSAPP_PAUSA_HORAS", "WHATSAPP_TIENDA_URL"
];

let cached;
function getEnv() {
  if (cached) return cached;
  const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"].filter(name => !process.env[name]);
  if (missing.length) throw new Error("Falta configurar en Vercel (Settings > Environment Variables): " + missing.join(", "));
  cached = {
    DB: createD1(createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })),
    BUCKET: createR2(blob),
    ...Object.fromEntries(passthrough.map(name => [name, process.env[name] || ""]))
  };
  return cached;
}

const store = { botCatalog, botIsAdmin, botOrder, botShippingQuote };

// El asistente de WhatsApp vive fuera del worker (usa el SDK de Anthropic); el resto va al worker.
const app = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/whatsapp/webhook") return await handleWhatsAppWebhook(request, env, store, waitUntil);
      if (pathname === "/admin/whatsapp") return await handleWhatsAppAdmin(request, env, store);
    } catch (error) {
      console.error(error);
      return new Response("Error", { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    return worker.fetch(request, env);
  }
};

export default createHandler({ worker: app, getEnv });