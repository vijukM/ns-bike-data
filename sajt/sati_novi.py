"""SAJT — „Dan na mapi“ posle istorije: satni fajlovi docs/data/istorija/sati/YYYY-MM.json od 09/2026, iz satnog
obračuna scraper-a (podaci/biciklisti/YYYY/MM/satno_YYYY-MM.parquet), u ISTOM formatu kao istorija
(sajt/pripremi_istoriju.py): satna mreža po UTC od lokalne ponoći 1. u mesecu, dani [datum, i0, sati], v (vrednosti),
r (razlozi kao RLE). Plus docs/data/istorija/sati_dostupno.json: poslednji obrađen dan i dani bez ijednog podatka.

    python -m sajt.sati_novi          # pokreće citaj.yml posle noćnog satnog obračuna (scraper.satno)

Današnji dan (sati koji su prošli) strana uzima iz docs/data/danas.json, pa se ovi fajlovi menjaju samo jednom dnevno.
Razlozi iz scraper-a (nema_citanja, nepotpun_sat, nema_podataka) → „nema podataka“; serija 28 → „brojač neispravan“.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from scraper import konfig

from . import pripremi_istoriju as pi

OD_MESECA = pd.Period("2026-09", freq="M")                 # istorija (istorija-v1) se završava 31. 8. 2026.


def ucitaj_satno(koren: Path = konfig.PODACI) -> pd.DataFrame:
    f = sorted(koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/satno_[0-9][0-9][0-9][0-9]-[0-9][0-9].parquet"))
    if not f:
        return pd.DataFrame(columns=["stanica_id", "pocetak_utc", "y_A", "kod"])
    d = pd.concat([pd.read_parquet(x) for x in f], ignore_index=True)
    d["pocetak_utc"] = pd.to_datetime(d["ts_utc"], utc=True).dt.tz_convert(None) - pd.Timedelta(hours=1)
    d["razlog_A"] = d["razlog_A"].fillna("ok")
    d["kod"] = np.where(d["razlog_A"] == "ok", pi.KOD["ok"], pi.KOD["nema_reda"])
    d.loc[d["y_A"].isna() & (d["kod"] == 0), "kod"] = pi.KOD["nema_reda"]
    for serija, (od, razlog, _) in pi.NEISPRAVNE.items():
        maska = d["stanica_id"] == serija
        d.loc[maska, "y_A"] = np.nan
        d.loc[maska, "kod"] = pi.KOD[razlog]
    return d.drop_duplicates(["stanica_id", "pocetak_utc"], keep="last")


def napravi(koren: Path = konfig.PODACI, izlaz: Path = pi.IZLAZ) -> dict:
    d = ucitaj_satno(koren)
    velicine = {}
    if d.empty:
        return velicine
    poslednji = (d["pocetak_utc"].max() + pd.Timedelta(hours=1)).tz_localize("UTC").tz_convert(konfig.TZ)
    poslednji_dan = (poslednji - pd.Timedelta(minutes=1)).date()          # kraj poslednjeg sata, 24:00 = isti dan
    serije = sorted(d["stanica_id"].unique())
    # sat u mesecu kao ceo broj (nezavisno od preciznosti datetime64: us/ns se razlikuju među verzijama pandas-a,
    # pa je reindex po vremenu u GitHub Actions dao prazne mesece)
    t_ns = pd.to_datetime(d["pocetak_utc"]).dt.as_unit("ns").astype("int64")
    prazni = []
    for per in pd.period_range(OD_MESECA, pd.Period(poslednji_dan, freq="M"), freq="M"):
        pocetak, n, dani_meseca = pi._mreza_meseca(per.year, per.month)
        p0 = pd.Timestamp(pocetak).as_unit("ns").value
        i = ((t_ns - p0) // 3_600_000_000_000).to_numpy()
        u_mesecu = (i >= 0) & (i < n)
        obj = {"mesec": str(per), "pocetak_utc": pocetak.strftime("%Y-%m-%dT%H:%MZ"), "n": n, "dani": dani_meseca,
               "v": {}, "r": {}}
        validnih = np.zeros(n, dtype=int)
        for s in serije:
            m = u_mesecu & (d["stanica_id"] == s).to_numpy()
            y = np.full(n, np.nan)
            kod = np.full(n, pi.KOD["nema_reda"], dtype=int)
            y[i[m]] = d.loc[m, "y_A"].to_numpy(dtype=float)
            kod[i[m]] = d.loc[m, "kod"].to_numpy(dtype=int)
            if np.isnan(y).all() and (kod == pi.KOD["nema_reda"]).all():
                continue                                   # serija bez ijednog podatka u mesecu (npr. ceo septembar)
            obj["v"][s] = [pi._i(x) for x in y]
            obj["r"][s] = pi.razlozi_rle(kod)
            validnih += ~np.isnan(y)
        for iso, i0, sati in dani_meseca:
            if date.fromisoformat(iso) <= poslednji_dan and not validnih[i0:i0 + sati].any():
                prazni.append(iso)
        velicine[f"sati/{per}.json"] = pi._pisi(izlaz / "sati" / f"{per}.json", obj)
    velicine["sati_dostupno.json"] = pi._pisi(izlaz / "sati_dostupno.json", {
        "od": pi.OD.isoformat(), "do": poslednji_dan.isoformat(), "prazni_dani": prazni,
        "opis": "dani do „do“ imaju satne fajlove; „prazni_dani“ nemaju nijedan podatak (rupa između istorije i "
                "scraper-a 01.09–08.10.2026); današnji dan je u data/danas.json"})
    return velicine


def main(argv=None) -> int:
    v = napravi()
    for k, n in v.items():
        print(f"{k}: {n / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
