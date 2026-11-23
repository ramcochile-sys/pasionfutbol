import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const distEntry = resolve("dist/server/index.js");
if (!existsSync(distEntry) || process.env.npm_lifecycle_event === "dev") {
  await import("./scripts/build.mjs");
}

const { default: worker } = await import(pathToFileURL(distEntry).href);

// MOCKED — in-memory Cloudflare D1 adapter, data lost on container sleep
function createMockD1() {
  const products = new Map();
  const sessions = new Map();
  const loginAttempts = new Map();
  const adminUsers = new Map();

  function makeStatement(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const execute = async () => {
      if (normalized === "SELECT username, salt, hash FROM catalog_admin_users") {
        return { results: [...adminUsers.values()] };
      }

      if (normalized.startsWith("INSERT INTO catalog_admin_users")) {
        const [username, salt, hash] = params;
        adminUsers.set(username, { username, salt, hash });
        return { results: [] };
      }

      if (normalized.startsWith("SELECT 1 FROM catalog_admin_sessions")) {
        const [tokenHash, now] = params;
        const exp = sessions.get(tokenHash);
        const rows = exp && exp > now ? [{ 1: 1 }] : [];
        return { results: rows };
      }

      if (normalized.startsWith("INSERT INTO catalog_login_attempts")) {
        const [addressHash, expiresAt, now] = params;
        const existing = loginAttempts.get(addressHash);
        const next =
          !existing || existing.expires_at <= now
            ? { attempts: 1, expires_at: expiresAt }
            : { attempts: Math.min(existing.attempts + 1, 6), expires_at: existing.expires_at };
        loginAttempts.set(addressHash, next);
        return { results: [{ attempts: next.attempts }] };
      }

      if (normalized.startsWith("DELETE FROM catalog_login_attempts")) {
        const [now, addressHash] = params;
        for (const [key, entry] of loginAttempts.entries()) {
          if (entry.expires_at <= now || key === addressHash) {
            loginAttempts.delete(key);
          }
        }
        return { results: [] };
      }

      if (normalized.startsWith("DELETE FROM catalog_admin_sessions WHERE expires_at <=")) {
        const [now] = params;
        for (const [key, exp] of sessions.entries()) {
          if (exp <= now) sessions.delete(key);
        }
        return { results: [] };
      }

      if (normalized.startsWith("DELETE FROM catalog_admin_sessions WHERE token_hash =")) {
        const [tokenHash] = params;
        sessions.delete(tokenHash);
        return { results: [] };
      }

      if (normalized.startsWith("INSERT INTO catalog_admin_sessions")) {
        const [tokenHash, expiresAt] = params;
        sessions.set(tokenHash, expiresAt);
        return { results: [] };
      }

      if (normalized === "SELECT * FROM products") {
        return { results: [...products.values()] };
      }

      if (normalized.startsWith("INSERT INTO products")) {
        const [id, name, price, position, categories, description, sizes, image] = params;
        products.set(id, { id, name, price, position, categories, description, sizes, image });
        return { results: [] };
      }

      return { results: [] };
    };

    return {
      bind: (...bound) => makeStatement(sql, bound),
      first: async () => (await execute()).results[0] ?? null,
      all: async () => await execute(),
      run: async () => {
        await execute();
        return { success: true };
      },
      _execute: execute
    };
  }

  return {
    prepare: sql => makeStatement(sql),
    batch: async statements => Promise.all(statements.map(stmt => stmt._execute()))
  };
}

// MOCKED — in-memory Cloudflare R2 bucket adapter, data lost on container sleep
function createMockBucket() {
  const store = new Map();

  return {
    async put(key, value, options = {}) {
      let bytes;
      if (typeof value === "string") {
        bytes = new TextEncoder().encode(value);
      } else if (value instanceof Uint8Array) {
        bytes = new Uint8Array(value);
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else {
        bytes = new Uint8Array(Buffer.from(value));
      }
      store.set(key, { bytes, httpMetadata: options.httpMetadata || {} });
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: entry.bytes,
        httpMetadata: entry.httpMetadata,
        async json() {
          return JSON.parse(Buffer.from(entry.bytes).toString("utf8"));
        },
        async text() {
          return Buffer.from(entry.bytes).toString("utf8");
        },
        async arrayBuffer() {
          return entry.bytes.buffer.slice(
            entry.bytes.byteOffset,
            entry.bytes.byteOffset + entry.bytes.byteLength
          );
        }
      };
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = "", limit = 1000, cursor } = {}) {
      const matching = [...store.keys()]
        .filter(key => key.startsWith(prefix))
        .sort();
      const offset = cursor ? Number(cursor) || 0 : 0;
      const slice = matching.slice(offset, offset + limit);
      const truncated = offset + slice.length < matching.length;
      return {
        objects: slice.map(key => ({ key })),
        truncated,
        cursor: truncated ? String(offset + slice.length) : undefined
      };
    }
  };
}

