"""Faza 2: istorija za model = model/istorija.parquet (očišćena, 01.06–31.08.2026) + novi sati iz scrapera,
očišćeni po istim pravilima kao istorijski master (docs/MODEL_KONTEKST.md, tačka 5).

    python -m prognoza_biciklista.priprema        # -> model_podaci/istorija.parquet

Izlaz: stanica_id, ts, y_A, razlog_A na punoj naivnoj satnoj mreži (rupa 01.09–08.10.2026 = NaN, nema_reda).
Oznaka vremena kao istorija (MODEL_KONTEKST 4b): ts = ts_utc + 1 h (kraj sata, UTC+1 cele godine) — u_utc1.
Istorija iz paketa se ne menja; pravila se primenjuju samo na nove sate (istorija služi kao kontekst).

Pravila (redosled primene; vrednost → NaN uz razlog):
  outlier        y > 400
  niz_nula       ≥ 168 uzastopnih sati sa 0
  nula_dan       serija sa jednim smerom ceo dan 0, a inače (medijana 28 prethodnih dana) ima ≥ 50 dnevno
  skok           y > max(50, 4 × p90[stanica, sat, mesec]); skok_okolina: ±3 h ako y > max(30, 2 × p90);
                 dan sa skokom na ≥ 3 stanice = gradski događaj → ne dira se
  otkaz_smera    stari dvosmerni: slabiji smer < 2 % dnevnog zbira, ≥ 3 dana zaredom (zbir ≥ 50/dan) → NaN.
                 (Pravilo ok_jedan_smer — zbir ≥ 60 % očekivanog → validno — postoji, ali je isključeno dok ga
                 korisnik ne odobri: OK_JEDAN_SMER_ODOBRENO.)
  iskljucene     ISKLJUCENE: serija 28 NaN (otkaz_smera) od 18.04.2026 do popravke (`do`, prvi ispravan sat);
                 automatski povratak i ranije, kad smer 21 ≥ 3 dana zaredom ima 35–60 % dnevnog zbira
                 (zapis u podaci/prognoza_biciklista/iskljucene_serije.log)
  kvar_smera     KVAR_SMERA: novi sati pre popravke, kad je brojao samo jedan smer (potvrđeno od održavanja):
                 y_A = NaN (ne ocenjuje se), y_jedan_smer = izmereni smer, y_procena = y_jedan_smer / udeo smera
                 (vrsta dana, sat) — samo za ulaz modela (lag, roll, dinamička skala) i prikaz na sajtu.
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
# ok_jedan_smer: pravilo postoji, ali se NE primenjuje dok ga korisnik ne odobri (otkaz → uvek NaN otkaz_smera)
OK_JEDAN_SMER_ODOBRENO = False

# Isključene serije (odluka korisnika). Serija je NaN sa datim razlogom, osim ako se brojač automatski vrati:
# smer `smer_povratak` ≥ 3 uzastopna dana sa udelom 35–60 % dnevnog zbira → od prvog takvog dana ponovo uključena.
ISKLJUCENE = {
    "28": {"od": "2026-04-18", "do": "2026-10-23 13:00", "razlog": "otkaz_smera", "opis": "brojač neispravan od 04/2026 "
           "(smer 21 ne broji, smer 11 broji samo svoj smer)", "smer_povratak": "21"},
}

# Kvar jednog smera sa poznatim krajem (ts = kraj sata UTC+1). 28 (stari brojač, zbir A01 + A02): od početka podataka
# uživo do popravke u petak 23.10.2026 brojao je samo A01 = smer 11. Prvi sat sa oba smera je 13–14 h lokalno (CEST)
# = ts 13:00; u satu 12–13 je popravka bila u toku (smer 21: 14), pa i on ide u kvar, sa izmerenim smerom 11.
# Provera skoka (27.10.2026): radni dani posle / 7 radnih dana pre, isti sati = 1,74 (samo 23.10 popodne i 26.10);
# na 84 sata sa oba smera procena smer 11 / udeo daje 0,975 (radni dan) i 0,954 (vikend) stvarnog zbira.
KVAR_SMERA = {
    "28": {"od": "2026-10-09", "do": "2026-10-23 13:00", "smer": "11", "udeo": KOREN / "prognoza_biciklista" / "udeo_smera_28.csv",
           "opis": "procena: drugi smer nije radio (potvrđeno od održavanja), dopuna po istorijskom odnosu smerova"},
}
POVRATAK_UDEO, POVRATAK_DANA = (0.35, 0.60), 3
LOG = konfig.KOREN / "podaci" / "prognoza_biciklista" / "iskljucene_serije.log"


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
            if OK_JEDAN_SMER_ODOBRENO and ocekivano is not None:
                oc = stvarno["sat"].map(ocekivano).sum()
                if oc > 0 and stvarno["y_A"].sum() >= OTKAZ_PRAG_OCEKIVANO * oc:
                    df.loc[u_danu, "razlog_A"] = "ok_jedan_smer"
                    continue
            n += _postavi(df, u_danu, "otkaz_smera")
            g = df[df["stanica_id"] == st]
    return n


def povratak_serije(smerovi: pd.DataFrame, serija: str, smer: str) -> pd.Timestamp | None:
    """Prvi dan niza od ≥ 3 uzastopna dana u kojima smer ima 35–60 % dnevnog zbira serije (brojač ponovo radi)."""
    if smerovi.empty:
        return None
    g = smerovi[smerovi["serija"] == serija].copy()
    if g.empty:
        return None
    g["dan"] = pd.to_datetime(g["datum"])
    siroko = g.pivot_table(index=["dan", "sat"], columns="direction", values="y_A", aggfunc="first").dropna()
    if smer not in siroko.columns or siroko.shape[1] < 2:
        return None
    po_danu = siroko.groupby(level="dan").sum()
    udeo = po_danu[smer] / po_danu.sum(axis=1)
    ok = udeo.between(*POVRATAK_UDEO).reindex(pd.date_range(po_danu.index.min(), po_danu.index.max(), freq="D"),
                                               fill_value=False)
    grupa = (ok != ok.shift()).cumsum()
    duzina = ok.groupby(grupa).transform("size")
    dani = ok[ok & (duzina >= POVRATAK_DANA)].index
    return dani.min() if len(dani) else None


def pravilo_iskljucene(df: pd.DataFrame, smerovi: pd.DataFrame) -> int:
    n = 0
    log_fajl = LOG
    for st, pod in ISKLJUCENE.items():
        povratak = povratak_serije(smerovi, st, pod["smer_povratak"])
        maska = (df["stanica_id"] == st) & (df["ts"] > pd.Timestamp(pod["od"]))
        if pod.get("do"):                                   # popravljen: od prvog ispravnog sata ponovo validna
            maska &= df["ts"] < pd.Timestamp(pod["do"])
        if povratak is not None:
            maska &= df["dan"] < povratak
            poruka = f"serija {st} ponovo uključena od {povratak.date()} (smer {pod['smer_povratak']} broji 35–60 %)"
            log.warning(poruka)
            if log_fajl is not None:
                log_fajl.parent.mkdir(parents=True, exist_ok=True)
                stari = log_fajl.read_text(encoding="utf-8") if log_fajl.exists() else ""
                if poruka not in stari:
                    with open(log_fajl, "a", encoding="utf-8") as f:
                        f.write(f"{pd.Timestamp.now(tz=konfig.TZ):%Y-%m-%d %H:%M}\t{poruka}\n")
        n += _postavi(df, maska, pod["razlog"])
    return n


def udeo_smera(putanja: Path) -> dict[tuple[int, int], float]:
    """(vikend 0/1, sat 1–24 = kraj sata UTC+1) → udeo smera u zbiru (istorija)."""
    u = pd.read_csv(putanja)
    return {(int(v), int(h)): float(x) for v, h, x in zip(u["vikend"], u["sat"], u["udeo"])}


def procena_iz_smera(ts: pd.Series, y_jedan: pd.Series, udeo: dict[tuple[int, int], float]) -> pd.Series:
    """y_procena = y_jedan_smer / udeo[vikend, sat] (ts = kraj sata UTC+1; dan i sat iz ts − 1 h), ceo broj."""
    pocetak = ts - pd.Timedelta(hours=1)
    u = [udeo.get((int(d >= 5), int(h) + 1)) for d, h in zip(pocetak.dt.dayofweek, pocetak.dt.hour)]
    return (y_jedan / pd.Series(u, index=y_jedan.index, dtype="float64")).round()


def pravilo_kvar_smera(df: pd.DataFrame, smerovi: pd.DataFrame) -> int:
    """KVAR_SMERA: novi sati serije pre popravke → razlog kvar_smera, y_A NaN (bez ocene), y_jedan_smer i y_procena."""
    n = 0
    for st, k in KVAR_SMERA.items():
        m = (df["stanica_id"] == st) & df["novo"] & df["y_sirovo"].notna() & \
            (df["ts"] > pd.Timestamp(k["od"])) & (df["ts"] < pd.Timestamp(k["do"]))
        if not m.any():
            continue
        jedan = df.loc[m, "y_sirovo"].astype("float64")
        if not smerovi.empty:                               # izmereni smer; zbir iz feed-a ako smera nema
            sm = smerovi[(smerovi["serija"] == st) & (smerovi["direction"] == k["smer"])]
            po_ts = pd.Series(sm["y_A"].to_numpy(dtype="float64"),
                              index=pd.to_datetime(sm["datum"]) + pd.to_timedelta(sm["sat"].astype(int), unit="h"))
            po_ts = po_ts[~po_ts.index.duplicated()]
            jedan = df.loc[m, "ts"].map(po_ts).fillna(jedan)
        df.loc[m, "y_jedan_smer"] = jedan
        df.loc[m, "y_procena"] = procena_iz_smera(df.loc[m, "ts"], jedan, udeo_smera(k["udeo"]))
        df.loc[m, "y_A"] = np.nan
        df.loc[m, "razlog_A"] = "kvar_smera"
        n += int(m.sum())
    return n


# ---------------------------------------------------------------- glavni tok

def pripremi(istorija: pd.DataFrame, novo: pd.DataFrame, smerovi: pd.DataFrame,
             p90: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """istorija: očišćen master iz paketa; novo: satno iz scraper-a (u_utc1); smerovi: satno_smerovi (u_utc1).
    Sve u oznaci modela: ts = kraj sata UTC+1."""
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
    df["y_sirovo"] = df["y_A"].astype("float64")                # vrednost iz feed-a, pre čišćenja
    df["y_jedan_smer"] = np.nan
    df["y_procena"] = np.nan

    izvestaj = {
        "outlier": pravilo_outlier(df),
        "niz_nula": pravilo_niz_nula(df),
        "nula_dan": pravilo_nula_dan(df),
        "skok": pravilo_skok(df, p90),
        "otkaz_smera": pravilo_otkaz_smera(df, smerovi),
        "iskljucene": pravilo_iskljucene(df, smerovi),
        "kvar_smera": pravilo_kvar_smera(df, smerovi),
    }
    izvestaj["ok_jedan_smer"] = int((df["novo"] & df["razlog_A"].eq("ok_jedan_smer")).sum())
    df["y_A"] = df["y_A"].astype("float64")
    kolone += ["y_jedan_smer", "y_procena"]                    # samo za kvar_smera (ulaz modela i prikaz), inače NaN
    return df[kolone].sort_values(["stanica_id", "ts"]).reset_index(drop=True), izvestaj


def u_utc1(df: pd.DataFrame) -> pd.DataFrame:
    """Scraper (satno) → oznaka modela (MODEL_KONTEKST 4b): ts = ts_utc + 1 h (kraj sata, naivno UTC+1, cele godine);
    datum i sat se računaju iz te oznake ((ts − 1 h).date(), (ts − 1 h).hour + 1), kao u istoriji.
    Lokalni ts iz scraper-a (Europe/Belgrade, leti UTC+2) se NE koristi: leti bi bio pomeren 1 h."""
    df = df.copy()
    df["ts"] = pd.to_datetime(df["ts_utc"], utc=True).dt.tz_convert(None) + pd.Timedelta(hours=1)
    pocetak = df["ts"] - pd.Timedelta(hours=1)
    df["datum"] = pocetak.dt.strftime("%Y-%m-%d")
    df["sat"] = pocetak.dt.hour + 1
    return df


def _ucitaj_novo(podaci: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Novi sati iz scraper-a u oznaci modela (UTC+1): mesečni satno_YYYY-MM.parquet (ima ts_utc) i satno_smerovi."""
    mesecni = sorted(podaci.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/satno_[0-9][0-9][0-9][0-9]-[0-9][0-9].parquet"))
    if not mesecni:
        raise SystemExit("nema podaci/YYYY/MM/satno_YYYY-MM.parquet — prvo pokrenuti scraper.satno")
    novo = u_utc1(pd.concat([pd.read_parquet(f) for f in mesecni], ignore_index=True))
    novo["razlog_A"] = novo["razlog_A"].fillna("ok")
    sm = sorted(podaci.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/satno_smerovi.csv"))
    smerovi = u_utc1(pd.concat([pd.read_csv(f, dtype={"direction": str, "serija": str}) for f in sm],
                               ignore_index=True)) if sm else pd.DataFrame()
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
