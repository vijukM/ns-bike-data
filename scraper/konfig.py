"""Zajednička podešavanja: izvor, putanje, vremenska zona."""
import os
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_URL = "http://stari.ugzins.rs/SAUS/QLTCnetTrafficAgent"

# Kontakt u User-Agent zaglavlju; može se promeniti promenljivom okruženja NS_BIKE_KONTAKT.
KONTAKT = os.environ.get("NS_BIKE_KONTAKT", "https://github.com/vijukM/ns-bike-data")
USER_AGENT = f"ns-bike-data / master rad FTN Novi Sad (kontakt: {KONTAKT})"
TIMEOUT_S = 30
PONAVLJANJA = 2  # najviše 2 ponovna pokušaja
PAUZA_S = (30, 60)  # pauza pre ponovnog pokušaja (nasumično u opsegu)

TZ = ZoneInfo("Europe/Belgrade")

KOREN = Path(__file__).resolve().parent.parent
PODACI = Path(os.environ.get("NS_BIKE_PODACI", KOREN / "podaci"))
SIROVO = PODACI / "sirovo"
SNIMCI = PODACI / "snimci"
GRESKE_LOG = PODACI / "greske.log"
