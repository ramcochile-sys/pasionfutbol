const noStore = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"};
const sessionCookie = "__Host-pasion-admin";
const sessionDuration = 8 * 60 * 60;
const attemptWindow = 15 * 60;
const encoder = new TextEncoder();
const mediaRoute = /^\/media\/[a-f0-9-]+$/;
const productRoute = /^\/api\/admin\/products(?:\/([a-z0-9-]+))?$/;
const maxPhotoSize = 4 * 1024 * 1024;
const sizeOptions = ["4", "6", "8", "10", "12", "14", "16", "XS", "S", "M", "L", "XL", "XXL"];

// ---------- Meta Pixel ----------
// El ID viene de la variable de entorno META_PIXEL_ID (Vercel). Sin ella, no se carga el pixel.
let metaPixelId = "";
function metaPixelSnippet() {
  if (!/^\d{8,20}$/.test(metaPixelId)) return "";
  return `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');</script><noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1"></noscript>`;
}
function withMetaPixel(page) {
  const snippet = metaPixelSnippet();
  return snippet ? page.replace("</head>", () => snippet + "</head>") : page;
}

function html(body, status = 200) {
  return new Response(body, {status, headers:{...noStore, "Content-Type":"text/html; charset=utf-8"}});
}

function json(body, status = 200) {
  return Response.json(body, {status, headers:noStore});
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function sessionToken(request) {
  const value = request.headers.get("Cookie")?.match(/(?:^|;\s*)__Host-pasion-admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  return value || null;
}

async function isAdmin(request, env) {
  const token = sessionToken(request);
  return Boolean(token && await env.DB.prepare("SELECT 1 FROM catalog_admin_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await hash(token), Math.floor(Date.now() / 1000)).first());
}

// SameSite=Strict por defecto (protege contra CSRF). Solo si el panel se muestra
// dentro de un iframe (p. ej. una vista previa) define ADMIN_COOKIE_EMBEDDED=1.
function sessionCookieSameSite(env) {
  return env?.ADMIN_COOKIE_EMBEDDED === "1" ? "SameSite=None; Partitioned" : "SameSite=Strict";
}

function redirectAdmin(token, maxAge, env) {
  return new Response(null, {status:303, headers:{...noStore, Location:"/admin",
    "Set-Cookie":`${sessionCookie}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; ${sessionCookieSameSite(env)}`}});
}

function loginError(message, status) {
  return html(login.replace("<!-- LOGIN_ERROR -->", `<p role="alert">${message}</p>`), status);
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[char]);
}

function setupPage(errorMessage = "", status = 200, showForm = true) {
  const alert = errorMessage ? `<p role="alert">${escapeAttr(errorMessage)}</p>` : "";
  return html(`<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configurar administración · Pasión Fútbol</title>
<style>
:root{color-scheme:dark;font:16px system-ui,sans-serif;background:#090e18;color:#f5f8ff}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:20px}
main{width:min(100%,460px);background:#101a2b;border:1px solid #344765;border-radius:14px;padding:24px}
strong{font-style:italic;color:#ffda28}
h1{font-size:24px;margin:12px 0 8px}
p{color:#b9c6da;font-size:14px;line-height:1.45;margin:0 0 14px}
form,label{display:grid;gap:6px}
form{gap:14px}
fieldset{border:1px solid #344765;border-radius:10px;padding:12px;display:grid;gap:10px;margin:0}
legend{font-size:13px;font-weight:700;color:#82e9a7;padding:0 6px}
input,button{width:100%;min-height:44px;border:1px solid #425575;border-radius:8px;background:#090e18;color:inherit;font:inherit;padding:8px 12px}
button{background:#16a34a;color:#06130a;font-weight:700;border:0;cursor:pointer}
a{color:#b9c6da}
[role="alert"]{color:#ffc1c1;font-weight:600}
</style>
</head>
<body>
<main>
<strong>PASIÓN FÚTBOL</strong>
<h1>Configurar acceso admin</h1>
<p>Crea hasta 2 cuentas de administrador para comenzar. Una vez guardadas, esta pantalla se bloqueará.</p>
${alert}
${showForm ? `<form method="post" action="/admin/setup">
<label>Código de configuración <input type="password" name="setup_code" autocomplete="off" maxlength="256" required></label>
<fieldset>
<legend>Administrador 1</legend>
<label>Usuario <input name="username1" autocomplete="off" autocapitalize="none" maxlength="100" required></label>
<label>Contraseña <input type="password" name="password1" autocomplete="new-password" maxlength="256" required></label>
</fieldset>
<fieldset>
<legend>Administrador 2 (opcional)</legend>
<label>Usuario <input name="username2" autocomplete="off" autocapitalize="none" maxlength="100"></label>
<label>Contraseña <input type="password" name="password2" autocomplete="new-password" maxlength="256"></label>
</fieldset>
<button type="submit">Guardar administradores y entrar</button>
</form>` : ""}
<p style="margin-top:14px"><a href="/">Volver a la tienda</a></p>
</main>
</body>
</html>`, status);
}

function parseEnvAdminUsers(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(u =>
      u && typeof u.username === "string" && u.username.trim() &&
      typeof u.salt === "string" && u.salt &&
      typeof u.hash === "string" && /^[a-f0-9]{64}$/i.test(u.hash)
    ).map(u => ({ username: u.username.trim(), salt: u.salt, hash: u.hash.toLowerCase() }));
  } catch {
    return [];
  }
}

function getEnvAdmins(env) {
  const list = parseEnvAdminUsers(env.CATALOG_ADMIN_USERS);
  if (env.CATALOG_ADMIN_USER && env.CATALOG_ADMIN_HASH && env.CATALOG_ADMIN_SALT) {
    list.unshift({
      username: env.CATALOG_ADMIN_USER,
      salt: env.CATALOG_ADMIN_SALT,
      hash: env.CATALOG_ADMIN_HASH.toLowerCase()
    });
  }
  return list;
}

async function getConfiguredAdmins(env) {
  const envAdmins = getEnvAdmins(env);
  if (envAdmins.length) return envAdmins;
  try {
    const {results} = await env.DB.prepare("SELECT username, salt, hash FROM catalog_admin_users").all();
    return results || [];
  } catch {
    return [];
  }
}

async function derivePasswordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({
    name:"PBKDF2", hash:"SHA-256", salt:encoder.encode(salt), iterations:100000
  }, key, 256));
}

