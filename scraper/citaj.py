"""Jedno čitanje: preuzmi bicikliste, sačuvaj sirov XML (gzip) i dodaj redove u dnevni CSV sa snimcima.

    python -m scraper.citaj                  # obično čitanje (XX:01)
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
    """Da li u snimcima već postoji čitanje u istom satu (po UTC satu = jedinstven i lokalno)."""
    lok = sada_utc.astimezone(konfig.TZ)
    csv_put = konfig.SNIMCI / f"{lok:%Y-%m-%d}.csv"
    if not csv_put.exists():
        return False
    prefiks = f"{sada_utc:%Y-%m-%dT%H}:"
    with open(csv_put, encoding="utf-8") as f:
        return any(red["vreme_citanja_utc"].startswith(prefiks) for red in csv.DictReader(f))


def sacuvaj(data: bytes, sada_utc: datetime) -> tuple[Path, Path, int, bool]:
    """Čuva sirov XML i dodaje redove u CSV. Vraća (sirov put, csv put, broj redova, prvo_u_danu)."""
    lok = sada_utc.astimezone(konfig.TZ)
    dan = f"{lok:%Y-%m-%d}"
    feed_updated, unosi = parsiraj(data)

    sirovo_dir = konfig.SIROVO / dan
    prvo_u_danu = not (sirovo_dir.exists() and any(sirovo_dir.glob("*.xml.gz")))
    sirovo_dir.mkdir(parents=True, exist_ok=True)
    sirov = sirovo_dir / f"{lok:%H%M}.xml.gz"
    i = 2
    while sirov.exists():  # npr. dva čitanja u 02:01 na dan prelaska na zimsko vreme
        sirov = sirovo_dir / f"{lok:%H%M}_{i}.xml.gz"
        i += 1
    with gzip.open(sirov, "wb") as f:
        f.write(data)

    konfig.SNIMCI.mkdir(parents=True, exist_ok=True)
    csv_put = konfig.SNIMCI / f"{dan}.csv"
    nov = not csv_put.exists()
    vreme = f"{sada_utc:%Y-%m-%dT%H:%M:%SZ}"
    with open(csv_put, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=KOLONE_SNIMKA)
        if nov:
            w.writeheader()
        for u in unosi:
            w.writerow({"vreme_citanja_utc": vreme, "feed_updated_utc": feed_updated, **u})
    return sirov, csv_put, len(unosi), prvo_u_danu


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
        sirov, csv_put, n, prvo = sacuvaj(data, sada)
    except Exception as e:  # noqa: BLE001
        poruka = f"metod={a.metod}\t{type(e).__name__}: {e}"
        _upisi_gresku(poruka, sada)
        log.error("čitanje nije uspelo: %s", poruka)
        _gh_output(procitano="false", prvo_u_danu="false")
        return 2

    _, unosi = parsiraj(data)
    nedostaju, visak = proveri_serije(unosi)
    log.info("sačuvano: %s, %d redova -> %s", sirov.name, n, csv_put)
    log.info("serija: %d / 46", len({u["serija"] for u in unosi} - set(visak)))
    if nedostaju:
        log.warning("NEDOSTAJU serije: %s", " ".join(nedostaju))
    if visak:
        log.warning("serije VIŠKA: %s", " ".join(visak))
    _gh_output(procitano="true", prvo_u_danu=str(prvo).lower())
    return 0


if __name__ == "__main__":
    sys.exit(main())
