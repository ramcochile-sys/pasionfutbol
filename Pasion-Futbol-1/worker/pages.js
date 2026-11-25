// ---------- Páginas del resultado del pago, revista interactiva, producto de prueba y avisos por correo ----------
// Se concatena antes de index.js en el build (usa `revista`, `metaPixelSnippet` y `purchaseEvent`).

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
})[char]);
const clp = value => "$" + Number(value || 0).toLocaleString("es-CL");

// Producto oculto para probar los pagos reales con el monto mínimo. Aparece al tocar 5 veces la pelota del logo.
function testProduct(env) {
  const price = Number.parseInt(env.PRUEBA_PRECIO || "1000", 10);
  return {
    id:"prueba-pagos", name:"Producto de prueba de pagos", price:Number.isSafeInteger(price) && price > 0 ? price : 1000,
    position:999999, categories:["prueba"], sizes:["Única"], hidden:true,
    description:"Solo para probar Flow y Mercado Pago con el monto mínimo. No se despacha.",
    image:"/pasion-futbol.jpg", cartImage:"/pasion-futbol.jpg"
  };
}

const pageFonts = `@font-face{font-family:"DM Sans";src:url("/dm-sans-latin-wght-normal.woff2") format("woff2");font-weight:100 1000;font-display:swap}
@font-face{font-family:"Barlow Condensed";src:url("/barlow-condensed-latin-800-normal.woff2") format("woff2");font-weight:800;font-display:swap}`;
const pageTokens = `:root{--page:#090e18;--ink:#f5f8ff;--muted:#b9c6da;--line:#344765;--hero:#050910;--surface:#101a2b;--accent:#ffcb32;--accent-ink:#171100;--blue:#76c8ff;--ok:#82e9a7;--bad:#ff8f8f;color-scheme:dark}`;
const brandMark = `<a class="pf-brand" href="/"><span class="pf-ball"><img src="/pasion-futbol.jpg" alt="" width="828" height="1792"></span><span>Pasión <strong>Fútbol</strong></span></a>`;

const statusIcons = {
  ok:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pending:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  fail:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  error:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 21 19.5H3z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M12 9.5v4.5M12 16.6v.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};

function paymentKind(title, status, giftId) {
  if (giftId) return "ok";
  if (/pendiente/i.test(title)) return "pending";
  if (status >= 400 || /verificar|configurado|no encontrado/i.test(title)) return "error";
  return "fail";
}

function orderSummary(record) {
  if (!record) return "";
  const lines = record.items.map(item => `<li><span><b>${escapeHtml(item.name)}</b><small>Talla ${escapeHtml(item.size)} · ${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"}</small></span><span>${clp(item.price * item.quantity)}</span></li>`).join("");
  const ship = record.shipping || {};
  const rows = [
    record.discount ? `<div><dt>Descuento</dt><dd>−${clp(record.discount)}</dd></div>` : "",
    `<div><dt>Envío${ship.carrier ? " · " + escapeHtml(ship.carrier) : ""}</dt><dd>${ship.price ? clp(ship.price) : "Gratis"}</dd></div>`,
    `<div class="pf-total"><dt>Total pagado</dt><dd>${clp(record.amount)}</dd></div>`
  ].join("");
  const address = [ship.address, ship.reference, ship.commune, ship.region].filter(Boolean).map(escapeHtml).join(", ");
  return `<section class="pf-card" aria-labelledby="pf-order-title">
    <h2 id="pf-order-title">Tu pedido <span>${escapeHtml(record.buy_order)}</span></h2>
    <ul class="pf-lines">${lines}</ul><dl class="pf-totals">${rows}</dl>
    ${address ? `<p class="pf-ship"><b>Lo enviamos a</b>${escapeHtml(ship.name)} · ${address}</p>` : ""}
    ${ship.email ? `<p class="pf-ship"><b>Comprobante</b>Te llega a ${escapeHtml(ship.email)}</p>` : ""}
  </section>`;
}

