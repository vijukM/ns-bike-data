"""SAJT — vektorska osnova mape Novog Sada iz OpenStreetMap-a (Overpass API) → docs/data/mapa/*.geojson.

    python -m sajt.osnova_mape          # pokreće se u GitHub Actions (workflow sajt_istorija, sta=mapa)

Iz ovih slojeva sajt sam crta „poster“ mape (tamno plava, siva, bela) u MapLibre-u: ulice, voda, zelenilo,
pruga i zgrade (za 3D prikaz, samo uži centar). Vektori ostaju oštri na svakom zumu i poklapaju se sa pinovima.

Svojstva:
  putevi.geojson   k — klasa: a autoput/magistrala, g glavna, s sporedna, o ostale (servisne, pešačke zone);
                   n — naziv ulice latinicom (name:sr-Latn, inače name preslovljen), za a/g/s
  zgrade.geojson   h — visina u metrima (height, building:levels × 3 m ili procena po vrsti)
  parking.geojson  tačke za bicikliste; t — p parking za bicikle, i iznajmljivanje (NS bike), s servis / prodavnica,
                   r stanica za samostalnu popravku; kap (capacity), pok (natkriveno), vrsta (bicycle_parking), ime;
                   unija sa zvaničnim spiskom JKP „Parking servis“ (sajt/podaci/parking_parkingns.json): sif — broj
                   parkirališta (šifra „Bic 23“ → 23), adr — opis lokacije; zvanično mesto bez OSM parkinga u blizini dodaje se kao nova tačka
                   (zv = 1; pribl = 1 kad je položaj poznat samo po ulici ili naselju)
  delovi.geojson   delovi grada i okolna naselja: tačke za natpis (n naziv, v vrsta: town, village, suburb, quarter,
                   neighbourhood, hamlet, locality; b [zapad, jug, istok, sever] ako postoji granica) i granice
                   (Polygon/MultiPolygon, n, v) — iz place=* i administrativnih granica nivoa 9–10 (mesne zajednice)
  mesta.geojson    tačke sa nazivom (n) i vrstom (t): park, trg; važna mesta f fakultet, b bolnica, k pozorište / muzej,
                   z železnička / autobuska stanica, c tržni centar, s stadion
Podaci: © OpenStreetMap saradnici, ODbL (navodi se na sajtu).
"""
from __future__ import annotations

import argparse
import json
import logging
import math
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

VRSTE_DELOVA = ("town", "village", "suburb", "quarter", "neighbourhood", "hamlet", "locality")
MESTA_RE = "|".join(VRSTE_DELOVA)
NIJE_DEO = {"Novi Sad", "Grad Novi Sad", "Нови Сад", "Град Нови Сад"}
PREFIKSI_MZ = ("Mesna zajednica ", "MZ ", "M.Z. ")

ZVANICNI = KOREN / "sajt" / "podaci" / "parking_parkingns.json"
NSBIKE = KOREN / "sajt" / "podaci" / "nsbike_stanice.json"     # 16 stanica sistema NS bike (app.nsbike.rs/stanje), naziv i opis latinicom
PRAG_ISTI_PARKING = 40                                  # m: zvanično mesto i OSM parking bliže od ovoga su isto mesto

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
        "delovi": (f'[out:json][timeout:180];(node["place"~"^({MESTA_RE})$"]({b});way["place"~"^({MESTA_RE})$"]({b});'
                   f'relation["place"~"^({MESTA_RE})$"]({b});relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]({b});'
                   f'relation["boundary"="place"]({b}););out geom;'),
        "mesta": (f'[out:json][timeout:180];(nwr["leisure"="park"]["name"]({b});nwr["place"="square"]({b});'
                  f'way["highway"="pedestrian"]["name"~"^(Trg|Трг) "]({b});'
                  f'nwr["amenity"~"^(university|college|hospital|theatre|bus_station)$"]["name"]({b});nwr["tourism"="museum"]["name"]({b});'
                  f'nwr["railway"="station"]["name"]({b});nwr["shop"="mall"]["name"]({b});nwr["leisure"="stadium"]["name"]({b}););out center tags;'),
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


