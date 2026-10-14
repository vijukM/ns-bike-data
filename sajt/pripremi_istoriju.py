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


def opis_stanica(feed_csv: Path) -> pd.DataFrame:
    c = pd.read_csv(feed_csv, dtype={"serija": str})
    redovi = []
    for serija, g in c.groupby("serija"):
        naziv = re.sub(r"^\d+NS\S*\s+", "", str(g["locationID"].iloc[0]).strip())  # „15NSaPS Vojvodjanska“
        smerovi = [re.sub(r"\s*\(b\)\s*$", "", str(d)).strip() for d in g.sort_values("direction")["directionDesc"]]
        redovi.append({"serija": serija, "mesto": int(re.match(r"\d+", serija).group()), "naziv": naziv,
                       "smerovi": smerovi, "lat": float(g["lat"].iloc[0]), "lon": float(g["lon"].iloc[0])})
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
                                                       "period": "01.09.2025 – 31.08.2026"},
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
        })
    dst = {r.datum.isoformat(): int(r.sati) for r in dani.itertuples() if r.sati != 24}
    velicine["stanice.json"] = _pisi(izlaz / "stanice.json", {
        "generisano_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "period": {"od": OD.isoformat(), "do": DO.isoformat()},
        "izvor": "UGZINS / Mikrobit brojači (očišćeno, master_v4_E3); vreme: Open-Meteo",
        "razlozi": [{"kod": k, "opis": o} for k, o in RAZLOZI], "dani_bez_24h": dst, "serije": redovi,
        "meseci": [str(p) for p in pd.period_range(OD, DO, freq="M")],
    })
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
