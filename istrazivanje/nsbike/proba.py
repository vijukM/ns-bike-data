"""Privremeno: odakle aplikacija app.nsbike.rs/ebiciklana učitava sliku stanice (JS + klikovi + mrežni zahtevi)."""
import json, re, pathlib, urllib.request
from playwright.sync_api import sync_playwright
D = pathlib.Path(__file__).parent; (D / "slike").mkdir(exist_ok=True)
js = urllib.request.urlopen(urllib.request.Request("https://app.nsbike.rs/ebiciklana/assets/index-D6AWU6H5.js", headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "ignore")
(D / "app.js").write_text(js, encoding="utf-8")
print("JS", len(js))
for pat in [r'["\'`](/[A-Za-z0-9_\-/{}$.]*(?:api|slik|image|foto|photo|stanic|biciklan)[A-Za-z0-9_\-/{}$.]*)["\'`]', r'https?://[A-Za-z0-9_.\-/{}$?=&]+', r'\.(?:jpe?g|png|webp)']:
    print("==", pat); print(sorted(set(re.findall(pat, js)))[:80])
for k in ["slika", "image", "foto", "photo", "img", "fetch(", "axios"]:
    for m in list(re.finditer(re.escape(k), js))[:6]:
        print(k, "…", js[max(0, m.start() - 160): m.start() + 200].replace("\n", " "))
odg = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 430, "height": 900})
    def zab(r):
        try:
            ct = r.headers.get("content-type", ""); t = r.request.resource_type
            odg.append([r.status, t, ct, r.url])
            if (t == "image" or ct.startswith("image/")) and "assets/" not in r.url:
                body = r.body()
                ime = re.sub(r"[^A-Za-z0-9._-]+", "_", r.url.split("?")[0].split("/")[-1])[-60:] or "slika"
                (D / "slike" / ime).write_bytes(body)
            if "json" in ct:
                print("JSON", r.url, r.text()[:400])
        except Exception as e:  # noqa: BLE001
            print("greška", e)
    pg.on("response", zab)
    pg.goto("https://app.nsbike.rs/ebiciklana/nsb01", wait_until="networkidle", timeout=60000); pg.wait_for_timeout(2000)
    for tekst in ["Изнајми бицикл", "Iznajmi bicikl"]:
        if pg.get_by_text(tekst).count():
            pg.get_by_text(tekst).first.click(); pg.wait_for_timeout(4000); break
    pg.screenshot(path=str(D / "posle_klika.png"), full_page=True)
    (D / "posle_klika.html").write_text(pg.content(), encoding="utf-8")
    print("IMG posle klika:", pg.eval_on_selector_all("img", "els => els.map(e => [e.currentSrc || e.src, e.naturalWidth, e.naturalHeight])"))
    print("dugmad:", pg.eval_on_selector_all("button, a", "els => els.map(e => e.innerText.trim()).filter(Boolean).slice(0,40)"))
    b.close()
for o in odg:
    if o[1] in ("fetch", "xhr", "image") and "/assets/" not in o[3]:
        print(o)
(D / "odgovori.json").write_text(json.dumps(odg, ensure_ascii=False, indent=0), encoding="utf-8")
