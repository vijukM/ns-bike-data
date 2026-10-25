"""SAJT — strane greške 404 i 403 sa NaSicu logoom → docs/404.html, docs/403.html.

    python -m sajt.strane_greske        # posle izmene logoa ili teksta grešaka

Strane su samostalne: GitHub Pages vraća 404.html za bilo koju putanju, pa relativne adrese ne rade.
Zato je logo (docs/assets/slike/brend/NaSicu_logo.svg) ugrađen u stranu kao SVG, a ikonice taba imaju
apsolutne adrese. Logo je nepromenjen; strana samo pomera isprekidanu liniju staze ispod bicikla
(ne i kad je u sistemu uključeno „manje pokreta“), a u svetloj temi natpis „icu“ dobija tamne boje
iz NaSicu_logo_za_svetlu_podlogu.svg.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

KOREN = Path(__file__).resolve().parents[1]
DOCS = KOREN / "docs"
LOGO = DOCS / "assets" / "slike" / "brend" / "NaSicu_logo.svg"
SAJT = "/ns-bike-data"

GRESKE = {
    404: {"oznaka": "nije pronađeno", "kod": "NIJE_PRONADJENO", "naslov": "Ova strana je skrenula sa staze",
          "tekst": "Link je možda zastareo, ili je strana premeštena. Vrati se na kontrolnu tablu ili potraži stanicu na mapi."},
    403: {"oznaka": "pristup zabranjen", "kod": "ZABRANJENO", "naslov": "Ova staza je zatvorena",
          "tekst": "Nemaš dozvolu da otvoriš ovu stranu. Ako misliš da je to greška, vrati se na kontrolnu tablu ili pokušaj ponovo kasnije."},
}


def logo_svg() -> str:
    """Logo bez XML zaglavlja, sa izrezom oko crteža (bicikl, staza, natpis) i još jednom crticom staze desno,
    da pri pomeranju linije ne ostane rupa."""
    s = LOGO.read_text(encoding="utf-8")
    s = re.sub(r"<\?xml[^>]*\?>\s*", "", s)
    s = re.sub(r"<svg [^>]*>", '<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="225 55 1100 870" role="img" aria-label="NaSicu">', s, count=1)
    poslednja = '<rect x="1152.0" y="673.0" width="34" height="6" rx="3"/>'
    if poslednja in s:
        s = s.replace(poslednja, poslednja + '<rect x="1214.0" y="673.0" width="34" height="6" rx="3"/>', 1)
    return s


def strana(kod: int) -> str:
    g = GRESKE[kod]
    return f'''<!doctype html>
<html lang="sr-Latn" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NaSicu</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="{SAJT}/assets/slike/brend/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="{SAJT}/assets/slike/brend/NaSicu_ikonica_NS.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="{SAJT}/assets/slike/brend/favicon-32.png">
  <link rel="apple-touch-icon" href="{SAJT}/assets/slike/brend/apple-touch-icon.png">
  <link rel="manifest" href="{SAJT}/site.webmanifest">
  <meta name="theme-color" content="#04162F">
  <script>try{{var d=document.documentElement,t=localStorage.getItem("ns-tema")||"dark";if(t==="sistem")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t}}catch(e){{}}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
  <style>
    /* strana greške {kod} — pravi je sajt.strane_greske (ne menjati ručno) */
    :root, :root[data-theme="dark"] {{ color-scheme: dark; --bg: #04162F; --bg2: #020E22; --kartica: #0B1F3D; --t: #F1F5F9; --m: #9FB3CC; --l: #6F86A6; --b: #1C3558;
      --plava: #14A0F5; --plava-sv: #3AD0FF; --crvena: #F0391F; --crvena-sv: #FF7550; --pt: #04162F; }}
    :root[data-theme="light"] {{ color-scheme: light; --bg: #F0F5FB; --bg2: #E2ECF7; --kartica: #FFFFFF; --t: #0B1630; --m: #4A5D78; --l: #7A8BA3; --b: #D5E0EE; --pt: #fff; }}
    :root[data-theme="light"] #gWhite stop:first-child {{ stop-color: #1A2B4C; }}
    :root[data-theme="light"] #gWhite stop:last-child {{ stop-color: #0B1630; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 28px 16px; color: var(--t); font: 15px/1.6 Inter, system-ui, sans-serif;
      background: radial-gradient(120% 80% at 45% 0%, color-mix(in srgb, var(--plava) 14%, var(--bg)) 0%, var(--bg) 55%, var(--bg2) 100%) fixed; }}
    main {{ width: 100%; max-width: 580px; text-align: center; }}
    a.znak {{ display: block; width: min(330px, 78vw); margin: 0 auto; border-radius: 16px; }}
    a.znak:focus-visible {{ outline: 2px solid var(--plava); outline-offset: 6px; }}
    svg.logo {{ display: block; width: 100%; height: auto; filter: drop-shadow(0 18px 30px rgb(0 0 0 / .28)); }}
    .eyebrow {{ display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; font: 500 11px "JetBrains Mono", monospace; letter-spacing: .18em; text-transform: uppercase; color: var(--l); }}
    .eyebrow::before, .eyebrow::after {{ content: ""; width: 22px; height: 1px; background: var(--b); }}
    .broj {{ font: 800 clamp(84px, 20vw, 140px)/1 "Inter Tight", Inter, sans-serif; letter-spacing: -.05em; margin: 4px 0 6px;
      background: linear-gradient(100deg, var(--plava-sv) 0%, var(--plava) 46%, var(--crvena-sv) 54%, var(--crvena) 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent; }}
    h1 {{ font: 700 26px/1.25 "Inter Tight", Inter, sans-serif; margin: 0 0 10px; }}
    p {{ color: var(--m); margin: 0 auto 26px; max-width: 440px; }}
    .akcije {{ display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }}
    a.dugme, button.dugme {{ display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 18px; border-radius: 10px; font: 600 14px Inter, sans-serif;
      text-decoration: none; border: 1px solid var(--b); background: var(--kartica); color: var(--t); cursor: pointer; }}
    a.dugme:hover, button.dugme:hover {{ border-color: var(--plava); }}
    a.dugme.primarno {{ background: linear-gradient(135deg, var(--plava-sv), var(--plava)); border-color: transparent; color: #04162F; }}
    .tehnicki {{ margin-top: 32px; display: inline-flex; gap: 22px; flex-wrap: wrap; justify-content: center; padding: 12px 18px; border: 1px dashed var(--b);
      border-radius: 12px; font: 11px "JetBrains Mono", monospace; color: var(--l); }}
    .tehnicki b {{ color: var(--t); font-weight: 500; }}
    @media (prefers-reduced-motion: no-preference) {{
      svg.logo #staza rect {{ animation: staza 0.9s linear infinite; }}
    }}
    @keyframes staza {{ to {{ transform: translateX(-62px); }} }}
  </style>
</head>
<body>
  <main>
    <a class="znak" id="znak" href="{SAJT}/" title="NaSicu — na kontrolnu tablu">{logo_svg()}</a>
    <div class="eyebrow">Greška · {g["oznaka"]}</div>
    <div class="broj">{kod}</div>
    <h1>{g["naslov"]}</h1>
    <p>{g["tekst"]}</p>
    <div class="akcije">
      <a class="dugme primarno" id="pocetna" href="{SAJT}/">Na kontrolnu tablu</a>
      <a class="dugme" id="mapa" href="{SAJT}/mapa.html">Mapa brojača</a>
      <button class="dugme" type="button" onclick="history.back()">Nazad</button>
    </div>
    <div class="tehnicki"><span>STATUS <b>{kod}</b></span><span>KOD <b>{g["kod"]}</b></span><span>PUTANJA <b id="putanja">—</b></span></div>
  </main>
  <script>
    // na github.io je sajt u podfolderu (/ns-bike-data/), na sopstvenom domenu u korenu
    const koren = location.hostname.endsWith("github.io") ? "/" + (location.pathname.split("/")[1] || "") + "/" : "/";
    for (const [id, put] of [["pocetna", ""], ["znak", ""], ["mapa", "mapa.html"]]) document.getElementById(id).href = koren + put;
    document.getElementById("putanja").textContent = location.pathname.length > 40 ? "…" + location.pathname.slice(-38) : location.pathname;
  </script>
</body>
</html>
'''


def main() -> int:
    for kod in GRESKE:
        (DOCS / f"{kod}.html").write_text(strana(kod), encoding="utf-8")
        print(f"docs/{kod}.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
