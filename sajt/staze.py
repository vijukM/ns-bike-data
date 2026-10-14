"""SAJT — biciklističke staze Novog Sada iz OpenStreetMap-a (Overpass API) → docs/data/staze.geojson.

    python -m sajt.staze                 # pokreće se u GitHub Actions (workflow sajt_istorija, sta=staze)

Tipovi (svojstvo `t` u GeoJSON-u):
  s — izdvojena biciklistička staza (highway=cycleway, cycleway*=track)
  t — biciklistička traka na kolovozu (cycleway*=lane / shared_lane / opposite_lane)
  z — zajednička površina sa pešacima (path/footway/pedestrian sa bicycle=designated)
Podaci: © OpenStreetMap saradnici, ODbL (navodi se na sajtu).
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

KOREN = Path(__file__).resolve().parents[1]
IZLAZ = KOREN / "docs" / "data" / "staze.geojson"
OKVIR = (45.205, 19.74, 45.320, 19.93)              # jug, zapad, sever, istok: Novi Sad, Petrovaradin, Sr. Kamenica
SERVERI = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter"]
UA = "ns-bike-data (master rad FTN Novi Sad; https://github.com/vijukM/ns-bike-data)"
TRAKA = "lane|shared_lane|opposite_lane|share_busway"
STAZA = "track|opposite_track"

log = logging.getLogger(__name__)


def upit(okvir=OKVIR) -> str:
    b = ",".join(str(x) for x in okvir)
    kljucevi = ["cycleway", "cycleway:left", "cycleway:right", "cycleway:both"]
    delovi = [f'way["highway"="cycleway"]({b});',
              *[f'way["{k}"~"^({TRAKA}|{STAZA})$"]({b});' for k in kljucevi],
              f'way["highway"~"^(path|footway|pedestrian)$"]["bicycle"="designated"]({b});']
    return f"[out:json][timeout:120];({''.join(delovi)});out geom;"


def tip(tagovi: dict) -> str | None:
    if tagovi.get("highway") == "cycleway":
        return "s"
    vrednosti = [tagovi.get(k, "") for k in ("cycleway", "cycleway:left", "cycleway:right", "cycleway:both")]
    if any(v in STAZA.split("|") for v in vrednosti):
        return "s"
    if any(v in TRAKA.split("|") for v in vrednosti):
        return "t"
    if tagovi.get("highway") in ("path", "footway", "pedestrian") and tagovi.get("bicycle") == "designated":
        return "z"
    return None


def u_geojson(odgovor: dict) -> dict:
    obelezja = []
    for e in odgovor.get("elements", []):
        if e.get("type") != "way" or len(e.get("geometry") or []) < 2:
            continue
        t = tip(e.get("tags", {}))
        if t is None:
            continue
        koord = [[round(g["lon"], 5), round(g["lat"], 5)] for g in e["geometry"]]
        obelezja.append({"type": "Feature", "properties": {"t": t, "id": e["id"]},
                         "geometry": {"type": "LineString", "coordinates": koord}})
    obelezja.sort(key=lambda f: f["properties"]["id"])
    return {"type": "FeatureCollection", "obelezja_po_tipu": {k: sum(f["properties"]["t"] == k for f in obelezja)
                                                              for k in "stz"},
            "izvor": "© OpenStreetMap saradnici (ODbL), Overpass API",
            "preuzeto_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "features": obelezja}


def preuzmi(okvir=OKVIR) -> dict:
    poslednja = None
    for pokusaj, url in enumerate(SERVERI * 2):
        try:
            r = requests.post(url, data={"data": upit(okvir)}, headers={"User-Agent": UA}, timeout=180)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            poslednja = e
            log.warning("Overpass %s: %s", url, e)
            time.sleep(5 * (pokusaj + 1))
    raise RuntimeError(f"Overpass nedostupan: {poslednja}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    g = u_geojson(preuzmi())
    if len(g["features"]) < 50:
        raise SystemExit(f"premalo staza ({len(g['features'])}) — Overpass odgovor je verovatno nepotpun")
    a.izlaz.parent.mkdir(parents=True, exist_ok=True)
    a.izlaz.write_text(json.dumps(g, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info("staze: %d deonica %s, %.0f KB", len(g["features"]), g["obelezja_po_tipu"], a.izlaz.stat().st_size / 1e3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
