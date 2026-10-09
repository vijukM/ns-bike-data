"""Jedno čitanje: preuzmi bicikliste i sačuvaj podaci/YYYY/MM/DD/HHMM.xml.gz (sirovo) i HHMM.csv (57 redova).

    python -m scraper.citaj                  # obično čitanje (XX:02)
    python -m scraper.citaj --samo-ako-nema  # rezerva (XX:20): čita samo ako za tekući sat nema čitanja

Izlazni kod: 0 = uspeh (ili već postoji čitanje), 2 = preuzimanje/parsiranje nije uspelo (zapis u greske.log).
"""
from __future__ import annotations

import argparse
import csv
import gzip
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import konfig
from .parsiranje import KOLONE_SNIMKA, parsiraj, proveri_serije
from .preuzimanje import preuzmi_bicikliste, proveri_sadrzaj
from .razlika import KOLONE_RAZLIKE, dodaj_razlike, prethodno_citanje

log = logging.getLogger(__name__)


def _upisi_gresku(poruka: str, sada_utc: datetime) -> None:
    konfig.GRESKE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(konfig.GRESKE_LOG, "a", encoding="utf-8") as f:
        f.write(f"{sada_utc:%Y-%m-%dT%H:%M:%SZ}\t{poruka}\n")


def _gh_output(**kv) -> None:
    put = os.environ.get("GITHUB_OUTPUT")
    if put:
        with open(put, "a", encoding="utf-8") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def postoji_citanje_za_sat(sada_utc: datetime) -> bool:
    """Da li u folderu dana već postoji čitanje u istom satu (po UTC satu = jedinstven i lokalno)."""
    folder = konfig.folder_dana(sada_utc.astimezone(konfig.TZ))
    prefiks = f"{sada_utc:%Y-%m-%dT%H}:"
    for f in folder.glob("[0-9]*.csv"):
        with open(f, encoding="utf-8") as fh:
            red = next(csv.DictReader(fh), None)
        if red and red["vreme_citanja_utc"].startswith(prefiks):
            return True
    return False


def sacuvaj(data: bytes, sada_utc: datetime) -> tuple[Path, int, bool]:
    """Čuva sirov XML i CSV ovog čitanja u podaci/YYYY/MM/DD/HHMM.*.

    Vraća (putanja CSV-a, broj redova, prvo_u_danu). Svako čitanje je novi fajl — postojeći se ne menjaju.
    """
    lok = sada_utc.astimezone(konfig.TZ)
    feed_updated, unosi = parsiraj(data)
    folder = konfig.folder_dana(lok)
    prvo_u_danu = not any(folder.glob("[0-9]*.csv"))
    folder.mkdir(parents=True, exist_ok=True)
    ime = f"{lok:%H%M}"
    i = 2
    while (folder / f"{ime}.csv").exists():  # npr. dva čitanja u 02:01 na dan prelaska na zimsko vreme
        ime = f"{lok:%H%M}_{i}"
        i += 1
    with gzip.open(folder / f"{ime}.xml.gz", "wb") as f:
        f.write(data)
    csv_put = folder / f"{ime}.csv"
    vreme = f"{sada_utc:%Y-%m-%dT%H:%M:%SZ}"
    redovi = [{"vreme_citanja_utc": vreme, "feed_updated_utc": feed_updated, **u} for u in unosi]
    redovi = dodaj_razlike(redovi, prethodno_citanje(vreme))
    with open(csv_put, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=KOLONE_SNIMKA + KOLONE_RAZLIKE)
        w.writeheader()
        w.writerows(redovi)
    return csv_put, len(unosi), prvo_u_danu


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--samo-ako-nema", action="store_true", help="preskoči ako za tekući sat već postoji čitanje")
    ap.add_argument("--metod", choices=["auto", "brza", "pregledac"], default="auto")
    ap.add_argument("--ponavljanja", type=int, default=konfig.PONAVLJANJA)
    ap.add_argument("--iz-fajla", type=Path, help="umesto preuzimanja koristi lokalni XML (za proveru)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    sada = datetime.now(timezone.utc).replace(microsecond=0)
    if a.samo_ako_nema and postoji_citanje_za_sat(sada):
        log.info("za tekući sat već postoji čitanje — preskačem")
        _gh_output(procitano="false", prvo_u_danu="false")
        return 0

    try:
        if a.iz_fajla:
            data = a.iz_fajla.read_bytes()
            proveri_sadrzaj(data)
        else:
            data = preuzmi_bicikliste(a.metod, a.ponavljanja)
        sada = datetime.now(timezone.utc).replace(microsecond=0)
        csv_put, n, prvo = sacuvaj(data, sada)
    except Exception as e:  # noqa: BLE001
        poruka = f"metod={a.metod}\t{type(e).__name__}: {e}"
        _upisi_gresku(poruka, sada)
        log.error("čitanje nije uspelo: %s", poruka)
        _gh_output(procitano="false", prvo_u_danu="false")
        return 2

    _, unosi = parsiraj(data)
    nedostaju, visak = proveri_serije(unosi)
    log.info("sačuvano: %d redova -> %s (+ .xml.gz)", n, csv_put)
    log.info("serija: %d / 46", len({u["serija"] for u in unosi} - set(visak)))
    if nedostaju:
        log.warning("NEDOSTAJU serije: %s", " ".join(nedostaju))
    if visak:
        log.warning("serije VIŠKA: %s", " ".join(visak))
    _gh_output(procitano="true", prvo_u_danu=str(prvo).lower())
    return 0


if __name__ == "__main__":
    sys.exit(main())