function magazineCard(giftId) {
  const start = revista.indexOf('<div class="rv"');
  const cover = revista.slice(start, revista.indexOf('<section class="page', revista.indexOf('<section class="page') + 10)).replace(' id="revista"', "") + "</div>";
  return `<section class="pf-card pf-gift" aria-labelledby="pf-gift-title">
    <a class="pf-book" href="/revista/${giftId}" aria-label="Abrir la revista"><div class="pf-book-cover">${cover}</div></a>
    <div class="pf-gift-copy">
      <h2 id="pf-gift-title">Tu revista de regalo</h2>
      <p>Resultados de la semana, lo que viene en Champions, LaLiga, Premier y Serie A con probabilidades, y la estrella 35 de Colo-Colo.</p>
      <div class="pf-actions"><a class="pf-button" href="/revista/${giftId}">Hojear la revista</a><a class="pf-button pf-ghost" href="/regalo/${giftId}" download>Descargar PDF</a></div>
    </div>
  </section>`;
}

function paymentPage(title, message, status = 200, giftId = "", label = "FLOW", record = null) {
  const kind = paymentKind(title, status, giftId);
  const provider = /MERCADO/i.test(label) ? "Mercado Pago" : "Flow";
  const actions = {
    ok:`<a class="pf-button pf-ghost" href="/">Volver a Pasión Fútbol</a>`,
    pending:`<button class="pf-button" type="button" onclick="location.reload()">Actualizar el estado</button><a class="pf-button pf-ghost" href="/">Volver a la tienda</a>`,
    fail:`<a class="pf-button" href="/#carrito">Volver a intentarlo</a><a class="pf-button pf-ghost" href="https://wa.me/56934974132">Escríbenos por WhatsApp</a>`,
    error:`<button class="pf-button" type="button" onclick="location.reload()">Volver a consultar</button><a class="pf-button pf-ghost" href="https://wa.me/56934974132">Escríbenos por WhatsApp</a>`
  }[kind];
  const hint = {
    ok:"",
    pending:`<p class="pf-hint">No vuelvas a pagar: apenas ${provider} confirme, tu pedido queda listo y te avisamos por correo.</p>`,
    fail:`<p class="pf-hint">No se hizo ningún cobro. Puedes intentar con otra tarjeta o elegir ${provider === "Flow" ? "Mercado Pago" : "Flow"} como medio de pago.</p>`,
    error:""
  }[kind];
  const steps = ["Carrito", "Datos de envío", "Pago", "Confirmación"].map((step, i) =>
    `<li${i === 3 ? ' aria-current="step"' : ""}${i < 3 || kind === "ok" ? ' class="done"' : ""}>${step}</li>`).join("");
  return html(`<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Pasión Fútbol</title>${metaPixelSnippet()}${purchaseEvent(record)}
<style>${pageFonts}${pageTokens}${revistaCoverCss}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(90% 55% at 50% -10%,#14305f 0%,var(--page) 60%) fixed,var(--page);color:var(--ink);font:16px/1.5 "DM Sans",system-ui,sans-serif}
a{color:inherit}header{border-bottom:1px solid var(--line);background:#050910cc;backdrop-filter:blur(8px)}
.pf-wrap{width:min(92vw,880px);margin:auto}header .pf-wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:66px}
.pf-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font:italic 800 clamp(22px,4vw,30px)/1 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.02em}
.pf-brand strong{color:var(--accent)}.pf-ball{display:block;width:40px;height:40px;border-radius:50%;overflow:hidden;box-shadow:0 0 12px #007dff60}.pf-ball img{width:100%;height:100%;object-fit:cover;object-position:50% 30%}
header small{color:var(--muted);font-size:13px}
.pf-steps{list-style:none;display:flex;gap:6px;padding:0;margin:28px 0 0;font-size:13px;color:var(--muted)}
.pf-steps li{flex:1;padding-top:8px;border-top:3px solid var(--line)}.pf-steps li.done{border-color:var(--accent);color:var(--ink)}.pf-steps li[aria-current]{font-weight:700}
main{padding-bottom:56px}.pf-hero{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;margin:34px 0 26px}
.pf-icon{display:grid;place-items:center;width:64px;height:64px;border-radius:50%}.pf-icon svg{width:34px;height:34px}
.ok .pf-icon{background:var(--accent);color:var(--accent-ink)}.pending .pf-icon{background:#1e3a66;color:var(--blue)}.fail .pf-icon{background:#4a1d26;color:var(--bad)}.error .pf-icon{background:#4a3a12;color:var(--accent)}
.ok .pf-icon{animation:pf-pop .5s cubic-bezier(.2,1.4,.4,1) both}@keyframes pf-pop{from{transform:scale(.4);opacity:0}}
h1{margin:0;font:800 clamp(40px,7vw,64px)/.92 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.01em}
.pf-lede{grid-column:1/-1;margin:0;max-width:62ch;color:#dbe4f3;font-size:17px}.pf-provider{color:var(--muted);font-size:13px;margin:0 0 6px}
.pf-hint{margin:-8px 0 22px;padding:12px 16px;border-left:3px solid var(--accent);background:var(--surface);color:#dbe4f3;max-width:62ch}
.pf-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 26px}
.pf-button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border:1px solid transparent;border-radius:4px;background:var(--accent);color:var(--accent-ink);font:800 16px/1 "DM Sans",sans-serif;text-decoration:none;cursor:pointer}
.pf-button.pf-ghost{background:transparent;color:var(--ink);border-color:var(--line)}.pf-button:hover{filter:brightness(1.08)}
:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
.pf-grid{display:grid;gap:18px}.pf-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:22px}
.pf-card h2{margin:0 0 14px;font:800 26px/1 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase}.pf-card h2 span{color:var(--muted);font:500 14px "DM Sans",sans-serif;text-transform:none;margin-left:6px}
.pf-lines{list-style:none;margin:0;padding:0}.pf-lines li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
.pf-lines small{display:block;color:var(--muted);font-size:13px}.pf-totals{margin:10px 0 0}.pf-totals div{display:flex;justify-content:space-between;padding:4px 0;color:var(--muted)}.pf-totals dd{margin:0;color:var(--ink)}
.pf-totals .pf-total{margin-top:6px;padding-top:10px;border-top:1px solid var(--line);color:var(--ink);font-weight:700}.pf-total dd{font:800 26px/1 "Barlow Condensed",sans-serif;color:var(--accent)}
.pf-success{isolation:isolate;text-align:center;display:grid;justify-items:center;gap:.8rem;margin:1.5rem 0;padding:clamp(1.6rem,6vw,4rem) 6%;border:1px solid #4e6b83;border-radius:1.25rem;overflow:hidden;background:radial-gradient(ellipse at top,#28535e77,transparent 62%),linear-gradient(#0913268a,#081224f2),url("/estadio-champions.webp") center 38% / cover}
.pf-success .pf-icon{width:4rem;height:4rem;background:#c1f2cf;color:#0a552c;box-shadow:0 0 0 .4rem #82e9a723}
.pf-success .pf-provider{color:#c1f2cf;font-weight:800;margin:.3rem 0 0}
.pf-success h1{text-transform:none;line-height:.96;font-size:clamp(2.4rem,7vw,4.5rem);max-width:17ch;text-wrap:balance}
.pf-success .pf-lede{font-size:clamp(.9rem,2.8vw,1.05rem);max-width:47ch;text-wrap:pretty}
.pf-success .pf-button{border-radius:2rem}
.ok .pf-card{border-radius:1rem;padding:clamp(1rem,4vw,1.5rem)}
.ok .pf-return{justify-content:center;margin:1.5rem 0 0}

.pf-ship{margin:14px 0 0;font-size:14px;color:#dbe4f3}.pf-ship b{display:block;color:var(--muted);font-weight:500;font-size:13px}
.pf-gift{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:26px;align-items:center;background:linear-gradient(135deg,#132a52,#0d1a30 60%);overflow:hidden}
.pf-gift p{color:#dbe4f3;margin:0 0 18px}.pf-gift .pf-actions{margin:0}
.pf-book{display:block;perspective:900px;text-decoration:none}.pf-book-cover{position:relative;aspect-ratio:148/210;transform:rotateY(-18deg) rotateX(4deg);transform-origin:left center;transition:transform .5s ease;border-radius:2px 6px 6px 2px;box-shadow:18px 22px 40px #000a,inset 6px 0 10px -4px #0008;overflow:hidden;background:#06112a}
.pf-book:hover .pf-book-cover,.pf-book:focus-visible .pf-book-cover{transform:rotateY(-6deg)}
.pf-book-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#0007 0,#0000 7%,#fff1 9%,#0000 14%);pointer-events:none}
.pf-book-cover .rv{position:absolute;top:0;left:0;transform-origin:0 0}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px;padding:20px 0}
@media(max-width:620px){.pf-gift{grid-template-columns:1fr}.pf-book{width:min(60vw,220px);margin:auto}.pf-steps{font-size:11px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body class="${kind}">
<header><div class="pf-wrap">${brandMark}<small>Compra segura</small></div></header>
<main class="pf-wrap"><ol class="pf-steps" aria-label="Pasos de compra">${steps}</ol>
${kind === "ok" ? `
  <section class="pf-success" aria-labelledby="pf-confirmation">
    <span class="pf-icon">${statusIcons.ok}</span>
    <p class="pf-provider">Pago aprobado · ${provider}</p>
    <h1 id="pf-confirmation">¡Felicidades, tu pedido está confirmado!</h1>
    <p class="pf-lede">Gracias por confiar en Pasión Fútbol. Te contactaremos para coordinar el envío de tu pedido.</p>
    <a class="pf-button" href="#pf-order-title">Ver resumen del pedido</a>
  </section>
  <div class="pf-grid">${orderSummary(record)}${magazineCard(giftId)}</div>
  <div class="pf-actions pf-return">${actions}</div>` : `
  <div class="pf-hero"><span class="pf-icon">${statusIcons[kind]}</span><div><p class="pf-provider">Pago con ${provider}</p><h1>${escapeHtml(title)}</h1></div><p class="pf-lede">${escapeHtml(message)}</p></div>
${hint}<div class="pf-actions">${actions}</div>` }
</main><footer><div class="pf-wrap">¿Dudas con tu compra? WhatsApp <a href="https://wa.me/56934974132">+56 9 3497 4132</a> · pasionfutbol.lat</div></footer>
<script>
document.querySelectorAll(".pf-book-cover").forEach(box => { const fit = () => { const rv = box.querySelector(".rv"); const page = rv && rv.querySelector(".page"); if (page) rv.style.transform = "scale(" + box.clientWidth / page.offsetWidth + ")"; }; fit(); addEventListener("resize", fit); });
${kind === "ok" ? 'try{localStorage.removeItem("pasionfutbol.lat:bag:v1")}catch(e){}' : ""}
</script></body></html>`, status);
}