function constantTimeHexMatch(a, b) {
  let mismatched = (a.length ^ 64) | (b.length ^ 64);
  if (mismatched !== 0) return false;
  for (let i = 0; i < 64; i++) mismatched |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatched === 0;
}

const setupDisabledMessage = "La configuración inicial está deshabilitada. Define el secreto CATALOG_SETUP_CODE (mínimo 12 caracteres) o las variables CATALOG_ADMIN_USER, CATALOG_ADMIN_HASH y CATALOG_ADMIN_SALT.";

function setupEnabled(env) {
  return typeof env.CATALOG_SETUP_CODE === "string" && env.CATALOG_SETUP_CODE.length >= 12;
}

async function setupAdmins(request, env, url) {
  if (request.method !== "POST") return new Response(null, {status:303, headers:{Location:"/admin"}});
  if (request.headers.get("Origin") !== url.origin) return json({error:"Origen inválido."}, 403);
  if (getEnvAdmins(env).length || (await getConfiguredAdmins(env)).length) {
    return json({error:"La configuración inicial ya fue completada."}, 403);
  }
  if (!setupEnabled(env)) return setupPage(setupDisabledMessage, 503, false);
  if (Number(request.headers.get("Content-Length")) > 4096) return setupPage("Solicitud inválida.", 413);
  const form = await request.formData();
  const providedCode = typeof form.get("setup_code") === "string" ? form.get("setup_code") : "";
  if (!constantTimeHexMatch(await hash(providedCode), await hash(env.CATALOG_SETUP_CODE))) {
    return setupPage("Código de configuración incorrecto.", 403);
  }
  const u1 = typeof form.get("username1") === "string" ? form.get("username1").trim() : "";
  const p1 = typeof form.get("password1") === "string" ? form.get("password1") : "";
  const u2 = typeof form.get("username2") === "string" ? form.get("username2").trim() : "";
  const p2 = typeof form.get("password2") === "string" ? form.get("password2") : "";
  if (!u1 || u1.length > 100 || !p1 || p1.length > 256) {
    return setupPage("Completa el usuario y la contraseña del Administrador 1.", 400);
  }
  if ((u2 && !p2) || (!u2 && p2)) {
    return setupPage("Si agregas un segundo administrador, completa usuario y contraseña.", 400);
  }
  if (u2.length > 100 || p2.length > 256) {
    return setupPage("El usuario o contraseña del Administrador 2 excede el límite.", 400);
  }
  if (u2 && u2 === u1) {
    return setupPage("Los dos nombres de usuario deben ser distintos.", 400);
  }
  const entries = [{ username: u1, password: p1 }];
  if (u2) entries.push({ username: u2, password: p2 });
  const now = Math.floor(Date.now() / 1000);
  const stmts = [];
  for (const entry of entries) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pwHash = await derivePasswordHash(entry.password, salt);
    stmts.push(env.DB.prepare("INSERT INTO catalog_admin_users (username, salt, hash) VALUES (?,?,?)").bind(entry.username, salt, pwHash));
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  stmts.push(env.DB.prepare("INSERT INTO catalog_admin_sessions (token_hash, expires_at) VALUES (?,?)").bind(await hash(token), now + sessionDuration));
  await env.DB.batch(stmts);
  return redirectAdmin(token, sessionDuration, env);
}

async function authenticate(request, env) {
  const admins = await getConfiguredAdmins(env);
  if (!admins.length) {
    return setupPage("Primero crea al menos un administrador.", 400);
  }
  const address = await hash(request.headers.get("CF-Connecting-IP") || "unknown");
  const now = Math.floor(Date.now() / 1000);
  const {attempts} = await env.DB.prepare(`INSERT INTO catalog_login_attempts (address_hash, attempts, expires_at)
    VALUES (?,1,?) ON CONFLICT(address_hash) DO UPDATE SET
    attempts = CASE WHEN expires_at <= ? THEN 1 ELSE min(attempts + 1, 6) END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING attempts`).bind(address, now + attemptWindow, now, now).first();
  if (attempts > 5) return loginError("Demasiados intentos. Vuelve a intentar en unos minutos.",429);

  const form = await request.formData();
  const username = typeof form.get("username") === "string" ? form.get("username").trim() : "";
  const password = form.get("password");
  if (typeof password !== "string" || !password || password.length > 256 || !username || username.length > 100) {
    return loginError("Usuario o contraseña incorrectos.",401);
  }
  const matchedAdmin = admins.find(admin => admin.username === username);
  const salt = matchedAdmin ? matchedAdmin.salt : "dummy-salt-timing-pad";
  const expectedHash = matchedAdmin ? matchedAdmin.hash : "0".repeat(64);
  const candidate = await derivePasswordHash(password, salt);
  if (!matchedAdmin || !constantTimeHexMatch(candidate, expectedHash)) {
    return loginError("Usuario o contraseña incorrectos.",401);
  }

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM catalog_login_attempts WHERE expires_at <= ? OR address_hash = ?").bind(now,address),
    env.DB.prepare("DELETE FROM catalog_admin_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO catalog_admin_sessions (token_hash, expires_at) VALUES (?,?)").bind(await hash(token),now + sessionDuration)
  ]);
  return redirectAdmin(token,sessionDuration,env);
}

async function catalog(env) {
  const {results} = await env.DB.prepare("SELECT * FROM products").all();
  const products = new Map(initialProducts.map(item => [item.id, item]));
  for (const row of results) {
    const item = {...row, categories:JSON.parse(row.categories), sizes:JSON.parse(row.sizes)};
    const replacement = products.get(row.id);
    if (replacement?.legacyImages?.includes(item.image)) {
      Object.assign(item, {
        name:replacement.name, description:replacement.description, sizes:replacement.sizes, image:replacement.image
      });
    }
    products.set(row.id, item);
  }
  return [...products.values()].sort((a,b) => a.position - b.position || a.name.localeCompare(b.name,"es"));
}

