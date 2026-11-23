"""Genera la revista de regalo de Pasión Fútbol.

Lee datos.json y produce:
  - Pasion-Futbol-1/worker/revista.html  (páginas + estilos; la tienda la muestra como libro interactivo)
  - Pasion-Futbol-1/worker/Revista_Pasion_Futbol.pdf  (la misma revista para descargar)

Uso (desde la raíz del repo):  python3 scripts/revista/generar.py
Requiere Playwright con Chromium para el PDF.
"""
import html
import json
import pathlib
import shutil
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = json.loads((ROOT / "scripts/revista/datos.json").read_text())
OUT_HTML = ROOT / "Pasion-Futbol-1/worker/revista.html"
OUT_PDF = ROOT / "Pasion-Futbol-1/worker/Revista_Pasion_Futbol.pdf"

e = html.escape

CSS = r"""
@font-face{font-family:"PF Display";src:url("/barlow-condensed-latin-800-normal.woff2") format("woff2");font-weight:800;font-display:swap}
@font-face{font-family:"PF Text";src:url("/dm-sans-latin-wght-normal.woff2") format("woff2");font-weight:100 1000;font-display:swap}
.rv{--night:#06112a;--night-2:#0d1f45;--ink:#0b1b36;--soft:#5b6b86;--rule:#d9dfea;--paper:#ffffff;--tint:#eef3fb;--gold:#ffcb32;--home:#ffcb32;--draw:#c6cedb;--away:#2f7fd9;--grass:#1d8a55}
.rv .page{position:relative;width:148mm;height:210mm;overflow:hidden;background:var(--paper);color:var(--ink);font:400 9.6pt/1.45 "PF Text",system-ui,sans-serif;box-sizing:border-box;padding:15mm 13mm 14mm}
.rv .page *{box-sizing:border-box}
.rv h1,.rv h2,.rv h3,.rv .display{font-family:"PF Display","Arial Narrow",sans-serif;font-weight:800;line-height:.92;margin:0;letter-spacing:.005em}
.rv h2{font-size:34pt;text-transform:uppercase}
.rv h3{font-size:14pt;text-transform:uppercase;margin:6mm 0 2.5mm}
.rv p{margin:0 0 2.6mm}
.rv .lede{font-size:11pt;line-height:1.4;color:var(--ink);margin:3mm 0 5mm;max-width:100mm}
.rv .folio{position:absolute;left:13mm;right:13mm;bottom:7mm;display:flex;justify-content:space-between;font-size:7pt;color:var(--soft)}
.rv .folio b{font-family:"PF Display",sans-serif;font-size:9pt;color:var(--ink)}
.rv .section-mark{position:absolute;top:0;right:13mm;width:9mm;height:15mm;background:var(--gold)}
/* Portada */
.rv .cover{background:radial-gradient(120% 80% at 50% 18%,#173a7a 0%,var(--night-2) 38%,var(--night) 72%);color:#fff;padding:13mm}
.rv .pitch{position:absolute;inset:0;pointer-events:none}
.rv .cover .mast{position:relative;display:flex;align-items:center;gap:3mm}
.rv .cover .mast img{width:13mm;height:13mm;border-radius:50%;object-fit:cover;object-position:50% 30%;box-shadow:0 0 0 1.2mm rgba(255,203,50,.25)}
.rv .cover .mast span{font-family:"PF Display",sans-serif;font-size:19pt;font-style:italic;text-transform:uppercase;letter-spacing:.01em}
.rv .cover .mast strong{color:var(--gold)}
.rv .cover .issue{position:relative;margin-top:2.5mm;font-size:8pt;color:#b9c8e6}
.rv .cover h1{position:relative;margin-top:34mm;font-size:50pt;text-transform:uppercase;line-height:.9}
.rv .cover h1 span{display:block;color:var(--gold);font-size:150pt;line-height:.78;margin-left:-1.5mm}
.rv .cover .kicker{position:relative;margin-top:5mm;font-size:11.5pt;line-height:1.35;max-width:92mm;color:#e6edfa}
.rv .cover .teasers{position:absolute;left:13mm;right:13mm;bottom:13mm;display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;border-top:1px solid rgba(255,255,255,.25);padding-top:4mm}
.rv .cover .teasers b{display:block;font-family:"PF Display",sans-serif;font-size:15pt;text-transform:uppercase;color:#fff;line-height:1}
.rv .cover .teasers small{display:block;margin-top:1.2mm;font-size:7.4pt;color:#b9c8e6;line-height:1.35}
/* Índice */
.rv .toc{list-style:none;margin:8mm 0 0;padding:0}
.rv .toc li{display:grid;grid-template-columns:12mm 1fr;gap:3mm;padding:3.2mm 0;border-top:1px solid var(--rule)}
.rv .toc li b{font-family:"PF Display",sans-serif;font-size:20pt;line-height:1;color:var(--away)}
.rv .toc li strong{display:block;font-family:"PF Display",sans-serif;font-size:14pt;text-transform:uppercase;line-height:1}
.rv .toc li span{font-size:8.4pt;color:var(--soft)}
.rv .note{margin-top:6mm;padding:4mm;background:var(--tint);border-left:1.2mm solid var(--gold);font-size:8.4pt}
/* Chile */
.rv .feature{background:var(--night);color:#fff}
.rv .feature .lede,.rv .feature p{color:#dfe7f6}
.rv .feature .big35{position:absolute;right:-6mm;bottom:22mm;font-family:"PF Display",sans-serif;font-size:250pt;line-height:.8;color:rgba(255,203,50,.13)}
.rv .feature .agenda{position:absolute;left:13mm;right:13mm;bottom:17mm;border-top:1px solid rgba(255,255,255,.25);padding-top:3mm}
.rv .feature .agenda div{display:flex;justify-content:space-between;gap:4mm;font-size:9pt}
.rv .feature .agenda b{font-family:"PF Display",sans-serif;font-size:13pt;text-transform:uppercase}
.rv .feature .folio,.rv .feature .folio b{color:#9fb0cf}
/* Resultados */
.rv table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.rv .results td{padding:.85mm 0;border-bottom:1px solid var(--rule);font-size:8.6pt;vertical-align:middle}
.rv .results .day{width:12mm;color:var(--soft);font-size:7.4pt}
.rv .results .home{text-align:right;padding-right:2.5mm}
.rv .results .away{padding-left:2.5mm}
.rv .results .score{width:15mm;text-align:center;font-family:"PF Display",sans-serif;font-size:11pt;background:var(--night);color:#fff}
.rv .results .won{font-weight:700}
.rv .league{display:flex;align-items:baseline;justify-content:space-between;margin:5mm 0 1.5mm;border-bottom:.6mm solid var(--ink);padding-bottom:1mm}
.rv .league h3{margin:0}
.rv .league small{font-size:7.4pt;color:var(--soft)}
/* Probabilidades */
.rv .odds{display:grid;gap:2.3mm;margin-top:2mm}
.rv .odd{display:grid;grid-template-columns:1fr;gap:.8mm}
.rv .odd .teams{display:grid;grid-template-columns:1fr auto 1fr;gap:2mm;align-items:baseline;font-size:8.6pt}
.rv .odd .teams span:last-child{text-align:right}
.rv .odd .teams em{font-style:normal;font-size:6.9pt;color:var(--soft);text-align:center}
.rv .bar{display:flex;height:4.2mm;overflow:hidden;border-radius:.8mm;font-size:6.8pt;font-weight:700;line-height:4.2mm}
.rv .bar i{font-style:normal;display:block;min-width:7mm;padding:0 1.2mm;white-space:nowrap}
.rv .bar .h{background:var(--home);color:#241a00}
.rv .bar .d{background:var(--draw);color:#27344b;text-align:center}
.rv .bar .a{background:var(--away);color:#fff;text-align:right}
.rv .fav{font-weight:700}
.rv .legend{display:flex;gap:4mm;font-size:7.2pt;color:var(--soft);margin-top:1mm}
.rv .legend i{display:inline-block;width:3mm;height:3mm;border-radius:.5mm;margin-right:1mm;vertical-align:-.4mm}
.rv .compact .odds{gap:1.6mm}
.rv .compact .odd .teams{font-size:8pt}
.rv .compact .bar{height:3.6mm;line-height:3.6mm;font-size:6.4pt}
/* Tabla */
.rv .standings th{font-size:7pt;color:var(--soft);font-weight:500;text-align:right;padding:1mm 0;border-bottom:.6mm solid var(--ink)}
.rv .standings th:nth-child(2){text-align:left}
.rv .standings td{padding:1.05mm 0;border-bottom:1px solid var(--rule);text-align:right;font-size:8.8pt}
.rv .standings td:nth-child(1){width:7mm;text-align:left;font-family:"PF Display",sans-serif;font-size:12pt}
.rv .standings td:nth-child(2){text-align:left}
.rv .standings td:last-child{font-family:"PF Display",sans-serif;font-size:12.5pt;width:10mm}
.rv .standings tr.top td{background:var(--tint)}
.rv .picks{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm;margin-top:3mm}
.rv .pick{background:var(--night);color:#fff;padding:2.8mm 3.2mm}
.rv .pick b{display:block;font-family:"PF Display",sans-serif;font-size:25pt;line-height:.9;color:var(--gold)}
.rv .pick span{display:block;font-size:8pt;line-height:1.35;margin-top:1mm}
.rv .pick small{display:block;font-size:7pt;color:#9fb0cf;margin-top:1mm}
/* Contraportada */
.rv .back{background:var(--gold);color:#1a1300}
.rv .back h2{font-size:58pt;line-height:.85;margin-top:22mm}
.rv .back .offers{margin-top:10mm;display:grid;gap:3mm}
.rv .back .offers div{display:flex;align-items:baseline;gap:4mm;border-top:.5mm solid #1a1300;padding-top:2.5mm}
.rv .back .offers b{font-family:"PF Display",sans-serif;font-size:30pt;line-height:.9;min-width:26mm}
.rv .back .offers span{font-size:10pt;line-height:1.3}
.rv .back .contact{position:absolute;left:13mm;right:13mm;bottom:14mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:9pt}
.rv .back .contact b{display:block;font-family:"PF Display",sans-serif;font-size:22pt;text-transform:uppercase;line-height:1}
.rv .back .folio,.rv .back .folio b{color:#4a3a00}
"""

