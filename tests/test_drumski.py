"""Drumski saobraćaj (scraper/drumski.py): parsiranje javnog fajla UGZ, čuvanje CSV-a i odbijanje fajla sa biciklistima."""
import csv
import gzip
from datetime import datetime, timezone
from pathlib import Path

import pytest

from scraper import drumski

PRIMER = Path(__file__).parent / "primer_drumski.xml"
BICIKLI = Path(__file__).parent / "primer_bicikli.xml"


def test_parsiranje():
    updated, unosi = drumski.parsiraj(PRIMER.read_bytes())
    assert updated == "2026-10-30T07:08:58Z" and len(unosi) == 2
    a, b = unosi
    assert a["id"] == "0014-21" and a["interval_utc"] == "2026-10-30T07:05:00Z" and a["laneDesc"] == "(v)"
    assert a["vozila_h"] == 516 and a["brzina_kmh"] == 54 and a["sledjenje_s"] == 6.1 and a["zauzetost_promil"] == 96
    assert a["datum_brojaca"] == "2026-10-30" and a["vreme_brojaca"] == "08:05:00" and a["vmax"] == 50
    assert (a["lat"], a["lon"]) == (45.269733, 19.802174)
    assert (b["lat"], b["lon"]) == (45.25, 19.8) and b["roadDesc"] == "IIA 100"   # decimalni zarez (gps fajl)


def test_odbija_bicikliste_i_html():
    drumski.proveri(PRIMER.read_bytes())
    with pytest.raises(drumski.GreskaDrumski):
        drumski.proveri(BICIKLI.read_bytes())
    with pytest.raises(drumski.GreskaDrumski):
        drumski.proveri(b"<html>greska</html>")


def test_sacuvaj(tmp_path):
    t = datetime(2026, 10, 30, 7, 2, 40, tzinfo=timezone.utc)
    p, n = drumski.sacuvaj(PRIMER.read_bytes(), t, tmp_path)
    p2, _ = drumski.sacuvaj(PRIMER.read_bytes(), t, tmp_path)
    assert n == 2 and p.relative_to(tmp_path).as_posix() == "2026/10/30/0802.csv.gz" and p2.name == "0802_2.csv.gz"
    with gzip.open(p, "rt", encoding="utf-8") as f:
        r = list(csv.DictReader(f))
    assert list(r[0]) == drumski.KOLONE and r[0]["vreme_citanja_utc"] == "2026-10-30T07:02:40Z" and r[1]["vozila_h"] == "476"
