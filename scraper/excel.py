"""Mesečni Excel u obliku istorijske tabele: jedan sheet po seriji (15a, 15b, … 51b), red po satu.

    python -m scraper.excel --mesec 2026-10   # -> podaci/excel/bicikli_2026-10.xlsx

Kolone sheeta: Date | Time (01:00–24:00) | Status | brojevi po smeru | (Sum)
  - serija sa jednim smerom (npr. 15a, smer 14): jedna kolona S<poslednja cifra smera> (S4), kao u istoriji;
  - serija sa dva smera (25a, 26, 28, 40a/b, 41, 46a/b, 47, 51a/b): Sum1 (smer 1x), Sum2 (smer 2x), Sum.
Status je prazan kada je sat ispravan, inače razlog (nema_citanja, zastarelo, …); vrednosti tada nema.
Ćelije sa vrednošću > 400 su crvene (kao u istorijskoj tabeli).
Klase vozila (A/B/C), OCC i GAP iz istorijskog izvoza sajt ne objavljuje, pa ih nema.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from . import konfig
from .parsiranje import OCEKIVANE_SERIJE

log = logging.getLogger(__name__)

PRAG_CRVENO = 400
_ZAGLAVLJE_FILL = PatternFill("solid", fgColor="305496")
_ZAGLAVLJE_FONT = Font(bold=True, color="FFFFFF")
_CRVENO_FILL = PatternFill("solid", fgColor="FF0000")
_CRVENO_FONT = Font(bold=True, color="FFFFFF")


def folder_excel(koren: Path | None = None) -> Path:
    return (koren or konfig.PODACI) / "excel"


def _vreme(ts: pd.Timestamp) -> str:
    """Kraj sata kao tekst 01:00–24:00 (00:00 sledećeg dana -> 24:00)."""
    return f"{ts.hour or 24:02d}:00"


def _kolone_smerova(smerovi: list[str]) -> dict[str, str]:
    """smer -> naziv kolone (S4 za jedan smer; Sum1/Sum2 za dva)."""
    if len(smerovi) == 1:
        return {smerovi[0]: f"S{smerovi[0][-1]}"}
    return {s: f"Sum{s[0]}" if s[0] in "12" else f"Sum_{s}" for s in sorted(smerovi)}


def _ucitaj(folder_meseca: Path, ime: str) -> pd.DataFrame:
    fajlovi = sorted(folder_meseca.glob(f"[0-9][0-9]/{ime}"))
    if not fajlovi:
        return pd.DataFrame()
    df = pd.concat([pd.read_csv(f, dtype={"direction": str, "stanica_id": str, "serija": str}) for f in fajlovi],
                   ignore_index=True)
    df["ts"] = pd.to_datetime(df["ts"])
    df["ts_utc"] = pd.to_datetime(df["ts_utc"], utc=True)
    return df


def napravi_mesec(d: date, koren: Path | None = None) -> Path | None:
    folder = konfig.folder_meseca(d, koren)
    serije = _ucitaj(folder, "satno.csv")
    smerovi = _ucitaj(folder, "satno_smerovi.csv")
    if serije.empty:
        return None

    wb = Workbook()
    wb.remove(wb.active)
    redosled = [s for s in OCEKIVANE_SERIJE if s in set(serije["stanica_id"])]
    redosled += sorted(set(serije["stanica_id"]) - set(redosled))
    for serija in redosled:
        sr = serije[serije["stanica_id"] == serija].sort_values("ts_utc")
        sm = smerovi[smerovi["serija"] == serija]
        nazivi = _kolone_smerova(sorted(sm["direction"].unique()))
        po_smeru = {s: g.set_index("ts_utc")["y"] for s, g in sm.groupby("direction")}
        dva_smera = len(nazivi) > 1
        zaglavlje = ["Date", "Time", "Status"] + list(nazivi.values()) + (["Sum"] if dva_smera else [])

        ws = wb.create_sheet(serija)
        ws.append(zaglavlje)
        for _, r in sr.iterrows():
            vrednosti = [po_smeru[s].get(r["ts_utc"]) for s in nazivi]
            red = [date.fromisoformat(r["datum"]), _vreme(r["ts"]),
                   "" if pd.isna(r["razlog"]) else r["razlog"]]
            red += [None if v is None or pd.isna(v) else int(v) for v in vrednosti]
            if dva_smera:
                red.append(None if pd.isna(r["y"]) else int(r["y"]))
            ws.append(red)

        for c in ws[1]:
            c.fill, c.font, c.alignment = _ZAGLAVLJE_FILL, _ZAGLAVLJE_FONT, Alignment(horizontal="center")
        for c in ws["A"][1:]:
            c.number_format = "yyyy-mm-dd"
        ws.column_dimensions["A"].width = 12
        ws.column_dimensions["C"].width = 18
        poslednja = get_column_letter(len(zaglavlje))
        if ws.max_row > 1:
            ws.conditional_formatting.add(
                f"D2:{poslednja}{ws.max_row}",
                CellIsRule(operator="greaterThan", formula=[str(PRAG_CRVENO)], fill=_CRVENO_FILL, font=_CRVENO_FONT))
        ws.freeze_panes = "A2"

    info = wb.create_sheet("Info")
    for red in [
        ["Izvor", "UGZINS / Mikrobit QLTCnet Traffic Agent — biciklisti, čitanje svakog sata (XX:02)"],
        ["Time", "kraj sata (01:00 = 00–01 h, 24:00 = 23–24 h)"],
        ["S<n> / Sum1, Sum2", "broj biciklista po smeru; Sum = zbir smerova (samo kada oba smera imaju vrednost)"],
        ["Status prazan", "sat je ispravan"],
        ["nema_citanja", "čitanje u tom satu nije uspelo"],
        ["nema_smera", "u čitanju nema tog smera"],
        ["zastarelo", "podatak brojača je prestar (uređaj ne javlja nove podatke)"],
        ["nepotpun_sat", "razmak čitanja nije ~1 sat"],
        ["negativna_razlika", "brojač je resetovan"],
        ["Crveno", f"vrednost > {PRAG_CRVENO}"],
    ]:
        info.append(red)
    info.column_dimensions["A"].width = 20
    info.column_dimensions["B"].width = 90

    izlaz = folder_excel(koren) / f"bicikli_{d:%Y-%m}.xlsx"
    izlaz.parent.mkdir(parents=True, exist_ok=True)
    wb.save(izlaz)
    log.info("Excel: %s (%d sheetova)", izlaz, len(redosled))
    return izlaz


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mesec", required=True, help="YYYY-MM")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    napravi_mesec(date.fromisoformat(a.mesec + "-01"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