// Estilos de la revista limitados a la portada (para la miniatura de la página de pago aprobado).
const revistaCoverCss = revista.slice(revista.indexOf("<style>") + 7, revista.indexOf("</style>"));

// ---------- Revista interactiva (libro que se hojea) ----------
async function magazinePage(request, env, pathname) {
  if (request.method !== "GET") return json({error:"Método no permitido."},405);
  const giftId = pathname.slice("/revista/".length);
  if (!/^[a-f0-9]{64}$/.test(giftId)) return json({error:"Revista no disponible."},404);
  const stored = await env.BUCKET.get("webpay-orders/" + giftId);
  if (!stored || !["paid_test","paid"].includes((await stored.json()).status)) return json({error:"Revista no disponible."},404);
  return html(`<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Revista oficial · Pasión Fútbol</title>
<style>${pageFonts}${pageTokens}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:flex;flex-direction:column;background:radial-gradient(80% 60% at 50% 40%,#18305a 0%,#070d1a 70%);color:var(--ink);font:15px/1.4 "DM Sans",system-ui,sans-serif;overflow:hidden}
.pf-brand{display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:inherit;font:italic 800 24px/1 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase}.pf-brand strong{color:var(--accent)}
.pf-ball{display:block;width:34px;height:34px;border-radius:50%;overflow:hidden}.pf-ball img{width:100%;height:100%;object-fit:cover;object-position:50% 30%}
.bar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #ffffff14;background:#050910b3}
.bar .sp{flex:1}.tool{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:42px;min-height:42px;padding:0 12px;border:1px solid var(--line);border-radius:4px;background:#0d1729;color:var(--ink);font:600 14px "DM Sans",sans-serif;text-decoration:none;cursor:pointer}
.tool svg{width:18px;height:18px}.tool.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent;font-weight:800}.tool[aria-pressed="false"] .on,.tool[aria-pressed="true"] .off{display:none}
:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
.stage{position:relative;flex:1;min-height:0;overflow:hidden}.stage.zoomed{overflow:auto;cursor:grab}
.canvas{position:relative;margin:auto}.book{position:absolute;top:0;left:0;transform-origin:0 0}
.spread{position:relative;perspective:2800px;transition:transform .7s cubic-bezier(.3,.7,.2,1)}
.leaf{position:absolute;top:0;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.35,.6,.2,1);will-change:transform}
.face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;background:#fff}
.leaf.shown .face{box-shadow:0 18px 40px #0007}
.face.back{transform:rotateY(180deg)}.face::after{content:"";position:absolute;inset:0;pointer-events:none}
.face.front::after{background:linear-gradient(90deg,#0003 0,#0000 6%)}.face.back::after{background:linear-gradient(270deg,#0003 0,#0000 6%)}
.face.blank{background:#e9edf3}.face .rv{position:absolute;inset:0}
.nav{position:absolute;top:50%;translate:0 -50%;z-index:5;width:48px;height:72px;border:0;border-radius:4px;background:#0d172999;color:#fff;cursor:pointer}.nav svg{width:26px;height:26px}.nav:disabled{opacity:.25;cursor:default}
.nav.prev{left:10px}.nav.next{right:10px}
.foot{display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 12px 12px;color:var(--muted);font-size:13px}
.hint{opacity:.8}@media(max-width:700px){.bar .label,.bar .pf-brand>span:last-child{display:none}.bar{gap:8px;padding:8px 10px}.hint{display:none}.nav{width:38px;height:60px}}
@media(prefers-reduced-motion:reduce){.leaf,.spread{transition:none}}
</style><style>${revista.slice(revista.indexOf("<style>") + 7, revista.indexOf("</style>"))}</style></head><body>
<div class="bar">${brandMark}<span class="sp"></span>
<button class="tool" id="zoom-out" type="button" aria-label="Alejar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11h6M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
<button class="tool" id="zoom-in" type="button" aria-label="Acercar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11h6M11 8v6M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
<button class="tool" id="sound" type="button" aria-pressed="true" aria-label="Sonido de las páginas"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z" fill="currentColor"/><path class="on" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="off" d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
<button class="tool" id="full" type="button" aria-label="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
<a class="tool primary" href="/regalo/${giftId}" download><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="label">Descargar PDF</span></a>
</div>
<div class="stage" id="stage"><button class="nav prev" id="prev" type="button" aria-label="Página anterior"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div class="canvas" id="canvas"><div class="book" id="book"><div class="spread" id="spread"></div></div></div>
<button class="nav next" id="next" type="button" aria-label="Página siguiente"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
<div class="foot"><span id="status" aria-live="polite"></span><span class="hint">· Toca la hoja izquierda o derecha, o usa las flechas del teclado</span></div>
<template id="source">${revista.slice(revista.indexOf("</style>") + 8)}</template>
<script>
(() => {
  const src = document.getElementById("source").content.querySelectorAll(".page");
  const spread = document.getElementById("spread"), book = document.getElementById("book"), canvas = document.getElementById("canvas"), stage = document.getElementById("stage");
  const W = 559.37, H = 793.7, total = src.length;
  let mode, leaves = [], index = 0, zoom = 1, sound = true, audio;
  const pageEl = node => { const wrap = document.createElement("div"); wrap.className = "rv"; wrap.append(node.cloneNode(true)); return wrap; };
  function build() {
    mode = innerWidth >= 760 ? "double" : "single";
    spread.replaceChildren(); leaves = [];
    const cols = mode === "double" ? 2 : 1;
    spread.style.width = W * cols + "px"; spread.style.height = H + "px";
    const step = mode === "double" ? 2 : 1;
    for (let i = 0; i < total; i += step) {
      const leaf = document.createElement("div"); leaf.className = "leaf";
      leaf.style.cssText = "width:" + W + "px;height:" + H + "px;left:" + (mode === "double" ? W : 0) + "px;transform-origin:left center";
      const front = document.createElement("div"); front.className = "face front"; front.append(pageEl(src[i]));
      const back = document.createElement("div"); back.className = "face back";
      if (mode === "double" && src[i + 1]) back.append(pageEl(src[i + 1])); else back.classList.add("blank");
      leaf.append(front, back); spread.append(leaf); leaves.push(leaf);
    }
    index = Math.min(index, leaves.length - (mode === "single" ? 1 : 0));
    layout(); paint(false);
  }
  function layout() {
    const cols = mode === "double" ? 2 : 1;
    const fit = Math.min((stage.clientWidth - (innerWidth < 700 ? 24 : 120)) / (W * cols), (stage.clientHeight - 24) / H);
    const scale = Math.max(.2, fit) * zoom;
    book.style.transform = "scale(" + scale + ")";
    canvas.style.width = W * cols * scale + "px"; canvas.style.height = H * scale + "px";
    canvas.style.top = Math.max(0, (stage.clientHeight - H * scale) / 2) + "px";
    stage.classList.toggle("zoomed", zoom > 1);
  }
  function paint(animate = true, moving = -1) {
    const n = leaves.length;
    leaves.forEach((leaf, i) => {
      const flipped = i < index;
      leaf.style.transform = flipped ? "rotateY(-180deg)" : "rotateY(0deg)";
      if (mode === "single") leaf.style.opacity = flipped ? "0" : "1", leaf.style.transitionProperty = "transform,opacity";
      leaf.style.zIndex = i === moving ? 3 * n : flipped ? i + 1 : 2 * n - i;
      const shown = i === moving || (mode === "double" ? (i === index || i === index - 1) : i === index);
      leaf.classList.toggle("shown", shown);
      leaf.inert = !shown || i === moving;
    });
    if (moving >= 0) setTimeout(() => paint(false), 900);
    if (mode === "double") spread.style.transform = index === 0 ? "translateX(-25%)" : index === leaves.length ? "translateX(25%)" : "none";
    else spread.style.transform = "none";
    const first = mode === "double" ? Math.max(1, index * 2) : index + 1;
    const last = mode === "double" ? Math.min(total, index * 2 + 1) : first;
    document.getElementById("status").textContent = (first === last ? "Página " + first : "Páginas " + first + " y " + last) + " de " + total;
    document.getElementById("prev").disabled = index === 0;
    document.getElementById("next").disabled = index >= leaves.length - (mode === "single" ? 1 : 0);
  }
  function rustle() {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const len = audio.sampleRate * .45, buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (0.35 + 0.65 * Math.abs(Math.sin(t * 38))); }
      const s = audio.createBufferSource(); s.buffer = buf;
      const f = audio.createBiquadFilter(); f.type = "bandpass"; f.Q.value = .7;
      f.frequency.setValueAtTime(900, audio.currentTime); f.frequency.exponentialRampToValueAtTime(3800, audio.currentTime + .4);
      const g = audio.createGain(); g.gain.setValueAtTime(.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(.5, audio.currentTime + .05); g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .45);
      s.connect(f).connect(g).connect(audio.destination); s.start();
    } catch {}
  }
  function go(delta) {
    const max = leaves.length - (mode === "single" ? 1 : 0);
    const next = Math.max(0, Math.min(max, index + delta));
    if (next === index) return;
    const moving = delta > 0 ? index : next;
    index = next; rustle(); paint(true, moving);
  }
  document.getElementById("prev").onclick = () => go(-1);
  document.getElementById("next").onclick = () => go(1);
  spread.addEventListener("click", event => {
    if (zoom > 1 || swiped || event.target.closest("a")) return;
    const box = spread.getBoundingClientRect();
    const mid = mode === "double" ? (index === 0 ? box.left + box.width / 2 : box.left + box.width / 2) : box.left + box.width * .35;
    go(event.clientX < mid && index > 0 ? -1 : 1);
  });
  let startX = null, swiped = false;
  stage.addEventListener("pointerdown", e => { startX = zoom > 1 ? null : e.clientX; swiped = false; });
  stage.addEventListener("pointerup", e => { if (startX !== null && Math.abs(e.clientX - startX) > 50) { swiped = true; go(e.clientX < startX ? 1 : -1); } startX = null; });
  addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
    if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    if (e.key === "Home") go(-index);
    if (e.key === "End") go(leaves.length);
  });
  const setZoom = z => { zoom = Math.max(1, Math.min(3, z)); layout(); };
  document.getElementById("zoom-in").onclick = () => setZoom(zoom + .5);
  document.getElementById("zoom-out").onclick = () => setZoom(zoom - .5);
  stage.addEventListener("dblclick", () => setZoom(zoom > 1 ? 1 : 2));
  const soundBtn = document.getElementById("sound");
  soundBtn.onclick = () => { sound = !sound; soundBtn.setAttribute("aria-pressed", String(sound)); };
  document.getElementById("full").onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {});
  let lastMode;
  addEventListener("resize", () => { const m = innerWidth >= 760 ? "double" : "single"; if (m !== lastMode) { if (lastMode) index = 0; lastMode = m; build(); } else layout(); });
  lastMode = innerWidth >= 760 ? "double" : "single";
  document.fonts.ready.then(build); build();
})();
</script></body></html>`);
}