CIR = dict(zip("абвгдђежзијклљмнњопрстћуфхцчџшАБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШ",
               ["a", "b", "v", "g", "d", "đ", "e", "ž", "z", "i", "j", "k", "l", "lj", "m", "n", "nj", "o", "p", "r", "s", "t", "ć",
                "u", "f", "h", "c", "č", "dž", "š", "A", "B", "V", "G", "D", "Đ", "E", "Ž", "Z", "I", "J", "K", "L", "Lj", "M", "N", "Nj",
                "O", "P", "R", "S", "T", "Ć", "U", "F", "H", "C", "Č", "Dž", "Š"]))


def latinica(tekst: str) -> str:
    """Srpska ćirilica → latinica (naziv ulice na mapi je latinicom, kao ceo sajt)."""
    return "".join(CIR.get(c, c) for c in tekst)


def naziv_ulice(t: dict) -> str | None:
    n = t.get("name:sr-Latn") or t.get("name")
    return latinica(n).strip() if n else None


def svojstva_puta(t: dict) -> dict | None:
    k = KLASA.get(t.get("highway"))
    if k is None:
        return None
    sv = {"k": k}
    n = naziv_ulice(t) if k != "o" else None
    if n:
        sv["n"] = n
    return sv


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


def pojednostavi(prsten: list[list[float]], tolerancija: float = 4e-5) -> list[list[float]]:
    """Douglas–Peucker (~4 m): granice mesnih zajednica imaju mnogo tačaka, a za obris su dovoljne ovako."""
    if len(prsten) <= 4:
        return prsten
    out = _dp(prsten, tolerancija)
    return out if len(out) >= 4 else prsten


def _dp(prsten, tolerancija):
    if len(prsten) <= 2:
        return prsten
    (x1, y1), (x2, y2) = prsten[0], prsten[-1]
    dx, dy = x2 - x1, y2 - y1
    d2 = dx * dx + dy * dy
    najdalja, i_max = -1.0, 0
    for i in range(1, len(prsten) - 1):
        x, y = prsten[i]
        if d2 == 0:
            d = (x - x1) ** 2 + (y - y1) ** 2
        else:
            u = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / d2))
            d = (x - x1 - u * dx) ** 2 + (y - y1 - u * dy) ** 2
        if d > najdalja:
            najdalja, i_max = d, i
    if najdalja <= tolerancija ** 2:
        return [prsten[0], prsten[-1]]
    return _dp(prsten[: i_max + 1], tolerancija)[:-1] + _dp(prsten[i_max:], tolerancija)


def _povrsina_i_teziste(prsten):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(prsten, prsten[1:]):
        k = x1 * y2 - x2 * y1
        a += k
        cx += (x1 + x2) * k
        cy += (y1 + y2) * k
    if abs(a) < 1e-12:
        return 0.0, prsten[0]
    return abs(a) / 2, [round(cx / (3 * a), 5), round(cy / (3 * a), 5)]


def naziv_dela(t: dict) -> str | None:
    n = naziv_ulice(t)
    if not n:
        return None
    for p in PREFIKSI_MZ:
        if n.startswith(p):
            n = n[len(p):].strip()
    return n or None


def delovi_grada(odgovor: dict) -> dict:
    """Tačke za natpise delova grada (place=* čvorovi) + granice (place=* površine, mesne zajednice) uparene po nazivu."""
    tacke_d, granice = {}, {}
    for e in odgovor.get("elements", []):
        t = e.get("tags", {})
        n = naziv_dela(t)
        if not n or n in NIJE_DEO:
            continue
        if e.get("type") == "node":
            if t.get("place") in VRSTE_DELOVA and n not in tacke_d:
                tacke_d[n] = {"v": t["place"], "p": [round(e["lon"], 5), round(e["lat"], 5)]}
            continue
        poli = [[pojednostavi(r) for r in p] for p in poligoni(e)]
        poli = [p for p in poli if len(p[0]) >= 4]
        if not poli:
            continue
        v = t.get("place") if t.get("place") in VRSTE_DELOVA else "mz"
        # ista celina može da postoji i kao place=* i kao mesna zajednica: prednost ima place=*
        if n not in granice or (granice[n][0] == "mz" and v != "mz"):
            granice[n] = (v, poli)
    out = []
    for n, (v, poli) in sorted(granice.items()):
        geom = {"type": "Polygon", "coordinates": poli[0]} if len(poli) == 1 else {"type": "MultiPolygon", "coordinates": poli}
        out.append({"type": "Feature", "properties": {"n": n, "v": v}, "geometry": geom})
    for n in sorted(set(tacke_d) | set(granice)):
        sv = {"n": n, "v": tacke_d[n]["v"] if n in tacke_d else granice[n][0]}
        if n in granice:
            sve = [x for p in granice[n][1] for x in p[0]]
            sv["b"] = [min(x for x, _ in sve), min(y for _, y in sve), max(x for x, _ in sve), max(y for _, y in sve)]
            tacka = tacke_d[n]["p"] if n in tacke_d else max((_povrsina_i_teziste(p[0]) for p in granice[n][1]), key=lambda x: x[0])[1]
        else:
            tacka = tacke_d[n]["p"]
        out.append({"type": "Feature", "properties": sv, "geometry": {"type": "Point", "coordinates": tacka}})
    return _fc(out)


