"""Drumski saobraćaj (automobili i ostala vozila): čitanje javnog fajla UGZ / Mikrobit uz čitanje biciklista.

    python -m scraper.drumski                 # jedno čitanje → podaci/drumski/YYYY/MM/DD/HHMM.csv.gz
    python -m scraper.drumski --iz-fajla x.xml

Izvor: http://stari.ugzins.rs/SAUS/counters_georss_sr.xml (rezerva: counters_georss_gps_sr.xml — isti sadržaj,
samo sa decimalnim zarezom u koordinatama). Atom + GeoRSS, „Automatski brojači saobraćaja“; fajl se osvežava na 5 min.

Za razliku od biciklista, fajl NEMA dnevnih zbirova: svaki unos je stanje jedne TRAKE u poslednjem 5-minutnom
intervalu (172 trake na 44 lokacije, oktobar 2026.):
  volume = broj vozila/h (preračunato iz 5 min), speed = km/h (0 = brojač ne meri brzinu), gap = vreme sleđenja (s),
  occ = zauzetost u promilima (96 = 9,6 %), state 1–6 (1 normalno … 5 otežano sa zastojima, 6 nema saobraćaja),
  vmax = ograničenje brzine, date/time = kraj intervala (lokalno), updated = kraj intervala (UTC).
Čitanje jednom na sat zato beleži jedan 5-minutni uzorak po satu (oko XX:00), ne ceo sat.

Čuva se samo CSV (gzip) sa svim poljima unosa — sirov XML je ~230 kB po čitanju (≈ 200 MB godišnje i kad je
kompresovan), a ne sadrži ništa što CSV nema. Greške idu u podaci/drumski/greske.log; čitanje biciklista ne zavisi
od ovoga (u workflow-u je poseban korak sa continue-on-error).
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import logging
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

from . import konfig

log = logging.getLogger(__name__)

URL = "http://stari.ugzins.rs/SAUS/counters_georss_sr.xml"
URL_REZERVA = "http://stari.ugzins.rs/SAUS/counters_georss_gps_sr.xml"
PODACI = konfig.KOREN / "podaci" / "drumski"
NS = {"atom": "http://www.w3.org/2005/Atom", "georss": "http://www.georss.org/georss",
      "c": "http://www.mikrobit.si/schemas/counters/v1"}

KOLONE = [
    "vreme_citanja_utc", "feed_updated_utc", "id", "interval_utc", "location", "locationDesc", "locationID",
    "roadDesc", "direction", "directionDesc", "laneDesc", "lat", "lon", "vmax", "datum_brojaca", "vreme_brojaca",
    "vozila_h", "brzina_kmh", "sledjenje_s", "zauzetost_promil", "state", "stateDesc",
]


class GreskaDrumski(Exception):
    pass


def proveri(data: bytes) -> None:
    """Atom fajl sa VOZILIMA (counters:volume / occ), ne sa biciklistima."""
    if b"<feed" not in data[:2000]:
        raise GreskaDrumski(f"odgovor nije Atom feed (počinje sa {data[:60]!r})")
    if b"counters:volume_today" in data or b"<counters:occ>" not in data:
        raise GreskaDrumski("fajl nije drumski saobraćaj (nema counters:occ ili ima volume_today)")


def _t(e: ET.Element, ime: str) -> str:
    x = e.find(f"c:{ime}", NS)
    return (x.text or "").strip() if x is not None and x.text else ""


def _broj(s: str) -> float | None:
    s = s.strip().replace(",", ".")
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _ceo(s: str) -> int | None:
    b = _broj(s)
    return int(b) if b is not None else None


def parsiraj(data: bytes) -> tuple[str, list[dict]]:
    """(feed_updated_utc, unosi) — jedan unos po traci."""
    koren = ET.fromstring(data)
    feed_updated = (koren.findtext("atom:updated", default="", namespaces=NS) or "").strip()
    unosi = []
    for e in koren.findall("atom:entry", NS):
        datum = _t(e, "date")
        try:
            datum = datetime.strptime(datum, "%d/%m/%Y").date().isoformat()
        except ValueError:
            pass
        unosi.append({
            "id": (e.findtext("atom:id", default="", namespaces=NS) or "").strip(),
            "interval_utc": (e.findtext("atom:updated", default="", namespaces=NS) or "").strip(),
            "location": _t(e, "location"), "locationDesc": _t(e, "locationDesc"), "locationID": _t(e, "locationID"),
            "roadDesc": _t(e, "roadDesc"), "direction": _t(e, "direction"), "directionDesc": _t(e, "directionDesc").strip(),
            "laneDesc": _t(e, "laneDesc"), "lat": _broj(_t(e, "geoX")), "lon": _broj(_t(e, "geoY")),
            "vmax": _ceo(_t(e, "vmax")), "datum_brojaca": datum, "vreme_brojaca": _t(e, "time"),
            "vozila_h": _ceo(_t(e, "volume")), "brzina_kmh": _ceo(_t(e, "speed")), "sledjenje_s": _broj(_t(e, "gap")),
            "zauzetost_promil": _ceo(_t(e, "occ")), "state": _ceo(_t(e, "state")), "stateDesc": _t(e, "stateDesc"),
        })
    return feed_updated, unosi


def preuzmi(pokusaji: int = 2, pauza_s: float = 30) -> bytes:
    """GET glavnog fajla, pa rezervnog; ceo krug se ponavlja `pokusaji` puta."""
    greske = []
    for i in range(pokusaji):
        if i:
            time.sleep(pauza_s)
        for url in (URL, URL_REZERVA):
            try:
                r = requests.get(url, headers={"User-Agent": konfig.USER_AGENT, "Cache-Control": "no-cache"}, timeout=konfig.TIMEOUT_S)
                r.raise_for_status()
                proveri(r.content)
                return r.content
            except Exception as e:  # noqa: BLE001
                greske.append(f"{url.rsplit('/', 1)[-1]}: {type(e).__name__}: {e}")
                log.warning(greske[-1])
    raise GreskaDrumski(" | ".join(greske))


def sacuvaj(data: bytes, sada_utc: datetime, koren: Path | None = None) -> tuple[Path, int]:
    """podaci/drumski/YYYY/MM/DD/HHMM.csv.gz (lokalni datum i vreme čitanja, kao kod biciklista)."""
    koren = koren or PODACI
    lok = sada_utc.astimezone(konfig.TZ)
    feed_updated, unosi = parsiraj(data)
    folder = koren / f"{lok:%Y}" / f"{lok:%m}" / f"{lok:%d}"
    folder.mkdir(parents=True, exist_ok=True)
    ime, i = f"{lok:%H%M}", 2
    while (folder / f"{ime}.csv.gz").exists():
        ime, i = f"{lok:%H%M}_{i}", i + 1
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=KOLONE)
    w.writeheader()
    vreme = f"{sada_utc:%Y-%m-%dT%H:%M:%SZ}"
    w.writerows({"vreme_citanja_utc": vreme, "feed_updated_utc": feed_updated, **u} for u in unosi)
    put = folder / f"{ime}.csv.gz"
    with gzip.open(put, "wt", encoding="utf-8", newline="") as f:
        f.write(buf.getvalue())
    return put, len(unosi)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--iz-fajla", type=Path, help="umesto preuzimanja koristi lokalni XML (za proveru)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    sada = datetime.now(timezone.utc).replace(microsecond=0)
    try:
        data = a.iz_fajla.read_bytes() if a.iz_fajla else preuzmi()
        proveri(data)
        put, n = sacuvaj(data, datetime.now(timezone.utc).replace(microsecond=0))
    except Exception as e:  # noqa: BLE001
        PODACI.mkdir(parents=True, exist_ok=True)
        with open(PODACI / "greske.log", "a", encoding="utf-8") as f:
            f.write(f"{sada:%Y-%m-%dT%H:%M:%SZ}\t{' '.join(f'{type(e).__name__}: {e}'.split())[:500]}\n")
        log.error("drumski saobraćaj nije pročitan: %s", e)
        return 2
    log.info("drumski saobraćaj: %d traka → %s", n, put.relative_to(konfig.KOREN))
    return 0


if __name__ == "__main__":
    sys.exit(main())
