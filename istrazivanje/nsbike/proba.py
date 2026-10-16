"""Privremeno: šta učitava ns-bike.web.app (slike stanica, API) — Playwright, beleži sve odgovore."""
import json, re, pathlib, hashlib
from playwright.sync_api import sync_playwright
D = pathlib.Path(__file__).parent
odg = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 1000})
    def zabelezi(r):
        try:
            u = r.url; t = r.request.resource_type; ct = r.headers.get("content-type", "")
            odg.append({"url": u, "tip": t, "ct": ct, "status": r.status})
            if t == "image" or ct.startswith("image/"):
                body = r.body()
                if len(body) > 3000:
                    ime = re.sub(r"[^A-Za-z0-9._-]+", "_", u.split("?")[0].split("/")[-1])[:60] or hashlib.md5(u.encode()).hexdigest()
                    (D / "slike").mkdir(exist_ok=True); (D / "slike" / ime).write_bytes(body)
            if "json" in ct and len(odg) < 400:
                (D / "json").mkdir(exist_ok=True)
                (D / "json" / (hashlib.md5(u.encode()).hexdigest()[:10] + ".json")).write_bytes(r.body())
        except Exception as e:  # noqa: BLE001
            print("greška", e)
    pg.on("response", zabelezi)
    for u in ("https://ns-bike.web.app/home", "https://ns-bike.web.app/"):
        try:
            pg.goto(u, wait_until="networkidle", timeout=60000); pg.wait_for_timeout(4000)
        except Exception as e:  # noqa: BLE001
            print(u, e)
    (D / "strana.html").write_text(pg.content(), encoding="utf-8")
    pg.screenshot(path=str(D / "snimak.png"), full_page=True)
    # linkovi i dugmad koja vode na stanice
    linkovi = pg.eval_on_selector_all("a", "els => els.map(e => [e.href, e.innerText.trim().slice(0,60)])")
    (D / "linkovi.json").write_text(json.dumps(linkovi, ensure_ascii=False, indent=0), encoding="utf-8")
    for href, txt in linkovi[:40]:
        if href and "ns-bike.web.app" in href and href.rstrip("/") not in ("https://ns-bike.web.app", "https://ns-bike.web.app/home"):
            try:
                pg.goto(href, wait_until="networkidle", timeout=30000); pg.wait_for_timeout(2500)
            except Exception as e:  # noqa: BLE001
                print(href, e)
    b.close()
(D / "odgovori.json").write_text(json.dumps(odg, ensure_ascii=False, indent=0), encoding="utf-8")
print(len(odg), "odgovora;", sum(1 for o in odg if o["tip"] == "image"), "slika")
for o in odg:
    if o["tip"] in ("image", "fetch", "xhr", "script") or "json" in o["ct"]:
        print(o["status"], o["tip"], o["url"][:160])