VRSTE_MESTA = (("leisure", "park", "park"), ("place", "square", "trg"), ("highway", "pedestrian", "trg"),
               ("amenity", "university", "f"), ("amenity", "college", "f"), ("amenity", "hospital", "b"),
               ("amenity", "theatre", "k"), ("tourism", "museum", "k"), ("amenity", "bus_station", "z"),
               ("railway", "station", "z"), ("shop", "mall", "c"), ("leisure", "stadium", "s"))


def mesta_sa_nazivom(odgovor: dict) -> dict:
    """Parkovi, trgovi i važna mesta kao tačke (centar površine), bez ponavljanja istog naziva iste vrste."""
    vidjeno, out = set(), []
    for e in odgovor.get("elements", []):
        t = e.get("tags", {})
        vrsta = next((k for kljuc, v, k in VRSTE_MESTA if t.get(kljuc) == v), None)
        n = naziv_ulice(t)
        lat, lon = (e.get("lat"), e.get("lon")) if e.get("type") == "node" else ((e.get("center") or {}).get("lat"), (e.get("center") or {}).get("lon"))
        if vrsta is None or not n or lat is None or (vrsta, n) in vidjeno:
            continue
        vidjeno.add((vrsta, n))
        out.append({"type": "Feature", "properties": {"n": n, "t": vrsta}, "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]}})
    out.sort(key=lambda f: (f["properties"]["t"], f["properties"]["n"]))
    return _fc(out)


def _metri(a, b) -> float:
    kx = 111320 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110574)


def spoji_zvanicne(fc: dict, zvanicni: list[dict], prag: float = PRAG_ISTI_PARKING) -> dict:
    """Unija OSM parkinga i zvaničnog spiska: par (OSM parking, zvanično mesto) bliži od praga je isto mesto — OSM tački se
    dopišu šifra i opis; zvanična mesta bez para dodaju se kao nove tačke (t = p). Uparuje se jedan na jedan, od najbližih."""
    osm = [f for f in fc["features"] if f["properties"]["t"] == "p"]
    parovi = sorted((_metri(f["geometry"]["coordinates"], (z["lon"], z["lat"])), i, j)
                    for i, f in enumerate(osm) for j, z in enumerate(zvanicni))
    uzet_o, uzet_z = set(), set()
    for d, i, j in parovi:
        if d > prag:
            break
        if i in uzet_o or j in uzet_z:
            continue
        uzet_o.add(i); uzet_z.add(j)
        osm[i]["properties"].update({"sif": zvanicni[j]["sif"], "adr": zvanicni[j]["adr"]})
    novi = [{"type": "Feature", "properties": {"t": "p", "sif": z["sif"], "adr": z["adr"], "zv": 1,
                                               **({"pribl": 1} if "približno" in z.get("pol", "") else {})},
             "geometry": {"type": "Point", "coordinates": [round(z["lon"], 6), round(z["lat"], 6)]}}
            for j, z in enumerate(zvanicni) if j not in uzet_z]
    out = fc["features"] + novi
    out.sort(key=lambda f: f["geometry"]["coordinates"])
    return {**fc, "features": out, "zvanicnih": len(zvanicni), "uparenih": len(uzet_z), "dodatih": len(novi)}


def spoji_nsbike(fc: dict, stanice: list[dict], prag: float = 60) -> dict:
    """Zvanične NS bike stanice: OSM tačka za iznajmljivanje (t = i) bliža od praga dobija šifru, naziv, opis, broj mesta
    i zvanični položaj; stanica bez para dodaje se. Ostale OSM tačke za iznajmljivanje (privatne) ostaju kakve jesu."""
    osm = [f for f in fc["features"] if f["properties"]["t"] == "i"]
    parovi = sorted((_metri(f["geometry"]["coordinates"], (z["lon"], z["lat"])), i, j)
                    for i, f in enumerate(osm) for j, z in enumerate(stanice))
    upareni = {}                                                  # OSM indeks -> indeks stanice, jedan na jedan, od najbližih
    for d, i, j in parovi:
        if d > prag:
            break
        if i not in upareni and j not in upareni.values():
            upareni[i] = j

    def svojstva(z):
        return {"t": "i", "sif": z["sif"], "ime": z["ime"], "adr": z["adr"], "kap": z["mesta"], "nsb": 1,
                **({"slike": z["slike"]} if z.get("slike") else {})}
    for i, j in upareni.items():
        z = stanice[j]
        osm[i]["properties"] = svojstva(z)
        osm[i]["geometry"] = {"type": "Point", "coordinates": [round(z["lon"], 6), round(z["lat"], 6)]}
    novi = [{"type": "Feature", "properties": svojstva(z), "geometry": {"type": "Point", "coordinates": [round(z["lon"], 6), round(z["lat"], 6)]}}
            for j, z in enumerate(stanice) if j not in upareni.values()]
    out = fc["features"] + novi
    out.sort(key=lambda f: f["geometry"]["coordinates"])
    return {**fc, "features": out, "nsbike": len(stanice), "nsbike_dodato": len(novi)}


def napravi(odgovori: dict) -> dict[str, dict]:
    return {
        "putevi": linije(odgovori["putevi"], svojstva_puta),
        "pruga": linije(odgovori["pruga"], lambda t: {}),
        "voda": povrsine(odgovori["voda"]),
        "zelenilo": povrsine(odgovori["zelenilo"]),
        "zgrade": povrsine(odgovori["zgrade"], lambda t: {"h": visina(t)}),
        "parking": spoji_nsbike(spoji_zvanicne(tacke_za_bicikliste(odgovori.get("parking", {})),
                                               json.loads(ZVANICNI.read_text(encoding="utf-8")) if ZVANICNI.exists() else []),
                                json.loads(NSBIKE.read_text(encoding="utf-8")) if NSBIKE.exists() else []),
        "delovi": delovi_grada(odgovori.get("delovi", {})),
        "mesta": mesta_sa_nazivom(odgovori.get("mesta", {})),
    }


MINIMUM = {"putevi": 2000, "pruga": 5, "voda": 5, "zelenilo": 50, "zgrade": 1000, "parking": 20, "delovi": 10, "mesta": 20}
OPCIONI = {"delovi", "mesta"}            # natpisi: ako zakažu, ne ruše osnovu mape


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    odgovori = {}
    for ime, upit in upiti().items():
        try:
            odgovori[ime] = posalji(upit)
        except RuntimeError:
            if ime not in OPCIONI:
                raise
            log.warning("%s: Overpass nije odgovorio — ostaje prethodna verzija", ime)
            odgovori[ime] = {}
        log.info("%s: %d elemenata", ime, len(odgovori[ime].get("elements", [])))
    slojevi = napravi(odgovori)
    a.izlaz.mkdir(parents=True, exist_ok=True)
    for ime, fc in slojevi.items():
        if len(fc["features"]) < MINIMUM[ime] and ime in OPCIONI:
            log.warning("%s: premalo obeležja (%d) — ostaje prethodna verzija", ime, len(fc["features"]))
            continue
        if len(fc["features"]) < MINIMUM[ime]:
            raise SystemExit(f"{ime}: premalo obeležja ({len(fc['features'])}) — Overpass odgovor je verovatno nepotpun")
        put = a.izlaz / f"{ime}.geojson"
        put.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log.info("%s: %d obeležja, %.0f KB", ime, len(fc["features"]), put.stat().st_size / 1e3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
