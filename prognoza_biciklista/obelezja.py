"""Faza 4: obeležja za model — PRENOS logike iz model/izvor/features.py (napravi, ucitaj_meteo, _istorija) i
model/izvor/tft.py (pripremi), bez izmena. Svako odstupanje od izvor/ je greška (test: tests/test_referenca.py).

Ulazi:
  master  — stanica_id, ts, y_A, razlog_A (očišćen, puna satna mreža; model_podaci/istorija.parquet)
  meteo   — tabela vremena u formatu treninga: Datum, Cas (01:00–24:00), 8 meteo kolona, dan_u_nedelji (pon = 1),
            is_weekend, is_holiday — oznaka sata u UTC+1 (model-v2, MODEL_KONTEKST 4b): open_meteo.tabela_iz_ts(
            model/meteo_istorija_utc1.parquet) ili open_meteo.u_format_treninga (Open-Meteo t → ts = t + 1 h).
            Meteo je već na oznaci modela, pa se ovde NE prevodi (features._meteo_u_utc1 / pomeri_izmereno se
            primenjuju samo na sirovu izmerenu tabelu iz treninga, koja ovde ne ulazi).
  paket   — model/obelezja.json + model/skale.json (fiksna skala po stanici)
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

MODEL = Path(__file__).resolve().parent.parent / "model"


@dataclass
class Paket:
    ob: dict
    skale: dict
    folder: Path

    @classmethod
    def ucitaj(cls, folder: Path = MODEL) -> "Paket":
        return cls(json.loads((folder / "obelezja.json").read_text(encoding="utf-8")),
                   json.loads((folder / "skale.json").read_text(encoding="utf-8")), folder)

    @property
    def L(self) -> int:
        return int(self.ob["min_lag_sati"])

    @property
    def t0(self) -> pd.Timestamp:
        return pd.Timestamp(self.ob["t0"])


# ---------------------------------------------------------------- features.ucitaj_meteo

def ucitaj_meteo(m: pd.DataFrame, meteo_kasnjenje: dict) -> pd.DataFrame:
    """Kopija features.ucitaj_meteo (bez godišnjih doba, koja konačni model ne koristi)."""
    m = m.copy()
    sat = m["Cas"].astype(str).str[:2].astype(int)
    datum = pd.to_datetime(m["Datum"])
    m["ts"] = datum + pd.to_timedelta(sat, unit="h")
    h = sat - 1                                    # 01:00 = interval 00-01h -> sat 0
    m["sat_sin"], m["sat_cos"] = np.sin(2 * np.pi * h / 24), np.cos(2 * np.pi * h / 24)
    dow = m["dan_u_nedelji"] - 1
    m["dan_sin"], m["dan_cos"] = np.sin(2 * np.pi * dow / 7), np.cos(2 * np.pi * dow / 7)
    doy = datum.dt.dayofyear - 1
    m["doy_sin"], m["doy_cos"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    m["trend"] = (datum - pd.Timestamp("2021-01-01")).dt.days / 365.25
    m["sat_u_danu"] = h
    m = m.sort_values("ts").reset_index(drop=True)          # izvedena obelezja kise (E20)
    pad = m["padavine"].fillna(0)
    m["padavine_pre_1h"] = pad.shift(1)
    m["padavine_3h"] = pad.rolling(3, min_periods=1).sum()
    m["padavine_dan"] = pad.groupby(m["Datum"]).transform("sum")
    m["sati_kise_dan"] = (pad > 0.1).groupby(m["Datum"]).transform("sum").astype(np.float32)
    for c, sati in (meteo_kasnjenje or {}).items():          # E23: vrednost od pre `sati` sati (po vremenu)
        s = m.set_index("ts")[c]
        m[c] = s.reindex(m["ts"] - pd.Timedelta(hours=int(sati))).to_numpy()
    return m


# ---------------------------------------------------------------- features._istorija / napravi

def _istorija(g: pd.Series, ime: str, L: int) -> pd.Series:
    if ime.startswith("lag_"):
        n = int(ime.split("_")[1])
        assert n >= L, f"{ime}: pomak {n} je manji od min_lag_sati={L}"
        return g.shift(n)
    if ime == "isti_sat_7d":
        pomaci = [24 * k for k in range(1, 8) if 24 * k >= L]
        return pd.concat([g.shift(p) for p in pomaci], axis=1).mean(axis=1)
    if ime.startswith("roll_"):
        n = int(ime.split("_")[1])
        return g.shift(L).rolling(n, min_periods=max(1, n // 4)).mean()
    raise ValueError(f"Nepoznato obelezje istorije: {ime}")


def napravi(master: pd.DataFrame, meteo: pd.DataFrame, paket: Paket) -> pd.DataFrame:
    """Kao features.napravi sa config_E31 (cilj A, dinamička skala 720 h, fiksna skala iz skale.json)."""
    ob, L = paket.ob, paket.L
    kolone = ["stanica_id", "ts", "y_A", "razlog_A"] + (["y_procena"] if "y_procena" in master else [])
    df = master[kolone].rename(columns={"y_A": "y", "razlog_A": "razlog"})
    df = df.sort_values(["stanica_id", "ts"]).reset_index(drop=True)
    # ulaz iz prošlosti (lag, roll, dinamička skala): izmereno, a za sate kvara smera procena (priprema.KVAR_SMERA);
    # cilj y i ocena ostaju bez procene
    df["y_ulaz"] = df["y"].fillna(df["y_procena"].where(df["razlog"] == "kvar_smera")) if "y_procena" in df else df["y"]
    df["skala_fiksna"] = df["stanica_id"].map(paket.skale).clip(lower=1.0)
    w = int(ob["skala_prozor_sati"])
    dyn = df.groupby("stanica_id", sort=False)["y_ulaz"].transform(
        lambda s: s.shift(L).rolling(w, min_periods=max(1, w // 4)).mean())
    df["skala"] = dyn.fillna(df["skala_fiksna"]).clip(lower=float(ob["skala_clip_min"]))
    df["nivo_stanice"] = df["skala"] / df["skala_fiksna"]
    df["yn"] = df["y"] / df["skala"]
    g = df.groupby("stanica_id", sort=False)["y_ulaz"]
    for ime in ob["istorija"]:
        df[ime] = g.transform(lambda s, ime=ime: _istorija(s, ime, L)) / df["skala"]

    m = ucitaj_meteo(meteo, ob.get("meteo_kasnjenje") or {})
    meteo_k, kal = ob["meteo"], ob["kalendar"]
    df = df.merge(m[["ts", "sat_u_danu"] + meteo_k + kal], on="ts", how="left")
    df["st_idx"] = df["stanica_id"].map(ob["st_idx"]).astype(np.int64)
    return df


# ---------------------------------------------------------------- tft.pripremi

def pripremi_tft(df: pd.DataFrame, paket: Paket) -> pd.DataFrame:
    """Kao tft.pripremi(istorija_poznata=True, bez=("trend", "log_skala")) nad izlazom napravi()."""
    ob = paket.ob
    df = df.sort_values(["stanica_id", "ts"]).reset_index(drop=True).copy()
    df["time_idx"] = ((df["ts"] - paket.t0) / pd.Timedelta(hours=1)).round().astype(np.int64)
    df["y_nema"] = df["yn"].isna().astype(np.float32)
    df["w"] = (1.0 - df["y_nema"]).astype(np.float32)
    df["yn_cilj"] = df["yn"].fillna(0.0).astype(np.float32)
    for c in ob["istorija"]:
        df[c] = df[c].fillna(df["isti_sat_7d"]).fillna(1.0).astype(np.float32)
    for c in ob["tft_poznata"]:
        df[c] = df.groupby("stanica_id")[c].transform(lambda s: s.ffill().bfill()).fillna(0).astype(np.float32)
    df["stanica_id"] = df["stanica_id"].astype(str)
    return df


def xgb_matrica(df: pd.DataFrame, paket: Paket) -> pd.DataFrame:
    X = df[paket.ob["xgb_obelezja"]].copy()
    X["st_idx"] = pd.Categorical(df["st_idx"], categories=paket.ob["xgb_kategorije_st_idx"])
    return X