// ---------- Aviso por correo de pedido pagado (Resend: https://resend.com) ----------
// Variables: RESEND_API_KEY (obligatoria para enviar), PEDIDOS_CORREO_DE (remitente verificado en Resend)
// y PEDIDOS_CORREO_PARA (destinatarios separados por coma).
async function notifyPaidOrder(env, record) {
  if (!env.RESEND_API_KEY || record.notifiedAt) return;
  const to = String(env.PEDIDOS_CORREO_PARA || "ramcochile@gmail.com,antutito93@gmail.com").split(",").map(value => value.trim()).filter(Boolean);
  const from = env.PEDIDOS_CORREO_DE || "Pasión Fútbol <pedidos@pasionfutbol.lat>";
  const ship = record.shipping || {};
  const provider = record.provider === "mercadopago" ? "Mercado Pago" : "Flow";
  const lines = record.items.map(item => `<tr><td style="padding:6px 0;border-bottom:1px solid #e3e8f0">${item.quantity} × ${escapeHtml(item.name)} <span style="color:#5b6b86">· talla ${escapeHtml(item.size)}</span></td><td style="padding:6px 0;border-bottom:1px solid #e3e8f0;text-align:right">${clp(item.price * item.quantity)}</td></tr>`).join("");
  const body = `<div style="font-family:Arial,sans-serif;color:#0b1b36;max-width:560px">
    <h2 style="margin:0 0 4px">Nuevo pedido pagado: ${escapeHtml(record.buy_order)}</h2>
    <p style="margin:0 0 16px;color:#5b6b86">${provider} · ${new Date(record.checkedAt || Date.now()).toLocaleString("es-CL",{timeZone:"America/Santiago"})}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${lines}
      ${record.discount ? `<tr><td style="padding:6px 0">Descuento</td><td style="text-align:right">−${clp(record.discount)}</td></tr>` : ""}
      <tr><td style="padding:6px 0">Envío ${escapeHtml(ship.carrier || "")}</td><td style="text-align:right">${ship.price ? clp(ship.price) : "Gratis"}</td></tr>
      <tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="text-align:right;font-weight:bold;font-size:18px">${clp(record.amount)}</td></tr></table>
    <h3 style="margin:20px 0 6px">Despacho</h3>
    <p style="margin:0;line-height:1.5">${escapeHtml(ship.name)}<br>${escapeHtml(ship.phone)} · ${escapeHtml(ship.email)}<br>${escapeHtml(ship.address)}${ship.reference ? ", " + escapeHtml(ship.reference) : ""}<br>${escapeHtml(ship.commune)}, ${escapeHtml(ship.region)}</p>
  </div>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{Authorization:"Bearer " + env.RESEND_API_KEY, "Content-Type":"application/json", "Idempotency-Key":"pedido-" + record.buy_order},
      body:JSON.stringify({from, to, reply_to:ship.email || undefined, subject:`Pedido pagado ${record.buy_order} · ${clp(record.amount)}`, html:body}),
      signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) { console.error("Resend respondió", response.status, (await response.text()).slice(0,300)); return; }
    record.notifiedAt = Date.now();
  } catch (error) { console.error("No se pudo enviar el aviso del pedido", error); }
}
