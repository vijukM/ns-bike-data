"""Privremeno: slike sa stranica stanica app.nsbike.rs/ebiciklana/nsbNN (Playwright)."""
import json, re, pathlib
from playwright.sync_api import sync_playwright
D = pathlib.Path(__file__).parent; (D / "stanice").mkdir(exist_ok=True)
rez = {}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 1000})
    for n in range(1, 17):
        sif = f"nsb{n:02d}"; slike = []
        def zab(r, slike=slike, sif=sif):
            try:
                if r.request.resource_type == "image" or r.headers.get("content-type", "").startswith("image/"):
                    body = r.body()
                    slike.append((r.url, len(body)))
                    if len(body) > 8000:
                        ime = sif + "_" + re.sub(r"[^A-Za-z0-9._-]+", "_", r.url.split("?")[0].split("/")[-1])[-50:]
                        (D / "stanice" / ime).write_bytes(body)
            except Exception as e:  # noqa: BLE001
                print("greška", e)
        pg.on("response", zab)
        try:
            pg.goto(f"https://app.nsbike.rs/ebiciklana/{sif}", wait_until="networkidle", timeout=45000); pg.wait_for_timeout(2500)
        except Exception as e:  # noqa: BLE001
            print(sif, e)
        imgs = pg.eval_on_selector_all("img", "els => els.map(e => [e.currentSrc || e.src, e.naturalWidth, e.naturalHeight, e.alt])")
        bg = pg.evaluate("[...document.querySelectorAll('*')].map(e=>getComputedStyle(e).backgroundImage).filter(x=>x&&x!=='none'&&x.includes('url'))")
        txt = pg.inner_text("body")[:600]
        if n == 1:
            (D / "stanica1.html").write_text(pg.content(), encoding="utf-8"); pg.screenshot(path=str(D / "stanica1.png"), full_page=True)
        pg.remove_listener("response", zab)
        rez[sif] = {"img": imgs, "bg": bg[:10], "odgovori": slike, "tekst": txt}
        print(sif, imgs, bg[:3], [s for s in slike if s[1] > 8000])
    b.close()
(D / "stanice.json").write_text(json.dumps(rez, ensure_ascii=False, indent=0), encoding="utf-8")
