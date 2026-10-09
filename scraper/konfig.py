"""Zajednička podešavanja: izvor, putanje, vremenska zona."""
import os
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_URL = "http://stari.ugzins.rs/SAUS/QLTCnetTrafficAgent"

# Običan User-Agent pregledača; može se promeniti promenljivom okruženja NS_BIKE_USER_AGENT.
USER_AGENT = os.environ.get(
    "NS_BIKE_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/154.0.0.0 Safari/537.36",
)
TIMEOUT_S = 30
PONAVLJANJA = 2  # najviše 2 ponovna pokušaja
PAUZA_S = (30, 60)  # pauza pre ponovnog pokušaja (nasumično u opsegu)

TZ = ZoneInfo("Europe/Belgrade")

KOREN = Path(__file__).resolve().parent.parent
PODACI = Path(os.environ.get("NS_BIKE_PODACI", KOREN / "podaci"))
SIROVO = PODACI / "sirovo"
SNIMCI = PODACI / "snimci"
GRESKE_LOG = PODACI / "greske.log"
