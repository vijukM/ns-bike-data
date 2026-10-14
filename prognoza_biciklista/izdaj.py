"""PROGNOZA BICIKLISTA — izdavanje (faza 5): vremenska prognoza → priprema istorije → obeležja → model → čuvanje.

    python -m prognoza_biciklista.izdaj --vrsta zvanicna      # oko 01:xx: za danas (dan D), podaci do 24:00 juče
    python -m prognoza_biciklista.izdaj --vrsta osvezavanje   # 07, 13, 19 h: za danas i sutra, novija prognoza vremena

Izlaz (sve se čuva, ništa se ne prepisuje osim latest):
  podaci/prognoza_biciklista/YYYY/MM/DD/<izdato YYYY-MM-DD_HHMM>_<vrsta>.parquet i .json   (DD = dan za koji je prognoza)
  podaci/prognoza_biciklista/zvanicne/YYYY-MM-DD.parquet   samo zvanična (01:xx), nikad se ne prepisuje
  docs/data/prognoza_biciklista.json                        poslednja prognoza za sajt (danas i sutra)
  podaci/prognoza_biciklista/greske.log                     neuspela izdavanja
Kolone: stanica_id, datum, sat, ts, pred, q10, q90, tft, xgb, skala, nepouzdano, razlog_nepouzdano,
        izdato_utc, vrsta, verzija_modela.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from scraper import konfig
from vremenska_prognoza import open_meteo

from . import priprema
from .model import ansambl, predvidi_tft, predvidi_xgb
from .obelezja import MODEL, Paket, napravi, pripremi_tft

log = logging.getLogger(__name__)

IZLAZ = konfig.KOREN / "podaci" / "prognoza_biciklista"
SAJT = konfig.KOREN / "docs" / "data" / "prognoza_biciklista.json"
PRAG_ENKODER = 0.5          # serija sa < 50 % validnih sati u enkoderu → nepouzdano


def meteo_tabela(paket: Paket, folder_vreme: Path = open_meteo.FOLDER) -> pd.DataFrame:
    """Meteo za obeležja: istorija iz paketa (format treninga) + sva sačuvana preuzimanja vremenske prognoze
    (za svaki sat poslednje izdanje pre tog sata); preuzimanja imaju prednost nad istorijom."""
    kol = ["Datum", "Cas", *open_meteo.PROMENLJIVE, "dan_u_nedelji", "is_weekend", "is_holiday"]
    ist = pd.read_parquet(paket.folder / "meteo_istorija.parquet")[kol]
    novo = open_meteo.po_satu(open_meteo.sva_preuzimanja(folder_vreme))
    m = pd.concat([ist, novo[kol]] if not novo.empty else [ist], ignore_index=True)
    return m.drop_duplicates(["Datum", "Cas"], keep="last").reset_index(drop=True)


def produzi_do(master: pd.DataFrame, do: pd.Timestamp) -> pd.DataFrame:
    """Dodaje buduće sate (y nepoznat) do `do`, da bi postojali redovi dana za koje se pravi prognoza."""
    delovi = [master]
    for st, g in master.groupby("stanica_id"):
        kraj = g["ts"].max()
        if kraj < do:
            ts = pd.date_range(kraj + pd.Timedelta(hours=1), do, freq="h")
            delovi.append(pd.DataFrame({"stanica_id": st, "ts": ts, "y_A": np.nan, "razlog_A": "buducnost"}))
    return pd.concat(delovi, ignore_index=True).sort_values(["stanica_id", "ts"]).reset_index(drop=True)


def pouzdanost(df: pd.DataFrame, dan: pd.Timestamp, paket: Paket) -> pd.DataFrame:
    """Po stanici: da li postoji dinamička skala (≥ 180 validnih sati u 720 h do t − 24 h) i udeo validnih sati
    u enkoderu (168 h do ponoći)."""
    ob = paket.ob
    prvi = dan + pd.Timedelta(hours=1)
    enk = df[(df["ts"] >= prvi - pd.Timedelta(hours=ob["tft_enkoder"])) & (df["ts"] < prvi)]
    udeo = enk.groupby("stanica_id")["y"].apply(lambda s: s.notna().mean())
    w, L = int(ob["skala_prozor_sati"]), paket.L
    od, do = prvi - pd.Timedelta(hours=L + w - 1), prvi - pd.Timedelta(hours=L)
    prozor = df[(df["ts"] >= od) & (df["ts"] <= do)]
    validnih = prozor.groupby("stanica_id")["y"].apply(lambda s: int(s.notna().sum()))
    r = pd.DataFrame({"udeo_enkoder": udeo, "validnih_za_skalu": validnih}).fillna(0)
    razlog = []
    for st, x in r.iterrows():
        z = []
        if x["validnih_za_skalu"] < ob["skala_min_periods"]:
            z.append(f"skala: {int(x['validnih_za_skalu'])} < {ob['skala_min_periods']} validnih sati (fiksna skala)")
        if x["udeo_enkoder"] < PRAG_ENKODER:
            z.append(f"enkoder: {100 * x['udeo_enkoder']:.0f} % validnih sati")
        razlog.append("; ".join(z))
    r["razlog_nepouzdano"] = razlog
    r["nepouzdano"] = r["razlog_nepouzdano"] != ""
    return r


def prognoza_za_dan(df: pd.DataFrame, tf: pd.DataFrame, dan: pd.Timestamp, paket: Paket) -> pd.DataFrame:
    dan_redovi = df[(df["ts"] > dan) & (df["ts"] <= dan + pd.Timedelta(days=1))]
    p = ansambl(predvidi_xgb(dan_redovi, paket), predvidi_tft(tf, dan, paket), paket)
    p = p.merge(dan_redovi[["stanica_id", "ts", "skala"]], on=["stanica_id", "ts"], how="left")
    p = p.merge(pouzdanost(df, dan, paket)[["nepouzdano", "razlog_nepouzdano"]], left_on="stanica_id",
                right_index=True, how="left")
    p["datum"] = dan.strftime("%Y-%m-%d")
    p["sat"] = (p["ts"] - pd.Timedelta(hours=1)).dt.hour + 1
    p = p.rename(columns={"tft_q10": "q10", "tft_q90": "q90", "tft_q50": "tft"})
    return p


def sacuvaj(p: pd.DataFrame, vrsta: str, izdato: datetime, paket: Paket, izlaz: Path = IZLAZ) -> list[Path]:
    kolone = ["stanica_id", "datum", "sat", "ts", "pred", "q10", "q90", "tft", "xgb", "skala", "nepouzdano",
              "razlog_nepouzdano", "izdato_utc", "vrsta", "verzija_modela"]
    p = p.assign(izdato_utc=izdato.strftime("%Y-%m-%dT%H:%M:%SZ"), vrsta=vrsta,
                 verzija_modela=paket.ob["verzija_modela"])[kolone]
    lok = izdato.astimezone(konfig.TZ)
    putanje = []
    for dan, g in p.groupby("datum"):
        d = date.fromisoformat(dan)
        folder = izlaz / f"{d:%Y}" / f"{d:%m}" / f"{d:%d}"
        folder.mkdir(parents=True, exist_ok=True)
        ime = folder / f"{lok:%Y-%m-%d_%H%M}_{vrsta}"
        g.to_parquet(ime.with_suffix(".parquet"), index=False)
        g.assign(ts=g["ts"].dt.strftime("%Y-%m-%d %H:%M")).to_json(ime.with_suffix(".json"), orient="records",
                                                                     force_ascii=False, indent=0)
        putanje += [ime.with_suffix(".parquet"), ime.with_suffix(".json")]
        if vrsta == "zvanicna":
            z = izlaz / "zvanicne" / f"{dan}.parquet"
            if not z.exists():                      # nikad se ne prepisuje
                z.parent.mkdir(parents=True, exist_ok=True)
                g.to_parquet(z, index=False)
                putanje.append(z)
    return putanje


def za_sajt(p: pd.DataFrame, vrsta: str, izdato: datetime, paket: Paket, sajt: Path = SAJT) -> None:
    stanice = {}
    for (st, dan), g in p.sort_values("ts").groupby(["stanica_id", "datum"]):
        stanice.setdefault(st, {})[dan] = {
            "pred": [round(float(x), 1) for x in g["pred"]], "q10": [round(float(x), 1) for x in g["q10"]],
            "q90": [round(float(x), 1) for x in g["q90"]], "sat": [int(x) for x in g["sat"]],
            "nepouzdano": bool(g["nepouzdano"].iloc[0]), "razlog_nepouzdano": g["razlog_nepouzdano"].iloc[0]}
    sajt.parent.mkdir(parents=True, exist_ok=True)
    sajt.write_text(json.dumps({"izdato_utc": izdato.strftime("%Y-%m-%dT%H:%M:%SZ"), "vrsta": vrsta,
                                "verzija_modela": paket.ob["verzija_modela"], "dani": sorted(p["datum"].unique()),
                                "stanice": stanice}, ensure_ascii=False), encoding="utf-8")


def izdaj(vrsta: str, sada: datetime, paket: Paket, preuzmi_vreme: bool = True) -> pd.DataFrame:
    danas = pd.Timestamp(sada.astimezone(konfig.TZ).date())
    dani = [danas] if vrsta == "zvanicna" else [danas, danas + pd.Timedelta(days=1)]
    if preuzmi_vreme:                                   # VREMENSKA PROGNOZA: preuzmi i trajno sačuvaj
        odgovor = open_meteo.preuzmi()
        log.info("vremenska prognoza: %s", open_meteo.sacuvaj_sirovo(odgovor, sada))
        for mesec in sorted(set(open_meteo.u_format_treninga(odgovor)["Datum"].str[:7])):
            open_meteo.napravi_excel(mesec)
    novo, smerovi = priprema._ucitaj_novo(konfig.PODACI)        # BICIKLISTI: istorija za model
    master, izv = priprema.pripremi(pd.read_parquet(paket.folder / "istorija.parquet"), novo, smerovi,
                                    pd.read_parquet(paket.folder / "p90.parquet"))
    log.info("istorija za model do %s; očišćeno: %s", master["ts"].max(), izv)
    if vrsta == "zvanicna":                             # samo podaci do 24:00 juče (kao prognoza „iz ponoći“)
        master = master[master["ts"] <= danas]
    master = produzi_do(master, dani[-1] + pd.Timedelta(days=1))
    df = napravi(master, meteo_tabela(paket), paket)
    tf = pripremi_tft(df, paket)
    return pd.concat([prognoza_za_dan(df, tf, d, paket) for d in dani], ignore_index=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vrsta", choices=["zvanicna", "osvezavanje"], required=True)
    ap.add_argument("--model", type=Path, default=MODEL)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    sada = datetime.now(timezone.utc).replace(microsecond=0)
    danas = sada.astimezone(konfig.TZ).date()
    if a.vrsta == "zvanicna" and (IZLAZ / "zvanicne" / f"{danas}.parquet").exists():
        log.info("zvanična prognoza za %s već postoji — preskačem", danas)
        return 0
    try:
        paket = Paket.ucitaj(a.model)
        p = izdaj(a.vrsta, sada, paket)
        for put in sacuvaj(p, a.vrsta, sada, paket):
            log.info("sačuvano: %s", put.relative_to(konfig.KOREN))
        za_sajt(p, a.vrsta, sada, paket)
        log.info("prognoza biciklista: %d serija × %d dana; nepouzdanih serija: %d", p["stanica_id"].nunique(),
                 p["datum"].nunique(), int(p.groupby("stanica_id")["nepouzdano"].first().sum()))
        return 0
    except Exception as e:  # noqa: BLE001 — zapis u greske.log, workflow mora da padne
        IZLAZ.mkdir(parents=True, exist_ok=True)
        with open(IZLAZ / "greske.log", "a", encoding="utf-8") as f:
            f.write(f"{sada:%Y-%m-%dT%H:%M:%SZ}\t{a.vrsta}\t{' '.join(f'{type(e).__name__}: {e}'.split())[:500]}\n")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
