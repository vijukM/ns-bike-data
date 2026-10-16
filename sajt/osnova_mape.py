"""SAJT — vektorska osnova mape Novog Sada iz OpenStreetMap-a (Overpass API) → docs/data/mapa/*.geojson.

    python -m sajt.osnova_mape          # pokreće se u GitHub Actions (workflow sajt_istorija, sta=mapa)

Iz ovih slojeva sajt sam crta „poster“ mape (tamno plava, siva, bela) u MapLibre-u: ulice, voda, zelenilo,
pruga i zgrade (za 3D prikaz, samo uži centar). Vektori ostaju oštri na svakom zumu i poklapaju se sa pinovima.

Svojstva:
  putevi.geojson   k — klasa: a autoput/magistrala, g glavna, s sporedna, o ostale (servisne, pešačke zone)
  zgrade.geojson   h — visina u metrima (height, building:levels × 3 m ili procena po vrsti)
  parking.geojson  tačke za bicikliste; t — p parking za bicikle, i iznajmljivanje (NS bike), s servis / prodavnica,
                   r stanica za samostalnu popravku; kap (capacity), pok (natkriveno), vrsta (bicycle_parking), ime
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

from sajt.staze import SERVERI, UA

KOREN = Path(__file__).resolve().parents[1]
IZLAZ = KOREN / "docs" / "data" / "mapa"
OKVIR = (45.185, 19.70, 45.335, 19.97)              # jug, zapad, sever, istok: grad sa Petrovaradinom i Kamenicom
OKVIR_ZGRADE = (45.228, 19.795, 45.275, 19.880)    # uži centar, Liman, Grbavica, Podbara, Petrovaradin
KLASE = {
    "a": ["motorway", "motorway_link", "trunk", "trunk_link"],
    "g": ["primary", "primary_link", "secondary", "secondary_link"],
    "s": ["tertiary", "tertiary_link", "unclassified", "residential", "living_street", "road"],
    "o": ["service", "pedestrian"],
}
KLASA = {h: k for k, lista in KLASE.items() for h in lista}
VISINE = {"house": 6, "detached": 6, "garage": 3, "garages": 3, "shed": 3, "roof": 4, "apartments": 15,
          "commercial": 10, "retail": 8, "industrial": 9, "warehouse": 9, "church": 18, "school": 12, "university": 15}

log = logging.getLogger(__name__)


def _b(okvir) -> str:
    return ",".join(str(x) for x in okvir)


def upiti(okvir=OKVIR, okvir_zgrade=OKVIR_ZGRADE) -> dict[str, str]:
    b, z = _b(okvir), _b(okvir_zgrade)
    putevi = "|".join(h for lista in KLASE.values() for h in lista)
    return {
        "putevi": f'[out:json][timeout:180];way["highway"~"^({putevi})$"]({b});out geom;',
        "pruga": f'[out:json][timeout:120];way["railway"="rail"]({b});out geom;',
        "voda": (f'[out:json][timeout:180];(way["natural"="water"]({b});way["waterway"="riverbank"]({b});'
                 f'way["landuse"~"^(reservoir|basin)$"]({b});relation["natural"="water"]({b});'
                 f'relation["waterway"="riverbank"]({b}););out geom;'),
        "zelenilo": (f'[out:json][timeout:180];(way["leisure"~"^(park|garden)$"]({b});'
                     f'way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"]({b});way["natural"="wood"]({b});'
                     f'relation["leisure"="park"]({b});relation["landuse"="forest"]({b});relation["natural"="wood"]({b}););out geom;'),
        "zgrade": f'[out:json][timeout:180];way["building"]({z});out geom;',
        "parking": (f'[out:json][timeout:120];(nwr["amenity"="bicycle_parking"]({b});nwr["amenity"="bicycle_rental"]({b});'
                    f'nwr["amenity"="bicycle_repair_station"]({b});nwr["shop"="bicycle"]({b}););out center tags;'),
    }


def posalji(upit: str) -> dict:
    poslednja = None
    for pokusaj, url in enumerate(SERVERI * 2):
        try:
            r = requests.post(url, data={"data": upit}, headers={"User-Agent": UA}, timeout=240)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            poslednja = e
            log.warning("Overpass %s: %s", url, e)
            time.sleep(5 * (pokusaj + 1))
    raise RuntimeError(f"Overpass nedostupan: {poslednja}")


# ---------------------------------------------------------------- geometrija

def tacke(geometrija) -> list[list[float]]:
    """Overpass geometrija → [[lon, lat], …] na 5 decimala (~1 m), bez uzastopnih duplikata."""
    out = []
    for g in geometrija or []:
        if g is None:
            continue
        p = [round(g["lon"], 5), round(g["lat"], 5)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def spoji_prstenove(delovi: list[list[list[float]]]) -> list[list[list[float]]]:
    """Spaja delove (way-eve relacije) u zatvorene prstenove po zajedničkim krajevima; otvoreni ostaci se odbacuju."""
    delovi = [d[:] for d in delovi if len(d) >= 2]
    prstenovi = []
    while delovi:
        prsten = delovi.pop(0)
        promena = True
        while prsten[0] != prsten[-1] and promena:
            promena = False
            for i, d in enumerate(delovi):
                if d[0] == prsten[-1]:
                    prsten += d[1:]
                elif d[-1] == prsten[-1]:
                    prsten += d[-2::-1]
                elif d[-1] == prsten[0]:
                    prsten = d[:-1] + prsten
                elif d[0] == prsten[0]:
                    prsten = d[:0:-1] + prsten
                else:
                    continue
                delovi.pop(i)
                promena = True
                break
        if prsten[0] == prsten[-1] and len(prsten) >= 4:
            prstenovi.append(prsten)
    return prstenovi


def u_prstenu(tacka, prsten) -> bool:
    x, y = tacka
    unutra = False
    for (x1, y1), (x2, y2) in zip(prsten, prsten[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            unutra = not unutra
    return unutra


def poligoni(e: dict) -> list[list[list[list[float]]]]:
    """Way ili multipolygon relacija → lista poligona [[spoljni, unutrašnji…], …]."""
    if e["type"] == "way":
        p = tacke(e.get("geometry"))
        return [[p]] if len(p) >= 4 and p[0] == p[-1] else []
    spolja = spoji_prstenove([tacke(m.get("geometry")) for m in e.get("members", [])
                              if m.get("type") == "way" and m.get("role") != "inner"])
    unutra = spoji_prstenove([tacke(m.get("geometry")) for m in e.get("members", [])
                              if m.get("type") == "way" and m.get("role") == "inner"])
    out = [[s] for s in spolja]
    for r in unutra:
        for p in out:
            if u_prstenu(r[0], p[0]):
                p.append(r)
                break
    return out


def visina(tagovi: dict) -> int:
    for k in ("height", "building:height"):
        try:
            return max(3, round(float(str(tagovi[k]).replace("m", "").replace(",", ".").strip())))
        except (KeyError, ValueError):
            pass
    try:
        return max(3, round(float(tagovi["building:levels"]) * 3 + 1))
    except (KeyError, ValueError):
        return VISINE.get(tagovi.get("building", ""), 7)


# ---------------------------------------------------------------- slojevi

def _fc(obelezja: list) -> dict:
    return {"type": "FeatureCollection", "izvor": "© OpenStreetMap saradnici (ODbL), Overpass API",
            "preuzeto_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "features": obelezja}


def linije(odgovor: dict, svojstva) -> dict:
    out = []
    for e in odgovor.get("elements", []):
        if e.get("type") != "way":
            continue
        p = tacke(e.get("geometry"))
        s = svojstva(e.get("tags", {}))
        if len(p) >= 2 and s is not None:
            out.append({"type": "Feature", "properties": s, "geometry": {"type": "LineString", "coordinates": p}})
    return _fc(out)


def povrsine(odgovor: dict, svojstva=lambda t: {}) -> dict:
    out = []
    for e in odgovor.get("elements", []):
        for p in poligoni(e):
            out.append({"type": "Feature", "properties": svojstva(e.get("tags", {})),
                        "geometry": {"type": "Polygon", "coordinates": p}})
    return _fc(out)


TIP_TACKE = (("amenity", "bicycle_parking", "p"), ("amenity", "bicycle_rental", "i"),
             ("amenity", "bicycle_repair_station", "r"), ("shop", "bicycle", "s"))


def tacke_za_bicikliste(odgovor: dict) -> dict:
    """Parking, iznajmljivanje, servisi: node → lat/lon, way/relation → centar (out center)."""
    out = []
    for e in odgovor.get("elements", []):
        t = e.get("tags", {})
        tip = next((k for kljuc, v, k in TIP_TACKE if t.get(kljuc) == v), None)
        lat, lon = (e.get("lat"), e.get("lon")) if e.get("type") == "node" else ((e.get("center") or {}).get("lat"), (e.get("center") or {}).get("lon"))
        if tip is None or lat is None:
            continue
        sv = {"t": tip}
        try:
            sv["kap"] = int(str(t["capacity"]).strip())
        except (KeyError, ValueError):
            pass
        if t.get("covered") == "yes" or t.get("bicycle_parking") in ("shed", "building"):
            sv["pok"] = 1
        for kljuc, ime in (("bicycle_parking", "vrsta"), ("name", "ime"), ("operator", "op")):
            if t.get(kljuc):
                sv[ime] = t[kljuc]
        out.append({"type": "Feature", "properties": sv, "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}})
    out.sort(key=lambda f: f["geometry"]["coordinates"])
    return _fc(out)


def napravi(odgovori: dict) -> dict[str, dict]:
    return {
        "putevi": linije(odgovori["putevi"], lambda t: {"k": KLASA[t["highway"]]} if t.get("highway") in KLASA else None),
        "pruga": linije(odgovori["pruga"], lambda t: {}),
        "voda": povrsine(odgovori["voda"]),
        "zelenilo": povrsine(odgovori["zelenilo"]),
        "zgrade": povrsine(odgovori["zgrade"], lambda t: {"h": visina(t)}),
        "parking": tacke_za_bicikliste(odgovori.get("parking", {})),
    }


MINIMUM = {"putevi": 2000, "pruga": 5, "voda": 5, "zelenilo": 50, "zgrade": 1000, "parking": 20}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    odgovori = {}
    for ime, upit in upiti().items():
        odgovori[ime] = posalji(upit)
        log.info("%s: %d elemenata", ime, len(odgovori[ime].get("elements", [])))
    slojevi = napravi(odgovori)
    a.izlaz.mkdir(parents=True, exist_ok=True)
    for ime, fc in slojevi.items():
        if len(fc["features"]) < MINIMUM[ime]:
            raise SystemExit(f"{ime}: premalo obeležja ({len(fc['features'])}) — Overpass odgovor je verovatno nepotpun")
        put = a.izlaz / f"{ime}.geojson"
        put.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log.info("%s: %d obeležja, %.0f KB", ime, len(fc["features"]), put.stat().st_size / 1e3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
