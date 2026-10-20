"""SAJT — priprema istorije (01.01.2021 – 31.08.2026) za statički prikaz u docs/ (faza 7a, bez prognoza).

    gh release download istorija-v1 -D istorija          # master_v4_E3.parquet + meteo (ne idu u git)
    python -m sajt.pripremi_istoriju                       # → docs/data/istorija/

Vreme:
  master `ts` = KRAJ sata u fiksnom UTC+1 (izvoz brojača, bez letnjeg računanja) → početak sata u UTC = ts − 2 h,
  pa u Europe/Belgrade. Lokalni dan ima 23 ili 25 sati na dane promene vremena.
  meteo `Datum` + `Cas` (01:00–24:00) = KRAJ sata po lokalnom vremenu (sa DST) → početak = kraj − 1 h (lokalno).
  Satni nizovi u JSON-u idu redom po UTC satima od `pocetak_utc`; sajt ih prikazuje po lokalnom vremenu.

Pravila:
  - NaN nikad ne postaje 0 (u JSON-u je null, uz šifru razloga);
  - dnevni zbir postoji samo ako su SVI sati lokalnog dana validni (inače null + broj validnih sati);
  - serija 28 je od 18.04.2026 neispravna (šifra neispravan_brojac) i ne ulazi u gradske zbirove;
  - gradski zbir = zbir serija sa kompletnim danom + broj uključenih serija.

Izlaz (docs/data/istorija/):
  stanice.json             serije, nazivi, koordinate, period rada, prosek, udeo validnih dana, šifre razloga
  grad_dnevno.json         gradski dnevni zbir, broj serija, dnevno vreme, praznici, mesečni proseci po seriji, činjenice
  dnevno/<serija>.json     dnevni zbirovi cele istorije serije
  profili/<serija>.json    satni profili (tip dana × godišnje doba), toplotna mapa, meseci po godinama
  sati/<YYYY-MM>.json      satne vrednosti svih serija za mesec
  meteo_sati/<YYYY-MM>.json  satna temperatura, padavine, novi sneg za mesec (ista satna mreža)
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

KOREN = Path(__file__).resolve().parents[1]
TZ = "Europe/Belgrade"
OD, DO = date(2021, 1, 1), date(2026, 8, 31)
ISTORIJA = KOREN / "istorija"
IZLAZ = KOREN / "docs" / "data" / "istorija"

# šifre razloga (indeks u listi); 0 = validno
RAZLOZI = [
    ("ok", "validno"),
    ("nema_reda", "nema podataka (brojač nije poslao red)"),
    ("status_prazan", "kvar brojača (prazan status)"),
    ("odluka_nan", "ručno isključeno — neispravni podaci"),
    ("otkaz_smera", "otkaz smera (jedan smer ne broji)"),
    ("skok", "izbačen lažni skok"),
    ("skok_okolina", "izbačeno — okolina lažnog skoka"),
    ("outlier", "izbačena nerealna vrednost (> 400 / h)"),
    ("neispravan_brojac", "brojač neispravan od 04/2026"),
    ("nije_postavljen", "brojač još nije postavljen"),
]
KOD = {k: i for i, (k, _) in enumerate(RAZLOZI)}
KOD["odluka_ok"] = 0                                   # ručno potvrđeno kao validno
NEISPRAVNE = {"28": (date(2026, 4, 18), "neispravan_brojac", "brojač neispravan od 04/2026")}
SEZONE = {"zima": (12, 1, 2), "prolece": (3, 4, 5), "leto": (6, 7, 8), "jesen": (9, 10, 11)}
TIPOVI_DANA = ["radni", "subota", "nedelja_praznik"]
MIN_DANA_MESEC = 10                                    # mesečni prosek tek uz ≥ 10 kompletnih dana
# stanje brojača na kraju istorije (poslednjih 30 dana) → ikonica na mapi
STANJA = {"radi": "radi", "delimicno": "delimično radi", "ne_radi": "ne radi", "neispravan": "neispravan"}
STANJA_OPIS = {
    "radi": "bar 90 % kompletnih dana u poslednjih 30 dana",
    "delimicno": "nepotpuni dani: ima podataka, ali manje od 90 % kompletnih dana u poslednjih 30 dana",
    "ne_radi": "nema podataka: nijedan validan sat u poslednjih 30 dana",
    "neispravan": "brojač je neispravan (npr. 28 od 04/2026: jedan smer ne broji) i ne ulazi u gradske zbirove",
}
DANA_STANJE, PRAG_RADI = 30, 0.9


def stanje_brojaca(serija: str, kompletnih: int, validnih_sati: int, dana: int = DANA_STANJE) -> str:
    if serija in NEISPRAVNE:
        return "neispravan"
    if kompletnih >= PRAG_RADI * dana:
        return "radi"
    return "delimicno" if validnih_sati > 0 else "ne_radi"

log = logging.getLogger(__name__)


# ---------------------------------------------------------------- vreme

def lokalni_dani(od: date = OD, do: date = DO) -> pd.DataFrame:
    """Za svaki lokalni dan: početak u UTC i broj sati (23/24/25)."""
    dani = pd.date_range(od, pd.Timestamp(do) + pd.Timedelta(days=1), freq="D").tz_localize(TZ)
    utc = dani.tz_convert("UTC").tz_localize(None)
    sati = (np.diff(utc.asi8) // 3_600_000_000_000).astype(int)
    return pd.DataFrame({"datum": dani[:-1].date, "pocetak_utc": utc[:-1], "sati": sati})


def sati_u_danu(d: date) -> int:
    return int(lokalni_dani(d, d)["sati"].iloc[0])


def master_u_lokalno(ts_utc1_kraj: pd.Series) -> pd.DataFrame:
    """ts (kraj sata, fiksni UTC+1) → pocetak_utc, lokalni početak, lokalni datum i sat."""
    pocetak_utc = pd.to_datetime(ts_utc1_kraj) - pd.Timedelta(hours=2)
    lok = pocetak_utc.dt.tz_localize("UTC").dt.tz_convert(TZ)
    return pd.DataFrame({"pocetak_utc": pocetak_utc, "datum": lok.dt.date, "sat": lok.dt.hour,
                         "mesec": lok.dt.month, "godina": lok.dt.year, "dan_u_nedelji": lok.dt.dayofweek})


def meteo_u_utc(datum: pd.Series, cas: pd.Series) -> pd.DataFrame:
    """Datum + Cas (kraj sata, lokalno sa DST) → lokalni početak sata (naivno) za spajanje po lokalnom času."""
    kraj = pd.to_datetime(datum) + pd.to_timedelta(cas.str[:2].astype(int), unit="h")
    return pd.DataFrame({"lok_pocetak": kraj - pd.Timedelta(hours=1)})


# ---------------------------------------------------------------- učitavanje

def ucitaj_master(put: Path) -> pd.DataFrame:
    m = pd.read_parquet(put, columns=["stanica_id", "ts", "y_A", "razlog_A"])
    m = pd.concat([m.reset_index(drop=True), master_u_lokalno(m["ts"]).reset_index(drop=True)], axis=1)
    m = m[(m["datum"] >= OD) & (m["datum"] <= DO)].copy()
    m["kod"] = m["razlog_A"].map(KOD).fillna(KOD["nema_reda"]).astype(int)
    m.loc[m["y_A"].notna(), "kod"] = 0
    m.loc[m["y_A"].isna() & (m["kod"] == 0), "kod"] = KOD["nema_reda"]
    for serija, (od, razlog, _) in NEISPRAVNE.items():
        maska = (m["stanica_id"] == serija) & (m["datum"] >= od)
        m.loc[maska, "y_A"] = np.nan
        m.loc[maska, "kod"] = KOD[razlog]
    return m.sort_values(["stanica_id", "pocetak_utc"]).reset_index(drop=True)


def ucitaj_meteo(put: Path) -> pd.DataFrame:
    w = pd.read_parquet(put)
    w = pd.concat([w.reset_index(drop=True), meteo_u_utc(w["Datum"], w["Cas"])], axis=1)
    w = w.drop_duplicates("lok_pocetak").set_index("lok_pocetak").sort_index()
    return w


def meteo_na_mrezi(w: pd.DataFrame, pocetak_utc: pd.DatetimeIndex) -> pd.DataFrame:
    """Meteo na UTC satnoj mreži: svaki UTC sat → lokalni početak → red iz meteo tabele.
    Prolećni nepostojeći sat se nikad ne traži; jesenji ponovljeni sat dobija istu vrednost dva puta."""
    lok = pd.DatetimeIndex(pocetak_utc).tz_localize("UTC").tz_convert(TZ).tz_localize(None)
    return w.reindex(lok)


NAZIVI = Path(__file__).with_name("nazivi.json")


def lep_smer(tekst: str, delovi: dict) -> str:
    """„Bul. M. Pupina - Maksima Gorkog (u oba smera)“ → „Bulevar Mihajla Pupina – Maksima Gorkog (u oba smera)“."""
    oba = "(u oba smera)" in tekst
    jezgro = tekst.replace("(u oba smera)", "").strip()
    deo = [d.strip() for d in re.split(r"\s*-\s*", jezgro) if d.strip()]
    nepoznati = [d for d in deo if d not in delovi]
    if nepoznati:
        log.warning("smer bez lepog naziva (sajt/nazivi.json): %s", nepoznati)
    return " – ".join(delovi.get(d, d) for d in deo) + (" (u oba smera)" if oba else "")


def opis_stanica(feed_csv: Path, nazivi: Path = NAZIVI) -> pd.DataFrame:
    """Nazivi i koordinate iz feed-a; za prikaz se zamenjuju lepim nazivima (prava latinica, bez skraćenica).
    Mapiranje podataka ide preko serije (locationID), ne preko naziva, pa ovo ne utiče na podatke."""
    lepo = json.loads(nazivi.read_text(encoding="utf-8")) if nazivi.exists() else {"mesta": {}, "delovi": {}}
    c = pd.read_csv(feed_csv, dtype={"serija": str})
    redovi = []
    for serija, g in c.groupby("serija"):
        mesto = int(re.match(r"\d+", serija).group())
        sirov = re.sub(r"^\d+NS\S*\s+", "", str(g["locationID"].iloc[0]).strip())  # „15NSaPS Vojvodjanska“
        smerovi = [re.sub(r"\s*\(b\)\s*$", "", str(d)).strip() for d in g.sort_values("direction")["directionDesc"]]
        redovi.append({"serija": serija, "mesto": mesto, "naziv": lepo["mesta"].get(str(mesto), sirov),
                       "smerovi": [lep_smer(x, lepo["delovi"]) for x in smerovi],
                       "lat": float(g["lat"].iloc[0]), "lon": float(g["lon"].iloc[0])})
    return pd.DataFrame(redovi)


def najnovije_citanje(koren: Path = KOREN / "podaci" / "biciklisti") -> Path:
    fajlovi = sorted(koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9].csv"))
    if not fajlovi:
        raise FileNotFoundError(f"nema sačuvanih čitanja u {koren}")
    return fajlovi[-1]


def razmakni_parove(st: pd.DataFrame, min_m: float = 90.0) -> pd.DataFrame:
    """Serije a/b istog mesta se na mapi razmaknu na najmanje min_m metara (duž pravca između njih)."""
    st = st.copy()
    st["lat_mapa"], st["lon_mapa"] = st["lat"], st["lon"]
    m_lat, m_lon = 111_320.0, 111_320.0 * np.cos(np.radians(45.25))
    for _, g in st.groupby("mesto"):
        if len(g) != 2:
            continue
        i, j = g.index
        dy = (st.at[j, "lat"] - st.at[i, "lat"]) * m_lat
        dx = (st.at[j, "lon"] - st.at[i, "lon"]) * m_lon
        d = float(np.hypot(dx, dy))
        if d >= min_m:
            continue
        ux, uy = (dx / d, dy / d) if d > 1 else (1.0, 0.0)
        pomak = (min_m - d) / 2
        st.at[i, "lat_mapa"] -= uy * pomak / m_lat
        st.at[i, "lon_mapa"] -= ux * pomak / m_lon
        st.at[j, "lat_mapa"] += uy * pomak / m_lat
        st.at[j, "lon_mapa"] += ux * pomak / m_lon
    return st


# ---------------------------------------------------------------- obrada

def dnevno(m: pd.DataFrame) -> pd.DataFrame:
    """serija × lokalni datum: zbir (samo kompletan dan), broj validnih sati, očekivano sati, glavni razlog."""
    dani = lokalni_dani().set_index("datum")["sati"]
    g = m.groupby(["stanica_id", "datum"])
    d = g.agg(validnih=("y_A", "count"), zbir=("y_A", "sum"), redova=("y_A", "size")).reset_index()
    d["sati"] = d["datum"].map(dani)
    d["kompletan"] = d["validnih"] == d["sati"]
    d.loc[~d["kompletan"], "zbir"] = np.nan
    losi = m[m["kod"] != 0].groupby(["stanica_id", "datum"])["kod"].agg(lambda s: int(s.mode().iloc[0]))
    d = d.merge(losi.rename("razlog").reset_index(), on=["stanica_id", "datum"], how="left")
    d["razlog"] = d["razlog"].fillna(0).astype(int)
    return d


def tip_dana(datum: pd.Series, praznici: set) -> pd.Series:
    dt = pd.to_datetime(datum)
    tip = np.where(dt.dt.dayofweek < 5, "radni", np.where(dt.dt.dayofweek == 5, "subota", "nedelja_praznik"))
    tip = np.where(pd.Series(datum).isin(praznici), "nedelja_praznik", tip)
    return pd.Series(tip, index=datum.index)


def datum_sr(d: date) -> str:
    return f"{d.day}. {d.month}. {d.year}."


def _r1(x):
    return None if x is None or pd.isna(x) else round(float(x), 1)


def _i(x):
    return None if x is None or pd.isna(x) else int(round(float(x)))


def mesecni_proseci(d: pd.DataFrame) -> pd.DataFrame:
    k = d[d["kompletan"]].copy()
    k["mesec"] = pd.to_datetime(k["datum"]).dt.strftime("%Y-%m")
    p = k.groupby(["stanica_id", "mesec"])["zbir"].agg(["mean", "size"]).reset_index()
    p.loc[p["size"] < MIN_DANA_MESEC, "mean"] = np.nan
    return p


def profil_serije(m_s: pd.DataFrame, praznici: set) -> dict:
    v = m_s[m_s["y_A"].notna()].copy()
    v["tip"] = tip_dana(v["datum"], praznici)
    profili = {}
    for sezona, meseci in [("ukupno", tuple(range(1, 13))), *SEZONE.items()]:
        s = v[v["mesec"].isin(meseci)]
        profili[sezona] = {}
        for tip in TIPOVI_DANA:
            p = s[s["tip"] == tip].groupby("sat")["y_A"].mean().reindex(range(24))
            profili[sezona][tip] = [_r1(x) for x in p]
    tm = v.groupby(["dan_u_nedelji", "sat"])["y_A"].mean().unstack().reindex(index=range(7), columns=range(24))
    return {"profil": profili, "toplotna_mapa": [[_r1(x) for x in red] for red in tm.to_numpy()]}


def najduzi_niz(datumi) -> tuple[int, date | None, date | None]:
    """Najduži niz uzastopnih datuma (npr. kompletnih dana): (dužina, od, do)."""
    naj, od, do_, poc, pret, duz = 0, None, None, None, None, 0
    for d in sorted(datumi):
        if pret is not None and (d - pret).days == 1:
            duz += 1
        else:
            poc, duz = d, 1
        if duz > naj:
            naj, od, do_ = duz, poc, d
        pret = d
    return naj, od, do_


def _sat_tekst(sat: int) -> str:
    return f"{sat:02d}–{(sat + 1) % 24:02d} h"


def ritam(m: pd.DataFrame, praznici: set) -> dict:
    """Ritam grada: prosečan brojač po satu (lokalno) — sat × dan u nedelji, godišnja doba, meseci, godine."""
    v = m[m["y_A"].notna()].copy()
    v["tip"] = tip_dana(v["datum"], praznici).to_numpy()
    obicni = v[~v["datum"].isin(praznici)]
    tm = obicni.groupby(["dan_u_nedelji", "sat"])["y_A"].mean().unstack().reindex(index=range(7), columns=range(24))
    profili = {}
    for sezona, meseci in [("ukupno", tuple(range(1, 13))), *SEZONE.items()]:
        s = v[v["mesec"].isin(meseci)]
        profili[sezona] = {t: [_r1(x) for x in s[s["tip"] == t].groupby("sat")["y_A"].mean().reindex(range(24))]
                           for t in TIPOVI_DANA}
    radni = v[v["tip"] == "radni"]
    po_mesecu = []
    for mes in range(1, 13):
        p = radni[radni["mesec"] == mes].groupby("sat")["y_A"].mean().reindex(range(24)).to_numpy()
        if np.isnan(p[5:10]).all() or np.isnan(p[13:20]).all():
            po_mesecu.append({"mesec": mes, "jutarnji_vrh": None, "popodnevni_vrh": None, "ustaje": None,
                              "udeo_noci": None, "profil": [_r1(x) for x in p]})
            continue
        jutro = 5 + int(np.nanargmax(p[5:10]))            # jutarnja špica: 05–10 h
        popodne = 13 + int(np.nanargmax(p[13:20]))
        pola = p[jutro] / 2                                   # kad promet pređe pola jutarnjeg vrha (sredina sata = h + 0.5)
        ustaje = None
        for h in range(3, jutro + 1):
            if p[h] >= pola:
                a, b = p[h - 1], p[h]
                ustaje = round(h - 0.5 + (pola - a) / (b - a), 2) if b > a else float(h) + 0.5
                break
        po_mesecu.append({"mesec": mes, "jutarnji_vrh": jutro, "popodnevni_vrh": popodne, "ustaje": ustaje,
                          "udeo_noci": _r1(100 * np.nansum(p[[22, 23, 0, 1, 2, 3, 4, 5]]) / np.nansum(p)),
                          "profil": [_r1(x) for x in p]})
    po_godini = {}
    for god, gg in radni.groupby("godina"):
        p = gg.groupby("sat")["y_A"].mean().reindex(range(24))
        po_godini[str(god)] = [_r1(100 * x / p.sum()) for x in p]
    ukupno_sat = v.groupby("sat")["y_A"].sum().reindex(range(24))
    return {"toplotna_mapa": [[_r1(x) for x in red] for red in tm.to_numpy()], "profili": profili,
            "po_mesecu": po_mesecu, "radni_po_godini": po_godini,
            "udeo_po_satu": [_r1(100 * x / ukupno_sat.sum()) for x in ukupno_sat],
            "opis": "prosečan broj biciklista po brojaču u satu (validni sati, lokalno vreme); praznici su nedelja"}


def rekordi(m: pd.DataFrame, d: pd.DataFrame, grad: pd.DataFrame, w_dan: pd.DataFrame, dani: pd.DataFrame,
            praznici: set, serije: list) -> dict:
    """Rekordi i zanimljivosti: dani, sati, godine, vreme, po stanici."""
    v = m[m["y_A"].notna()]
    g = pd.DataFrame({"datum": dani["datum"].to_numpy(), "zbir": grad["sum"].to_numpy(), "n": grad["size"].to_numpy(),
                      "tmin": w_dan["tmin"].to_numpy(), "tmax": w_dan["tmax"].to_numpy(), "tsr": w_dan["tsr"].to_numpy(),
                      "pad": w_dan["pad"].to_numpy(), "sneg": w_dan["sneg"].to_numpy()})
    g = g[g["zbir"].notna() & (g["n"] > 0)].copy()
    g["po"] = g["zbir"] / g["n"]
    g["tip"] = tip_dana(g["datum"], praznici).to_numpy()
    g["ym"] = pd.to_datetime(g["datum"]).dt.strftime("%Y-%m")
    g["uob"] = g.groupby(["ym", "tip"])["po"].transform("median")

    def dan(r) -> dict:
        return {"datum": r["datum"].isoformat(), "zbir": _i(r["zbir"]), "n": _i(r["n"]), "po": _i(r["po"]),
                "odst": _i(100 * (r["po"] / r["uob"] - 1)) if r["uob"] else None,
                "tmin": _r1(r["tmin"]), "tmax": _r1(r["tmax"]), "pad": _r1(r["pad"]), "sneg": _r1(r["sneg"]), "tip": r["tip"]}

    sat = v.groupby("pocetak_utc").agg(zbir=("y_A", "sum"), n=("y_A", "size"), datum=("datum", "first"), sat=("sat", "first"))
    ns = sat.loc[sat["zbir"].idxmax()]
    x = v.loc[v["y_A"].idxmax()]
    godine = v.groupby("godina").agg(ukupno=("y_A", "sum"), brojaca=("stanica_id", "nunique"))
    gm = g.groupby("ym")["po"].agg(["mean", "size"])
    gm = gm[gm["size"] >= 20]
    gn = g.assign(ned=pd.to_datetime(g["datum"]).dt.to_period("W-SUN").astype(str)).groupby("ned")["zbir"].agg(["sum", "size"])
    gn = gn[gn["size"] == 7]
    pn = gn["sum"].idxmax() if len(gn) else None
    radni = g[g["tip"] == "radni"]
    vikend = g[g["tip"].isin(["subota", "nedelja_praznik"])]
    kalendarski = g.assign(mes=pd.to_datetime(g["datum"]).dt.month).groupby("mes")["po"].mean()
    noc = v[v["sat"].isin([22, 23, 0, 1, 2, 3, 4])]["y_A"].sum() / v["y_A"].sum()
    profil = v[tip_dana(v["datum"], praznici).to_numpy() == "radni"].groupby("sat")["y_A"].mean()
    profil = profil.reindex(range(24))
    jutro = int(profil.loc[5:9].idxmax()) if profil.loc[5:9].notna().any() else None
    popodne = int(profil.loc[13:19].idxmax()) if profil.loc[13:19].notna().any() else None

    po_stanici, nizovi = [], []
    for s in serije:
        ds = d[(d["stanica_id"] == s) & d["kompletan"]]
        vs = v[v["stanica_id"] == s]
        if vs.empty:
            continue
        hm = vs.loc[vs["y_A"].idxmax()]
        duz, od, do_ = najduzi_niz(ds["datum"])
        r = {"serija": s, "ukupno": _i(vs["y_A"].sum()), "kompletnih": int(len(ds)),
             "sat": {"datum": hm["datum"].isoformat(), "sat": int(hm["sat"]), "v": _i(hm["y_A"])},
             "niz": {"dana": duz, "od": od.isoformat() if od else None, "do": do_.isoformat() if do_ else None}}
        if len(ds):
            dm = ds.loc[ds["zbir"].idxmax()]
            r["dan"] = {"datum": dm["datum"].isoformat(), "v": _i(dm["zbir"])}
        po_stanici.append(r)
        nizovi.append((duz, s))
    naj_niz = max(nizovi)
    meseci_imena = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar",
                    "novembar", "decembar"]
    zanimljivosti = [
        {"ik": "bike", "naslov": "Ukupno izbrojano", "vrednost": _i(v["y_A"].sum()),
         "opis": f"prolazaka biciklista pored brojača od {datum_sr(OD)} do {datum_sr(DO)}"},
        {"ik": "clock", "naslov": "Najprometniji sat u gradu", "vrednost": _i(ns["zbir"]),
         "opis": f"{datum_sr(ns['datum'])}, {_sat_tekst(int(ns['sat']))}, zbir {int(ns['n'])} brojača", "datum": ns["datum"].isoformat()},
        {"ik": "trophy", "naslov": "Rekord jednog brojača u satu", "vrednost": _i(x["y_A"]),
         "opis": f"brojač {x['stanica_id']}, {datum_sr(x['datum'])}, {_sat_tekst(int(x['sat']))}"
                 + (" (gornja granica čišćenja je 400 / h)" if x["y_A"] >= 400 else ""), "serija": x["stanica_id"],
         "datum": x["datum"].isoformat()},
        *([] if pn is None else [{"ik": "calendar", "naslov": "Najprometnija nedelja", "vrednost": _i(gn.loc[pn, "sum"]),
         "opis": f"od {datum_sr(date.fromisoformat(pn[:10]))} do {datum_sr(date.fromisoformat(pn[-10:]))} (zbir svih brojača)",
         "datum": pn[:10]}]),
        *([] if profil.loc[5:9].isna().all() else [{"ik": "activity", "naslov": "Jutarnja špica", "vrednost": _sat_tekst(jutro),
         "opis": f"najprometniji jutarnji sat radnim danom; popodne {_sat_tekst(popodne) if popodne is not None else '—'}"}]),
        {"ik": "sun", "naslov": "Najprometniji mesec", "vrednost": meseci_imena[int(kalendarski.idxmax()) - 1],
         "opis": f"prosečan dan po brojaču {_i(kalendarski.max())}; najmirniji {meseci_imena[int(kalendarski.idxmin()) - 1]} ({_i(kalendarski.min())})"},
        {"ik": "moon", "naslov": "Noćna vožnja", "vrednost": _r1(100 * noc), "jed": "%",
         "opis": "biciklista vozi između 22 i 05 h"},
        {"ik": "pulse", "naslov": "Vikend prema radnom danu", "vrednost": _i(100 * (vikend['po'].mean() / radni['po'].mean() - 1)), "jed": "%", "znak": True,
         "opis": "prosečan dan po brojaču (subota, nedelja i praznici prema radnim danima)"},
        {"ik": "check", "naslov": "Najduži rad bez prekida", "vrednost": naj_niz[0], "jed": "dana",
         "opis": f"brojač {naj_niz[1]} — kompletni dani jedan za drugim", "serija": naj_niz[1]},
    ]
    return {
        "top_dani": [dan(r) for _, r in g.nlargest(10, "zbir").iterrows()],
        "top_po_brojacu": [dan(r) for _, r in g.nlargest(10, "po").iterrows()],
        "najmirniji_radni": [dan(r) for _, r in radni.nsmallest(5, "po").iterrows()],
        "vreme": {"najtopliji": dan(g.loc[g["tmax"].idxmax()]), "najhladniji": dan(g.loc[g["tmin"].idxmin()]),
                  "najkisniji": dan(g.loc[g["pad"].idxmax()]), "najsnezniji": dan(g.loc[g["sneg"].idxmax()])},
        "godine": [{"godina": int(k), "ukupno": _i(r["ukupno"]), "brojaca": int(r["brojaca"])} for k, r in godine.iterrows()],
        "najprometniji_mesec": {"mesec": gm["mean"].idxmax(), "po": _i(gm["mean"].max())} if len(gm) else None,
        "zanimljivosti": zanimljivosti,
        "po_stanici": po_stanici,
    }


def razlozi_rle(kodovi: np.ndarray) -> list[list[int]]:
    """[[početak, dužina, šifra], …] za uzastopne nevalidne sate (šifra ≠ 0)."""
    out, i, n = [], 0, len(kodovi)
    while i < n:
        if kodovi[i] == 0:
            i += 1
            continue
        j = i
        while j < n and kodovi[j] == kodovi[i]:
            j += 1
        out.append([i, j - i, int(kodovi[i])])
        i = j
    return out


def _pisi(put: Path, obj) -> int:
    put.parent.mkdir(parents=True, exist_ok=True)
    tekst = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    put.write_text(tekst, encoding="utf-8")
    return len(tekst.encode("utf-8"))


def _mreza_meseca(godina: int, mesec: int) -> tuple[pd.Timestamp, int, list]:
    pocetak = pd.Timestamp(godina, mesec, 1)
    kraj = pocetak + pd.offsets.MonthBegin(1)
    dani = lokalni_dani(pocetak.date(), (kraj - pd.Timedelta(days=1)).date())
    indeksi = np.concatenate([[0], np.cumsum(dani["sati"].to_numpy())[:-1]])
    return (dani["pocetak_utc"].iloc[0], int(dani["sati"].sum()),
            [[d.isoformat(), int(i), int(s)] for d, i, s in zip(dani["datum"], indeksi, dani["sati"])])


# ---------------------------------------------------------------- glavno

def prosek_dana(m: pd.DataFrame, praznici: set, od: date = date(2024, 9, 1)) -> dict:
    """Za stranu „Danas uživo“: prosečan grad po lokalnom satu za isti dan u nedelji i mesec (poslednje 2 godine,
    bez praznika). Grad = zbir proseka serija (prosek svake serije po satu samo iz validnih sati)."""
    x = m[(m["datum"] >= od) & m["y_A"].notna() & ~m["datum"].isin(praznici)]
    po_seriji = x.groupby(["stanica_id", "dan_u_nedelji", "mesec", "sat"])["y_A"].mean()
    grad = po_seriji.groupby(level=["dan_u_nedelji", "mesec", "sat"]).sum()
    out = {}
    for (dn, mes), g in grad.groupby(level=["dan_u_nedelji", "mesec"]):
        v = g.droplevel([0, 1]).reindex(range(24))
        out[f"{dn}-{mes}"] = [None if pd.isna(a) else int(round(a)) for a in v]
    return {"opis": "prosečan broj biciklista u gradu po lokalnom satu (zbir proseka serija), isti dan u nedelji "
                    f"(pon = 0) i mesec, {datum_sr(od)} – {datum_sr(DO)}, bez praznika", "grad": out}


def pripremi(master: Path, meteo: Path, feed_csv: Path, izlaz: Path = IZLAZ) -> dict:
    m = ucitaj_master(master)
    w = ucitaj_meteo(meteo)
    st = razmakni_parove(opis_stanica(feed_csv))
    serije = sorted(m["stanica_id"].unique(), key=lambda s: (int(re.match(r"\d+", s).group()), s))
    nedostaju = sorted(set(serije) - set(st["serija"]))
    if nedostaju:
        raise ValueError(f"serije bez naziva/koordinata u feed-u: {nedostaju}")
    dani = lokalni_dani()
    praznici = set(pd.to_datetime(w.loc[w["is_holiday"] == 1, "Datum"]).dt.date)
    velicine = {}

    # dnevno po seriji
    d = dnevno(m)
    for s in serije:
        ds = d[d["stanica_id"] == s].set_index("datum").reindex(dani["datum"])
        prvi = ds["redova"].first_valid_index()
        ds = ds.loc[prvi:]
        nekompletni = ds[~ds["kompletan"].astype(bool)]
        velicine[f"dnevno/{s}.json"] = _pisi(izlaz / "dnevno" / f"{s}.json", {
            "serija": s, "od": prvi.isoformat(),
            "v": [_i(x) for x in ds["zbir"]],
            "h": [_i(x) for x in ds["validnih"]],
            "r": [[int(i), int(r)] for i, (r, ok) in enumerate(zip(ds["razlog"].fillna(9), ds["kompletan"]))
                  if not ok],
        })

    # gradski dnevni zbir + vreme
    k = d[d["kompletan"]]
    grad = k.groupby("datum")["zbir"].agg(["sum", "size"]).reindex(dani["datum"])
    postoji = d.groupby("datum")["stanica_id"].nunique().reindex(dani["datum"]).fillna(0)
    w_dan = w.copy()
    w_dan["datum"] = w_dan.index.date
    w_dan = w_dan.groupby("datum").agg(tmin=("temperatura", "min"), tmax=("temperatura", "max"),
                                       tsr=("temperatura", "mean"), pad=("padavine", "sum"),
                                       sneg=("sneg_N", "sum"), praznik=("is_holiday", "max")).reindex(dani["datum"])
    mp = mesecni_proseci(d)
    meseci = [str(p) for p in pd.period_range(OD, DO, freq="M")]
    tab = mp.pivot(index="mesec", columns="stanica_id", values="mean").reindex(index=meseci, columns=serije)

    # činjenice
    rad = pd.DataFrame({"datum": dani["datum"], "v": grad["sum"].to_numpy(), "n": grad["size"].to_numpy(),
                        "pad": w_dan["pad"].to_numpy(), "praznik": w_dan["praznik"].to_numpy()})
    dt = pd.to_datetime(rad["datum"])
    rad = rad[(dt.dt.dayofweek < 5) & (rad["praznik"] != 1) & dt.dt.month.between(4, 10) & (rad["n"] > 0)]
    po_brojacu = rad["v"] / rad["n"]
    kisni, suvi = po_brojacu[rad["pad"] >= 1.0], po_brojacu[rad["pad"] == 0]
    pg = d[(d["kompletan"]) & (d["datum"] >= date(2025, 9, 1))].groupby("stanica_id")["zbir"].agg(["mean", "size"])
    pg = pg[pg["size"] >= 30]
    naj_dan = grad["sum"].idxmax()
    cinjenice = {
        "najprometniji_dan": {"datum": naj_dan.isoformat(), "zbir": _i(grad.loc[naj_dan, "sum"]),
                              "serija": _i(grad.loc[naj_dan, "size"])},
        "najprometnija_serija": None if pg.empty else {"serija": pg["mean"].idxmax(), "prosek": _i(pg["mean"].max()),
                                                       "period": "1. 9. 2025. – 31. 8. 2026."},
        "kisa": {"kisni_dani": int(len(kisni)), "suvi_dani": int(len(suvi)),
                 "kisni_po_brojacu": _i(kisni.mean()), "suvi_po_brojacu": _i(suvi.mean()),
                 "razlika_pct": _r1(100 * (kisni.mean() / suvi.mean() - 1)),
                 "opis": "radni dani april–oktobar; kišni ≥ 1 mm padavina, suvi 0 mm; prosek po uključenom brojaču"},
        "ukupno_izbrojano": _i(m["y_A"].sum()),
    }
    velicine["grad_dnevno.json"] = _pisi(izlaz / "grad_dnevno.json", {
        "od": OD.isoformat(), "do": DO.isoformat(),
        "v": [_i(x) for x in grad["sum"]], "n": [_i(x) or 0 for x in grad["size"]],
        "postoji": [int(x) for x in postoji],
        "tmin": [_r1(x) for x in w_dan["tmin"]], "tmax": [_r1(x) for x in w_dan["tmax"]],
        "tsr": [_r1(x) for x in w_dan["tsr"]], "pad": [_r1(x) for x in w_dan["pad"]],
        "sneg": [_r1(x) for x in w_dan["sneg"]],
        "praznik": [i for i, p in enumerate(w_dan["praznik"]) if p == 1],
        "mesecno": {"meseci": meseci, "serije": serije,
                    "prosek": [[_i(x) for x in red] for red in tab.to_numpy()]},
        "cinjenice": cinjenice,
    })

    velicine["rekordi.json"] = _pisi(izlaz / "rekordi.json", rekordi(m, d, grad, w_dan, dani, praznici, serije))
    velicine["ritam.json"] = _pisi(izlaz / "ritam.json", ritam(m, praznici))

    # profili po seriji
    for s in serije:
        m_s = m[m["stanica_id"] == s]
        p = profil_serije(m_s, praznici)
        ps = mp[mp["stanica_id"] == s].copy()
        ps["godina"], ps["mes"] = ps["mesec"].str[:4], ps["mesec"].str[5:].astype(int)
        p["meseci_po_godinama"] = {g: [_i(x) for x in gg.set_index("mes")["mean"].reindex(range(1, 13))]
                                   for g, gg in ps.groupby("godina")}
        ds = d[(d["stanica_id"] == s) & d["kompletan"]].copy()
        ds["godina"] = pd.to_datetime(ds["datum"]).dt.year.astype(str)
        p["godine"] = {g: {"prosek": _i(gg["zbir"].mean()), "kompletnih_dana": int(len(gg))}
                       for g, gg in ds.groupby("godina")}
        velicine[f"profili/{s}.json"] = _pisi(izlaz / "profili" / f"{s}.json", {"serija": s, **p})

    # satni fajlovi po mesecu (svih serija) + meteo
    m_idx = m.set_index(["stanica_id", "pocetak_utc"])
    for per in pd.period_range(OD, DO, freq="M"):
        pocetak, n, dani_meseca = _mreza_meseca(per.year, per.month)
        mreza = pd.date_range(pocetak, periods=n, freq="h")
        sat_obj = {"mesec": str(per), "pocetak_utc": pocetak.strftime("%Y-%m-%dT%H:%MZ"), "n": n,
                   "dani": dani_meseca, "v": {}, "r": {}}
        for s in serije:
            try:
                ms = m_idx.loc[s].reindex(mreza)
            except KeyError:
                continue
            if ms["kod"].isna().all():
                continue
            kod = ms["kod"].fillna(KOD["nije_postavljen"]).astype(int).to_numpy()
            sat_obj["v"][s] = [_i(x) for x in ms["y_A"]]
            sat_obj["r"][s] = razlozi_rle(kod)
        velicine[f"sati/{per}.json"] = _pisi(izlaz / "sati" / f"{per}.json", sat_obj)
        wm = meteo_na_mrezi(w, mreza)
        velicine[f"meteo_sati/{per}.json"] = _pisi(izlaz / "meteo_sati" / f"{per}.json", {
            "mesec": str(per), "pocetak_utc": sat_obj["pocetak_utc"], "n": n,
            "temp": [_r1(x) for x in wm["temperatura"]], "pad": [_r1(x) for x in wm["padavine"]],
            "sneg": [_r1(x) for x in wm["sneg_N"]]})

    # stanice
    redovi = []
    poslednji_12m = date(2025, 9, 1)
    for s in serije:
        o = st.set_index("serija").loc[s]
        ds = d[d["stanica_id"] == s]
        validni = ds[ds["validnih"] > 0]["datum"]
        prvi_dan = ds["datum"].min()
        ukupno_dana = (DO - prvi_dan).days + 1
        kompl = ds[ds["kompletan"]]
        p12 = kompl[kompl["datum"] >= poslednji_12m]["zbir"]
        od30 = date.fromordinal(DO.toordinal() - DANA_STANJE + 1)
        d30 = ds[ds["datum"] >= od30]
        k30, v30 = int(d30["kompletan"].sum()), int(d30["validnih"].sum())
        napomena = None
        if s in NEISPRAVNE:
            napomena = NEISPRAVNE[s][2]
        elif validni.max() < date(2026, 8, 1):
            napomena = f"nema validnih podataka od {datum_sr(validni.max())}"
        redovi.append({
            "serija": s, "mesto": int(o["mesto"]), "naziv": o["naziv"], "smerovi": list(o["smerovi"]),
            "lat": round(float(o["lat"]), 6), "lon": round(float(o["lon"]), 6),
            "lat_mapa": round(float(o["lat_mapa"]), 6), "lon_mapa": round(float(o["lon_mapa"]), 6),
            "od": validni.min().isoformat(), "do": validni.max().isoformat(),
            "prosek_12m": _i(p12.mean()) if len(p12) >= 30 else None,
            "udeo_validnih_dana": round(len(kompl) / ukupno_dana, 3),
            "napomena": napomena,
            "stanje": stanje_brojaca(s, k30, v30), "kompletnih_30d": k30,
        })
    dst = {r.datum.isoformat(): int(r.sati) for r in dani.itertuples() if r.sati != 24}
    velicine["stanice.json"] = _pisi(izlaz / "stanice.json", {
        "generisano_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "period": {"od": OD.isoformat(), "do": DO.isoformat()},
        "izvor": "UGZINS / Mikrobit brojači (očišćeno, master_v4_E3); vreme: Open-Meteo",
        "razlozi": [{"kod": k, "opis": o} for k, o in RAZLOZI], "stanja": STANJA, "stanja_opis": STANJA_OPIS,
        "stanje_period": f"{datum_sr(date.fromordinal(DO.toordinal() - DANA_STANJE + 1))} – {datum_sr(DO)}", "dani_bez_24h": dst, "serije": redovi,
        "meseci": [str(p) for p in pd.period_range(OD, DO, freq="M")],
    })
    velicine["prosek_dana.json"] = _pisi(izlaz / "prosek_dana.json", prosek_dana(m, praznici))
    return velicine


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--master", type=Path, default=ISTORIJA / "master_v4_E3.parquet")
    ap.add_argument("--meteo", type=Path, default=ISTORIJA / "meteo_vazduh_2021_2026_ISPRAVLJENO.parquet")
    ap.add_argument("--feed", type=Path, help="CSV čitanja sa nazivima i koordinatama (podrazumevano najnovije)")
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    vel = pripremi(a.master, a.meteo, a.feed or najnovije_citanje(), a.izlaz)
    ukupno = sum(vel.values())
    pocetno = vel["stanice.json"] + vel["grad_dnevno.json"]
    najveci = max(vel, key=vel.get)
    log.info("fajlova: %d, ukupno %.2f MB; početno učitavanje (stanice + grad_dnevno) %.0f KB; najveći %s %.0f KB",
             len(vel), ukupno / 1e6, pocetno / 1e3, najveci, vel[najveci] / 1e3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
