"""PROGNOZA BICIKLISTA: prognoza vs. stvarno — za svaku stanicu i sat, svako izdanje prognoze (faza 6, ocena).

    python -m prognoza_biciklista.poredjenje          # dani od juče unazad 10 dana (preračunava se svaki put)

„Stvarno“ = očišćen y_A (ista pravila kao istorija, prognoza_biciklista.priprema); poznat tek posle satnog
obračuna u 01:02 sledećeg dana. Metrike samo na validnim satima (razlog_A = ok).

Izlaz (podaci/prognoza_biciklista/prognoza_vs_stvarno/):
  YYYY/MM/YYYY-MM-DD.csv   dan D, svako izdanje (zvanična + osvežavanja) × stanica × sat:
      datum, sat, ts, stanica_id, vrsta, izdato_utc, horizont_h, prognoza, q10, q90, tft, xgb, stvarno, razlog_A,
      greska (prognoza − stvarno), aps_greska, u_intervalu, naive_t168, nepouzdano
  rezime_dnevno.csv        samo zvanične, po danu: datum, prozor, n, RMSE, MAE, bias, WAPE_%, pokrivenost_%,
      RMSE_naive, MAE_naive, neobicne_stanice, gradski_dogadjaj
  po_stanici.csv           samo zvanične, kumulativno po prozoru: prozor, stanica_id, n, RMSE, MAE, bias, WAPE_%,
      pokrivenost_%, RMSE_naive, dana
docs/data/ocena_prognoze_biciklista.json   za sajt (dnevni RMSE model vs. naive, referenca 12,85, po stanici)

Prozori ocene: „probni“ od 17.10.2026 (skala ≥ 7,5 dana), „glavni“ od 08.11.2026 (skala puna 30 dana).
Neobičan dan: stanica sa ≥ 6 dnevnih sati (07–22 h) van intervala 10–90 %; ≥ 3 takve stanice = gradski događaj
(samo oznaka, ne izbacuje se iz ocene). Referenca iz rada: RMSE 12,85 (test, stvarna prognoza vremena).
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from scraper import konfig

from . import priprema
from .obelezja import MODEL

log = logging.getLogger(__name__)

PROGNOZE = konfig.KOREN / "podaci" / "prognoza_biciklista"
IZLAZ = PROGNOZE / "prognoza_vs_stvarno"
SAJT = konfig.KOREN / "docs" / "data" / "ocena_prognoze_biciklista.json"
PROBNI_OD, GLAVNI_OD = pd.Timestamp("2026-10-17"), pd.Timestamp("2026-11-08")
REFERENCA_RMSE = 12.85
NEOBICNO_SATI, NEOBICNO_OD, NEOBICNO_DO, DOGADJAJ_STANICA = 6, 7, 22, 3


def prozor(datum: str) -> str:
    d = pd.Timestamp(datum)
    return "glavni" if d >= GLAVNI_OD else ("probni" if d >= PROBNI_OD else "pre_ocene")


def metrike(y: pd.Series, p: pd.Series) -> dict:
    e = p - y
    return {"n": int(len(y)), "RMSE": float(np.sqrt((e ** 2).mean())) if len(y) else np.nan,
            "MAE": float(e.abs().mean()) if len(y) else np.nan, "bias": float(e.mean()) if len(y) else np.nan,
            "WAPE_%": float(100 * e.abs().sum() / y.abs().sum()) if y.abs().sum() else np.nan}


def stvarno_ocisceno(model: Path = MODEL) -> pd.DataFrame:
    novo, smerovi = priprema._ucitaj_novo(konfig.PODACI)
    master, _ = priprema.pripremi(pd.read_parquet(model / "istorija.parquet"), novo, smerovi,
                                  pd.read_parquet(model / "p90.parquet"))
    master = master.sort_values(["stanica_id", "ts"])
    master["naive_t168"] = master.groupby("stanica_id")["y_A"].shift(168)    # mreža je puna satna
    return master


def uporedi_dan(dan: pd.Timestamp, stvarno: pd.DataFrame) -> pd.DataFrame:
    folder = PROGNOZE / f"{dan:%Y}" / f"{dan:%m}" / f"{dan:%d}"
    fajlovi = sorted(folder.glob("*.parquet"))
    if not fajlovi:
        return pd.DataFrame()
    p = pd.concat([pd.read_parquet(f) for f in fajlovi], ignore_index=True)
    x = p.merge(stvarno[["stanica_id", "ts", "y_A", "razlog_A", "naive_t168"]], on=["stanica_id", "ts"], how="left")
    izdato_lok = pd.to_datetime(x["izdato_utc"]).dt.tz_convert(konfig.TZ).dt.tz_localize(None)
    x["horizont_h"] = ((x["ts"] - izdato_lok) / pd.Timedelta(hours=1)).round(1)
    x = x.rename(columns={"pred": "prognoza", "y_A": "stvarno"})
    x["greska"] = x["prognoza"] - x["stvarno"]
    x["aps_greska"] = x["greska"].abs()
    x["u_intervalu"] = np.where(x["stvarno"].isna(), np.nan,
                                ((x["stvarno"] >= x["q10"]) & (x["stvarno"] <= x["q90"])).astype(float))
    kol = ["datum", "sat", "ts", "stanica_id", "vrsta", "izdato_utc", "horizont_h", "prognoza", "q10", "q90", "tft",
           "xgb", "stvarno", "razlog_A", "greska", "aps_greska", "u_intervalu", "naive_t168", "nepouzdano"]
    return x[kol].sort_values(["vrsta", "izdato_utc", "stanica_id", "sat"]).round(3)


def rezime_dana(x: pd.DataFrame) -> dict | None:
    z = x[(x["vrsta"] == "zvanicna") & (x["razlog_A"] == "ok") & x["stvarno"].notna()]
    if z.empty:
        return None
    m = metrike(z["stvarno"], z["prognoza"])
    zn = z[z["naive_t168"].notna()]
    mn = metrike(zn["stvarno"], zn["naive_t168"])
    dnevni = z[z["sat"].between(NEOBICNO_OD, NEOBICNO_DO)]
    van = dnevni.groupby("stanica_id")["u_intervalu"].apply(lambda s: int((s == 0).sum()))
    neobicne = sorted(van[van >= NEOBICNO_SATI].index)
    return {"datum": z["datum"].iloc[0], "prozor": prozor(z["datum"].iloc[0]), **m,
            "pokrivenost_%": float(100 * z["u_intervalu"].mean()), "RMSE_naive": mn["RMSE"], "MAE_naive": mn["MAE"],
            "neobicne_stanice": " ".join(neobicne), "gradski_dogadjaj": len(neobicne) >= DOGADJAJ_STANICA}


def po_stanici(fajlovi: list[Path]) -> pd.DataFrame:
    x = pd.concat([pd.read_csv(f) for f in fajlovi], ignore_index=True)
    z = x[(x["vrsta"] == "zvanicna") & (x["razlog_A"] == "ok") & x["stvarno"].notna()].copy()
    z["prozor"] = z["datum"].map(prozor)
    redovi = []
    for (pr, st), g in z.groupby(["prozor", "stanica_id"]):
        gn = g[g["naive_t168"].notna()]
        redovi.append({"prozor": pr, "stanica_id": st, **metrike(g["stvarno"], g["prognoza"]),
                       "pokrivenost_%": 100 * g["u_intervalu"].mean(),
                       "RMSE_naive": metrike(gn["stvarno"], gn["naive_t168"])["RMSE"], "dana": g["datum"].nunique()})
    return pd.DataFrame(redovi).round(3)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dana", type=int, default=10)
    ap.add_argument("--model", type=Path, default=MODEL)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    stvarno = stvarno_ocisceno(a.model)
    danas = pd.Timestamp(datetime.now(konfig.TZ).date())
    for k in range(1, a.dana + 1):
        dan = danas - timedelta(days=k)
        x = uporedi_dan(dan, stvarno)
        if x.empty:
            continue
        put = IZLAZ / f"{dan:%Y}" / f"{dan:%m}" / f"{dan:%Y-%m-%d}.csv"
        put.parent.mkdir(parents=True, exist_ok=True)
        x.to_csv(put, index=False)
        log.info("%s: %d redova (%d izdanja)", dan.date(), len(x), x["izdato_utc"].nunique())
    fajlovi = sorted(IZLAZ.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/*.csv"))
    if not fajlovi:
        return 0
    dnevno = pd.DataFrame([r for f in fajlovi if (r := rezime_dana(pd.read_csv(f))) is not None])
    if dnevno.empty:
        log.info("još nema zvaničnih prognoza sa poznatim stvarnim vrednostima")
        return 0
    dnevno.round(3).to_csv(IZLAZ / "rezime_dnevno.csv", index=False)
    ps = po_stanici(fajlovi)
    ps.to_csv(IZLAZ / "po_stanici.csv", index=False)
    SAJT.parent.mkdir(parents=True, exist_ok=True)
    SAJT.write_text(json.dumps({"referenca_RMSE": REFERENCA_RMSE, "probni_od": str(PROBNI_OD.date()),
                                "glavni_od": str(GLAVNI_OD.date()),
                                "dnevno": json.loads(dnevno.round(3).to_json(orient="records")),
                                "po_stanici": json.loads(ps.to_json(orient="records"))}, ensure_ascii=False),
                    encoding="utf-8")
    log.info("rezime: %d dana; poslednji: %s", len(dnevno), dnevno.iloc[-1].to_dict())
    return 0


if __name__ == "__main__":
    sys.exit(main())
