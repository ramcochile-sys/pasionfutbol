import { createClient } from "@libsql/client/web";
import * as blob from "@vercel/blob";
import worker from "../dist/server/index.js";
import { createD1 } from "../lib/d1-libsql.js";
import { createR2 } from "../lib/r2-blob.js";
import { createHandler } from "../lib/vercel-handler.js";

const passthrough = [
  "CATALOG_SETUP_CODE", "ADMIN_COOKIE_EMBEDDED",
  "CATALOG_ADMIN_USER", "CATALOG_ADMIN_HASH", "CATALOG_ADMIN_SALT", "CATALOG_ADMIN_USERS",
  "TBK_API_KEY_ID", "TBK_API_KEY_SECRET", "GOOGLE_MAPS_API_KEY"
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

export default createHandler({ worker, getEnv });
