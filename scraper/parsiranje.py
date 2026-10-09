"""Parsiranje Atom + GeoRSS fajla sa biciklistima (Mikrobit counters v1) i mapiranje na serije modela."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "c": "http://www.mikrobit.si/schemas/counters/v1",
}

# 46 serija iz istorijskih podataka (master).
OCEKIVANE_SERIJE = (
    "15a 15b 20a 20b 22a 22b 23a 25a 26 27a 27b 28 29a 29b 30a 30b 31b 34a 34b 36a 36b "
    "37a 38a 38b 39a 39b 40a 40b 41 42a 42b 43a 43b 44a 44b 45a 45b 46a 46b 47 49a 49b "
    "50a 50b 51a 51b"
).split()

_RE_SERIJA = re.compile(r"^(\d+)NS([ab]?)")

# Kolone dnevnog CSV-a sa snimcima (redosled je bitan).
KOLONE_SNIMKA = [
    "vreme_citanja_utc", "feed_updated_utc", "location", "locationID", "direction",
    "directionDesc", "serija", "datum_brojaca", "vreme_brojaca", "danas", "juce",
    "ove_godine", "state", "stateDesc", "lat", "lon",
]


def serija_iz_location_id(location_id: str) -> str | None:
    """34NSa -> 34a, 26NS -> 26, 15NSaPS -> 15a; None ako ne odgovara obrascu."""
    m = _RE_SERIJA.match((location_id or "").strip())
    if not m:
        return None
    return f"{int(m.group(1))}{m.group(2)}"


def _tekst(el: ET.Element, ime: str) -> str:
    x = el.find(f"c:{ime}", NS)
    return (x.text or "").strip() if x is not None and x.text else ""


def _broj(s: str) -> float | None:
    s = s.strip().replace(",", ".")
    return float(s) if s else None


def _ceo(s: str) -> int | None:
    s = s.strip()
    return int(s) if s else None


def parsiraj(data: bytes) -> tuple[str, list[dict]]:
    """Vraća (feed_updated_utc, lista unosa kao rečnici sa ključevima iz KOLONE_SNIMKA bez vremena čitanja)."""
    koren = ET.fromstring(data)
    feed_updated = (koren.findtext("atom:updated", default="", namespaces=NS) or "").strip()
    unosi = []
    for e in koren.findall("atom:entry", NS):
        location_id = _tekst(e, "locationID")
        datum = _tekst(e, "date")  # dd/mm/yyyy, lokalno vreme brojača
        try:
            datum_iso = datetime.strptime(datum, "%d/%m/%Y").date().isoformat()
        except ValueError:
            datum_iso = datum
        unosi.append({
            "location": _tekst(e, "location"),
            "locationID": location_id,
            "direction": _tekst(e, "direction"),
            "directionDesc": _tekst(e, "directionDesc"),
            "serija": serija_iz_location_id(location_id),
            "datum_brojaca": datum_iso,
            "vreme_brojaca": _tekst(e, "time"),
            "danas": _ceo(_tekst(e, "volume_today")),
            "juce": _ceo(_tekst(e, "volume_yesterday")),
            "ove_godine": _ceo(_tekst(e, "volumethisyear")),
            "state": _ceo(_tekst(e, "state")),
            "stateDesc": _tekst(e, "stateDesc"),
            "lat": _broj(_tekst(e, "geoX")),
            "lon": _broj(_tekst(e, "geoY")),
        })
    return feed_updated, unosi


def proveri_serije(unosi: list[dict]) -> tuple[list[str], list[str]]:
    """Vraća (serije koje nedostaju, serije viška) u odnosu na OCEKIVANE_SERIJE."""
    nadjene = {u["serija"] for u in unosi}
    nedostaju = [s for s in OCEKIVANE_SERIJE if s not in nadjene]
    visak = sorted(str(s) for s in nadjene - set(OCEKIVANE_SERIJE))
    return nedostaju, visak
