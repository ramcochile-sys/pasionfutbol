const noStore = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"};
const sessionCookie = "__Host-pasion-admin";
const sessionDuration = 8 * 60 * 60;
const attemptWindow = 15 * 60;
const encoder = new TextEncoder();
const mediaRoute = /^\/media\/[a-f0-9-]+$/;
const productRoute = /^\/api\/admin\/products(?:\/([a-z0-9-]+))?$/;
const maxPhotoSize = 4 * 1024 * 1024;
const sizeOptions = ["4", "6", "8", "10", "12", "14", "16", "XS", "S", "M", "L", "XL", "XXL"];

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

function redirectAdmin(token, maxAge) {
  return new Response(null, {status:303, headers:{...noStore, Location:"/admin",
    "Set-Cookie":`${sessionCookie}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`}});
}

function loginError(message, status) {
  return html(login.replace("<!-- LOGIN_ERROR -->", `<p role="alert">${message}</p>`), status);
}

async function authenticate(request, env) {
  if (!env.CATALOG_ADMIN_USER || !env.CATALOG_ADMIN_HASH || !env.CATALOG_ADMIN_SALT) {
    return loginError("El acceso de administración todavía no está configurado.", 503);
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
  const username = form.get("username");
  const password = form.get("password");
  if (typeof password !== "string" || password.length > 256 || typeof username !== "string" || username.length > 100) {
    return loginError("Usuario o contraseña incorrectos.",401);
  }
  const key = await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const candidate = hex(await crypto.subtle.deriveBits({
    name:"PBKDF2", hash:"SHA-256", salt:encoder.encode(env.CATALOG_ADMIN_SALT), iterations:100000
  },key,256));
  let mismatched = env.CATALOG_ADMIN_HASH.length ^ 64;
  for (let i = 0; i < 64; i++) mismatched |= candidate.charCodeAt(i) ^ env.CATALOG_ADMIN_HASH.charCodeAt(i);
  if (username !== env.CATALOG_ADMIN_USER || mismatched !== 0) return loginError("Usuario o contraseña incorrectos.",401);

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM catalog_login_attempts WHERE expires_at <= ? OR address_hash = ?").bind(now,address),
    env.DB.prepare("DELETE FROM catalog_admin_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO catalog_admin_sessions (token_hash, expires_at) VALUES (?,?)").bind(await hash(token),now + sessionDuration)
  ]);
  return redirectAdmin(token,sessionDuration);
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

