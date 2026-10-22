"""SAJT — analiza mreže biciklističkih staza za stranu „Biciklističke staze“ → docs/data/staze_analiza.json.

    python -m sajt.staze_analiza          # posle sajt.staze i/ili sajt.osnova_mape (workflow sajt_istorija)

Ulazi (svi već postoje na sajtu): staze.geojson (OSM staze, trake, zajedničke površine), mapa/putevi.geojson
(ulice sa nazivima i klasom), mapa/delovi.geojson (granice delova grada), mapa/mesta.geojson, istorija/stanice.json.

Šta se računa (sve u metrima, ravna projekcija oko 45,25° s. g. š. — greška < 0,1 % na ovom području):
  - dužina linija po vrsti i dužina pravaca: staze sa obe strane bulevara su dve linije, ali jedan pravac
    (tačka staze koja ima paralelnu stazu druge deonice na 4–50 m popreko broji se kao 1/(1+n));
  - naziv ulice svake deonice: najbliža paralelna ulica (do 35 m, pa do 80 m), većinom po dužini;
    deonice daleko od ulica (kej, nasipi, staze ka okolnim mestima) dobijaju naziv po najbližem mestu;
  - brojači: najbliža staza i ulica; deonice iste ulice do 1,5 km dobijaju najbliži brojač (opterećenje);
  - ulice: koliko je udaljena najbliža staza (klase ≤100, ≤300, ≤600, >600 m) i da li uz ulicu ide staza;
  - delovi grada: km staza, udeo glavnih i svih ulica uz koje ide staza, tipična udaljenost do staze;
  - prekidi: kraj staze bez veze, a druga staza se nastavlja istim pravcem 15–150 m dalje, duž ulice;
    i krajevi gde se staza završi, a ista glavna ulica se nastavlja bez staze.
Podaci: © OpenStreetMap saradnici (ODbL). Analiza zavisi od toga koliko je OSM potpun — strana to navodi.
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

KOREN = Path(__file__).resolve().parents[1]
DATA = KOREN / "docs" / "data"
IZLAZ = DATA / "staze_analiza.json"

KX = 111320 * math.cos(math.radians(45.25))
KY = 110574
KLASE_PUTA = "asg"                       # autoput, sporedna, glavna (klasa „o“ — servisne i pešačke — se ne računa)
A, SPOREDNA, GLAVNA = range(3)
GRANICE_UDALJENOSTI = (100, 300, 600)   # m: klase 0..3 za „koliko je daleko najbliža staza“
KORAK_STAZE, KORAK_PUTA = 5.0, 10.0
PRAG_BROJAC_DEONICA = 1500              # m: deonica iste ulice dobija najbliži brojač ako je bliže od ovoga

log = logging.getLogger(__name__)


# ---------------------------------------------------------------- geometrija
def u_m(c) -> tuple[float, float]:
    return c[0] * KX, c[1] * KY


def u_lonlat(x: float, y: float) -> list[float]:
    return [round(x / KX, 5), round(y / KY, 5)]


def progusti(koord, korak: float) -> list[tuple]:
    """Tačke na sredinama komada dužine ≤ korak: (x, y, ux, uy, dužina komada)."""
    p = [u_m(c) for c in koord]
    out = []
    for (ax, ay), (bx, by) in zip(p, p[1:]):
        L = math.hypot(bx - ax, by - ay)
        if L == 0:
            continue
        ux, uy = (bx - ax) / L, (by - ay) / L
        n = max(1, math.ceil(L / korak))
        for j in range(n):
            t = (j + 0.5) / n * L
            out.append((ax + ux * t, ay + uy * t, ux, uy, L / n))
    return out


class Mreza:
    """Prostorni indeks tačaka u ćelijama zadate veličine (bez scipy-ja)."""

    def __init__(self, x: np.ndarray, y: np.ndarray, celija: float):
        self.c = celija
        d = defaultdict(list)
        for i, k in enumerate(zip((x // celija).astype(int).tolist(), (y // celija).astype(int).tolist())):
            d[k].append(i)
        self.d = {k: np.array(v) for k, v in d.items()}

    def blizu(self, x: float, y: float, r: float) -> np.ndarray:
        a0, a1, b0, b1 = int((x - r) // self.c), int((x + r) // self.c), int((y - r) // self.c), int((y + r) // self.c)
        delovi = [self.d[(a, b)] for a in range(a0, a1 + 1) for b in range(b0, b1 + 1) if (a, b) in self.d]
        return np.concatenate(delovi) if delovi else np.empty(0, dtype=int)


def unutra(x: np.ndarray, y: np.ndarray, prsten: list) -> np.ndarray:
    """Tačke (u metrima) unutar poligona (prsten u lon/lat) — par-nepar pravilo."""
    p = np.array([u_m(c) for c in prsten])
    u = np.zeros(len(x), dtype=bool)
    for (x1, y1), (x2, y2) in zip(p, np.roll(p, -1, axis=0)):
        s = (y1 > y) != (y2 > y)
        if not s.any():
            continue
        with np.errstate(divide="ignore", invalid="ignore"):
            xp = (x2 - x1) * (y - y1) / (y2 - y1) + x1
        u ^= s & (x < xp)
    return u


def okvir(tacke: np.ndarray) -> list[float]:
    return [*u_lonlat(tacke[:, 0].min(), tacke[:, 1].min()), *u_lonlat(tacke[:, 0].max(), tacke[:, 1].max())]


# ---------------------------------------------------------------- delovi grada (isto pravilo kao mapa-modul.js)
def gradski_delovi(delovi: dict) -> list[tuple[str, list]]:
    """Četvrti (+ Liman) i naselja sa granicom van četvrti; deo sa pod-delovima (Liman → Liman 1–4) se izostavlja."""
    prstenovi = {}
    for f in delovi["features"]:
        g = f["geometry"]
        if g["type"] == "Polygon":
            prstenovi[f["properties"]["n"]] = [g["coordinates"][0]]
        elif g["type"] == "MultiPolygon":
            prstenovi[f["properties"]["n"]] = [p[0] for p in g["coordinates"]]
    s_granicom = [f for f in delovi["features"] if f["geometry"]["type"] == "Point" and f["properties"].get("b")]
    cetvrti = [f for f in s_granicom if f["properties"]["v"] == "quarter" or f["properties"]["n"] == "Liman"]

    def u_cetvrti(f):
        x, y = u_m(f["geometry"]["coordinates"])
        return any(unutra(np.array([x]), np.array([y]), p)[0] for c in cetvrti for p in prstenovi.get(c["properties"]["n"], []))

    lista = cetvrti + [f for f in s_granicom if f["properties"]["v"] == "neighbourhood" and not u_cetvrti(f)]
    imena = [f["properties"]["n"] for f in lista]
    listovi = [n for n in imena if not any(x.startswith(n + " ") for x in imena)]
    return [(n, prstenovi[n]) for n in sorted(set(listovi)) if n in prstenovi]


# ---------------------------------------------------------------- analiza
def analiziraj(staze: dict, putevi: dict, delovi: dict, mesta: dict, stanice: dict, voda: dict | None = None) -> dict:
    F = staze["features"]
    vrste = [f["properties"]["t"] for f in F]

    sp = np.array([(*p, i) for i, f in enumerate(F) for p in progusti(f["geometry"]["coordinates"], KORAK_STAZE)])
    fs = sp[:, 5].astype(int)
    ms = Mreza(sp[:, 0], sp[:, 1], 40)

    imena, im_idx, rp = [], {}, []
    for i, f in enumerate(putevi["features"]):
        k = f["properties"]["k"]
        if k not in KLASE_PUTA:
            continue
        n = f["properties"].get("n")
        if n and n not in im_idx:
            im_idx[n] = len(imena)
            imena.append(n)
        for p in progusti(f["geometry"]["coordinates"], KORAK_PUTA):
            rp.append((*p, i, im_idx[n] if n else -1, KLASE_PUTA.index(k)))
    rp = np.array(rp)
    rk = rp[:, 7].astype(int)
    mr = Mreza(rp[:, 0], rp[:, 1], 40)

    # 1) naziv ulice uz svaku tačku staze: najbliža paralelna ulica sa nazivom (35 m, pa 80 m)
    ulica_t = np.full(len(sp), -1)
    for i, (x, y, ux, uy, _, _) in enumerate(sp):
        c = mr.blizu(x, y, 80)
        c = c[rp[c, 6] >= 0]
        if not len(c):
            continue
        d = np.hypot(rp[c, 0] - x, rp[c, 1] - y)
        par = np.abs(rp[c, 2] * ux + rp[c, 3] * uy) > 0.8
        for r in (35, 80):
            ok = par & (d < r)
            if ok.any():
                ulica_t[i] = int(rp[c[ok][np.argmin(d[ok])], 6])
                break

    # 2) pravci: paralelna tačka druge deonice 4–50 m popreko i < 8 m uzduž → obe strane ulice su jedan pravac
    tezina = np.ones(len(sp))
    for i, (x, y, ux, uy, _, f) in enumerate(sp):
        c = ms.blizu(x, y, 50)
        c = c[fs[c] != f]
        if not len(c):
            continue
        dx, dy = sp[c, 0] - x, sp[c, 1] - y
        uz, po = np.abs(dx * ux + dy * uy), np.abs(-dx * uy + dy * ux)
        ok = (np.abs(sp[c, 2] * ux + sp[c, 3] * uy) > 0.9) & (uz < 8) & (po > 4) & (po < 50)
        if ok.any():
            tezina[i] = 1 / (1 + len(set(fs[c[ok]].tolist())))

    duz = np.bincount(fs, weights=sp[:, 4], minlength=len(F))
    duz_pravca = np.bincount(fs, weights=sp[:, 4] * tezina, minlength=len(F))

    # naziv deonice = ulica sa najviše dužine (bar pola deonice); ostale po najbližem mestu, po povezanim grupama
    glas = defaultdict(Counter)
    for f, u, w in zip(fs.tolist(), ulica_t.tolist(), sp[:, 4].tolist()):
        if u >= 0:
            glas[f][u] += w
    ulica_f = {}
    for f in range(len(F)):
        if glas[f]:
            u, w = glas[f].most_common(1)[0]
            if w >= 0.5 * duz[f]:
                ulica_f[f] = imena[u]
    bez = [f for f in range(len(F)) if f not in ulica_f]
    if bez:
        tacke_mesta = [(f["geometry"]["coordinates"], f["properties"]["n"]) for f in mesta["features"]] + \
            [(f["geometry"]["coordinates"], f["properties"]["n"]) for f in delovi["features"]
             if f["geometry"]["type"] == "Point" and f["properties"]["v"] != "mz"]          # mesne zajednice nisu poznati nazivi
        pm = np.array([u_m(c) for c, _ in tacke_mesta])
        obala = obala_dunava(voda) if voda else None
        mo = Mreza(obala[:, 0], obala[:, 1], 150) if obala is not None else None
        for grupa in povezane_grupe(F, bez):
            t = sp[np.isin(fs, grupa)]
            cx, cy = np.average(t[:, 0], weights=t[:, 4]), np.average(t[:, 1], weights=t[:, 4])
            n = f"kod: {tacke_mesta[int(np.argmin(np.hypot(pm[:, 0] - cx, pm[:, 1] - cy)))][1]}"
            if mo is not None:                                       # kej i nasip: većina deonice do 150 m od obale Dunava
                uz = np.array([(np.hypot(obala[c, 0] - x, obala[c, 1] - y) < 150).any() for x, y in t[:, :2] for c in [mo.blizu(x, y, 150)]])
                if t[uz, 4].sum() >= 0.5 * t[:, 4].sum():
                    n = "uz Dunav"
            for f in grupa:
                ulica_f[f] = n

    # 3) brojači (po mestu: a i b su dve strane iste ulice) → najbliža staza
    po_mestu = defaultdict(list)
    for s in stanice["serije"]:
        po_mestu[s["mesto"]].append(s)
    brojaci = []
    for mesto, ser in sorted(po_mestu.items()):
        x = float(np.mean([u_m((s["lon"], s["lat"]))[0] for s in ser]))
        y = float(np.mean([u_m((s["lon"], s["lat"]))[1] for s in ser]))
        c = ms.blizu(x, y, 300)
        if not len(c):
            continue
        d = np.hypot(sp[c, 0] - x, sp[c, 1] - y)
        # brojač stoji kod raskrsnice: prednost ima staza ulice iz naziva brojača („Futoška (kod …)“, „Bulevar … – Paje Adamova“)
        osnova = ser[0]["naziv"].split(" (")[0].split(" – ")[0].strip()
        ista = np.array([ulica_f.get(int(f)) == osnova for f in fs[c]])
        if (ista & (d < 300)).any():
            d = np.where(ista, d, np.inf)
        j = int(c[np.argmin(d)])
        f = int(fs[j])
        brojaci.append({"mesto": mesto, "naziv": ser[0]["naziv"], "serije": [s["serija"] for s in ser],
                        "prosek": int(sum(s["prosek_12m"] or 0 for s in ser)),
                        "stanje": [s["stanje"] for s in ser], "ulica": ulica_f.get(f), "vrsta": vrste[f],
                        "udaljenost_m": round(float(d.min()), 1), "p": u_lonlat(x, y)})

    # deonica → najbliži brojač na istoj ulici (do 1,5 km od sredine deonice)
    sredina = {f: (np.average(sp[fs == f, 0], weights=sp[fs == f, 4]), np.average(sp[fs == f, 1], weights=sp[fs == f, 4]))
               for f in range(len(F)) if duz[f] > 0}
    brojac_f = {}
    for f, (x, y) in sredina.items():
        kand = [(math.hypot(u_m(b["p"])[0] - x, u_m(b["p"])[1] - y), b["mesto"]) for b in brojaci if b["ulica"] == ulica_f.get(f)]
        if kand and min(kand)[0] <= PRAG_BROJAC_DEONICA:
            brojac_f[f] = min(kand)[1]

    # 4) ulice: udaljenost do najbliže staze i da li uz ulicu ide staza (paralelna do 30 m)
    ms100 = Mreza(sp[:, 0], sp[:, 1], 150)
    udalj = np.full(len(rp), 5000.0)
    pokr = np.zeros(len(rp), dtype=bool)
    for i, (x, y, ux, uy, *_r) in enumerate(rp):
        for r in (30, 150, 600, 1500):
            c = (ms if r <= 40 else ms100).blizu(x, y, r)
            if not len(c):
                continue
            d = np.hypot(sp[c, 0] - x, sp[c, 1] - y)
            if d.min() <= r:
                udalj[i] = d.min()
                if r == 30:
                    pokr[i] = bool(((d < 30) & (np.abs(sp[c, 2] * ux + sp[c, 3] * uy) > 0.8)).any())
                break
    klasa_t = np.searchsorted(np.array(GRANICE_UDALJENOSTI), udalj, side="left")
    rf = rp[:, 5].astype(int)
    klasa_puta = ["-"] * len(putevi["features"])
    po_putu = defaultdict(list)
    for f, k in zip(rf.tolist(), klasa_t.tolist()):
        po_putu[f].append(k)
    for f, ks in po_putu.items():
        klasa_puta[f] = str(int(np.median(ks)))

    # 5) delovi grada
    delovi_out = []
    for ime, prstenovi in gradski_delovi(delovi):
        u_r = np.zeros(len(rp), dtype=bool)
        u_s = np.zeros(len(sp), dtype=bool)
        for p in prstenovi:
            u_r |= unutra(rp[:, 0], rp[:, 1], p)
            u_s |= unutra(sp[:, 0], sp[:, 1], p)
        if not u_r.any():
            continue
        w = rp[:, 4]
        g = u_r & (rk == GLAVNA)
        sve = u_r & (rk != A)
        b_unutra = [b["mesto"] for b in brojaci if any(unutra(np.array([u_m(b["p"])[0]]), np.array([u_m(b["p"])[1]]), p)[0] for p in prstenovi)]
        sv = np.concatenate([np.array([u_m(c) for c in p]) for p in prstenovi])
        delovi_out.append({
            "n": ime, "km_staza": round(float(sp[u_s, 4].sum()) / 1000, 2), "km_pravaca": round(float((sp[u_s, 4] * tezina[u_s]).sum()) / 1000, 2),
            "km_ulica": round(float(w[sve].sum()) / 1000, 1), "km_glavnih": round(float(w[g].sum()) / 1000, 1),
            "pokr_glavnih": round(float(w[g & pokr].sum() / w[g].sum()), 3) if w[g].sum() > 200 else None,
            "pokr_ulica": round(float(w[sve & pokr].sum() / w[sve].sum()), 3) if w[sve].sum() else None,
            "do_300": round(float(w[sve & (udalj <= 300)].sum() / w[sve].sum()), 3) if w[sve].sum() else None,
            "medijana_m": int(np.median(udalj[sve])) if sve.any() else None,
            "brojaci": b_unutra, "b": [*u_lonlat(sv[:, 0].min(), sv[:, 1].min()), *u_lonlat(sv[:, 0].max(), sv[:, 1].max())]})
    delovi_out.sort(key=lambda d: -d["km_pravaca"])

    # 6) prekidi i krajevi staza
    prekidi, krajevi = prekidi_i_krajevi(F, sp, fs, ms, rp, mr, pokr, imena, ulica_f)

    # 7) ulice sa stazama (pravci): dužine, vrste, strane, brojači
    ulice = defaultdict(lambda: {"km": 0.0, "km_pravca": 0.0, "vrste": Counter(), "f": []})
    for f in range(len(F)):
        u = ulica_f.get(f)
        if u is None:
            continue
        z = ulice[u]
        z["km"] += duz[f] / 1000
        z["km_pravca"] += duz_pravca[f] / 1000
        z["vrste"][vrste[f]] += duz[f] / 1000
        z["f"].append(f)
    ulice_out = []
    for u, z in ulice.items():
        t = sp[np.isin(fs, z["f"])]
        bb = [b for b in brojaci if b["ulica"] == u]
        ulice_out.append({"n": u, "van_ulice": u not in im_idx, "km": round(z["km"], 2), "km_pravca": round(z["km_pravca"], 2),
                          "vrste": {k: round(v, 2) for k, v in z["vrste"].items()},
                          "obe_strane": round(z["km"] / z["km_pravca"], 2) if z["km_pravca"] else None,
                          "brojaci": [b["mesto"] for b in bb], "prosek": max((b["prosek"] for b in bb), default=None),
                          "b": okvir(t)})
    ulice_out.sort(key=lambda u: -u["km_pravca"])
    ui = {u["n"]: i for i, u in enumerate(ulice_out)}

    km = {k: round(float(sum(duz[f] for f in range(len(F)) if vrste[f] == k)) / 1000, 2) for k in "stz"}
    km_glavnih = float(rp[rk == GLAVNA, 4].sum())
    gradske = np.zeros(len(rp), dtype=bool)
    for _, prstenovi in gradski_delovi(delovi):
        for p in prstenovi:
            gradske |= unutra(rp[:, 0], rp[:, 1], p)
    w = rp[:, 4]
    gg, gs = gradske & (rk == GLAVNA), gradske & (rk != A)
    return {
        "generisano_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "staze_preuzeto_utc": staze.get("preuzeto_utc"), "putevi_preuzeto_utc": putevi.get("preuzeto_utc"),
        "izvor": "© OpenStreetMap saradnici (ODbL); analiza: ns-bike-data",
        "ukupno": {"km": km, "km_linija": round(sum(km.values()), 1), "km_pravaca": round(float(duz_pravca.sum()) / 1000, 1),
                   "deonica": len(F), "ulica": sum(not u["van_ulice"] for u in ulice_out),
                   "grad": {"km_glavnih": round(float(w[gg].sum()) / 1000, 1), "pokr_glavnih": round(float(w[gg & pokr].sum() / w[gg].sum()), 3),
                            "km_ulica": round(float(w[gs].sum()) / 1000, 1), "pokr_ulica": round(float(w[gs & pokr].sum() / w[gs].sum()), 3),
                            "do_300": round(float(w[gs & (udalj <= 300)].sum() / w[gs].sum()), 3),
                            "udaljenost_km": [round(float(w[gs & (klasa_t == k)].sum()) / 1000, 1) for k in range(4)]},
                   "km_glavnih_ukupno": round(km_glavnih / 1000, 1)},
        "granice_udaljenosti": list(GRANICE_UDALJENOSTI),
        "ulice": ulice_out,
        # OSM id deonice → [indeks ulice u „ulice“, mesto brojača ili null, dužina pravca / dužina linije]
        "deonice": {str(F[f]["properties"]["id"]): [ui.get(ulica_f.get(f), -1), brojac_f.get(f), round(float(duz_pravca[f] / duz[f]), 2) if duz[f] else 1]
                    for f in range(len(F))},
        "brojaci": brojaci,
        "delovi": delovi_out,
        "prekidi": prekidi,
        "krajevi": krajevi,
        # jedan znak po obeležju putevi.geojson: klasa udaljenosti najbliže staze (0–3) ili „-“ (servisne, pešačke)
        "udaljenost_puteva": "".join(klasa_puta),
    }


def povezane_grupe(F: list, indeksi: list[int], prag: float = 15.0) -> list[list[int]]:
    """Deonice čiji se krajevi dodiruju (do 15 m) idu u istu grupu (union-find)."""
    roditelj = {i: i for i in indeksi}

    def koren(i):
        while roditelj[i] != i:
            roditelj[i] = roditelj[roditelj[i]]
            i = roditelj[i]
        return i

    krajevi = [(i, *u_m(c)) for i in indeksi for c in (F[i]["geometry"]["coordinates"][0], F[i]["geometry"]["coordinates"][-1])]
    k = np.array([(x, y) for _, x, y in krajevi])
    for a in range(len(krajevi)):
        d = np.hypot(k[:, 0] - k[a, 0], k[:, 1] - k[a, 1])
        for b in np.nonzero(d < prag)[0]:
            ra, rb = koren(krajevi[a][0]), koren(krajevi[int(b)][0])
            if ra != rb:
                roditelj[ra] = rb
    grupe = defaultdict(list)
    for i in indeksi:
        grupe[koren(i)].append(i)
    return list(grupe.values())


def prekidi_i_krajevi(F, sp, fs, ms, rp, mr, pokr, imena, ulica_f):
    """Slobodni krajevi deonica: prekid (nastavak na 15–150 m istim pravcem duž ulice) ili kraj (ulica se nastavlja bez staze)."""
    temena = np.array([(*u_m(c), i) for i, f in enumerate(F) for c in f["geometry"]["coordinates"]])
    mt = Mreza(temena[:, 0], temena[:, 1], 40)
    kandidati = []
    for i, f in enumerate(F):
        c = f["geometry"]["coordinates"]
        if len(c) < 2 or c[0] == c[-1]:
            continue
        for kraj, pre in ((c[0], c[1]), (c[-1], c[-2])):
            ax, ay = u_m(kraj)
            bx, by = u_m(pre)
            L = math.hypot(ax - bx, ay - by)
            if L == 0:
                continue
            ux, uy = (ax - bx) / L, (ay - by) / L                       # pravac „napolje“
            # povezan: tačka ili teme druge deonice do 6 m
            blizu = np.concatenate([ms.blizu(ax, ay, 6), np.empty(0, dtype=int)])
            if (np.hypot(sp[blizu, 0] - ax, sp[blizu, 1] - ay)[fs[blizu] != i] < 6).any():
                continue
            t = mt.blizu(ax, ay, 6)
            if (np.hypot(temena[t, 0] - ax, temena[t, 1] - ay)[temena[t, 2] != i] < 6).any():
                continue
            kandidati.append((i, ax, ay, ux, uy))

    prekidi, krajevi, vidjeni = [], [], set()
    for i, ax, ay, ux, uy in kandidati:
        c = ms.blizu(ax, ay, 150)
        c = c[fs[c] != i]
        dx, dy = sp[c, 0] - ax, sp[c, 1] - ay
        d = np.hypot(dx, dy)
        with np.errstate(invalid="ignore", divide="ignore"):
            ugao = (dx * ux + dy * uy) / d
        bocno = np.abs(-dx * uy + dy * ux)                             # nastavak mora biti na istoj liniji, ne „kuka“ u stranu
        ok = (d >= 15) & (d <= 150) & (ugao > math.cos(math.radians(25))) & (np.abs(sp[c, 2] * ux + sp[c, 3] * uy) > 0.85) & \
            (bocno < np.maximum(6, 0.12 * d))
        # ulica duž prekida (sredina prekida do 30 m od ulice sa nazivom, paralelna sa stazom)
        ulica = None
        if ok.any():
            j = int(c[ok][np.argmin(d[ok])])
            mx, my = (ax + sp[j, 0]) / 2, (ay + sp[j, 1]) / 2
            r = mr.blizu(mx, my, 30)
            r = r[(rp[r, 6] >= 0) & (np.hypot(rp[r, 0] - mx, rp[r, 1] - my) < 30) & (np.abs(rp[r, 2] * ux + rp[r, 3] * uy) > 0.8)]
            if len(r):
                ulica = imena[int(rp[r[np.argmin(np.hypot(rp[r, 0] - mx, rp[r, 1] - my))], 6])]
                par = tuple(sorted((i, int(fs[j]))))
                if par in vidjeni:
                    continue
                vidjeni.add(par)
                # raskrsnica: preko prekida prelazi druga ulica (tačka puta do 12 m od duži, ne paralelna sa stazom)
                bx, by = float(sp[j, 0]), float(sp[j, 1])
                r = mr.blizu(mx, my, d[ok].min() / 2 + 12)
                vx, vy = bx - ax, by - ay
                L2 = vx * vx + vy * vy
                tt = np.clip(((rp[r, 0] - ax) * vx + (rp[r, 1] - ay) * vy) / L2, 0, 1)
                dd = np.hypot(rp[r, 0] - ax - tt * vx, rp[r, 1] - ay - tt * vy)
                popreko = (dd < 12) & (np.abs(rp[r, 2] * ux + rp[r, 3] * uy) < 0.5) & (tt > 0.05) & (tt < 0.95)
                prekidi.append({"m": int(round(float(d[ok].min()))), "ulica": ulica, "raskrsnica": bool(popreko.any()),
                                "a": u_lonlat(ax, ay), "b": u_lonlat(bx, by)})
                continue
            continue                                                     # nastavak postoji, ali ne duž ulice — preskače se
        # kraj: glavna ulica uz stazu (do 30 m, paralelna) se nastavlja napred bez staze
        r = mr.blizu(ax, ay, 30)
        r = r[(rp[r, 6] >= 0) & (rp[r, 7] == GLAVNA) & (np.hypot(rp[r, 0] - ax, rp[r, 1] - ay) < 30) & (np.abs(rp[r, 2] * ux + rp[r, 3] * uy) > 0.8)]
        if not len(r):
            continue
        u = int(rp[r[0], 6])
        q = mr.blizu(ax, ay, 2000)
        q = q[(rp[q, 6] == u)]
        tq = (rp[q, 0] - ax) * ux + (rp[q, 1] - ay) * uy
        pq = np.abs(-(rp[q, 0] - ax) * uy + (rp[q, 1] - ay) * ux)
        napred = (tq > 0) & (pq < 120)
        q, tq = q[napred], tq[napred]
        red = np.argsort(tq)
        duzina, pret = 0.0, 40.0
        for k in red:
            if tq[k] < 40:                                            # uz sam kraj staze ulica je još „pokrivena“
                continue
            if tq[k] - pret > 40 or pokr[q[k]]:
                break
            duzina = pret = float(tq[k])
        if duzina >= 250:
            # tok ulice: srednja tačka ulice na svakih 50 m (dvostruki kolovoz → sredina)
            put = [(ax, ay)]
            for o in np.arange(50, duzina + 1, 50):
                m = (tq >= o - 25) & (tq < o + 25)
                if m.any():
                    put.append((float(rp[q[m], 0].mean()), float(rp[q[m], 1].mean())))
            krajevi.append({"ulica": imena[u], "m": int(round(duzina, -1)), "uz": ulica_f.get(i), "a": u_lonlat(ax, ay),
                            "put": [u_lonlat(x, y) for x, y in put]})
    return spoji_strane(prekidi), spoji_strane(krajevi)


def spoji_strane(lista: list[dict], prag: float = 80) -> list[dict]:
    """Isti prekid ili kraj sa obe strane ulice (ista ulica, početak do 80 m) → jedan zapis sa „strane“: 2."""
    out = []
    for p in sorted(lista, key=lambda p: -p["m"]):
        ax, ay = u_m(p["a"])
        isti = next((o for o in out if o["ulica"] == p["ulica"] and math.hypot(u_m(o["a"])[0] - ax, u_m(o["a"])[1] - ay) < prag), None)
        if isti:
            isti["strane"] = 2
        else:
            out.append({**p, "strane": 1})
    return out


def obala_dunava(voda: dict) -> np.ndarray | None:
    """Tačke (na ~20 m) granice najveće vodene površine — Dunava."""
    def povrsina(prsten):
        p = [u_m(c) for c in prsten]
        return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(p, p[1:] + p[:1]))) / 2
    prstenovi = [p[0] for f in voda["features"] for p in ([f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon"
                                                        else f["geometry"]["coordinates"])]
    if not prstenovi:
        return None
    najveci = max(prstenovi, key=povrsina)
    return np.array([(x, y) for x, y, *_ in progusti(najveci, 20)])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    uc = lambda p: json.loads((DATA / p).read_text(encoding="utf-8"))   # noqa: E731
    r = analiziraj(uc("staze.geojson"), uc("mapa/putevi.geojson"), uc("mapa/delovi.geojson"), uc("mapa/mesta.geojson"),
                   uc("istorija/stanice.json"), uc("mapa/voda.geojson"))
    a.izlaz.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    u = r["ukupno"]
    log.info("staze: %.1f km linija, %.1f km pravaca, %d ulica, %d delova, %d prekida, %d krajeva, %.0f KB",
             u["km_linija"], u["km_pravaca"], u["ulica"], len(r["delovi"]), len(r["prekidi"]), len(r["krajevi"]), a.izlaz.stat().st_size / 1e3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
