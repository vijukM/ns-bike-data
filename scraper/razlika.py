"""Broj biciklista od prethodnog čitanja — upisuje se direktno u CSV svakog čitanja.

Za svaki smer:
    isti dan brojača:       bicikala_od_prethodnog = danas − danas_prethodno
    preko ponoći (dan + 1): bicikala_od_prethodnog = juče − danas_prethodno + danas
Kad su čitanja na sat, to je broj biciklista u tom satu. minuta_od_prethodnog = razmak vremena brojača,
da se odmah vidi da li je stvarno bio sat. Prazno uz razlog_razlike kada se ne može izračunati.

Konačne satne vrednosti po seriji (sa svim proverama) i dalje računa satno.py posle ponoći.

    python -m scraper.razlika --dopuni podaci/2026/10/09   # dopuni već sačuvana čitanja u folderu
"""
from __future__ import annotations

import argparse
import csv
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

from . import konfig

log = logging.getLogger(__name__)

KOLONE_RAZLIKE = ["bicikala_od_prethodnog", "minuta_od_prethodnog", "prethodno_citanje_utc", "razlog_razlike"]


def _kljuc(red: dict) -> tuple:
    return red["locationID"], str(red["direction"]), red["directionDesc"]


def _ceo(x) -> int | None:
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def _brojac(red: dict) -> datetime | None:
    try:
        return datetime.fromisoformat(f"{red['datum_brojaca']}T{red['vreme_brojaca']}")
    except (KeyError, TypeError, ValueError):
        return None


def _procitaj(put: Path) -> list[dict]:
    with open(put, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def prethodno_citanje(vreme_utc: str, koren: Path | None = None) -> list[dict]:
    """Redovi poslednjeg čitanja pre `vreme_utc` (traži u folderu tog dana i dan ranije)."""
    lok = datetime.fromisoformat(vreme_utc.replace("Z", "+00:00")).astimezone(konfig.TZ).date()
    najbolje, najbolje_vreme = None, ""
    for d in (lok, lok - timedelta(days=1)):
        for f in konfig.folder_dana(d, koren).glob("[0-9]*.csv"):
            with open(f, encoding="utf-8") as fh:
                red = next(csv.DictReader(fh), None)
            if red and najbolje_vreme < red["vreme_citanja_utc"] < vreme_utc:
                najbolje, najbolje_vreme = f, red["vreme_citanja_utc"]
        if najbolje:
            break
    return _procitaj(najbolje) if najbolje else []


def izracunaj(red: dict, pre: dict | None) -> dict:
    """Kolone razlike za jedan smer (red = sadašnje čitanje, pre = isti smer u prethodnom čitanju)."""
    out = dict.fromkeys(KOLONE_RAZLIKE, "")
    if pre is None:
        out["razlog_razlike"] = "nema_prethodnog"
        return out
    out["prethodno_citanje_utc"] = pre["vreme_citanja_utc"]
    t, t0 = _brojac(red), _brojac(pre)
    if t and t0:
        out["minuta_od_prethodnog"] = round((t - t0).total_seconds() / 60)
    danas, juce, danas0 = _ceo(red["danas"]), _ceo(red["juce"]), _ceo(pre["danas"])
    if None in (danas, danas0) or not (t and t0):
        out["razlog_razlike"] = "nema_vrednosti"
        return out
    for s in (pre["state"], red["state"]):
        if str(s) != "1":
            out["razlog_razlike"] = f"kvar_state_{s}"
            return out
    if t.date() == t0.date():
        y = danas - danas0
    elif t.date() == t0.date() + timedelta(days=1) and juce is not None:
        y = juce - danas0 + danas
    else:
        out["razlog_razlike"] = "razmak_vise_od_dana"
        return out
    if y < 0:
        out["razlog_razlike"] = "negativna_razlika"
        return out
    out["bicikala_od_prethodnog"] = y
    return out


def dodaj_razlike(redovi: list[dict], prethodni: list[dict]) -> list[dict]:
    po_kljucu = {_kljuc(r): r for r in prethodni}
    return [{**r, **izracunaj(r, po_kljucu.get(_kljuc(r)))} for r in redovi]


def dopuni_folder(folder: Path) -> int:
    """Dopisuje kolone razlike u sva čitanja u folderu (redom po vremenu). Vraća broj fajlova."""
    fajlovi = sorted(folder.glob("[0-9]*.csv"), key=lambda f: _procitaj(f)[0]["vreme_citanja_utc"])
    for f in fajlovi:
        redovi = _procitaj(f)
        kolone = [k for k in redovi[0] if k not in KOLONE_RAZLIKE] + KOLONE_RAZLIKE
        koren = folder.parents[2]
        redovi = dodaj_razlike(redovi, prethodno_citanje(redovi[0]["vreme_citanja_utc"], koren))
        with open(f, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=kolone, extrasaction="ignore")
            w.writeheader()
            w.writerows(redovi)
    return len(fajlovi)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dopuni", type=Path, nargs="+", required=True, help="folder(i) dana")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    for folder in a.dopuni:
        log.info("%s: dopunjeno %d čitanja", folder, dopuni_folder(folder))
    return 0


if __name__ == "__main__":
    sys.exit(main())
