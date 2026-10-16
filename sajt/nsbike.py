"""SAJT — slike NS bike stanica iz zvanične Google My Maps mape (JKP „Parking servis“) → sajt/podaci/nsbike_stanice.json.

    python -m sajt.nsbike                 # preuzima KML (GitHub Actions, workflow sajt_istorija, sta=mapa)
    python -m sajt.nsbike --kml mapa.kml  # iz već preuzetog fajla

Google slike šalje sa „Cross-Origin-Resource-Policy: same-site“, pa se ne mogu prikazati direktno sa drugog sajta
(ERR_BLOCKED_BY_RESPONSE.NotSameSite). Zato se jednom preuzmu, smanje (640 px, WebP) i čuvaju u
docs/assets/slike/nsbike/NSBxx-n.webp; na mapi se učitavaju tek kad se klikne stanica.
Stanica i tačka iz KML-a uparuju se po položaju (najbliža, do 80 m). Treba Pillow (pip install pillow).
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import re
import sys
from pathlib import Path

import requests

KOREN = Path(__file__).resolve().parents[1]
STANICE = KOREN / "sajt" / "podaci" / "nsbike_stanice.json"
MID = "1z5ScvGMDEaXjNNq8U4Jcg3FIKW0"
KML_URL = f"https://www.google.com/maps/d/kml?mid={MID}&forcekml=1"
VELICINA = "s800"                                     # preuzima se 800 px, čuva 640 px
SLIKE = KOREN / "docs" / "assets" / "slike" / "nsbike"
SIRINA = 640
log = logging.getLogger(__name__)


def tacke_iz_kml(kml: str) -> list[dict]:
    """Placemark → naziv, [lon, lat] i jedinstveni linkovi slika (opis + gx_media_links), sa veličinom 408 px."""
    out = []
    for p in re.findall(r"<Placemark>(.*?)</Placemark>", kml, re.S):
        ime = re.search(r"<name>(.*?)</name>", p, re.S)
        k = re.search(r"<coordinates>\s*([-\d.]+),([-\d.]+)", p)
        if not k:
            continue
        slike = []
        for u in re.findall(r"https://mymaps\.usercontent\.google\.com/hostedimage/[^\s<\"']+", p):
            u = re.sub(r"([?&])fife=s\d+", rf"\1fife={VELICINA}", u.replace("&amp;", "&"))
            if "fife=" not in u:
                u += ("&" if "?" in u else "?") + f"fife={VELICINA}"
            if u not in slike:
                slike.append(u)
        out.append({"ime": (ime.group(1).strip() if ime else ""), "lon": float(k.group(1)), "lat": float(k.group(2)), "slike": slike})
    return out


def _metri(a, b) -> float:
    kx = 111320 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110574)


def dodaj_slike(stanice: list[dict], tacke: list[dict], prag: float = 80) -> int:
    """Stanici upisuje linkove slika najbliže tačke iz KML-a (privremeno, pre preuzimanja)."""
    n = 0
    for s in stanice:
        najbliza = min(tacke, key=lambda t: _metri((s["lon"], s["lat"]), (t["lon"], t["lat"])), default=None)
        if najbliza and _metri((s["lon"], s["lat"]), (najbliza["lon"], najbliza["lat"])) <= prag and najbliza["slike"]:
            s["slike"] = najbliza["slike"]
            n += 1
    return n


def preuzmi_slike(stanice: list[dict], folder: Path = SLIKE) -> dict[str, int]:
    """Linkove zamenjuje lokalnim WebP slikama (assets/slike/nsbike/…); vraća broj slika po stanici i broj različitih."""
    from hashlib import sha1
    from io import BytesIO

    from PIL import Image

    folder.mkdir(parents=True, exist_ok=True)
    otisci, broj = set(), {}
    for s in stanice:
        lokalne = []
        for k, u in enumerate(s.get("slike", []), 1):
            if not u.startswith("http"):
                lokalne.append(u)
                continue
            try:
                r = requests.get(u, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
                r.raise_for_status()
                otisci.add(sha1(r.content).hexdigest())
                im = Image.open(BytesIO(r.content)).convert("RGB")
                im.thumbnail((SIRINA, SIRINA * 2))
                put = folder / f"{s['sif']}-{k}.webp"
                im.save(put, "WEBP", quality=74, method=6)
                lokalne.append(f"assets/slike/nsbike/{put.name}")
            except Exception as e:  # noqa: BLE001
                log.warning("%s: slika %d nije preuzeta: %s", s["sif"], k, e)
        if lokalne:
            s["slike"] = lokalne
        else:
            s.pop("slike", None)
        broj[s["sif"]] = len(lokalne)
    broj["_razlicitih"] = len(otisci)
    return broj


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kml", type=Path, help="već preuzet KML (inače se preuzima)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    kml = a.kml.read_text(encoding="utf-8") if a.kml else requests.get(KML_URL, timeout=60, headers={"User-Agent": "Mozilla/5.0"}).text
    tacke = tacke_iz_kml(kml)
    stanice = json.loads(STANICE.read_text(encoding="utf-8"))
    stare = {s["sif"]: s.get("slike") for s in stanice}
    n = dodaj_slike(stanice, tacke)
    if n < len(stanice) // 2:
        log.warning("slike za samo %d od %d stanica — ostaje prethodna verzija", n, len(stanice))
        return 0
    if not a.kml:
        log.info("preuzeto: %s", preuzmi_slike(stanice))
    for s in stanice:                                  # ako preuzimanje nije uspelo, ostaju ranije lokalne slike
        if not s.get("slike") or s["slike"][0].startswith("http"):
            if stare.get(s["sif"]) and not stare[s["sif"]][0].startswith("http"):
                s["slike"] = stare[s["sif"]]
            elif s.get("slike") and s["slike"][0].startswith("http"):
                s.pop("slike")
    STANICE.write_text("[\n" + ",\n".join(json.dumps(s, ensure_ascii=False) for s in stanice) + "\n]\n", encoding="utf-8")
    log.info("slike za %d od %d stanica (%d tačaka u KML-u)", n, len(stanice), len(tacke))
    return 0


if __name__ == "__main__":
    sys.exit(main())