// Demo listings remain editable in the admin, but only photographed items can be purchased.
function productWithPhoto(product) {
  if (product.image.startsWith("/media/")) return true;
  return /-(?:frente)\.(?:webp|png)$/.test(product.image) && Object.hasOwn(assets, product.image);
}

function hasPhotoSignature(bytes, type) {
  const is = (offset, signature) => [...signature].every((char,i) => bytes[offset+i] === char.charCodeAt(0));
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes[0] === 137 && is(1,"PNG\r\n\x1a\n");
  return type === "image/webp" && is(0,"RIFF") && is(8,"WEBP");
}

async function saveProduct(request, env, id) {
  if (Number(request.headers.get("Content-Length")) > maxPhotoSize + 65536) {
    return json({error:"La foto supera los 4 MB."}, 413);
  }
  const previous = id && (await catalog(env)).find(item => item.id === id);
  if (id && !previous) return json({error:"El producto ya no existe."},404);
  const form = await request.formData();
  const field = name => String(form.get(name) ?? "").trim();
  const name = field("name");
  const price = Number(field("price"));
  const position = Number(field("position"));
  const description = field("description");
  const categories = [...new Set(field("categories").split(",").map(value => value.trim()).filter(Boolean))];
  const sizes = form.getAll("sizes").filter(size => sizeOptions.includes(size));
  if (!name || name.length > 100 || !categories.length || categories.length > 8 ||
      categories.some(value => value.length > 40) || description.length > 500 || !sizes.length ||
      !field("price") || !Number.isInteger(price) || price < 1 || price > 99999999 ||
      !field("position") || !Number.isInteger(position) || position < 1 || position > 999999) {
    return json({error:"Revisa el nombre, precio, orden, categorías y tallas."},400);
  }
  let image = previous?.image;
  let photoKey;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size) {
    if (photo.size > maxPhotoSize) return json({error:"La foto supera los 4 MB."},413);
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!hasPhotoSignature(bytes, photo.type)) return json({error:"Elige una foto JPG, PNG o WebP."},400);
    photoKey = crypto.randomUUID();
    await env.BUCKET.put(photoKey, bytes, {httpMetadata:{contentType:photo.type}});
    image = "/media/" + photoKey;
  }
  if (!image) return json({error:"Selecciona una foto para el producto."},400);
  id ||= crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO products (id,name,price,position,categories,description,sizes,image)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, price=excluded.price, position=excluded.position, categories=excluded.categories,
      description=excluded.description, sizes=excluded.sizes, image=excluded.image`)
      .bind(id,name,price,position,JSON.stringify(categories),description,JSON.stringify(sizes),image).run();
  } catch (error) {
    if (photoKey) await env.BUCKET.delete(photoKey).catch(console.error);
    throw error;
  }
  return json({id});
}

// Valida el pedido (productos, tallas, envío y total). La usan Flow y Mercado Pago.
async function prepareOrder(request, env, url) {
  if (request.method !== "POST") return {response:json({error:"Método no permitido."},405)};
  if (request.headers.get("Origin") !== url.origin) return {response:json({error:"Origen inválido."},403)};
  const raw = await request.text();
  if (raw.length > 16000) return {response:json({error:"Pedido demasiado grande."},413)};
  let body;
  try { body = JSON.parse(raw); } catch { return {response:json({error:"Pedido inválido."},400)}; }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) return {response:json({error:"Revisa tu carrito."},400)};
  const available = [...(await catalog(env)).filter(productWithPhoto), testProduct(env)];
  const items = [];
  for (const line of body.items) {
    const product = available.find(item => item.id === line.id);
    if (!product || !product.sizes.includes(line.size) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return {response:json({error:"Revisa las tallas y cantidades de tu carrito."},400)};
    items.push({id:product.id,name:product.name,size:line.size,quantity:line.quantity,price:product.price,categories:product.categories});
  }
  const shipping = body.shipping;
  const required = ["name","email","phone","address","commune","region"];
  if (!shipping || required.some(key => typeof shipping[key] !== "string" || !shipping[key].trim() || shipping[key].length > 250)) return {response:json({error:"Completa los datos de envío."},400)};
  const contact = checkShippingContact(shipping);
  const [firstField] = Object.keys(contact.errors);
  if (firstField) return {response:json({error:contact.errors[firstField], field:firstField, fields:contact.errors},400)};
  const cleanShipping = {...Object.fromEntries(required.map(key => [key,shipping[key].trim()])), ...contact.clean};
  const carrierId = typeof shipping.carrier === "string" && shipping.carrier.trim()
    ? shipping.carrier.trim()
    : "blue-express";
  if (!Object.hasOwn(shippingCarriers, carrierId)) return {response:json({error:"Selecciona una empresa de envío válida."},400)};
  const quote = shippingQuote(items, cleanShipping.region, cleanShipping.commune, carrierId);
  if (!quote) return {response:json({error:"Este envío requiere cotización por WhatsApp."},400)};
  const reference = typeof shipping["address-extra"] === "string" ? shipping["address-extra"].trim().slice(0,250) : "";
  const verifiedAddress = typeof shipping.verifiedAddress === "string" ? shipping.verifiedAddress.trim().slice(0,250) : "";
  Object.assign(cleanShipping, quote, {reference, ...(verifiedAddress ? {verifiedAddress} : {})});
  const pricing = orderPricing(items);
  const {subtotal, discount} = pricing;
  const amount = pricing.amount + quote.price;
  if (body.quotedTotal !== amount) return {response:json({error:"El total cambió. Recarga el catálogo antes de volver a pagar."},409)};
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99999999) return {response:json({error:"Total inválido."},400)};
  return {items, cleanShipping, subtotal, discount, amount};
}
function purchaseEvent(record) {
  if (!metaPixelSnippet() || !record) return "";
  const data = {
    value: record.amount, currency: "CLP", content_type: "product",
    content_ids: [...new Set(record.items.map(item => item.id))],
    contents: record.items.map(item => ({id: item.id, quantity: item.quantity, item_price: item.price})),
    num_items: record.items.reduce((sum, item) => sum + item.quantity, 0)
  };
  const order = String(record.buy_order);
  // Se envía una sola vez por pedido, aunque el cliente recargue la página.
  return `<script>try{var k="pf-purchase-"+${JSON.stringify(order).replaceAll("<", "\\u003c")};if(!localStorage.getItem(k)){fbq("track","Purchase",${JSON.stringify(data).replaceAll("<", "\\u003c")},{eventID:${JSON.stringify(order).replaceAll("<", "\\u003c")}});localStorage.setItem(k,"1")}}catch(e){}</script>`;
}
// paymentPage está en pages.js
// ---------- Flow (https://www.flow.cl) ----------
// Variables de entorno: FLOW_API_KEY, FLOW_SECRET_KEY. FLOW_SANDBOX=1 usa el ambiente de pruebas de Flow.
const flowHosts = ["www.flow.cl", "sandbox.flow.cl"];
function flowBase(env) {
  if (env.FLOW_API_URL) return env.FLOW_API_URL;
  return env.FLOW_SANDBOX === "1" || env.FLOW_SANDBOX === "true" ? "https://sandbox.flow.cl/api" : "https://www.flow.cl/api";
}
async function flowSign(params, secret) {
  const text = Object.keys(params).sort().map(key => key + params[key]).join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text))));
}
async function flowRequest(env, path, params, method = "GET") {
  const signed = {...params, apiKey:env.FLOW_API_KEY};
  signed.s = await flowSign(signed, env.FLOW_SECRET_KEY);
  const query = new URLSearchParams(signed);
  const response = method === "GET"
    ? await fetch(flowBase(env) + path + "?" + query, {signal:AbortSignal.timeout(20000)})
    : await fetch(flowBase(env) + path, {method, headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:query, signal:AbortSignal.timeout(20000)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Flow respondió", response.status, JSON.stringify(data).slice(0,300));
    const failure = new Error("Flow no disponible");
    failure.flowCode = Number.isInteger(data?.code) ? data.code : response.status;
    throw failure;
  }
  return data;
}
async function createFlow(request, env, url) {
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) return json({error:"Flow no está configurado."},503);
  const order = await prepareOrder(request, env, url);
  if (order.response) return order.response;
  const {items, cleanShipping, subtotal, discount, amount} = order;
  const buy_order = "PF" + crypto.randomUUID().replaceAll("-", "").slice(0,24);
  let result;
  try {
    result = await flowRequest(env,"/payment/create",{
      commerceOrder:buy_order, subject:"Pedido Pasión Fútbol " + buy_order, currency:"CLP", amount:String(amount),
      email:cleanShipping.email, urlConfirmation:url.origin + "/flow/confirm", urlReturn:url.origin + "/flow/return"
    },"POST");
  } catch (error) {
    // 1620: Flow rechaza correos que no existen o no reciben mensajes (ej. cuentas Gmail inventadas).
    if (error?.flowCode === 1620) return json({error:"Flow no aceptó ese correo electrónico. Usa un correo real que revises: ahí te llegará el comprobante de pago.", field:"email"},400);
    if (error?.flowCode !== undefined) return json({error:`No pudimos iniciar el pago con Flow (código ${error.flowCode}). Intenta de nuevo o escríbenos por WhatsApp.`},502);
    throw error;
  }
  let destination;
  try { destination = new URL(result.url); } catch { throw new Error("Respuesta Flow inválida"); }
  if (destination.protocol !== "https:" || !flowHosts.includes(destination.hostname) || typeof result.token !== "string" || !/^[A-Za-z0-9_-]{10,256}$/.test(result.token)) throw new Error("Respuesta Flow inválida");
  const record = {provider:"flow",buy_order,session_id:buy_order,amount,subtotal,discount,items,shipping:cleanShipping,status:"pending",createdAt:Date.now()};
  await env.BUCKET.put("webpay-orders/" + await hash(result.token),JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return json({url:result.url + "?token=" + encodeURIComponent(result.token),token:result.token,provider:"flow"});
}
// Consulta a Flow el estado real del pago y lo guarda. Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada.
async function settleFlow(env, token) {
  const giftId = await hash(token);
  const key = "webpay-orders/" + giftId;
  const stored = await env.BUCKET.get(key);
  if (!stored) return {notFound:true};
  const record = await stored.json();
  if (record.provider !== "flow") return {notFound:true};
  if (record.status === "paid") return {record, giftId, approved:true};
  const result = await flowRequest(env,"/payment/getStatus",{token});
  const approved = Number(result.status) === 2 && Number(result.amount) === record.amount && result.commerceOrder === record.buy_order;
  const pending = Number(result.status) === 1;
  if (!pending) {
    record.status = approved ? "paid" : "not_approved";
    record.checkedAt = Date.now();
    if (approved) await notifyPaidOrder(env, record);
    await env.BUCKET.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  }
  return {record, giftId, approved, pending};
}
async function flowToken(request, url) {
  const params = request.method === "POST" ? new URLSearchParams(await request.text()) : url.searchParams;
  const token = params.get("token") || "";
  return /^[a-zA-Z0-9_-]{10,256}$/.test(token) ? token : "";
}
// Flow avisa aquí (servidor a servidor) cuando un pago cambia de estado.
async function confirmFlow(request, env, url) {
  if (request.method !== "POST") return json({error:"Método no permitido."},405);
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) return json({error:"Flow no está configurado."},503);
  const token = await flowToken(request, url);
  if (!token) return json({error:"Token inválido."},400);
  const result = await settleFlow(env, token);
  if (result.notFound) return json({error:"Pago no encontrado."},404);
  return new Response("OK",{status:200,headers:{"Cache-Control":"no-store"}});
}
async function returnFlow(request, env, url) {
  const token = await flowToken(request, url);
  if (!token) return paymentPage("Pago cancelado o expirado","El pago no se completó. Tu carrito sigue disponible para volver a intentarlo.",200,"","FLOW");
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET_KEY) return paymentPage("Flow no está configurado","No se pudo verificar este pago.",503,"","FLOW");
  let result;
  try { result = await settleFlow(env, token); }
  catch { return paymentPage("No pudimos verificar el pago","Recarga esta página para consultar el resultado antes de volver a pagar. Tu pedido no se marcará como pagado hasta recibir la confirmación de Flow.",200,"","FLOW"); }
  if (result.notFound) return paymentPage("Pago no encontrado","No se pudo verificar este pago.",404,"","FLOW");
  const {record, giftId} = result;
  if (result.approved) return paymentPage("Pago aprobado",`Pedido ${record.buy_order}. Total: $${record.amount.toLocaleString("es-CL")}. Gracias por tu compra, te contactaremos para coordinar el envío.`,200,giftId,"FLOW",record);
  if (result.pending) return paymentPage("Pago pendiente","Flow aún no confirma tu pago. Si ya pagaste, recarga esta página en unos minutos.",200,"","FLOW");
  return paymentPage("Pago no aprobado","Flow no confirmó el pago. Tu carrito sigue disponible para volver a intentarlo.",200,"","FLOW");
}

// ---------- Mercado Pago Checkout Pro (https://www.mercadopago.cl/developers) ----------
// Variables de entorno: MP_ACCESS_TOKEN (credencial de producción o de prueba) y, opcional,
// MP_WEBHOOK_SECRET (clave secreta de Webhooks del panel de Mercado Pago, para validar avisos).
const mpApi = "https://api.mercadopago.com";
const mpHosts = ["www.mercadopago.cl", "mercadopago.cl", "sandbox.mercadopago.cl"];
const mpOrderKey = async buyOrder => "webpay-orders/" + await hash("mercadopago:" + buyOrder);
async function mpRequest(env, path, body) {
  const response = await fetch(mpApi + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + env.MP_ACCESS_TOKEN,
      ...(body ? {"Content-Type":"application/json", "X-Idempotency-Key":crypto.randomUUID()} : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Mercado Pago respondió", response.status, JSON.stringify(data).slice(0,300));
    const failure = new Error("Mercado Pago no disponible");
    failure.mpStatus = response.status;
    throw failure;
  }
  return data;
}
async function createMercadoPago(request, env, url) {
  if (!env.MP_ACCESS_TOKEN) return json({error:"Mercado Pago no está configurado."},503);
  const order = await prepareOrder(request, env, url);
  if (order.response) return order.response;
  const {items, cleanShipping, subtotal, discount, amount} = order;
  const buy_order = "PF" + crypto.randomUUID().replaceAll("-", "").slice(0,24);
  const [firstName, ...rest] = cleanShipping.name.split(/\s+/);
  let result;
  try {
    result = await mpRequest(env, "/checkout/preferences", {
      // Un solo ítem con el total ya calculado (productos, descuentos y envío) para que el monto calce exacto.
      items:[{id:buy_order, title:"Pedido Pasión Fútbol " + buy_order, quantity:1, currency_id:"CLP", unit_price:amount}],
      payer:{email:cleanShipping.email, name:firstName, surname:rest.join(" ")},
      external_reference:buy_order,
      statement_descriptor:"PASION FUTBOL",
      back_urls:{success:url.origin + "/mercadopago/return", pending:url.origin + "/mercadopago/return", failure:url.origin + "/mercadopago/return"},
      auto_return:"approved",
      notification_url:url.origin + "/mercadopago/webhook?source_news=webhooks",
      expires:true,
      expiration_date_to:new Date(Date.now() + 24*60*60*1000).toISOString()
    });
  } catch (error) {
    if (error?.mpStatus === 401 || error?.mpStatus === 403) return json({error:"Mercado Pago rechazó las credenciales de la tienda. Escríbenos por WhatsApp mientras lo solucionamos."},502);
    if (error?.mpStatus !== undefined) return json({error:`No pudimos iniciar el pago con Mercado Pago (código ${error.mpStatus}). Intenta de nuevo o escríbenos por WhatsApp.`},502);
    throw error;
  }
  let destination;
  try { destination = new URL(result.init_point); } catch { throw new Error("Respuesta Mercado Pago inválida"); }
  if (destination.protocol !== "https:" || !mpHosts.includes(destination.hostname)) throw new Error("Respuesta Mercado Pago inválida");
  const record = {provider:"mercadopago",buy_order,session_id:result.id,amount,subtotal,discount,items,shipping:cleanShipping,status:"pending",createdAt:Date.now()};
  await env.BUCKET.put(await mpOrderKey(buy_order),JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return json({url:destination.href,provider:"mercadopago"});
}
// Consulta a Mercado Pago el pago real (nunca se confía en los parámetros de la URL) y lo guarda.
async function settleMercadoPago(env, paymentId) {
  const payment = await mpRequest(env, "/v1/payments/" + encodeURIComponent(paymentId));
  const buyOrder = String(payment.external_reference || "");
  if (!/^PF[a-f0-9]{24}$/.test(buyOrder)) return {notFound:true};
  const key = await mpOrderKey(buyOrder);
  const giftId = key.slice("webpay-orders/".length);
  const stored = await env.BUCKET.get(key);
  if (!stored) return {notFound:true};
  const record = await stored.json();
  if (record.provider !== "mercadopago") return {notFound:true};
  if (record.status === "paid") return {record, giftId, approved:true};
  const approved = payment.status === "approved" && payment.currency_id === "CLP" && Number(payment.transaction_amount) === record.amount;
  const pending = ["pending","in_process","authorized"].includes(payment.status);
  // Un rechazo no cierra el pedido: el cliente puede reintentar con otra tarjeta en la misma preferencia.
  if (approved || ["rejected","cancelled","refunded","charged_back"].includes(payment.status)) {
    if (approved) { record.status = "paid"; record.paymentId = String(payment.id); }
    else record.lastPaymentStatus = payment.status;
    record.checkedAt = Date.now();
    if (approved) await notifyPaidOrder(env, record);
    await env.BUCKET.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  }
  return {record, giftId, approved, pending};
}
async function validMercadoPagoSignature(request, env, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true;
  const header = request.headers.get("x-signature") || "";
  const parts = Object.fromEntries(header.split(",").map(part => part.trim().split("=",2)));
  if (!parts.ts || !/^[a-f0-9]{64}$/.test(parts.v1 || "")) return false;
  const requestId = request.headers.get("x-request-id");
  const manifest = (dataId ? `id:${dataId.toLowerCase()};` : "") + (requestId ? `request-id:${requestId};` : "") + `ts:${parts.ts};`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.MP_WEBHOOK_SECRET), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(manifest))));
  let diff = expected.length ^ parts.v1.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
// Mercado Pago avisa aquí (servidor a servidor) cuando un pago cambia de estado.
async function webhookMercadoPago(request, env, url) {
  if (request.method !== "POST") return json({error:"Método no permitido."},405);
  if (!env.MP_ACCESS_TOKEN) return json({error:"Mercado Pago no está configurado."},503);
  const body = await request.json().catch(() => ({}));
  const type = url.searchParams.get("type") || body?.type || url.searchParams.get("topic");
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || String(body?.data?.id || "");
  if (!(await validMercadoPagoSignature(request, env, url.searchParams.get("data.id") || ""))) return json({error:"Firma inválida."},401);
  // Solo interesan los pagos; los demás avisos se confirman para que Mercado Pago no los reintente.
  if (type !== "payment" || !/^\d{1,20}$/.test(dataId)) return new Response("OK",{status:200,headers:{"Cache-Control":"no-store"}});
  const result = await settleMercadoPago(env, dataId);
  if (result.notFound) return json({error:"Pago no encontrado."},404);
  return new Response("OK",{status:200,headers:{"Cache-Control":"no-store"}});
}
async function returnMercadoPago(request, env, url) {
  const label = "MERCADO PAGO";
  const paymentId = url.searchParams.get("payment_id") || url.searchParams.get("collection_id") || "";
  if (!/^\d{1,20}$/.test(paymentId)) return paymentPage("Pago cancelado o expirado","El pago no se completó. Tu carrito sigue disponible para volver a intentarlo.",200,"",label);
  if (!env.MP_ACCESS_TOKEN) return paymentPage("Mercado Pago no está configurado","No se pudo verificar este pago.",503,"",label);
  let result;
  try { result = await settleMercadoPago(env, paymentId); }
  catch { return paymentPage("No pudimos verificar el pago","Recarga esta página para consultar el resultado antes de volver a pagar. Tu pedido no se marcará como pagado hasta recibir la confirmación de Mercado Pago.",200,"",label); }
  if (result.notFound) return paymentPage("Pago no encontrado","No se pudo verificar este pago.",404,"",label);
  const {record, giftId} = result;
  if (result.approved) return paymentPage("Pago aprobado",`Pedido ${record.buy_order}. Total: $${record.amount.toLocaleString("es-CL")}. Gracias por tu compra, te contactaremos para coordinar el envío.`,200,giftId,label,record);
  if (result.pending) return paymentPage("Pago pendiente","Mercado Pago aún no confirma tu pago. Si ya pagaste, recarga esta página en unos minutos.",200,"",label);
  return paymentPage("Pago no aprobado","Mercado Pago no aprobó el pago. Tu carrito sigue disponible para volver a intentarlo.",200,"",label);
}

async function downloadGift(request, env, pathname) {
  if (request.method !== "GET") return json({error:"Método no permitido."},405);
  const giftId = pathname.slice("/regalo/".length);
  if (!/^[a-f0-9]{64}$/.test(giftId)) return json({error:"Regalo no disponible."},404);
  const stored = await env.BUCKET.get("webpay-orders/" + giftId);
  if (!stored || !["paid_test","paid"].includes((await stored.json()).status)) return json({error:"Regalo no disponible."},404);
  return new Response(Uint8Array.from(atob(ebook), byte => byte.charCodeAt(0)), {headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":'attachment; filename="Revista_Oficial_Pasion_Futbol.pdf"',
    "Cache-Control":"private, no-store",
    "Referrer-Policy":"no-referrer"
  }});
}

async function orderDispatchPage(env, url) {
  const page = await env.BUCKET.list({prefix:"webpay-orders/", limit:30, cursor:url.searchParams.get("cursor") || undefined});
  const records = await Promise.all(page.objects.map(async ({key}) => {
    const object = await env.BUCKET.get(key);
    return object?.json();
  }));
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[char]);
  const paid = records.filter(record => ["paid_test","paid"].includes(record?.status)).sort((a,b) => b.createdAt-a.createdAt);
  const cards = paid.map(record => {
    const data = record.shipping;
    const contents = record.items.map(item => `${item.quantity} × ${escape(item.name)} (talla ${escape(item.size)})`).join("<br>");
    return `<article><h2>${escape(record.buy_order)}</h2>
      <p><strong>${record.status === "paid" ? `Pago aprobado (${record.provider === "mercadopago" ? "Mercado Pago" : "Flow"})` : "Pago de prueba aprobado"}</strong> · ${new Date(record.createdAt).toLocaleDateString("es-CL",{timeZone:"America/Santiago"})}</p>
      <p>${contents}</p>
      <p>${escape(data.name)} · ${escape(data.phone)} · ${escape(data.email)}<br>${escape(data.address)}${data.reference ? ", "+escape(data.reference) : ""}<br>${escape(data.commune)}, ${escape(data.region)}</p>
      <p>${data.carrier ? `${escape(data.carrier)} a domicilio · Talla ${escape(data.size)} · Envío: $${escape(data.price?.toLocaleString("es-CL"))}` : "Pedido anterior sin tarifa de envío registrada"}</p></article>`;
  }).join("");
  const next = page.truncated ? `<p><a href="?cursor=${encodeURIComponent(page.cursor)}">Siguiente página</a></p>` : "";
  return html(`<!doctype html><html lang="es-CL"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedidos · Pasión Fútbol</title><style>body{background:#100b1f;color:#f5f2fa;font:16px/1.5 system-ui;margin:auto;padding:24px;max-width:900px}a{color:#9af7ff}article{border:1px solid #4c4165;border-radius:12px;padding:12px 18px;margin:14px 0;overflow-wrap:anywhere}h2{font-size:1.2rem}</style><main><a href="/admin">Volver a productos</a><h1>Pedidos y envíos</h1><p>Pagos aprobados con Flow y Mercado Pago. Los pedidos anteriores marcados como prueba vienen del Webpay de pruebas.</p>${cards || "<p>No hay pagos aprobados en esta página.</p>"}${next}</main></html>`);
}