PITCH = """<svg class="pitch" viewBox="0 0 148 210" preserveAspectRatio="none" aria-hidden="true">
<g fill="none" stroke="rgba(255,255,255,.09)" stroke-width=".35">
<rect x="8" y="8" width="132" height="194"/><line x1="8" y1="105" x2="140" y2="105"/><circle cx="74" cy="105" r="22"/>
<rect x="38" y="8" width="72" height="30"/><rect x="56" y="8" width="36" height="11"/><path d="M60 38a14 14 0 0 0 28 0"/>
<rect x="38" y="172" width="72" height="30"/><rect x="56" y="191" width="36" height="11"/><path d="M60 172a14 14 0 0 1 28 0"/>
</g><circle cx="74" cy="105" r=".9" fill="rgba(255,255,255,.2)"/></svg>"""


def folio(n, section):
    return f'<div class="folio"><span>{e(section)}</span><b>{n}</b></div>'


def odd_row(p):
    when, home, away, ph, pd, pa = p
    fav = max(ph, pd, pa)
    h_cls = ' class="fav"' if ph == fav else ""
    a_cls = ' class="fav"' if pa == fav else ""
    pct = lambda v: f"{round(v)}%"
    return (f'<div class="odd"><div class="teams"><span{h_cls}>{e(home)}</span><em>{e(when)}</em><span{a_cls}>{e(away)}</span></div>'
            f'<div class="bar" role="img" aria-label="{e(home)} {pct(ph)}, empate {pct(pd)}, {e(away)} {pct(pa)}">'
            f'<i class="h" style="flex:{ph}">{pct(ph)}</i><i class="d" style="flex:{pd}">{pct(pd)}</i><i class="a" style="flex:{pa}">{pct(pa)}</i></div></div>')