console.warn("[AI Studio] Using in-memory D1 and R2 mock adapters — data resets on restart.");

const env = {
  DB: createMockD1(),
  BUCKET: createMockBucket(),
  CATALOG_ADMIN_USER: process.env.CATALOG_ADMIN_USER || "",
  CATALOG_ADMIN_HASH: process.env.CATALOG_ADMIN_HASH || "",
  CATALOG_ADMIN_SALT: process.env.CATALOG_ADMIN_SALT || "",
  CATALOG_ADMIN_USERS: process.env.CATALOG_ADMIN_USERS || "",
  CATALOG_SETUP_CODE: process.env.CATALOG_SETUP_CODE || "",
  ADMIN_COOKIE_EMBEDDED: process.env.ADMIN_COOKIE_EMBEDDED || "",
  TBK_API_KEY_ID: process.env.TBK_API_KEY_ID || "",
  FLOW_API_KEY: process.env.FLOW_API_KEY || "",
  FLOW_SECRET_KEY: process.env.FLOW_SECRET_KEY || "",
  FLOW_SANDBOX: process.env.FLOW_SANDBOX || "",
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN || "",
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET || "",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  PEDIDOS_CORREO_DE: process.env.PEDIDOS_CORREO_DE || "",
  PEDIDOS_CORREO_PARA: process.env.PEDIDOS_CORREO_PARA || "",
  PRUEBA_PRECIO: process.env.PRUEBA_PRECIO || "",
  GEOAPIFY_API_KEY: process.env.GEOAPIFY_API_KEY || "",
  META_PIXEL_ID: process.env.META_PIXEL_ID || "",
  TBK_API_KEY_SECRET: process.env.TBK_API_KEY_SECRET || "",
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || ""
};

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const PORT = Number(process.env.PORT) || 3000;

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    req.on("data", chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        rejectBody(Object.assign(new Error("Payload too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

// En Vercel, public/ lo sirve la CDN antes de llegar a la función. En local se imita aquí.
const staticTypes = { svg: "image/svg+xml", jpg: "image/jpeg", webp: "image/webp", png: "image/png", woff2: "font/woff2" };
async function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  const ext = pathname.split(".").at(-1);
  if (!/^\/[\w.-]+$/.test(pathname) || !staticTypes[ext]) return false;
  try {
    const data = await readFile(resolve("public", pathname.slice(1)));
    res.setHeader("Content-Type", staticTypes[ext]);
    res.end(req.method === "HEAD" ? undefined : data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (await serveStatic(req, res)) return;
    const forwardedHost = req.headers["x-forwarded-host"];
    const host =
      (typeof forwardedHost === "string" ? forwardedHost.split(",")[0].trim() : "") ||
      req.headers.host ||
      `localhost:${PORT}`;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const rawProto =
      (typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : "") || "http";
    const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
    const proto = rawProto === "https" || !isLocalHost ? "https" : "http";
    const requestUrl = `${proto}://${host}${req.url || "/"}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const entry of value) headers.append(key, entry);
      } else {
        headers.set(key, value);
      }
    }

    if (!headers.has("cf-connecting-ip")) {
      const forwardedFor = headers.get("x-forwarded-for");
      const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : "") || req.socket.remoteAddress || "127.0.0.1";
      headers.set("cf-connecting-ip", ip);
    }

    if (proto !== "https" && headers.has("cookie")) {
      headers.set(
        "cookie",
        headers.get("cookie").replace(/(^|;\s*)pasion-admin=/g, "$1__Host-pasion-admin=")
      );
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await readRequestBody(req) : undefined;
    const webRequest = new Request(requestUrl, {
      method: req.method,
      headers,
      body
    });

    const webResponse = await worker.fetch(webRequest, env);

    res.statusCode = webResponse.status;
    const setCookies = typeof webResponse.headers.getSetCookie === "function"
      ? webResponse.headers.getSetCookie()
      : [];

    for (const [key, value] of webResponse.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") continue;
      res.setHeader(key, value);
    }

    if (setCookies.length) {
      const adjusted =
        proto === "https"
          ? setCookies
          : setCookies.map(cookie =>
              cookie
                .replace(/^__Host-pasion-admin=/, "pasion-admin=")
                .replace(/;\s*Secure\b/gi, "")
                .replace(/;\s*SameSite=None\b/gi, "; SameSite=Lax")
                .replace(/;\s*Partitioned\b/gi, "")
            );
      res.setHeader("Set-Cookie", adjusted);
    }

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
    res.end(responseBuffer);
  } catch (error) {
    console.error(error);
    res.statusCode = error?.status || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "No se pudo completar la operación. Inténtalo de nuevo." }));
  }
});

server.listen(PORT, () => {
  console.log(`Pasión Fútbol listening on http://localhost:${PORT} (0.0.0.0:${PORT})`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
