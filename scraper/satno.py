"""Satne vrednosti iz čitanja „danas/juče" — po smeru, pa po seriji. Bez interpolacije.

Konvencija (kao istorijski podaci): oznaka sata = KRAJ sata, 01:00–24:00 lokalno (Europe/Belgrade);
24:00 se zapisuje kao 00:00 sledećeg dana. Za lokalni dan D i čitanja R(h) u satu h (≈ h:01):
    sat 00–01 = danas@R(1)
    sat (h−1)–h = danas@R(h) − danas@R(h−1)
    sat 23–24 = juče@(prvo ispravno čitanje posle ponoći) − danas@R(23)
Čitanje važi samo ako je vreme brojača posle pune sata i ne starije od 15 min od čitanja.
Dan prelaska na letnje vreme ima 23 sata, na zimsko 25 (oznaka 02:00 se tada javlja dva puta —
jednoznačno je ts_utc). Računaju se samo završeni dani (za koje je počeo sledeći dan).

    python -m scraper.satno

Izlaz: podaci/satno.parquet i .csv (stanica_id, ts, y, razlog, ts_utc), podaci/satno_smerovi.csv,
podaci/satno_provera.csv (odstupanja zbira 24 sata od „juče").
"""
from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from . import konfig

log = logging.getLogger(__name__)

MAKS_STAROST = timedelta(minutes=15)
KLJUC = ["locationID", "direction", "directionDesc"]

# razlozi (prioritet: prvi pronađeni po redosledu potrebnih čitanja)
NEMA_CITANJA = "nema_citanja"
NEMA_SMERA = "nema_smera"
ZASTARELO = "zastarelo"
NEGATIVNO = "negativna_razlika"


def kvar(state) -> str:
    return f"kvar_state_{state}"


def ucitaj_snimke(folder: Path | None = None) -> pd.DataFrame:
    folder = folder or konfig.SNIMCI
    fajlovi = sorted(folder.glob("*.csv"))
    if not fajlovi:
        return pd.DataFrame()
    return pd.concat([pd.read_csv(f, dtype={"location": str, "direction": str}, keep_default_na=False,
                                  na_values=[""]) for f in fajlovi], ignore_index=True)


def _vreme_brojaca(datum: str, vreme: str, citanje: datetime) -> datetime | None:
    """Lokalno vreme brojača -> UTC; dvosmislen sat (zimsko vreme) razrešava se prema vremenu čitanja."""
    try:
        naivno = datetime.fromisoformat(f"{datum}T{vreme}")
    except (TypeError, ValueError):
        return None
    kandidati = {naivno.replace(tzinfo=konfig.TZ, fold=f).astimezone(timezone.utc) for f in (0, 1)}
    # najbliže vremenu čitanja, ali ne posle njega (uz 2 min tolerancije za satove)
    ispravni = [k for k in kandidati if k <= citanje + timedelta(minutes=2)] or list(kandidati)
    return max(ispravni)


