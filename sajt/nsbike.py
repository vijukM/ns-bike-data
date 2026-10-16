"""SAJT — slike NS bike stanica iz zvanične Google My Maps mape (JKP „Parking servis“) → sajt/podaci/nsbike_stanice.json.

    python -m sajt.nsbike                 # preuzima KML (GitHub Actions, workflow sajt_istorija, sta=mapa)
    python -m sajt.nsbike --kml mapa.kml  # iz već preuzetog fajla

U podacima se čuvaju samo linkovi (mymaps.usercontent.google.com, veličina 408 px); slika se u pregledaču učitava
tek kad se klikne stanica, isto kao na Google mapi. Stanica i tačka iz KML-a uparuju se po položaju (najbliža, do 80 m).
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
VELICINA = "s408"
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
    n = 0
    for s in stanice:
        najbliza = min(tacke, key=lambda t: _metri((s["lon"], s["lat"]), (t["lon"], t["lat"])), default=None)
        if najbliza and _metri((s["lon"], s["lat"]), (najbliza["lon"], najbliza["lat"])) <= prag and najbliza["slike"]:
            s["slike"] = najbliza["slike"]
            n += 1
    return n


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kml", type=Path, help="već preuzet KML (inače se preuzima)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    kml = a.kml.read_text(encoding="utf-8") if a.kml else requests.get(KML_URL, timeout=60, headers={"User-Agent": "Mozilla/5.0"}).text
    tacke = tacke_iz_kml(kml)
    stanice = json.loads(STANICE.read_text(encoding="utf-8"))
    n = dodaj_slike(stanice, tacke)
    if n < len(stanice) // 2:
        log.warning("slike za samo %d od %d stanica — ostaje prethodna verzija", n, len(stanice))
        return 0
    STANICE.write_text("[\n" + ",\n".join(json.dumps(s, ensure_ascii=False) for s in stanice) + "\n]\n", encoding="utf-8")
    log.info("slike za %d od %d stanica (%d tačaka u KML-u)", n, len(stanice), len(tacke))
    return 0


if __name__ == "__main__":
    sys.exit(main())