const webpayBase = "https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions";
async function webpayRequest(env, path = "", method = "GET", body) {
  const response = await fetch(webpayBase + path, {
    method, headers: {"Tbk-Api-Key-Id":env.TBK_API_KEY_ID, "Tbk-Api-Key-Secret":env.TBK_API_KEY_SECRET, "Content-Type":"application/json"},
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("Webpay no disponible");
  return response.json();
}
async function createWebpay(request, env, url) {
  if (request.method !== "POST") return json({error:"Método no permitido."},405);
  if (request.headers.get("Origin") !== url.origin) return json({error:"Origen inválido."},403);
  if (!env.TBK_API_KEY_ID || !env.TBK_API_KEY_SECRET) return json({error:"Webpay no está configurado."},503);
  const raw = await request.text();
  if (raw.length > 16000) return json({error:"Pedido demasiado grande."},413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({error:"Pedido inválido."},400); }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) return json({error:"Revisa tu carrito."},400);
  const available = (await catalog(env)).filter(productWithPhoto);
  const items = [];
  for (const line of body.items) {
    const product = available.find(item => item.id === line.id);
    if (!product || !product.sizes.includes(line.size) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return json({error:"Revisa las tallas y cantidades de tu carrito."},400);
    items.push({id:product.id,name:product.name,size:line.size,quantity:line.quantity,price:product.price,categories:product.categories});
  }
  const shipping = body.shipping;
  const required = ["name","email","phone","address","commune","region"];
  if (!shipping || required.some(key => typeof shipping[key] !== "string" || !shipping[key].trim() || shipping[key].length > 250)) return json({error:"Completa los datos de envío."},400);
  const cleanShipping = Object.fromEntries(required.map(key => [key,shipping[key].trim()]));
  const quote = shippingQuote(items, cleanShipping.region, cleanShipping.commune);
  if (!quote) return json({error:"Este envío requiere cotización por WhatsApp."},400);
  const reference = typeof shipping["address-extra"] === "string" ? shipping["address-extra"].trim().slice(0,250) : "";
  Object.assign(cleanShipping, quote, {reference});
  const pricing = orderPricing(items);
  const {subtotal, discount} = pricing;
  const amount = pricing.amount + quote.price;
  if (body.quotedTotal !== amount) return json({error:"El total cambió. Recarga el catálogo antes de volver a pagar."},409);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99999999) return json({error:"Total inválido."},400);
  const buy_order = "PF" + crypto.randomUUID().replaceAll("-", "").slice(0,24);
  const session_id = crypto.randomUUID();
  const result = await webpayRequest(env,"","POST",{buy_order,session_id,amount,return_url:url.origin + "/webpay/return"});
  const destination = new URL(result.url);
  if (destination.protocol !== "https:" || destination.hostname !== "webpay3gint.transbank.cl" || typeof result.token !== "string") throw new Error("Respuesta Webpay inválida");
  const record = {buy_order,session_id,amount,subtotal,discount,items,shipping:cleanShipping,status:"pending",createdAt:Date.now()};
  await env.BUCKET.put("webpay-orders/" + await hash(result.token),JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return json({url:result.url,token:result.token});
}
function paymentPage(title, message, status = 200, giftId = "") {
  return html(`<!doctype html><html lang="es-CL"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Pasión Fútbol</title><style>body{font-family:Helvetica,Arial,sans-serif;background:#090e18;color:#f5f8ff;margin:0;padding:48px 24px}main{max-width:600px;margin:auto}h1{color:#f5f8ff}a{display:inline-block;padding:14px 20px;background:#ffcb32;color:#171100;text-decoration:none;font-weight:bold;margin-top:20px}p{line-height:1.6}</style><main><strong>Pasión Fútbol · Compra segura</strong><ol aria-label="Pasos de compra" style="display:flex;flex-wrap:wrap;gap:1.5rem;padding-left:1.3rem"><li>Carrito</li><li>Datos de envío</li><li aria-current="step" style="color:#ffcb32;font-weight:bold">Pago</li></ol><p>WEBPAY · MODO DE PRUEBAS</p><h1>${title}</h1><p>${message}</p>${giftId ? `<p><a href="/regalo/${giftId}" download>Descargar mi ebook de fútbol</a></p>` : ""}<a href="/">Volver a la tienda</a></main></html>`,status);
}
async function returnWebpay(request, env, url) {
  const params = request.method === "POST" ? new URLSearchParams(await request.text()) : url.searchParams;
  const token = params.get("token_ws");
  if (!token) return paymentPage("Pago cancelado o expirado","El pago de prueba no se completó. Tu carrito sigue disponible para volver a intentarlo.");
  if (!/^[a-zA-Z0-9_-]{10,256}$/.test(token)) return paymentPage("Pago no encontrado","No se pudo verificar este pago.",400);
  const giftId = await hash(token);
  const key = "webpay-orders/" + giftId;
  const stored = await env.BUCKET.get(key);
  if (!stored) return paymentPage("Pago no encontrado","No se pudo verificar este pago.",404);
  const record = await stored.json();
  const confirmation = () => paymentPage("Pago de prueba aprobado",`Pedido ${record.buy_order}. Total: $${record.amount.toLocaleString("es-CL")}. Esta operación corresponde al ambiente de pruebas y no realiza un cobro real.`,200,giftId);
  if (record.status === "paid_test") return confirmation();
  let result;
  try {
    result = await webpayRequest(env,"/" + encodeURIComponent(token));
    if (result.status === "INITIALIZED" && Date.now() - record.createdAt < 24*60*60*1000) result = await webpayRequest(env,"/" + encodeURIComponent(token),"PUT");
  } catch {
    return paymentPage("No pudimos verificar el pago","Recarga esta página para consultar el resultado antes de volver a pagar. Tu pedido no se marcará como pagado hasta recibir la confirmación de Transbank.",503);
  }
  const approved = result.status === "AUTHORIZED" && result.response_code === 0 && result.amount === record.amount && result.buy_order === record.buy_order && result.session_id === record.session_id;
  record.status = approved ? "paid_test" : "not_approved";
  record.checkedAt = Date.now();
  await env.BUCKET.put(key,JSON.stringify(record),{httpMetadata:{contentType:"application/json"}});
  return approved ? confirmation() : paymentPage("Pago no aprobado","Transbank no confirmó el pago de prueba. Tu carrito sigue disponible para volver a intentarlo.");
}

async function downloadGift(request, env, pathname) {
  if (request.method !== "GET") return json({error:"Método no permitido."},405);
  const giftId = pathname.slice("/regalo/".length);
  if (!/^[a-f0-9]{64}$/.test(giftId)) return json({error:"Regalo no disponible."},404);
  const stored = await env.BUCKET.get("webpay-orders/" + giftId);
  if (!stored || (await stored.json()).status !== "paid_test") return json({error:"Regalo no disponible."},404);
  return new Response(Uint8Array.from(atob(ebook), byte => byte.charCodeAt(0)), {headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":'attachment; filename="Pasion_Futbol_Noviembre_2026.pdf"',
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
  const paid = records.filter(record => record?.status === "paid_test").sort((a,b) => b.createdAt-a.createdAt);
  const cards = paid.map(record => {
    const data = record.shipping;
    const contents = record.items.map(item => `${item.quantity} × ${escape(item.name)} (talla ${escape(item.size)})`).join("<br>");
    return `<article><h2>${escape(record.buy_order)}</h2>
      <p><strong>Pago de prueba aprobado</strong> · ${new Date(record.createdAt).toLocaleDateString("es-CL",{timeZone:"America/Santiago"})}</p>
      <p>${contents}</p>
      <p>${escape(data.name)} · ${escape(data.phone)} · ${escape(data.email)}<br>${escape(data.address)}${data.reference ? ", "+escape(data.reference) : ""}<br>${escape(data.commune)}, ${escape(data.region)}</p>
      <p>${data.carrier ? `${escape(data.carrier)} a domicilio · Talla ${escape(data.size)} · Envío: $${escape(data.price?.toLocaleString("es-CL"))}` : "Pedido anterior sin tarifa de envío registrada"}</p></article>`;
  }).join("");
  const next = page.truncated ? `<p><a href="?cursor=${encodeURIComponent(page.cursor)}">Siguiente página</a></p>` : "";
  return html(`<!doctype html><html lang="es-CL"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedidos · Pasión Fútbol</title><style>body{background:#100b1f;color:#f5f2fa;font:16px/1.5 system-ui;margin:auto;padding:24px;max-width:900px}a{color:#9af7ff}article{border:1px solid #4c4165;border-radius:12px;padding:12px 18px;margin:14px 0;overflow-wrap:anywhere}h2{font-size:1.2rem}</style><main><a href="/admin">Volver a productos</a><h1>Pedidos y envíos</h1><p>Los pedidos actuales corresponden a Webpay de prueba. Usa los datos solo para practicar la generación manual de etiquetas.</p>${cards || "<p>No hay pagos aprobados en esta página.</p>"}${next}</main></html>`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const {pathname} = url;
    const match = pathname.match(productRoute);
    try {
      if (pathname.startsWith("/regalo/")) return await downloadGift(request,env,pathname);
      if (pathname === "/api/webpay/create") return await createWebpay(request,env,url);
      if (pathname === "/webpay/return") return await returnWebpay(request,env,url);
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
        const serialized = JSON.stringify(storefrontProducts).replaceAll("<", "\\u003c");
        return html(storefront.replace("/* CATALOG_DATA */ []", () => serialized));
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
        return redirectAdmin("",0);
      }
      if (pathname === "/admin/pedidos") {
        if (request.method !== "GET") return json({error:"Método no permitido."},405);
        if (!await isAdmin(request,env)) return new Response(null,{status:303,headers:{...noStore,Location:"/admin"}});
        return await orderDispatchPage(env,url);
      }
      if (pathname === "/admin" || pathname === "/admin/") {
        return html(await isAdmin(request,env) ? admin : login);
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
