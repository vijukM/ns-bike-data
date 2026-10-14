"""VREMENSKA PROGNOZA (Open-Meteo Forecast API) — preuzimanje, trajno čuvanje i tabela u formatu treninga modela.

    python -m vremenska_prognoza.open_meteo

Svako preuzimanje se čuva (ništa se ne briše):
  podaci/vremenska_prognoza/YYYY/MM/DD/HHMM.json            sirov odgovor API-ja (lokalno vreme preuzimanja)
  podaci/vremenska_prognoza/excel/vremenska_prognoza_YYYY-MM.xlsx
        ceo grad, jedan red po satu — poslednja prognoza izdata pre tog sata (+ kada je izdata); sva ranija
        izdanja za isti sat ostaju u sirovim JSON fajlovima (Excel se ne pravi od svih, da repo ne raste)
  model_podaci/vremenska_prognoza.parquet                   tabela za model (ne čuva se u git-u)

Format kao meteo fajl iz treninga: Datum (dan D) + Cas 01:00–24:00 + 8 promenljivih + dan_u_nedelji (pon = 1),
is_weekend, is_holiday. Vrednost Open-Meteo za lokalno vreme T nosi oznaku Cas = T + 1 h, kao u treningu
(provereno poređenjem model/meteo_istorija.parquet sa Open-Meteo za avgust 2026: sa +1 h prosečna razlika
insolacije 15 W/m², sa 0 h 72 W/m²). DST: prolećna rupa se interpolira, jesenji duplikat usrednjava.
Izvedena obeležja (kiša, kašnjenje vlažnosti zemljišta, kalendar) računa SAMO prognoza_biciklista.obelezja.ucitaj_meteo
(prenos koda iz treninga).
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

from prognoza_biciklista.praznici import is_holiday
from scraper import konfig

log = logging.getLogger(__name__)

URL = "https://api.open-meteo.com/v1/forecast"
LAT, LON = 45.33, 19.85
# naše ime ← Open-Meteo
PROMENLJIVE = {
    "temperatura": "temperature_2m",           # °C
    "vlaznost": "relative_humidity_2m",        # %
    "brzina_vetra": "wind_speed_10m",          # km/h
    "insolacija": "shortwave_radiation",       # W/m²
    "oblacnost": "cloud_cover",                # %
    "padavine": "precipitation",               # mm
    "sneg_U": "snow_depth",                    # m (ne cm!)
    "vlaznost_zemljista": "soil_moisture_0_to_7cm",  # m³/m³
}
FOLDER = konfig.KOREN / "podaci" / "vremenska_prognoza"
ZA_MODEL = konfig.KOREN / "model_podaci" / "vremenska_prognoza.parquet"


def preuzmi(past_days: int = 8, forecast_days: int = 3) -> dict:
    """forecast_days=3: za „sutra“ treba i Cas 24:00 (sa 2 dana poslednji sat je sutra 23:00)."""
    params = {
        "latitude": LAT, "longitude": LON, "timezone": "Europe/Belgrade",
        "hourly": ",".join(PROMENLJIVE.values()), "past_days": past_days, "forecast_days": forecast_days,
        "wind_speed_unit": "kmh", "precipitation_unit": "mm",
    }
    r = requests.get(URL, params=params, timeout=konfig.TIMEOUT_S)
    r.raise_for_status()
    return r.json()


def sacuvaj_sirovo(odgovor: dict, sada_utc: datetime, folder: Path = FOLDER) -> Path:
    lok = sada_utc.astimezone(konfig.TZ)
    put = folder / f"{lok:%Y}" / f"{lok:%m}" / f"{lok:%d}" / f"{lok:%H%M}.json"
    put.parent.mkdir(parents=True, exist_ok=True)
    put.write_text(json.dumps({"preuzeto_utc": sada_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "izvor": URL,
                               "odgovor": odgovor}, ensure_ascii=False), encoding="utf-8")
    return put


def u_format_treninga(odgovor: dict) -> pd.DataFrame:
    h = odgovor["hourly"]
    df = pd.DataFrame({nase: h[om] for nase, om in PROMENLJIVE.items()})
    df["ts"] = pd.to_datetime(h["time"]) + pd.Timedelta(hours=1)          # Cas = T + 1 h (kao trening)
    df = df.groupby("ts", as_index=False).mean(numeric_only=True)        # jesenji duplikat → prosek
    mreza = pd.date_range(df["ts"].min(), df["ts"].max(), freq="h")
    df = df.set_index("ts").reindex(mreza).interpolate(method="linear", limit_area="inside")  # prolećna rupa
    df = df.rename_axis("ts").reset_index()
    pocetak = df["ts"] - pd.Timedelta(hours=1)
    datum = pocetak.dt.normalize()
    df.insert(0, "Datum", datum.dt.strftime("%Y-%m-%d"))
    df.insert(1, "Cas", (pocetak.dt.hour + 1).map(lambda s: f"{s:02d}:00"))
    df["dan_u_nedelji"] = datum.dt.dayofweek + 1                           # pon = 1 (kao trening)
    df["is_weekend"] = (datum.dt.dayofweek >= 5).astype(int)
    df["is_holiday"] = datum.map(lambda d: int(is_holiday(d.date())))
    return df.drop(columns="ts")


# ---------------------------------------------------------------- arhiva i Excel

def sva_preuzimanja(folder: Path = FOLDER, mesec: str | None = None) -> pd.DataFrame:
    """Svi sačuvani odgovori → jedan red po (izdato, Datum, Cas)."""
    delovi = []
    for f in sorted(folder.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/*.json")):
        j = json.loads(f.read_text(encoding="utf-8"))
        d = u_format_treninga(j["odgovor"])
        d.insert(0, "izdato_utc", j["preuzeto_utc"])
        if mesec:
            d = d[d["Datum"].str[:7] == mesec]
        delovi.append(d)
    return pd.concat(delovi, ignore_index=True) if delovi else pd.DataFrame()


def po_satu(sve: pd.DataFrame) -> pd.DataFrame:
    """Za svaki sat — poslednja prognoza izdata PRE kraja tog sata (najbliže stvarnom vremenu)."""
    if sve.empty:
        return sve
    s = sve.copy()
    pocetak = pd.to_datetime(s["Datum"]) + pd.to_timedelta(s["Cas"].str[:2].astype(int) - 1, unit="h")
    izdato_lok = pd.to_datetime(s["izdato_utc"]).dt.tz_convert(konfig.TZ).dt.tz_localize(None)
    s["_pre"] = izdato_lok <= pocetak + pd.Timedelta(hours=1)
    s = s.sort_values(["Datum", "Cas", "_pre", "izdato_utc"])
    return s.groupby(["Datum", "Cas"], as_index=False).last().drop(columns="_pre")


def napravi_excel(mesec: str, folder: Path = FOLDER) -> Path | None:
    sve = sva_preuzimanja(folder, mesec)
    if sve.empty:
        return None
    izlaz = folder / "excel" / f"vremenska_prognoza_{mesec}.xlsx"
    izlaz.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(izlaz, engine="openpyxl") as w:
        po_satu(sve).to_excel(w, sheet_name="po_satu", index=False)
        pd.DataFrame({"kolona": ["Datum, Cas", "izdato_utc", *PROMENLJIVE],
                      "opis": ["dan i sat (kraj sata, 01:00–24:00), Novi Sad (lat 45.33, lon 19.85)",
                               "kada je prognoza preuzeta sa Open-Meteo (UTC)",
                               *[f"Open-Meteo {v}" for v in PROMENLJIVE.values()]]}
                     ).to_excel(w, sheet_name="Info", index=False)
    return izlaz


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--iz-fajla", type=Path, help="obradi sačuvan sirov JSON umesto preuzimanja")
    ap.add_argument("--izlaz", type=Path, default=ZA_MODEL)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if a.iz_fajla:
        odgovor = json.loads(a.iz_fajla.read_text(encoding="utf-8"))["odgovor"]
    else:
        sada = datetime.now(timezone.utc).replace(microsecond=0)
        odgovor = preuzmi()
        put = sacuvaj_sirovo(odgovor, sada)
        log.info("vremenska prognoza sačuvana: %s", put)
    df = u_format_treninga(odgovor)
    if not a.iz_fajla:
        for mesec in sorted(set(df["Datum"].str[:7])):
            log.info("Excel: %s", napravi_excel(mesec))
    a.izlaz.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(a.izlaz, index=False)
    log.info("vremenska prognoza za model: %d sati, %s %s – %s %s", len(df), df["Datum"].iloc[0], df["Cas"].iloc[0],
             df["Datum"].iloc[-1], df["Cas"].iloc[-1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
