"""Zajednička podešavanja: izvor, putanje, vremenska zona."""
import os
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_URL = "http://stari.ugzins.rs/SAUS/QLTCnetTrafficAgent"
# Isti fajl sa biciklistima javno stoji u folderu SAUS (IIS ga osvežava na par minuta): jedan GET, bez sesije i filtera.
STATICKI_URL = "http://stari.ugzins.rs/SAUS/bicycles_georss_gps_sr.xml"

# Običan User-Agent pregledača; može se promeniti promenljivom okruženja NS_BIKE_USER_AGENT.
USER_AGENT = os.environ.get(
    "NS_BIKE_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/154.0.0.0 Safari/537.36",
)
TIMEOUT_S = 30
# Pokušaji preuzimanja u jednom pokretanju: odmah, posle 3 i posle 6 min (sekunde od početka pokretanja,
# NS_BIKE_POCETAK = unix vreme početka; podrazumevano trenutak poziva). U XX:08 je vreme brojača i dalje
# u okviru provere svežine satnog obračuna.
POKUSAJI_U = (0, 180, 360)

TZ = ZoneInfo("Europe/Belgrade")

KOREN = Path(__file__).resolve().parent.parent
# Podaci sa brojača biciklista (scraper). Vremenska prognoza je odvojeno u podaci/vremenska_prognoza/.
PODACI = Path(os.environ.get("NS_BIKE_PODACI", KOREN / "podaci" / "biciklisti"))
GRESKE_LOG = PODACI / "greske.log"
# dnevnik pokretanja (svako čitanje i svaki neuspeo pokušaj; preskočena rezerva se ne upisuje) — strana „Preuzimanje podataka“
POKRETANJA_LOG = PODACI / "pokretanja.csv"


def folder_dana(dan, koren: Path | None = None) -> Path:
    """podaci/YYYY/MM/DD za lokalni datum."""
    return (koren or PODACI) / f"{dan:%Y}" / f"{dan:%m}" / f"{dan:%d}"


def folder_meseca(dan, koren: Path | None = None) -> Path:
    return (koren or PODACI) / f"{dan:%Y}" / f"{dan:%m}"
