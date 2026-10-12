"""Označavanje neobičnih sati po smeru (za Excel). Vrednosti se NE menjaju — samo se markiraju.

Pravila (pragovi su konstante ispod):
  nula_dan  — smer je ceo dan imao 0 biciklista (moguće neispravan senzor)                 narandžasto
  nula_niz  — ≥ 3 uzastopna dnevna sata (07:00–21:00) sa 0, a smer tog dana ima ≥ 100    narandžasto
  skok      — vrednost ≥ 50 i ≥ 3× veća od OBA susedna sata (nagli izolovani skok)        žuto
  (> 400 je crveno kao u istorijskoj tabeli; nedostajući sat — sivo, razlog u Status)
"""
from __future__ import annotations

import pandas as pd

NIZ_MIN_SATI = 3
NIZ_OD, NIZ_DO = 7, 21          # oznake sati (kraj sata) u kojima se traže nizovi nula
NIZ_MIN_DNEVNO = 100
SKOK_MIN = 50
SKOK_PUTA = 3
SKOK_MIN_SUSED = 5              # da 0 u susednom satu ne pravi „beskonačan“ skok

OPIS = {
    "nula_dan": "smer je ceo dan imao 0 biciklista (moguće neispravan senzor)",
    "nula_niz": f"≥ {NIZ_MIN_SATI} uzastopna sata sa 0 između {NIZ_OD:02d}:00 i {NIZ_DO:02d}:00, "
                f"a smer tog dana ima ≥ {NIZ_MIN_DNEVNO}",
    "skok": f"vrednost ≥ {SKOK_MIN} i ≥ {SKOK_PUTA}× veća od oba susedna sata",
}


def oznaci(df: pd.DataFrame) -> pd.Series:
    """df: kolone ts_utc, datum, sat, y_A za JEDAN smer. Vraća Series oznaka (None = običan sat), indeks = df.index."""
    df = df.sort_values("ts_utc")
    y = df["y_A"]
    oznake = pd.Series(None, index=df.index, dtype=object)

    # nula_dan: svi sati dana prisutni i = 0
    po_danu = df.groupby("datum")["y_A"]
    ceo_dan_nula = po_danu.transform(lambda s: s.notna().all() and (s == 0).all())
    oznake[ceo_dan_nula.astype(bool)] = "nula_dan"

    # nula_niz: uzastopne nule u dnevnim satima, u danu sa dovoljno saobraćaja
    dnevno = po_danu.transform("sum")
    kandidat = (y == 0) & df["sat"].between(NIZ_OD, NIZ_DO) & (dnevno >= NIZ_MIN_DNEVNO)
    grupa = (kandidat != kandidat.shift()).cumsum()
    duzina = kandidat.groupby(grupa).transform("size")
    oznake[kandidat & (duzina >= NIZ_MIN_SATI) & oznake.isna()] = "nula_niz"

    # skok: izolovan nagli skok u odnosu na oba suseda
    pre = y.shift(1).clip(lower=SKOK_MIN_SUSED)
    posle = y.shift(-1).clip(lower=SKOK_MIN_SUSED)
    skok = (y >= SKOK_MIN) & (y >= SKOK_PUTA * pre) & (y >= SKOK_PUTA * posle)
    oznake[skok.fillna(False) & oznake.isna()] = "skok"
    return oznake
