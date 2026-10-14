"""Faza 2: istorija za model = model/istorija.parquet (očišćena, 01.06–31.08.2026) + novi sati iz scrapera,
očišćeni po istim pravilima kao istorijski master (docs/MODEL_KONTEKST.md, tačka 5).

    python -m prognoza.priprema        # -> model_podaci/istorija.parquet

Izlaz: stanica_id, ts, y_A, razlog_A na punoj naivnoj satnoj mreži (rupa 01.09–08.10.2026 = NaN, nema_reda).
Istorija iz paketa se ne menja; pravila se primenjuju samo na nove sate (istorija služi kao kontekst).

Pravila (redosled primene; vrednost → NaN uz razlog):
  outlier        y > 400
  niz_nula       ≥ 168 uzastopnih sati sa 0
  nula_dan       serija sa jednim smerom ceo dan 0, a inače (medijana 28 prethodnih dana) ima ≥ 50 dnevno
  skok           y > max(50, 4 × p90[stanica, sat, mesec]); skok_okolina: ±3 h ako y > max(30, 2 × p90);
                 dan sa skokom na ≥ 3 stanice = gradski događaj → ne dira se
  otkaz_smera    stari dvosmerni: slabiji smer < 2 % dnevnog zbira, ≥ 3 dana zaredom (zbir ≥ 50/dan). Dan je NaN
                 samo ako je zbir serije < 60 % očekivanog (prosek iste stanice i istog dana u nedelji, poslednje
                 4 nedelje sa podacima); inače ostaje validan sa razlogom ok_jedan_smer
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from scraper import konfig

log = logging.getLogger(__name__)

KOREN = konfig.KOREN
MODEL = KOREN / "model"
IZLAZ = KOREN / "model_podaci" / "istorija.parquet"

STARI_DVOSMERNI = ("25a", "26", "28", "40a", "40b", "41", "46a", "46b", "47", "51a", "51b")
VALIDNI = ("ok", "ok_jedan_smer")

OUTLIER = 400
NIZ_NULA_SATI = 168
NULA_DAN_MIN = 50
NULA_DAN_PROZOR_DANA = 28
SKOK_MIN, SKOK_PUTA = 50, 4
OKOLINA_MIN, OKOLINA_PUTA, OKOLINA_SATI = 30, 2, 3
DOGADJAJ_STANICA = 3
OTKAZ_UDEO, OTKAZ_DANA, OTKAZ_MIN_DNEVNO = 0.02, 3, 50
OTKAZ_PRAG_OCEKIVANO, OTKAZ_NEDELJA = 0.60, 4


# ---------------------------------------------------------------- pomoćno

def _dan_i_sat(ts: pd.Series) -> tuple[pd.Series, pd.Series]:
    """ts = kraj sata → (kalendarski dan D, sat 1–24); 24:00 pripada prethodnom danu."""
    pocetak = ts - pd.Timedelta(hours=1)
    return pocetak.dt.normalize(), pocetak.dt.hour + 1


def _postavi(df: pd.DataFrame, maska: pd.Series, razlog: str) -> int:
    maska = maska & df["novo"] & df["razlog_A"].isin(VALIDNI)
    df.loc[maska, "y_A"] = np.nan
    df.loc[maska, "razlog_A"] = razlog
    return int(maska.sum())


def puna_mreza(df: pd.DataFrame, do: pd.Timestamp | None = None) -> pd.DataFrame:
    """Za svaku stanicu puna satna mreža od prvog ts do `do` (ili poslednjeg ts); rupe = NaN, nema_reda."""
    delovi = []
    kraj_svih = do if do is not None else df["ts"].max()
    for st, g in df.groupby("stanica_id", sort=True):
        mreza = pd.date_range(g["ts"].min(), kraj_svih, freq="h")
        g = g.drop_duplicates("ts", keep="first").set_index("ts").reindex(mreza).rename_axis("ts").reset_index()
        nema = g["stanica_id"].isna()
        g["stanica_id"] = st
        g.loc[nema, "razlog_A"] = "nema_reda"
        delovi.append(g)
    return pd.concat(delovi, ignore_index=True)


# ---------------------------------------------------------------- pravila

def pravilo_outlier(df: pd.DataFrame) -> int:
    return _postavi(df, df["y_A"] > OUTLIER, "outlier")


def pravilo_niz_nula(df: pd.DataFrame) -> int:
    maska = pd.Series(False, index=df.index)
    for _, g in df.groupby("stanica_id", sort=False):  # df je sortiran po stanici i ts
        nula = g["y_A"].eq(0)
        duzina = nula.groupby((nula != nula.shift()).cumsum()).transform("size")
        maska.loc[g.index] = nula & (duzina >= NIZ_NULA_SATI)
    return _postavi(df, maska, "niz_nula")


def pravilo_nula_dan(df: pd.DataFrame) -> int:
    """Serije sa jednim smerom (dvosmerne pokriva otkaz_smera)."""
    n = 0
    for st, g in df[~df["stanica_id"].isin(STARI_DVOSMERNI)].groupby("stanica_id", sort=False):
        validno = g["razlog_A"].isin(VALIDNI)
        dnevno = g[validno].groupby("dan")["y_A"].agg(["sum", "size"])
        puni = dnevno[dnevno["size"] >= 23]  # 23 h = prolećni dan
        for dan, red in puni.iterrows():
            if red["sum"] != 0 or not g.loc[g["dan"] == dan, "novo"].any():
                continue
            pre = puni[(puni.index < dan) & (puni.index >= dan - pd.Timedelta(days=NULA_DAN_PROZOR_DANA))]
            if pre.empty:
                pre = puni[puni.index < dan].tail(NULA_DAN_PROZOR_DANA)
            if not pre.empty and pre["sum"].median() >= NULA_DAN_MIN:
                n += _postavi(df, (df["stanica_id"] == st) & (df["dan"] == dan), "nula_dan")
    return n


def pravilo_skok(df: pd.DataFrame, p90: pd.DataFrame) -> int:
    """p90 (model/p90.parquet): stanica_id, sat_pocetak (0–23 = početak sata), mesec (1–12), p90."""
    kljuc = pd.DataFrame({"stanica_id": df["stanica_id"], "sat_pocetak": df["sat"] - 1, "mesec": df["mesec"]})
    m = kljuc.merge(p90[["stanica_id", "sat_pocetak", "mesec", "p90"]], on=["stanica_id", "sat_pocetak", "mesec"],
                    how="left")["p90"]
    m.index = df.index
    kandidat = df["novo"] & df["razlog_A"].isin(VALIDNI)
    skok = kandidat & (df["y_A"] > np.maximum(SKOK_MIN, SKOK_PUTA * m))
    # gradski događaj: skok na ≥ 3 stanice istog dana → taj dan se ne dira
    stanica_po_danu = df[skok].groupby("dan")["stanica_id"].nunique()
    dogadjaj = df["dan"].isin(stanica_po_danu[stanica_po_danu >= DOGADJAJ_STANICA].index)
    skok &= ~dogadjaj
    okolina = pd.Series(False, index=df.index)
    for st, g in df[skok].groupby("stanica_id"):
        u_st = df["stanica_id"] == st
        for t in g["ts"]:
            okolina |= u_st & (df["ts"] - t).abs().le(pd.Timedelta(hours=OKOLINA_SATI))
    okolina &= kandidat & ~skok & ~dogadjaj & (df["y_A"] > np.maximum(OKOLINA_MIN, OKOLINA_PUTA * m))
    return _postavi(df, skok, "skok") + _postavi(df, okolina, "skok_okolina")


def _ocekivano_po_satu(g: pd.DataFrame, dan: pd.Timestamp) -> pd.Series | None:
    """Prosek po satu iz poslednjih 4 ista dana u nedelji (pre `dan`) sa potpunim validnim podacima."""
    validno = g[g["razlog_A"].isin(VALIDNI)]
    po_danu = validno.groupby("dan")["y_A"].size()
    puni = po_danu[(po_danu >= 23) & (po_danu.index < dan)
                   & (pd.DatetimeIndex(po_danu.index).dayofweek == dan.dayofweek)].index
    izabrani = sorted(puni)[-OTKAZ_NEDELJA:]
    if not izabrani:
        return None
    return validno[validno["dan"].isin(izabrani)].groupby("sat")["y_A"].mean()


def pravilo_otkaz_smera(df: pd.DataFrame, smerovi: pd.DataFrame) -> int:
    """smerovi: satno_smerovi (serija, direction, datum, sat, y_A) za nove dane."""
    n = 0
    if smerovi.empty:
        return 0
    sm = smerovi[smerovi["serija"].isin(STARI_DVOSMERNI)].copy()
    sm["dan"] = pd.to_datetime(sm["datum"])
    for st, gs in sm.groupby("serija"):
        # sati u kojima su oba smera validna
        siroko = gs.pivot_table(index=["dan", "sat"], columns="direction", values="y_A", aggfunc="first")
        siroko = siroko.dropna()
        if siroko.shape[1] < 2:
            continue
        po_danu = siroko.groupby(level="dan").sum()
        zbir = po_danu.sum(axis=1)
        sumnjiv = (po_danu.min(axis=1) < OTKAZ_UDEO * zbir) & (zbir >= OTKAZ_MIN_DNEVNO)
        sumnjiv = sumnjiv.reindex(pd.date_range(po_danu.index.min(), po_danu.index.max(), freq="D"),
                                  fill_value=False)
        grupa = (sumnjiv != sumnjiv.shift()).cumsum()
        duzina = sumnjiv.groupby(grupa).transform("size")
        dani = sumnjiv[sumnjiv & (duzina >= OTKAZ_DANA)].index
        g = df[df["stanica_id"] == st]
        for dan in dani:
            u_danu = (df["stanica_id"] == st) & (df["dan"] == dan) & df["razlog_A"].isin(VALIDNI) & df["novo"]
            if not u_danu.any():
                continue
            ocekivano = _ocekivano_po_satu(g[g["razlog_A"] != "otkaz_smera"], dan)
            stvarno = df.loc[u_danu]
            if ocekivano is not None:
                oc = stvarno["sat"].map(ocekivano).sum()
                if oc > 0 and stvarno["y_A"].sum() >= OTKAZ_PRAG_OCEKIVANO * oc:
                    df.loc[u_danu, "razlog_A"] = "ok_jedan_smer"
                    continue
            n += _postavi(df, u_danu, "otkaz_smera")
            g = df[df["stanica_id"] == st]
    return n


# ---------------------------------------------------------------- glavni tok

def pripremi(istorija: pd.DataFrame, novo: pd.DataFrame, smerovi: pd.DataFrame,
             p90: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """istorija: očišćen master iz paketa; novo: master_YYYY-MM iz scrapera; smerovi: satno_smerovi novih dana."""
    kolone = ["stanica_id", "ts", "y_A", "razlog_A"]
    ist = istorija[kolone].copy()
    ist["novo"] = False
    nov = novo[kolone].copy()
    nov = nov[nov["ts"] > ist["ts"].max()]
    nov["novo"] = True
    df = pd.concat([ist, nov], ignore_index=True)
    df = puna_mreza(df)
    df["novo"] = df["novo"].astype("boolean").fillna(True).astype(bool)  # rupa između = nov deo
    df.loc[df["razlog_A"].eq("ok") & df["y_A"].isna(), "razlog_A"] = "nema_reda"
    df["dan"], df["sat"] = _dan_i_sat(df["ts"])
    df["mesec"] = (df["ts"] - pd.Timedelta(hours=1)).dt.month   # mesec početka sata (kao sat_pocetak)

    izvestaj = {
        "outlier": pravilo_outlier(df),
        "niz_nula": pravilo_niz_nula(df),
        "nula_dan": pravilo_nula_dan(df),
        "skok": pravilo_skok(df, p90),
        "otkaz_smera": pravilo_otkaz_smera(df, smerovi),
    }
    izvestaj["ok_jedan_smer"] = int((df["novo"] & df["razlog_A"].eq("ok_jedan_smer")).sum())
    df["y_A"] = df["y_A"].astype("float64")
    return df[kolone].sort_values(["stanica_id", "ts"]).reset_index(drop=True), izvestaj


def _ucitaj_novo(podaci: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    mesecni = sorted(podaci.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/master_*.parquet"))
    if not mesecni:
        raise SystemExit("nema podaci/YYYY/MM/master_YYYY-MM.parquet — prvo pokrenuti scraper.satno")
    novo = pd.concat([pd.read_parquet(f) for f in mesecni], ignore_index=True)
    sm = sorted(podaci.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/satno_smerovi.csv"))
    smerovi = pd.concat([pd.read_csv(f, dtype={"direction": str, "serija": str}) for f in sm],
                        ignore_index=True) if sm else pd.DataFrame()
    return novo, smerovi


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, default=MODEL)
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    potrebno = [a.model / "istorija.parquet", a.model / "p90.parquet"]
    nedostaje = [str(p) for p in potrebno if not p.exists()]
    if nedostaje:
        log.error("nedostaje paket modela: %s", ", ".join(nedostaje))
        return 3
    novo, smerovi = _ucitaj_novo(konfig.PODACI)
    df, izvestaj = pripremi(pd.read_parquet(potrebno[0]), novo, smerovi, pd.read_parquet(potrebno[1]))
    a.izlaz.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(a.izlaz, index=False)
    log.info("istorija za model: %d redova, %d serija, do %s; očišćeno: %s", len(df), df["stanica_id"].nunique(),
             df["ts"].max(), izvestaj)
    return 0


if __name__ == "__main__":
    sys.exit(main())
