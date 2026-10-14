"""VREMENSKA PROGNOZA — više izvora za poređenje (ulaz modela biciklista ostaje Open-Meteo best_match).

Svako preuzimanje se trajno čuva:
  podaci/vremenska_prognoza/drugi_izvori/open_meteo_<model>/YYYY/MM/DD/HHMM.json   pojedinačni modeli preko Open-Meteo
  podaci/vremenska_prognoza/drugi_izvori/met_norway/YYYY/MM/DD/HHMM.json          MET Norway (yr.no) Locationforecast

Svi izvori se svode na isti oblik (satno, lokalno vreme bez zone):
  vreme_lokalno — trenutak (temperatura, vlažnost, vetar, oblačnost) odnosno kraj sata (padavine = zbir sata
                  koji se završava u tom trenutku), isto kao Open-Meteo `time`
  temperatura (°C), vlaznost (%), brzina_vetra (km/h), oblacnost (%), padavine (mm), insolacija (W/m², ako postoji)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

from scraper import konfig

log = logging.getLogger(__name__)

FOLDER = konfig.KOREN / "podaci" / "vremenska_prognoza" / "drugi_izvori"
UPOREDIVE = ["temperatura", "vlaznost", "brzina_vetra", "oblacnost", "padavine", "insolacija"]

# Open-Meteo modeli (bez ključa). best_match je ulaz modela biciklista i čuva se posebno (za_model/).
OPEN_METEO_MODELI = {
    "icon_d2": "DWD ICON-D2 (2 km, osvežava se na 3 h)",
    "icon_eu": "DWD ICON-EU (7 km)",
    "ecmwf_ifs025": "ECMWF IFS (25 km, na 6 h)",
    "gfs_seamless": "NOAA GFS",
    "meteofrance_seamless": "Météo-France ARPEGE/AROME",
    "ukmo_seamless": "UK Met Office",
}
OM_PROMENLJIVE = {"temperatura": "temperature_2m", "vlaznost": "relative_humidity_2m", "brzina_vetra": "wind_speed_10m",
                  "oblacnost": "cloud_cover", "padavine": "precipitation", "insolacija": "shortwave_radiation"}
MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
# MET Norway traži User-Agent koji identifikuje aplikaciju i kontakt (uslovi korišćenja api.met.no)
MET_UA = "ns-bike-data (master rad FTN Novi Sad; https://github.com/vijukM/ns-bike-data)"


def _sacuvaj(izvor: str, sada_utc: datetime, sadrzaj: dict) -> Path:
    lok = sada_utc.astimezone(konfig.TZ)
    put = FOLDER / izvor / f"{lok:%Y}" / f"{lok:%m}" / f"{lok:%d}" / f"{lok:%H%M}.json"
    put.parent.mkdir(parents=True, exist_ok=True)
    put.write_text(json.dumps({"preuzeto_utc": sada_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "izvor": izvor,
                               "odgovor": sadrzaj}, ensure_ascii=False), encoding="utf-8")
    return put


def preuzmi_sve(sada_utc: datetime) -> dict[str, Path]:
    """Preuzima sve izvore; greška jednog izvora ne zaustavlja ostale. Vraća {izvor: putanja}."""
    sacuvano = {}
    for model in OPEN_METEO_MODELI:
        try:
            r = requests.get("https://api.open-meteo.com/v1/forecast", timeout=konfig.TIMEOUT_S, params={
                "latitude": 45.33, "longitude": 19.85, "timezone": "Europe/Belgrade", "models": model,
                "hourly": ",".join(OM_PROMENLJIVE.values()), "wind_speed_unit": "kmh",
                "forecast_days": 2 if model == "icon_d2" else 3})        # ICON-D2 ide najviše 48 h unapred
            r.raise_for_status()
            sacuvano[f"open_meteo_{model}"] = _sacuvaj(f"open_meteo_{model}", sada_utc, r.json())
        except Exception as e:  # noqa: BLE001
            log.warning("Open-Meteo %s: %s", model, e)
    try:
        r = requests.get(MET_URL, params={"lat": 45.33, "lon": 19.85}, headers={"User-Agent": MET_UA},
                         timeout=konfig.TIMEOUT_S)
        r.raise_for_status()
        sacuvano["met_norway"] = _sacuvaj("met_norway", sada_utc, r.json())
    except Exception as e:  # noqa: BLE001
        log.warning("MET Norway: %s", e)
    return sacuvano


def u_tabelu(izvor: str, odgovor: dict) -> pd.DataFrame:
    """Sirov odgovor → vreme_lokalno + UPOREDIVE kolone (Open-Meteo konvencija vremena)."""
    if izvor == "met_norway":
        redovi = []
        for t in odgovor["properties"]["timeseries"]:
            d = t["data"]
            if "next_1_hours" not in d:                                   # posle ~2,5 dana samo na 6 h
                continue
            i = d["instant"]["details"]
            vreme = pd.Timestamp(t["time"]).tz_convert(konfig.TZ).tz_localize(None)
            redovi.append({"vreme_lokalno": vreme, "temperatura": i.get("air_temperature"),
                           "vlaznost": i.get("relative_humidity"),
                           "brzina_vetra": i["wind_speed"] * 3.6 if i.get("wind_speed") is not None else None,
                           "oblacnost": i.get("cloud_area_fraction"),
                           # MET: padavine u NAREDNOM satu → kraj sata = vreme + 1 h (kao Open-Meteo)
                           "_pad": d["next_1_hours"]["details"].get("precipitation_amount")})
        df = pd.DataFrame(redovi)
        pad = df[["vreme_lokalno", "_pad"]].assign(vreme_lokalno=df["vreme_lokalno"] + pd.Timedelta(hours=1))
        df = df.drop(columns="_pad").merge(pad.rename(columns={"_pad": "padavine"}), on="vreme_lokalno", how="left")
        df["insolacija"] = float("nan")
        return df[["vreme_lokalno", *UPOREDIVE]]
    h = odgovor["hourly"]
    df = pd.DataFrame({k: h.get(v) for k, v in OM_PROMENLJIVE.items()})
    vreme = pd.to_datetime(pd.Series(h["time"]))
    if odgovor.get("timezone") in ("GMT", "UTC"):                         # za_model/ se od 10/2026 čuva u UTC
        vreme = vreme.dt.tz_localize("UTC").dt.tz_convert(konfig.TZ).dt.tz_localize(None)
    df.insert(0, "vreme_lokalno", vreme)
    return df.groupby("vreme_lokalno", as_index=False).mean(numeric_only=True)