const geoapifyBase = "https://api.geoapify.com/v1/geocode";

function isMapsQuotaError(status) {
  return status === 429;
}

const normText = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Número escrito al final de la calle ("Av. Providencia 1234"). Geoapify no tiene todos los números de Chile.
function typedStreetNumber(text) {
  const first = String(text || "").split(",")[0].trim();
  const m = first.match(/(?:^|\s)(\d{1,6}[A-Za-z]?)\s*$/);
  return m ? m[1] : "";
}

function geoCommune(p) {
  return String(p.city || p.town || p.village || p.municipality || p.suburb || "").trim();
}

async function geoapifyRequest(env, endpoint, params) {
  const target = new URL(`${geoapifyBase}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  target.searchParams.set("apiKey", env.GEOAPIFY_API_KEY);
  const response = await fetch(target.href, {signal: AbortSignal.timeout(8000)});
  const data = await response.json().catch(() => ({}));
  return {status: response.status, ok: response.ok, data};
}

function geoFeatures(data) {
  return (Array.isArray(data?.features) ? data.features : [])
    .map(f => f?.properties)
    .filter(p => p && String(p.country_code || "").toLowerCase() === "cl" && p.street && typeof p.place_id === "string");
}

async function handleAddressAutocomplete(request, env, url) {
  if (request.method !== "POST") return json({error:"Método no permitido."},405);
  if (request.headers.get("Origin") !== url.origin) return json({error:"Origen inválido."},403);
  if (!env.GEOAPIFY_API_KEY) return json({error:"Búsqueda de direcciones no configurada.", code:"MAPS_NOT_CONFIGURED"},503);
  const raw = await request.text();
  if (raw.length > 2048) return json({error:"Solicitud demasiado grande."},413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({error:"Solicitud inválida."},400); }
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  const communeName = typeof body?.communeName === "string" ? body.communeName.trim().slice(0,80) : "";
  if (input.length < 5 || input.length > 180) return json({suggestions:[]});

  const typed = typedStreetNumber(input);
  let query = input;
  if (communeName && !normText(input).includes(normText(communeName))) query += `, ${communeName}`;

  let result;
  try {
    result = await geoapifyRequest(env, "autocomplete", {text: query, lang: "es", limit: "6", format: "geojson", filter: "countrycode:cl"});
  } catch (error) {
    console.error("Autocompletar direcciones falló:", error?.message || error);
    return json({error:"No pudimos buscar direcciones en este momento."},502);
  }
  if (isMapsQuotaError(result.status)) return json({error:"Límite de búsqueda alcanzado.", code:"RESOURCE_EXHAUSTED"},429);
  if (!result.ok) {
    console.error("Geoapify autocompletar respondió", result.status, JSON.stringify(result.data).slice(0,300));
    return json({error:"No pudimos buscar direcciones en este momento."},502);
  }
  const seen = new Set();
  const suggestions = [];
  for (const p of geoFeatures(result.data)) {
    const number = p.housenumber || typed;
    const mainText = number ? `${p.street} ${number}` : p.street;
    const place = [geoCommune(p), p.state].filter(Boolean).join(", ");
    const text = place ? `${mainText}, ${place}` : mainText;
    if (seen.has(text)) continue;
    seen.add(text);
    suggestions.push({placeId:p.place_id, text, mainText, secondaryText:place, types:[p.result_type || "street"]});
  }
  return json({suggestions});
}

async function handleAddressVerify(request, env, url) {
  if (request.method !== "POST") return json({error:"Método no permitido."},405);
  if (request.headers.get("Origin") !== url.origin) return json({error:"Origen inválido."},403);
  if (!env.GEOAPIFY_API_KEY) return json({error:"Verificación de direcciones no configurada.", code:"MAPS_NOT_CONFIGURED"},503);
  const raw = await request.text();
  if (raw.length > 4096) return json({error:"Solicitud demasiado grande."},413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({error:"Solicitud inválida."},400); }
  const input = typeof body?.input === "string" ? body.input.trim().slice(0,200) : "";
  const communeName = typeof body?.communeName === "string" ? body.communeName.trim().slice(0,80) : "";
  const placeId = typeof body?.placeId === "string" && /^[A-Za-z0-9_=-]{10,200}$/.test(body.placeId) ? body.placeId : "";
  if (input.length < 3) return json({status:"not_found", exists:false, message:"Ingresa una calle y número válidos en Chile."});

  let text = input;
  if (communeName && !normText(input).includes(normText(communeName))) text += `, ${communeName}`;
  let result;
  try {
    result = await geoapifyRequest(env, "search", {text, lang: "es", limit: "5", format: "geojson", filter: "countrycode:cl"});
  } catch (error) {
    console.error("Verificar dirección falló:", error?.message || error);
    return json({error:"No pudimos verificar la dirección en este momento."},502);
  }
  if (isMapsQuotaError(result.status)) return json({error:"Límite de búsqueda alcanzado.", code:"RESOURCE_EXHAUSTED"},429);
  if (!result.ok) {
    console.error("Geoapify verificar respondió", result.status, JSON.stringify(result.data).slice(0,300));
    return json({error:"No pudimos verificar la dirección en este momento."},502);
  }
  const found = geoFeatures(result.data);
  const p = found.find(item => placeId && item.place_id === placeId) || found[0];
  if (!p) return json({status:"not_found", exists:false, hasStreetNumber:false});

  const typed = typedStreetNumber(input);
  const number = p.housenumber || typed;
  const commune = geoCommune(p);
  const region = String(p.state || "").trim();
  const base = {placeId: p.place_id, commune, region, types: [p.result_type || "street"]};
  if (!number) {
    return json({...base, status:"route_only", exists:true, hasStreetNumber:false, streetLine:p.street,
      formattedAddress: [p.street, commune, region].filter(Boolean).join(", ")});
  }
  const streetLine = `${p.street} ${number}`;
  return json({...base, status:"verified", exists:true, hasStreetNumber:true,
    // Si el número no figura en el mapa, se acepta el que escribió el cliente y la calle sí se confirma.
    numberConfirmed: Boolean(p.housenumber),
    streetLine, formattedAddress: [streetLine, commune, region].filter(Boolean).join(", ")});
}

export default {
  async fetch(request, env) {
    metaPixelId = String(env.META_PIXEL_ID || "").trim();
    const url = new URL(request.url);
    const {pathname} = url;
    const match = pathname.match(productRoute);
    try {
      if (pathname.startsWith("/regalo/")) return await downloadGift(request,env,pathname);
      if (pathname.startsWith("/revista/")) return await magazinePage(request,env,pathname);
      if (pathname === "/api/address/autocomplete") return await handleAddressAutocomplete(request,env,url);
      if (pathname === "/api/address/verify") return await handleAddressVerify(request,env,url);
      if (pathname === "/api/flow/create") return await createFlow(request,env,url);
      if (pathname === "/flow/confirm") return await confirmFlow(request,env,url);
      if (pathname === "/flow/return") return await returnFlow(request,env,url);
      if (pathname === "/api/mercadopago/create") return await createMercadoPago(request,env,url);
      if (pathname === "/mercadopago/webhook") return await webhookMercadoPago(request,env,url);
      if (pathname === "/mercadopago/return") return await returnMercadoPago(request,env,url);
      if (pathname === "/") {
        let products;
        try { products = await catalog(env); }
        catch (error) { console.error(error); products = initialProducts; }
        const storefrontProducts = products.filter(productWithPhoto).map(product => {
          const label = value => value.replace(/\bpoleras?\b/gi, word => (word[0] === "P" ? "Camiseta" : "camiseta") + (word.toLowerCase().endsWith("s") ? "s" : ""));
          const thumbnail = product.image.replace(/\.webp$/, ".png");
          const cartImage = assets[thumbnail]?.type === "image/png" ? thumbnail : product.image;
          const item = {...product, cartImage, name:label(product.name), description:label(product.description)};
          const studio = initialProducts.find(entry => entry.id === item.id && entry.image === item.image);
          if (studio?.gallery?.every(path => Object.hasOwn(assets, path))) {
            return {...item, studioGallery:true, gallery:studio.gallery, galleryLabels:studio.galleryLabels, illustratedSlides:studio.illustratedSlides};
          }
          if (item.image === "/mbappe-hd-frente.png") {
            return {
              ...item, studioGallery:true, gallery:[item.image, "/mbappe-hd-espalda.png", "/mbappe-hd-jugador.png"],
              galleryLabels:["Frente", "Espalda", "Mbappé con la camiseta"], illustratedSlides:[0,1,2]
            };
          }
          const base = item.image.replace(/\.(svg|webp)$/, "");
          const gallery = [`${base}-full.png`, `${base}-chest.png`, `${base}-sleeve.png`];
          const name = item.name;
          if (item.image === "/liverpool-hd-frente.png") {
            return {
              ...item, name, studioGallery:true, gallery:[item.image, "/liverpool-hd-espalda.png", "/liverpool-hd-jugador.png"],
              galleryLabels:["Frente", "Espalda", "Wirtz con la camiseta"], illustratedSlides:[0,1,2]
            };
          }
          return Object.hasOwn(assets, gallery[0])
            ? {...item, name, image: gallery[0], gallery}
            : {...item, name};
        });
        storefrontProducts.push(testProduct(env));
        const serialized = JSON.stringify(storefrontProducts).replaceAll("<", "\\u003c");
        const page = html(withMetaPixel(storefront.replace("/* CATALOG_DATA */ []", () => serialized)));
        // La tienda es igual para todos: la CDN de Vercel la guarda 60 s y la renueva en segundo plano,
        // así casi ninguna visita espera a la base de datos. Los cambios del admin se ven en ~1 minuto.
        page.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
        page.headers.set("Vercel-CDN-Cache-Control", "max-age=60, stale-while-revalidate=86400");
        return page;
      }
      if (pathname === "/admin/setup") {
        return await setupAdmins(request, env, url);
      }
      if (pathname === "/admin/login" || pathname === "/admin/logout") {
        if (request.method !== "POST") return new Response(null,{status:303,headers:{Location:"/admin"}});
        if (request.headers.get("Origin") !== url.origin) return json({error:"Origen inválido."},403);
        if (pathname.endsWith("/login")) {
          if (Number(request.headers.get("Content-Length")) > 4096) return loginError("Solicitud inválida.",413);
          return await authenticate(request,env);
        }
        const token = sessionToken(request);
        if (token) await env.DB.prepare("DELETE FROM catalog_admin_sessions WHERE token_hash = ?").bind(await hash(token)).run();
        return redirectAdmin("",0,env);
      }
      if (pathname === "/admin/pedidos") {
        if (request.method !== "GET") return json({error:"Método no permitido."},405);
        if (!await isAdmin(request,env)) return new Response(null,{status:303,headers:{...noStore,Location:"/admin"}});
        return await orderDispatchPage(env,url);
      }
      if (pathname === "/admin" || pathname === "/admin/") {
        if (await isAdmin(request,env)) return html(admin);
        const admins = await getConfiguredAdmins(env);
        if (admins.length) return html(login);
        return setupEnabled(env) ? setupPage() : setupPage(setupDisabledMessage, 503, false);
      }
      if (match) {
        if (!await isAdmin(request,env)) return json({error:"Acceso restringido."},403);
        if (request.method === "GET" && !match[1]) return json(await catalog(env));
        if (request.method === "POST") {
          if (request.headers.get("Origin") !== url.origin) return json({error:"Origen inválido."},403);
          return await saveProduct(request,env,match[1]);
        }
        return json({error:"Método no permitido."},405);
      }
      if (mediaRoute.test(pathname)) {
        const object = await env.BUCKET.get(pathname.slice(7));
        if (!object) return new Response("Foto no encontrada",{status:404});
        return new Response(object.body,{headers:{"Content-Type":object.httpMetadata.contentType,
          "X-Content-Type-Options":"nosniff","Cache-Control":"public, max-age=31536000, immutable"}});
      }
      if (Object.hasOwn(assets,pathname)) {
        const {type,data} = assets[pathname];
        return new Response(Uint8Array.from(atob(data), char => char.charCodeAt(0)),{headers:{"Content-Type":type,"Cache-Control":"public, max-age=86400"}});
      }
      return new Response("Página no encontrada",{status:404});
    } catch (error) {
      console.error(error);
      return json({error:"No se pudo completar la operación. Inténtalo de nuevo."},500);
    }
  }
};
