"""Jednokratno: otvori UGZINS Traffic Agent u pregledaču, zabeleži zahteve za pločice mape i JS biblioteke mape."""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://stari.ugzins.rs/SAUS/QLTCnetTrafficAgent/"
IZLAZ = Path(sys.argv[1] if len(sys.argv) > 1 else "istrazi_mapu")
IZLAZ.mkdir(parents=True, exist_ok=True)
zahtevi = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    pg.on("request", lambda r: zahtevi.append([r.resource_type, r.url]))
    pg.goto(URL, wait_until="networkidle", timeout=90000)
    pg.wait_for_timeout(6000)
    pg.screenshot(path=str(IZLAZ / "strana.png"))
    try:
        pg.locator("#qTAMap").screenshot(path=str(IZLAZ / "mapa.png"))
    except Exception as e:  # noqa: BLE001
        print("nema #qTAMap:", e)
    html = pg.content()
    (IZLAZ / "strana.html").write_text(html, encoding="utf-8")
    info = pg.evaluate("""() => ({
      leaflet: typeof L !== 'undefined' ? (L.version || true) : null,
      ol: typeof ol !== 'undefined' ? true : null,
      google: typeof google !== 'undefined' && google.maps ? (google.maps.version || true) : null,
      skripte: [...document.scripts].map(s => s.src).filter(Boolean),
      stilovi: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href),
      slike: [...document.querySelectorAll('#qTAMap img')].slice(0, 8).map(i => i.src),
      mapaHtml: (document.querySelector('#qTAMap') || {}).outerHTML?.slice(0, 3000) || null,
    })""")
    b.close()
(IZLAZ / "zahtevi.json").write_text(json.dumps(zahtevi, indent=1), encoding="utf-8")
print("BIBLIOTEKE:", json.dumps({k: info[k] for k in ("leaflet", "ol", "google")}))
print("SKRIPTE:", *info["skripte"], sep="\n  ")
print("STILOVI:", *info["stilovi"], sep="\n  ")
print("SLIKE U MAPI:", *info["slike"], sep="\n  ")
plocice = [u for t, u in zahtevi if t == "image" and re.search(r"/\d+/\d+/\d+|tile|x=\d+|bbox|WMS|maps", u, re.I)]
print("PRIMERI PLOČICA:", *sorted(set(plocice))[:25], sep="\n  ")
print("SVI DOMENI:", sorted({re.sub(r"^(https?://[^/]+).*", r"\1", u) for _, u in zahtevi}))
for m in re.findall(r"(?:tileLayer|TileLayer|L\.tileLayer|new ol\.source\.\w+|google\.maps\.\w+|urlTemplate|url:\s*['\"][^'\"]+)[^;\n]{0,220}", html)[:30]:
    print("KOD:", m)
print("MAPA HTML:", info["mapaHtml"])
