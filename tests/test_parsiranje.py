from pathlib import Path

import pytest

from scraper.parsiranje import OCEKIVANE_SERIJE, parsiraj, proveri_serije, serija_iz_location_id
from scraper.preuzimanje import FajlSaVozilima, GreskaPreuzimanja, proveri_sadrzaj

PRIMER = Path(__file__).parent / "primer_bicikli.xml"

ENTRY = """<entry><id>0034-14</id><updated>2026-10-09T10:53:02Z</updated>
 <counters:location>0034</counters:location><counters:locationDesc>Futoška (N. Tesle)</counters:locationDesc>
 <counters:locationID>34NSa Futoska (N. Tesle)</counters:locationID><counters:direction>14</counters:direction>
 <counters:directionDesc>C. Dušana - Bul. Oslobodjenja (u oba smera)(b)</counters:directionDesc>
 <counters:roadDesc></counters:roadDesc><counters:section/>
 <counters:geoX>45,2551</counters:geoX><counters:geoY>19,8302</counters:geoY>
 <counters:date>09/10/2026</counters:date><counters:time>12:53:02</counters:time>
 <counters:volume_today>1456</counters:volume_today><counters:volume_yesterday>5178</counters:volume_yesterday>
 <counters:volumethisyear>900751</counters:volumethisyear>
 <counters:state>1</counters:state><counters:stateDesc>Saobraćaj se odvija normalno</counters:stateDesc></entry>"""

FEED = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:georss="http://www.georss.org/georss"
      xmlns:counters="http://www.mikrobit.si/schemas/counters/v1">
<title>Biciklisti</title><updated>2026-10-09T10:53:30Z</updated>
{entries}
</feed>"""

VOZILA = FEED.format(entries="""<entry><id>0001-1</id><counters:locationID>1NS</counters:locationID>
 <counters:volume>120</counters:volume><counters:speed>48</counters:speed><counters:occ>7</counters:occ></entry>""")


def test_parsiranje_unosa():
    data = FEED.format(entries=ENTRY).encode("utf-8")
    proveri_sadrzaj(data)
    updated, unosi = parsiraj(data)
    assert updated == "2026-10-09T10:53:30Z"
    (u,) = unosi
    assert u["serija"] == "34a"
    assert u["direction"] == "14" and u["location"] == "0034"
    assert u["datum_brojaca"] == "2026-10-09" and u["vreme_brojaca"] == "12:53:02"
    assert (u["danas"], u["juce"], u["ove_godine"], u["state"]) == (1456, 5178, 900751, 1)
    assert u["lat"] == pytest.approx(45.2551) and u["lon"] == pytest.approx(19.8302)
    assert u["directionDesc"].startswith("C. Dušana")


@pytest.mark.parametrize("lid, serija", [
    ("34NSa Futoska (N. Tesle)", "34a"), ("26NS", "26"), ("28NS x", "28"), ("41NS", "41"), ("47NS", "47"),
    ("25NSa", "25a"), ("40NSa", "40a"), ("46NSb", "46b"), ("51NSa", "51a"), ("15NSaPS", "15a"),
    ("Nesto drugo", None),
])
def test_mapiranje_serije(lid, serija):
    assert serija_iz_location_id(lid) == serija


def test_ocekivano_46_serija():
    assert len(OCEKIVANE_SERIJE) == 46 == len(set(OCEKIVANE_SERIJE))


def test_odbija_fajl_sa_vozilima():
    with pytest.raises(FajlSaVozilima):
        proveri_sadrzaj(VOZILA.encode())


@pytest.mark.parametrize("data", [b"<html>Biciklisti: Da li zelite...</html>", b"<?xml version='1.0'?><x/>",
                                  FEED.format(entries="").encode()])
def test_odbija_ne_feed(data):
    with pytest.raises(GreskaPreuzimanja):
        proveri_sadrzaj(data)


@pytest.mark.skipif(not PRIMER.exists(), reason="tests/primer_bicikli.xml nije dodat u repozitorijum")
def test_primer_57_unosa_46_serija():
    data = PRIMER.read_bytes()
    proveri_sadrzaj(data)
    _, unosi = parsiraj(data)
    assert len(unosi) == 57
    nedostaju, visak = proveri_serije(unosi)
    assert nedostaju == [] and visak == []
    # <id> nije jedinstven, ključ smera jeste
    kljucevi = {(u["locationID"], u["direction"], u["directionDesc"]) for u in unosi}
    assert len(kljucevi) == 57
