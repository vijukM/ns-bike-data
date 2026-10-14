"""Faza 3: vremenska prognoza (Open-Meteo Forecast API) u formatu meteo fajla iz treninga + izvedena obeležja.

    python -m prognoza.meteo     # preuzmi, sačuvaj sirovo u meteo/YYYY/MM/DD/HHMM.json, obradi -> model_podaci/meteo.parquet

Format kao u treningu: `Datum` (dan D) + `Cas` 01:00–24:00 (kraj sata). Vrednost Open-Meteo za lokalno vreme T
(temperatura u trenutku T, padavine = zbir za sat koji se završava u T) ide u Cas = T; T = 00:00 → Cas 24:00
prethodnog dana. DST: prolećna rupa se interpolira, jesenji duplikat usrednjava.

Izvedena obeležja (kao izvor/features.py::ucitaj_meteo — proveriti na model/referenca.parquet):
  padavine_pre_1h (prethodni sat), padavine_3h (tekući + 2 prethodna), padavine_dan, sati_kise_dan (> 0,1 mm)
  po Datum-u; vlaznost_zemljista = vrednost od pre 24 h; kalendar iz Datum/Cas: sat_sin/cos (h = sat − 1),
  dan_sin/cos (pon = 0), doy_sin/cos ((dan u godini − 1)/365,25), is_weekend, is_holiday, trend (samo XGB).
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from scraper import konfig

from .praznici import is_holiday

log = logging.getLogger(__name__)

URL = "https://api.open-meteo.com/v1/forecast"
LAT, LON = 45.33, 19.85
# naše ime ← Open-Meteo
PROMENLJIVE = {
    "temperatura": "temperature_2m",
    "vlaznost": "relative_humidity_2m",
    "brzina_vetra": "wind_speed_10m",          # km/h (podrazumevano)
    "insolacija": "shortwave_radiation",       # W/m²
    "oblacnost": "cloud_cover",                # %
    "padavine": "precipitation",               # mm
    "sneg_U": "snow_depth",                    # m (ne cm!)
    "vlaznost_zemljista": "soil_moisture_0_to_7cm",
}
METEO_DIR = konfig.KOREN / "meteo"
IZLAZ = konfig.KOREN / "model_podaci" / "meteo.parquet"
POCETAK_TRENDA = pd.Timestamp("2021-01-01")
KISA_MM = 0.1


def preuzmi(past_days: int = 8, forecast_days: int = 2) -> dict:
    params = {
        "latitude": LAT, "longitude": LON, "timezone": "Europe/Belgrade",
        "hourly": ",".join(PROMENLJIVE.values()), "past_days": past_days, "forecast_days": forecast_days,
        "wind_speed_unit": "kmh", "precipitation_unit": "mm",
    }
    r = requests.get(URL, params=params, timeout=konfig.TIMEOUT_S)
    r.raise_for_status()
    return r.json()


def sacuvaj_sirovo(odgovor: dict, sada_utc: datetime, koren: Path = METEO_DIR) -> Path:
    lok = sada_utc.astimezone(konfig.TZ)
    put = koren / f"{lok:%Y}" / f"{lok:%m}" / f"{lok:%d}" / f"{lok:%H%M}.json"
    put.parent.mkdir(parents=True, exist_ok=True)
    put.write_text(json.dumps({"preuzeto_utc": sada_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "odgovor": odgovor},
                              ensure_ascii=False), encoding="utf-8")
    return put


def u_format_treninga(odgovor: dict) -> pd.DataFrame:
    """Open-Meteo hourly → satna mreža po kraju sata (naivno lokalno), kolone kao u treningu (bez izvedenih)."""
    h = odgovor["hourly"]
    df = pd.DataFrame({nase: h[om] for nase, om in PROMENLJIVE.items()})
    df["ts"] = pd.to_datetime(h["time"])  # lokalno, naivno; T = kraj sata
    df = df.groupby("ts", as_index=False).mean(numeric_only=True)  # jesenji duplikat → prosek
    mreza = pd.date_range(df["ts"].min(), df["ts"].max(), freq="h")
    df = df.set_index("ts").reindex(mreza)
    df = df.interpolate(method="linear", limit_area="inside")  # prolećna rupa
    df = df.rename_axis("ts").reset_index()
    pocetak = df["ts"] - pd.Timedelta(hours=1)
    df["Datum"] = pocetak.dt.normalize()
    df["sat"] = pocetak.dt.hour + 1
    df["Cas"] = df["sat"].map(lambda s: f"{s:02d}:00")
    return df


def izvedena(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("ts").reset_index(drop=True).copy()
    df["padavine_pre_1h"] = df["padavine"].shift(1)
    df["padavine_3h"] = df["padavine"].rolling(3, min_periods=1).sum()
    po_danu = df.groupby("Datum")["padavine"]
    df["padavine_dan"] = po_danu.transform("sum")
    df["sati_kise_dan"] = (df["padavine"] > KISA_MM).groupby(df["Datum"]).transform("sum").astype(float)
    df["vlaznost_zemljista"] = df["vlaznost_zemljista"].shift(24)  # E23: vrednost od pre 24 h
    h = df["sat"] - 1
    df["sat_sin"], df["sat_cos"] = np.sin(2 * np.pi * h / 24), np.cos(2 * np.pi * h / 24)
    d = df["Datum"].dt.dayofweek  # pon = 0
    df["dan_sin"], df["dan_cos"] = np.sin(2 * np.pi * d / 7), np.cos(2 * np.pi * d / 7)
    g = (df["Datum"].dt.dayofyear - 1) / 365.25
    df["doy_sin"], df["doy_cos"] = np.sin(2 * np.pi * g), np.cos(2 * np.pi * g)
    df["is_weekend"] = (d >= 5).astype(float)
    df["is_holiday"] = df["Datum"].map(lambda x: is_holiday(x.date())).astype(float)
    df["trend"] = (df["Datum"] - POCETAK_TRENDA).dt.days / 365.25
    return df


def obradi(odgovor: dict) -> pd.DataFrame:
    return izvedena(u_format_treninga(odgovor))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--iz-fajla", type=Path, help="obradi sačuvan sirov JSON umesto preuzimanja")
    ap.add_argument("--izlaz", type=Path, default=IZLAZ)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if a.iz_fajla:
        odgovor = json.loads(a.iz_fajla.read_text(encoding="utf-8"))["odgovor"]
    else:
        sada = datetime.now(timezone.utc).replace(microsecond=0)
        odgovor = preuzmi()
        log.info("sirovo: %s", sacuvaj_sirovo(odgovor, sada))
    df = obradi(odgovor)
    a.izlaz.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(a.izlaz, index=False)
    log.info("meteo: %d sati, %s %s – %s %s", len(df), df["Datum"].min().date(), df["Cas"].iloc[0],
             df["Datum"].max().date(), df["Cas"].iloc[-1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