LEGEND = ('<div class="legend"><span><i style="background:var(--home)"></i>Gana el local</span>'
          '<span><i style="background:var(--draw)"></i>Empate</span><span><i style="background:var(--away)"></i>Gana la visita</span></div>')


def results_block(block):
    rows = []
    for day, home, gh, ga, away in block["partidos"]:
        hw = ' won' if gh > ga else ''
        aw = ' won' if ga > gh else ''
        rows.append(f'<tr><td class="day">{e(day)}</td><td class="home{hw}">{e(home)}</td>'
                    f'<td class="score">{gh} – {ga}</td><td class="away{aw}">{e(away)}</td></tr>')
    return (f'<div class="league"><h3>{e(block["liga"])}</h3><small>{len(block["partidos"])} partidos</small></div>'
            f'<table class="results">{"".join(rows)}</table>')


def odds_block(block, compact=False):
    return (f'<div class="league"><h3>{e(block["liga"])}</h3><small>{e(block["bajada"])}</small></div>'
            f'<div class="odds">{"".join(odd_row(p) for p in block["partidos"])}</div>')


def build_pages():
    d = DATA
    res = {b["liga"]: b for b in d["resultados"]}
    nxt = {b["liga"]: b for b in d["proximos"]}
    all_upcoming = [(p, b["liga"]) for b in d["proximos"] for p in b["partidos"]]
    top = sorted(all_upcoming, key=lambda x: -max(x[0][3], x[0][5]))[:4]
    goals = sum(gh + ga for b in d["resultados"] for _, _, gh, ga, _ in b["partidos"])
    games = sum(len(b["partidos"]) for b in d["resultados"])
    pages = []

    pages.append(f'''<section class="page cover">{PITCH}
<div class="mast"><img src="/pasion-futbol.jpg" alt=""><span>Pasión <strong>Fútbol</strong></span></div>
<div class="issue">Revista oficial · {e(d["edicionCorta"])} · {e(d["edicion"])}</div>
<h1>La estrella<span>35</span></h1>
<p class="kicker">Colo-Colo es campeón de Chile. Además: los {games} resultados de la semana en Europa y las probabilidades de cada partido que viene.</p>
<div class="teasers">
<div><b>Champions</b><small>La fecha del 24 y 25 de noviembre, con favoritos.</small></div>
<div><b>{goals} goles</b><small>Lo que dejó el fin de semana en España, Inglaterra e Italia.</small></div>
<div><b>LaLiga</b><small>Así va la tabla: Barcelona manda por tres puntos.</small></div>
</div></section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
<h2>En esta<br>edición</h2>
<p class="lede">Gracias por tu compra. Esta revista acompaña tu pedido: la puedes hojear aquí o descargarla en PDF cuando quieras.</p>
<ol class="toc">
<li><b>3</b><div><strong>La estrella 35</strong><span>Colo-Colo, campeón de la Liga de Primera 2026.</span></div></li>
<li><b>4</b><div><strong>Resultados de la semana</strong><span>LaLiga, Premier League y Serie A, del 20 al 22 de noviembre.</span></div></li>
<li><b>6</b><div><strong>Lo que viene</strong><span>Champions League, LaLiga, Premier League y Serie A con probabilidades.</span></div></li>
<li><b>10</b><div><strong>La tabla y los favoritos</strong><span>Los diez primeros de LaLiga y los cuatro pronósticos más claros.</span></div></li>
<li><b>11</b><div><strong>Cuida tu camiseta</strong><span>Cómo lavarla para que dure.</span></div></li>
</ol>
<div class="note">Cómo leer las probabilidades: cada barra suma 100% y se reparte entre victoria local (amarillo), empate (gris) y victoria visitante (azul). En negrita, el favorito. {e(d["fuenteProbabilidades"])}</div>
{folio(2, "Pasión Fútbol · " + d["edicion"])}</section>''')

    ch = d["chile"]
    agenda = "".join(f'<div><span><b>{e(a["partido"])}</b><br>{e(a["nota"])}</span><span>{e(a["fecha"])}</span></div>' for a in ch["agenda"])
    paras = "".join(f"<p>{e(p)}</p>" for p in ch["parrafos"])
    pages.append(f'''<section class="page feature">{PITCH}<div class="big35" aria-hidden="true">35</div>
<h2 style="font-size:52pt;position:relative">{e(ch["titulo"])}</h2>
<p class="lede" style="position:relative">{e(ch["bajada"])}</p>
<div style="position:relative;max-width:96mm">{paras}</div>
<div class="agenda"><div style="margin-bottom:1.5mm;color:#9fb0cf;font-size:7.6pt"><span>Próximo partido del campeón</span></div>{agenda}</div>
{folio(3, "Fútbol chileno")}</section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
<h2>Resultados</h2><p class="lede" style="margin-bottom:2mm">Del 20 al 22 de noviembre. En negrita, el ganador.</p>
{results_block(res["LaLiga"])}
{results_block(res["Serie A"])}
{folio(4, "Resultados de la semana")}</section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
{results_block(res["Premier League"])}
<div class="note" style="margin-top:7mm"><b>El dato.</b> Leeds United ganó 4-1 en la cancha de Chelsea y Liverpool goleó 4-0 a Manchester United. En Italia, Atalanta e Inter empataron 4-4 en el partido con más goles de la semana.</div>
{folio(5, "Resultados de la semana")}</section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
<h2>Lo que viene</h2><p class="lede" style="margin-bottom:2mm">Hora de Chile continental (UTC−3).</p>{LEGEND}
{odds_block(nxt["Champions League"])}
{folio(6, "Lo que viene · Champions League")}</section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
{odds_block(nxt["LaLiga"])}
{folio(7, "Lo que viene · LaLiga")}</section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
{odds_block(nxt["Premier League"])}
{folio(8, "Lo que viene · Premier League")}</section>''')
    pages.append(f'''<section class="page"><div class="section-mark"></div>
{odds_block(nxt["Serie A"])}
{folio(9, "Lo que viene · Serie A")}</section>''')

    rows = "".join(
        f'<tr class="{"top" if r[0] <= 4 else ""}"><td>{r[0]}</td><td>{e(r[1])}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td><td>{r[6]}</td></tr>'
        for r in d["tabla"]["filas"])
    picks = "".join(
        f'<div class="pick"><b>{round(max(p[3], p[5]))}%</b><span>{e(p[1] if p[3] >= p[5] else p[2])} ante {e(p[2] if p[3] >= p[5] else p[1])}</span><small>{e(liga)} · {e(p[0])}</small></div>'
        for p, liga in top)
    pages.append(f'''<section class="page"><div class="section-mark"></div>
<h2>La tabla</h2>
<div class="league"><h3>LaLiga · 10 primeros</h3><small>Fondo celeste: puestos de Champions</small></div>
<table class="standings"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>Pts</th></tr></thead><tbody>{rows}</tbody></table>
<h3 style="margin-top:7mm">Los favoritos más claros</h3>
<div class="picks">{picks}</div>
{folio(10, "La tabla y los favoritos")}</section>''')

    pages.append(f'''<section class="page"><div class="section-mark"></div>
<h2>Cuida tu<br>camiseta</h2>
<p class="lede">Cuatro hábitos para que el estampado y los colores duren temporadas.</p>
<ol class="toc care">
<li><b>1</b><div><strong>Lávala al revés</strong><span>Así el roce del lavado no toca el estampado ni el bordado.</span></div></li>
<li><b>2</b><div><strong>Agua fría y ciclo suave</strong><span>Máximo 30 °C, con detergente líquido y sin cloro ni suavizante.</span></div></li>
<li><b>3</b><div><strong>Sécala a la sombra</strong><span>Nada de secadora: el calor encoge la tela y agrieta el número.</span></div></li>
<li><b>4</b><div><strong>Plancha solo por dentro</strong><span>A temperatura baja y nunca directo sobre el estampado.</span></div></li>
</ol>
<div class="note">¿Un problema con tu pedido o la talla? Escríbenos por WhatsApp al +56 9 3497 4132 y lo resolvemos contigo.</div>
{folio(11, "Pasión Fútbol")}</section>''')
    pages.append(f'''<section class="page back">
<div class="mast" style="display:flex;align-items:center;gap:3mm"><img src="/pasion-futbol.jpg" alt="" style="width:12mm;height:12mm;border-radius:50%;object-fit:cover;object-position:50% 30%"><span class="display" style="font-size:17pt;font-style:italic;text-transform:uppercase">Pasión Fútbol</span></div>
<h2>Tu próxima camiseta te espera</h2>
<div class="offers">
<div><b>20%</b><span>de descuento llevando 2 camisetas.</span></div>
<div><b>25%</b><span>de descuento llevando 3 o más.</span></div>
<div><b>Gratis</b><span>el envío en la Región Metropolitana. Despachamos a todo Chile.</span></div>
</div>
<div class="contact"><div><b>pasionfutbol.lat</b>Camisetas de selecciones y clubes</div><div style="text-align:right"><b>WhatsApp</b>+56 9 3497 4132</div></div>
{folio(12, "Pasión Fútbol")}</section>''')
    return pages


def main():
    pages = build_pages()
    fragment = f'<style>{CSS}</style>\n<div class="rv" id="revista">\n' + "\n".join(pages) + "\n</div>\n"
    OUT_HTML.write_text(fragment)
    print("HTML:", OUT_HTML.relative_to(ROOT), len(pages), "páginas")

    from playwright.sync_api import sync_playwright
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        for name in ["barlow-condensed-latin-800-normal.woff2", "dm-sans-latin-wght-normal.woff2", "pasion-futbol.jpg"]:
            shutil.copy(ROOT / "storefront" / name, tmp / name)
        doc = ('<!doctype html><html lang="es-CL"><meta charset="utf-8"><style>@page{size:148mm 210mm;margin:0}'
               'html,body{margin:0}.rv .page{break-after:page}</style>' + fragment.replace('url("/', 'url("./').replace('src="/', 'src="./') + "</html>")
        (tmp / "revista.html").write_text(doc)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto((tmp / "revista.html").as_uri())
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(300)
            page.pdf(path=str(OUT_PDF), width="148mm", height="210mm", print_background=True, prefer_css_page_size=True)
            browser.close()
    print("PDF:", OUT_PDF.relative_to(ROOT), OUT_PDF.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