def pripremi(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["t_citanja"] = pd.to_datetime(df["vreme_citanja_utc"], utc=True)
    df["t_brojaca"] = [
        _vreme_brojaca(d, v, c.to_pydatetime())
        for d, v, c in zip(df["datum_brojaca"], df["vreme_brojaca"], df["t_citanja"])
    ]
    df["t_brojaca"] = pd.to_datetime(df["t_brojaca"], utc=True)
    df["sat_utc"] = df["t_citanja"].dt.floor("h")
    for k in KLJUC + ["serija"]:
        df[k] = df[k].astype(str)
    return df


def _sat(t) -> str:
    """Ključ UTC sata (nezavisan od rezolucije/tz objekta pandas Timestamp-a)."""
    return pd.Timestamp(t).tz_convert("UTC").strftime("%Y-%m-%dT%H")


@dataclass
class _Citanje:
    danas: float | None
    juce: float | None
    state: int | None
    razlog: str | None  # None = ispravno


def _granice_dana(d: date) -> tuple[datetime, datetime]:
    pocetak = datetime(d.year, d.month, d.day, tzinfo=konfig.TZ).astimezone(timezone.utc)
    sledeci = d + timedelta(days=1)
    kraj = datetime(sledeci.year, sledeci.month, sledeci.day, tzinfo=konfig.TZ).astimezone(timezone.utc)
    return pocetak, kraj


def _ocitaj(red: pd.Series | None, ima_citanja: bool, pocetak_sata: datetime) -> _Citanje:
    if not ima_citanja:
        return _Citanje(None, None, None, NEMA_CITANJA)
    if red is None:
        return _Citanje(None, None, None, NEMA_SMERA)
    tb, tc = red["t_brojaca"], red["t_citanja"]
    if pd.isna(tb) or tb < pocetak_sata or tc - tb > MAKS_STAROST:
        return _Citanje(None, None, None, ZASTARELO)
    st = None if pd.isna(red["state"]) else int(red["state"])
    return _Citanje(red["danas"], red["juce"], st, None)


def _razlika(citanja: list[_Citanje], vrednost) -> tuple[float | None, str | None]:
    for c in citanja:
        if c.razlog:
            return None, c.razlog
    for c in citanja:
        if c.state != 1:
            return None, kvar(c.state)
    y = vrednost()
    if y is None or pd.isna(y):
        return None, NEMA_SMERA
    if y < 0:
        return None, NEGATIVNO
    return float(y), None


def satno_po_smeru(df: pd.DataFrame, do_dana: date | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Vraća (satne vrednosti po smeru, provera zbira) za sve završene lokalne dane."""
    if df.empty:
        return pd.DataFrame(), pd.DataFrame()
    df = pripremi(df)
    lok_dan = df["t_citanja"].dt.tz_convert(konfig.TZ).dt.date
    prvi, poslednji = lok_dan.min(), lok_dan.max()
    do_dana = do_dana or poslednji  # isključivo: dan D se računa samo ako je počeo D+1
    # prvo čitanje u svakom UTC satu (svaki lokalni sat je tačno jedan UTC sat)
    df_prva = df[df["t_citanja"] == df.groupby("sat_utc")["t_citanja"].transform("min")]
    po_satu = {_sat(s): g.set_index(KLJUC) for s, g in df_prva.groupby("sat_utc")}

    redovi, provera = [], []
    d = prvi
    while d < do_dana:
        pocetak, kraj = _granice_dana(d)
        sati = list(pd.date_range(pocetak, kraj, freq="h", inclusive="left"))
        n = len(sati)  # 23 / 24 / 25
        u_danu = df[(df["t_citanja"] >= pocetak) & (df["t_citanja"] < kraj)]
        sledeci = df[(df["t_citanja"] >= kraj) & (df["t_citanja"] < kraj + timedelta(days=1))]
        izvor = u_danu if not u_danu.empty else sledeci
        kljucevi = izvor[KLJUC + ["serija"]].drop_duplicates()
        for _, kr in kljucevi.iterrows():
            k = tuple(kr[KLJUC])

            def citanje(i: int) -> _Citanje:
                s = sati[i]
                g = po_satu.get(_sat(s))
                red = g.loc[k] if g is not None and k in g.index else None
                if isinstance(red, pd.DataFrame):
                    red = red.iloc[0]
                return _ocitaj(red, g is not None, s)

            # „juče" iz prvog ispravnog čitanja posle ponoći
            kand = sledeci[(sledeci[KLJUC] == list(k)).all(axis=1)].sort_values("t_citanja")
            J = _Citanje(None, None, None, NEMA_CITANJA if sledeci.empty else NEMA_SMERA)
            for _, red in kand.iterrows():
                c = _ocitaj(red, True, kraj)
                J = c
                if c.razlog is None:
                    break
            R = [citanje(i) for i in range(n)]
            vrednosti = []
            for i in range(n):
                if i == 0:
                    y, razlog = _razlika([R[1]], lambda: R[1].danas)
                elif i < n - 1:
                    y, razlog = _razlika([R[i], R[i + 1]], lambda: R[i + 1].danas - R[i].danas)
                else:
                    y, razlog = _razlika([R[i], J], lambda: J.juce - R[i].danas)
                kraj_sata = sati[i + 1] if i + 1 < n else pd.Timestamp(kraj)
                vrednosti.append(y)
                redovi.append({
                    "serija": kr["serija"], "locationID": k[0], "direction": k[1], "directionDesc": k[2],
                    "ts": kraj_sata.tz_convert(konfig.TZ).tz_localize(None),
                    "ts_utc": kraj_sata,
                    "y": y, "razlog": razlog,
                })
            if all(v is not None for v in vrednosti) and J.juce is not None:
                zbir = sum(vrednosti)
                if zbir != J.juce:
                    provera.append({"datum": d.isoformat(), "locationID": k[0], "direction": k[1],
                                    "directionDesc": k[2], "zbir_sati": zbir, "juce": J.juce,
                                    "razlika": zbir - J.juce})
        d += timedelta(days=1)
    return pd.DataFrame(redovi), pd.DataFrame(provera)


def satno_po_seriji(smerovi: pd.DataFrame) -> pd.DataFrame:
    """Serija = zbir svih smerova, samo ako svi smerovi imaju vrednost; inače NaN sa razlogom prvog smera."""
    if smerovi.empty:
        return pd.DataFrame(columns=["stanica_id", "ts", "y", "razlog", "ts_utc"])
    redovi = []
    for (serija, ts_utc), g in smerovi.groupby(["serija", "ts_utc"], sort=True):
        if g["y"].notna().all():
            y, razlog = float(g["y"].sum()), None
        else:
            y, razlog = None, g.loc[g["y"].isna(), "razlog"].iloc[0]
        redovi.append({"stanica_id": serija, "ts": g["ts"].iloc[0], "y": y, "razlog": razlog, "ts_utc": ts_utc})
    out = pd.DataFrame(redovi)
    out["y"] = out["y"].astype("float64")
    return out.sort_values(["stanica_id", "ts_utc"]).reset_index(drop=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--podaci", type=Path, default=konfig.PODACI)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    df = ucitaj_snimke(a.podaci / "snimci")
    smerovi, provera = satno_po_smeru(df)
    serije = satno_po_seriji(smerovi)
    serije.to_parquet(a.podaci / "satno.parquet", index=False)
    serije.to_csv(a.podaci / "satno.csv", index=False)
    smerovi.to_csv(a.podaci / "satno_smerovi.csv", index=False)
    provera.to_csv(a.podaci / "satno_provera.csv", index=False)
    if serije.empty:
        log.info("nema završenih dana")
        return 0
    log.info("serija: %d, sati: %d, popunjeno: %d, NaN: %d", serije["stanica_id"].nunique(), len(serije),
             serije["y"].notna().sum(), serije["y"].isna().sum())
    for r, n in serije["razlog"].value_counts().items():
        log.info("  NaN razlog %s: %d", r, n)
    if not provera.empty:
        log.warning("odstupanja zbira od „juče“: %d (vidi satno_provera.csv)", len(provera))
    return 0


if __name__ == "__main__":
    sys.exit(main())
