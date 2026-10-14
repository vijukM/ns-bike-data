"""VREMENSKA PROGNOZA: prognoza vs. stvarno — koji izvor/model najbolje pogađa vreme u Novom Sadu.

    python -m vremenska_prognoza.poredjenje          # dani od juče unazad 10 dana (ponovo, kad stigne bolje „stvarno“)

„Stvarno“ vreme za dan D (javni podaci bez ključa, Open-Meteo):
  1) era5        — Historical Weather API (ERA5 reanaliza, najbliže merenju), dostupno ~5–7 dana kasnije
  2) analiza     — Forecast API, prethodni dan (`past_days`, najnovija analiza modela), dostupno već sutradan
  Uzima se najbolji dostupan; kad stigne ERA5, poređenje za taj dan se ponovo računa (kolona stvarno_izvor).

Izlaz:
  podaci/vremenska_prognoza/stvarno/YYYY/MM/YYYY-MM-DD.json                 sirovo „stvarno“ vreme za dan D
  podaci/vremenska_prognoza/prognoza_vs_stvarno/YYYY/MM/YYYY-MM-DD.csv     dan D: svaka prognoza × sat × promenljiva
     kolone: datum, vreme_lokalno, promenljiva, izvor, izdato_utc, horizont_h, prognoza, stvarno, greska,
             aps_greska, stvarno_izvor
  podaci/vremenska_prognoza/prognoza_vs_stvarno/rezime.csv                 svi dani: izvor × promenljiva × horizont
     kolone: izvor, promenljiva, horizont, n, MAE, RMSE, bias, dana, od, do
Samo prave prognoze: izdate PRE tog sata (horizont_h > 0).
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from scraper import konfig

from . import izvori, open_meteo

log = logging.getLogger(__name__)

KOREN = konfig.KOREN / "podaci" / "vremenska_prognoza"
STVARNO = KOREN / "stvarno"
IZLAZ = KOREN / "prognoza_vs_stvarno"
HORIZONTI = [(0, 24, "0–24 h"), (24, 48, "24–48 h"), (48, 999, "48+ h")]


def _put_stvarno(d: date) -> Path:
    return STVARNO / f"{d:%Y}" / f"{d:%m}" / f"{d.isoformat()}.json"


def preuzmi_stvarno(d: date) -> dict | None:
    """Najbolje dostupno „stvarno“ vreme za dan D; čuva se i ne preuzima ponovo kad je već ERA5."""
    put = _put_stvarno(d)
    if put.exists() and json.loads(put.read_text(encoding="utf-8"))["stvarno_izvor"] == "era5":
        return json.loads(put.read_text(encoding="utf-8"))
    h = ",".join(izvori.OM_PROMENLJIVE.values())
    zajednicko = {"latitude": open_meteo.LAT, "longitude": open_meteo.LON, "timezone": "Europe/Belgrade",
                  "hourly": h, "wind_speed_unit": "kmh"}
    pokusaji = []
    if (date.today() - d).days >= 5:
        pokusaji.append(("era5", "https://archive-api.open-meteo.com/v1/archive",
                         {**zajednicko, "start_date": d.isoformat(), "end_date": (d + timedelta(days=1)).isoformat()}))
    if (date.today() - d).days <= 80:                       # analiza modela za tačno taj dan (+ ponoć)
        pokusaji.append(("analiza", "https://api.open-meteo.com/v1/forecast",
                         {**zajednicko, "start_date": d.isoformat(), "end_date": (d + timedelta(days=1)).isoformat()}))
    for ime, url, params in pokusaji:
        try:
            r = requests.get(url, params=params, timeout=konfig.TIMEOUT_S)
            r.raise_for_status()
            o = r.json()
            vrednosti = [v for v in o["hourly"].get("temperature_2m", []) if v is not None]
            if len(vrednosti) < 20:
                continue
            sadrzaj = {"datum": d.isoformat(), "stvarno_izvor": ime, "url": url,
                       "preuzeto_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "odgovor": o}
            put.parent.mkdir(parents=True, exist_ok=True)
            put.write_text(json.dumps(sadrzaj, ensure_ascii=False), encoding="utf-8")
            return sadrzaj
        except Exception as e:  # noqa: BLE001
            log.warning("stvarno vreme %s (%s): %s", d, ime, e)
    return json.loads(put.read_text(encoding="utf-8")) if put.exists() else None


def _sve_prognoze() -> list[tuple[str, str, Path]]:
    """(izvor, izdato_utc, putanja) za sve sačuvane prognoze: ulaz modela (best_match) i drugi izvori."""
    lista = [("open_meteo_best_match (ulaz modela)", f) for f in
             open_meteo.FOLDER.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/*.json")]
    for folder in sorted(izvori.FOLDER.glob("*")):
        lista += [(folder.name, f) for f in folder.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/*.json")]
    out = []
    for izvor, f in sorted(lista, key=lambda x: str(x[1])):
        j = json.loads(f.read_text(encoding="utf-8"))
        out.append((izvor, j["preuzeto_utc"], f))
    return out


def uporedi_dan(d: date) -> pd.DataFrame:
    kraj_dana = pd.Timestamp(d) + pd.Timedelta(days=1)
    prognoze = [x for x in _sve_prognoze()
                if pd.Timestamp(x[1]).tz_convert(konfig.TZ).tz_localize(None) < kraj_dana]
    if not prognoze:                                       # nema prognoze za taj dan → ne preuzima se ni stvarno
        return pd.DataFrame()
    s = preuzmi_stvarno(d)
    if s is None:
        return pd.DataFrame()
    stv = izvori.u_tabelu("open_meteo", s["odgovor"])
    od, do = pd.Timestamp(d) + pd.Timedelta(hours=1), pd.Timestamp(d) + pd.Timedelta(days=1)
    stv = stv[(stv["vreme_lokalno"] >= od) & (stv["vreme_lokalno"] <= do)]
    stv = stv.melt(id_vars="vreme_lokalno", var_name="promenljiva", value_name="stvarno").dropna()
    delovi = []
    for izvor, izdato, f in prognoze:
        izdato_lok = pd.Timestamp(izdato).tz_convert(konfig.TZ).tz_localize(None)
        if izdato_lok >= do:
            continue
        j = json.loads(f.read_text(encoding="utf-8"))
        p = izvori.u_tabelu("met_norway" if izvor == "met_norway" else "open_meteo", j["odgovor"])
        p = p[(p["vreme_lokalno"] >= od) & (p["vreme_lokalno"] <= do) & (p["vreme_lokalno"] > izdato_lok)]
        if p.empty:
            continue
        p = p.melt(id_vars="vreme_lokalno", var_name="promenljiva", value_name="prognoza").dropna()
        p["izvor"], p["izdato_utc"] = izvor, izdato
        p["horizont_h"] = ((p["vreme_lokalno"] - izdato_lok) / pd.Timedelta(hours=1)).round(1)
        delovi.append(p)
    if not delovi:
        return pd.DataFrame()
    x = pd.concat(delovi, ignore_index=True).merge(stv, on=["vreme_lokalno", "promenljiva"], how="inner")
    x["greska"] = (x["prognoza"] - x["stvarno"]).round(3)
    x["aps_greska"] = x["greska"].abs()
    x["stvarno_izvor"] = s["stvarno_izvor"]
    x.insert(0, "datum", d.isoformat())
    x["vreme_lokalno"] = x["vreme_lokalno"].dt.strftime("%Y-%m-%d %H:%M")
    return x[["datum", "vreme_lokalno", "promenljiva", "izvor", "izdato_utc", "horizont_h", "prognoza", "stvarno",
              "greska", "aps_greska", "stvarno_izvor"]].sort_values(["promenljiva", "izvor", "izdato_utc",
                                                                       "vreme_lokalno"])


def rezime(izlaz: Path = IZLAZ) -> pd.DataFrame:
    fajlovi = sorted(izlaz.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/*.csv"))
    if not fajlovi:
        return pd.DataFrame()
    x = pd.concat([pd.read_csv(f) for f in fajlovi], ignore_index=True)
    x["horizont"] = pd.cut(x["horizont_h"], [a for a, _, _ in HORIZONTI] + [HORIZONTI[-1][1]],
                           labels=[n for _, _, n in HORIZONTI], right=False)
    g = x.groupby(["izvor", "promenljiva", "horizont"], observed=True)
    r = g.agg(n=("greska", "size"), MAE=("aps_greska", "mean"), bias=("greska", "mean"), dana=("datum", "nunique"),
              od=("datum", "min"), do=("datum", "max")).reset_index()
    r["RMSE"] = g["greska"].apply(lambda s: float(np.sqrt((s ** 2).mean()))).to_numpy()
    r = r[["izvor", "promenljiva", "horizont", "n", "MAE", "RMSE", "bias", "dana", "od", "do"]].round(3)
    r.to_csv(izlaz / "rezime.csv", index=False)
    return r


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dana", type=int, default=10, help="koliko dana unazad (od juče)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    danas = datetime.now(konfig.TZ).date()
    for k in range(1, a.dana + 1):
        d = danas - timedelta(days=k)
        x = uporedi_dan(d)
        if x.empty:
            continue
        put = IZLAZ / f"{d:%Y}" / f"{d:%m}" / f"{d.isoformat()}.csv"
        put.parent.mkdir(parents=True, exist_ok=True)
        x.to_csv(put, index=False)
        log.info("%s: %d poređenja (%s), stvarno: %s", d, len(x), ", ".join(sorted(x["izvor"].unique())),
                 x["stvarno_izvor"].iloc[0])
    r = rezime()
    if not r.empty:
        log.info("rezime (temperatura, 0–24 h):\n%s", r[(r["promenljiva"] == "temperatura")
                                                       & (r["horizont"] == "0–24 h")].to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
