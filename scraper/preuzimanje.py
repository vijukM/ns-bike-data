"""Preuzimanje fajla sa BICIKLISTIMA (bicycles_georss_gps_sr.xml) sa UGZINS / Mikrobit QLTCnet servisa.

Izbor filtera (ETYPETABLE: 0 = Sve, 1 = Vozila, 2 = Biciklisti) čuva se u IntraWeb sesiji, pa se
pre preuzimanja u istoj sesiji mora postaviti ETYPETABLE = 2.

a) brza varijanta: requests.Session (IntraWeb asinhroni događaj / submit forme, pa /rss i „Preuzimanje“),
b) rezerva: Playwright (headless Chromium).

Svaki preuzeti sadržaj prolazi proveri_sadrzaj(): fajl sa vozilima se odbija.

Istraživanje mehanizma (snima sve odgovore i IntraWeb JS fajlove u folder):
    python -m scraper.preuzimanje --istrazi /tmp/istrazi
"""
from __future__ import annotations

import argparse
import logging
import random
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

import requests

from .konfig import BASE_URL, PAUZA_S, PONAVLJANJA, TIMEOUT_S, USER_AGENT

log = logging.getLogger(__name__)

FILTER_BICIKLISTI = "2"
TEKST_DUGMETA = "Preuzimanje"


class GreskaPreuzimanja(Exception):
    pass


class FilterNijePostavljen(GreskaPreuzimanja):
    """/rss ne nudi biciklise (ili je stigao fajl sa vozilima)."""


class FajlSaVozilima(FilterNijePostavljen):
    """Preuzet je fajl sa vozilima — filter „Biciklisti“ nije postavljen u sesiji."""


# ---------------------------------------------------------------- provera sadržaja

_RE_VOZILA = re.compile(rb"<counters:(volume|speed|occ)[\s/>]")


def proveri_sadrzaj(data: bytes) -> None:
    """Baca izuzetak ako sadržaj nije Atom fajl sa biciklistima."""
    pocetak = data.lstrip(b"\xef\xbb\xbf \t\r\n")
    if not pocetak.startswith(b"<?xml"):
        raise GreskaPreuzimanja(f"odgovor nije XML (počinje sa {pocetak[:60]!r})")
    if b"<feed" not in data:
        raise GreskaPreuzimanja("XML nema <feed")
    if _RE_VOZILA.search(data):
        raise FajlSaVozilima("preuzet fajl sa VOZILIMA (counters:volume/speed/occ) — filter nije postavljen")
    if b"counters:volume_today" not in data:
        raise GreskaPreuzimanja("XML nema counters:volume_today")


def _je_xml(data: bytes) -> bool:
    return data.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"<?xml")


# ---------------------------------------------------------------- HTML (IntraWeb) pomoćnici

class _Stranica(HTMLParser):
    """Skuplja forme, polja, dugmad, linkove i skripte sa IntraWeb stranice."""

    def __init__(self, html: str, url: str):
        super().__init__(convert_charrefs=True)
        self.url = url
        self.html = html
        self.forme: list[dict] = []
        self.polja: list[dict] = []
        self.dugmad: list[dict] = []
        self.skripte: list[str] = []
        self._dugme: dict | None = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "form":
            self.forme.append(a)
        elif tag in ("input", "select", "textarea"):
            a["_tag"] = tag
            self.polja.append(a)
            if a.get("type", "").lower() in ("submit", "button", "image"):
                self.dugmad.append({**a, "_tekst": a.get("value", "")})
        elif tag == "button":
            self._dugme = {**a, "_tag": tag, "_tekst": ""}
        elif tag == "script" and a.get("src"):
            self.skripte.append(urljoin(self.url, a["src"]))

    def handle_data(self, data):
        if self._dugme is not None:
            self._dugme["_tekst"] += data

    def handle_endtag(self, tag):
        if tag == "button" and self._dugme is not None:
            self._dugme["_tekst"] = self._dugme["_tekst"].strip()
            self.dugmad.append(self._dugme)
            self._dugme = None

    def action(self) -> str:
        return urljoin(self.url, self.forme[0].get("action", "")) if self.forme else self.url

    def podaci_forme(self) -> dict[str, str]:
        """Sva polja forme kao što bi ih pregledač poslao (bez dugmadi; radio/checkbox samo izabrani)."""
        d: dict[str, str] = {}
        for p in self.polja:
            ime = p.get("name")
            tip = p.get("type", "").lower()
            if not ime or tip in ("submit", "button", "image", "reset", "file"):
                continue
            if tip in ("radio", "checkbox") and "checked" not in p:
                continue
            d[ime] = p.get("value", "")
        return d


# ---------------------------------------------------------------- a) brza varijanta
#
# Tok (utvrđeno snimanjem odgovora sajta, IntraWeb 15.2):
#  1. GET glavne stranice vraća „bootstrap“ formu (IW_width, IW_height, IW_dpr, IW_iframe) koju pregledač
#     odmah šalje POST-om; odgovor je prava stranica (TAForm) i kolačić IW_QLTCnet3TA.
#  2. Radio grupa ETYPETABLE ima polje ETYPETABLE_INPUT (0 = Sve, 1 = Vozila, 2 = Biciklisti); promena ide
#     kao asinhroni poziv $/callback?callback=ETYPETABLE.DoOnAsyncChange.
#  3. /rss (RssTAForm) prikazuje „Biciklisti: Da li želite da preuzmete RSS podatke?“; dugme DOWNLOADBUTTON
#     radi SubmitClickConfirm('DOWNLOADBUTTON') = POST forme SubmitForm na /rss sa IW_Action=DOWNLOADBUTTON.

_RE_GAPPID = re.compile(r'GAppID\s*=\s*"([^"]+)"')
_RE_GTRACKID = re.compile(r"GTrackID\s*=\s*(\d+)")


def _submit_forma(st: _Stranica) -> tuple[str, dict[str, str]]:
    """Akcija i polja IntraWeb forme name="SubmitForm" (ona koju šalju SubmitClick/SubmitClickConfirm)."""
    m = re.search(r'<form[^>]*action="([^"]*)"[^>]*name="SubmitForm"[^>]*>(.*?)</form>', st.html, flags=re.S | re.I)
    if not m:
        raise GreskaPreuzimanja("na stranici nema IntraWeb forme SubmitForm")
    polja = {}
    for tag in re.findall(r"<input[^>]*>", m.group(2), flags=re.I):
        ime = re.search(r'name="([^"]*)"', tag, flags=re.I)
        vrednost = re.search(r'value="([^"]*)"', tag, flags=re.I)
        if ime:
            polja[ime.group(1)] = vrednost.group(1) if vrednost else ""
    return urljoin(st.url, m.group(1)), polja


def _iw_sesija(st: _Stranica) -> dict[str, str]:
    d = {}
    if m := _RE_GAPPID.search(st.html):
        d["IW_SessionID_"] = m.group(1)
    if m := _RE_GTRACKID.search(st.html):
        d["IW_TrackID_"] = m.group(1)
    return d


def _izabrano(st: _Stranica, ime: str) -> str:
    for p in st.polja:
        if p.get("name") == ime and "checked" in p:
            return p.get("value", "")
    return ""


class _Brza:
    def __init__(self, debug_dir: Path | None = None):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = USER_AGENT
        self.debug_dir = debug_dir
        self.n = 0

    def _zapamti(self, r: requests.Response, oznaka: str) -> None:
        if not self.debug_dir:
            return
        self.n += 1
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        zaglavlje = f"{r.request.method} {r.request.url}\n-> {r.status_code} {r.url}\n"
        zaglavlje += "".join(f"{k}: {v}\n" for k, v in r.headers.items())
        if r.request.body:
            telo = r.request.body if isinstance(r.request.body, str) else r.request.body.decode("latin-1")
            zaglavlje += f"\nZAHTEV TELO:\n{telo}\n"
        (self.debug_dir / f"{self.n:02d}_{oznaka}.zaglavlja.txt").write_text(zaglavlje, encoding="utf-8")
        (self.debug_dir / f"{self.n:02d}_{oznaka}.telo").write_bytes(r.content)

    def _zahtev(self, metod: str, url: str, oznaka: str, **kw) -> requests.Response:
        r = self.s.request(metod, url, timeout=TIMEOUT_S, **kw)
        self._zapamti(r, oznaka)
        r.raise_for_status()
        return r

    def otvori_glavnu(self) -> _Stranica:
        r = self._zahtev("GET", BASE_URL + "/", "glavna")
        st = _Stranica(r.text, r.url)
        if "IW_width" in r.text:  # bootstrap forma — pošalji je kao pregledač
            podaci = st.podaci_forme()
            podaci.update({"IW_width": "1920", "IW_height": "1080", "IW_dpr": "1", "IW_iframe": "0"})
            r = self._zahtev("POST", st.action(), "glavna_start", data=podaci)
            st = _Stranica(r.text, r.url)
        if "ETYPETABLE" not in st.html:
            raise GreskaPreuzimanja("glavna stranica nema filter ETYPETABLE")
        return st

    def postavi_filter(self, st: _Stranica) -> None:
        _, polja = _submit_forma(st)
        for ime in polja:
            if ime.endswith("_INPUT"):
                polja[ime] = _izabrano(st, ime)
        polja["ETYPETABLE_INPUT"] = FILTER_BICIKLISTI
        polja.update(_iw_sesija(st))
        self._zahtev(
            "POST", BASE_URL + "/$/callback", "filter_callback",
            params={"callback": "ETYPETABLE.DoOnAsyncChange", "x": 0, "y": 0, "which": 0, "modifiers": ""},
            data=polja,
        )

    def preuzmi_sa_rss(self) -> bytes:
        r = self._zahtev("GET", BASE_URL + "/rss", "rss")
        if _je_xml(r.content):
            return r.content
        st = _Stranica(r.text, r.url)
        if "Biciklisti" not in r.text:
            poruka = re.search(r'id="EMESSAGE"[^>]*>([^<]*)', r.text, flags=re.I)
            raise FilterNijePostavljen(
                f"/rss ne nudi „Biciklisti“ ({poruka.group(1).strip() if poruka else '?'}) — filter nije postavljen")
        akcija, polja = _submit_forma(st)
        polja.update(_iw_sesija(st))
        polja.update({"IW_Action": "DOWNLOADBUTTON", "IW_ActionParam": ""})
        r = self._zahtev("POST", akcija, "preuzimanje", data=polja)
        if _je_xml(r.content):
            return r.content
        # Odgovor je stranica koja preuzima fajl preko skrivenog <a id="downlink" download href=...>.
        for link in re.findall(r"""(?:href|src)\s*=\s*["']([^"']+\.xml[^"']*)["']|["']([^"'\s]*\$/[^"'\s]+\.xml[^"'\s]*)["']""",
                               r.text, flags=re.I):
            url = next(x for x in link if x)
            rr = self._zahtev("GET", urljoin(r.url, url.replace("&amp;", "&")), "preuzimanje_link")
            if _je_xml(rr.content):
                return rr.content
        raise GreskaPreuzimanja("klik na „Preuzimanje“ nije vratio XML ni link ka XML-u")

    def preuzmi(self) -> bytes:
        st = self.otvori_glavnu()
        self.postavi_filter(st)
        data = self.preuzmi_sa_rss()
        proveri_sadrzaj(data)
        return data

    def istrazi(self) -> None:
        """Snima ceo tok i IntraWeb JS fajlove (za otklanjanje grešaka)."""
        st = self.otvori_glavnu()
        for src in st.skripte:
            if "/$/js/" in src:
                try:
                    self._zahtev("GET", src, "js_" + re.sub(r"\W+", "_", src.rsplit("/", 1)[-1])[:60])
                except requests.RequestException as e:
                    log.warning("JS %s: %s", src, e)
        try:
            self.postavi_filter(st)
            data = self.preuzmi_sa_rss()
            proveri_sadrzaj(data)
            log.info("istraživanje: brza varijanta USPELA (%d bajtova)", len(data))
        except Exception as e:  # noqa: BLE001 — istraživanje, sve se snima
            log.warning("istraživanje: brza varijanta nije uspela: %s", e)


def preuzmi_brzo(debug_dir: Path | None = None) -> bytes:
    return _Brza(debug_dir).preuzmi()


# ---------------------------------------------------------------- b) rezerva: Playwright

def preuzmi_pregledacem() -> bytes:
    from playwright.sync_api import sync_playwright  # opciono; instalira se samo ako zatreba

    with sync_playwright() as p:
        pregledac = p.chromium.launch(headless=True)
        try:
            ctx = pregledac.new_context(accept_downloads=True, user_agent=USER_AGENT)
            page = ctx.new_page()
            page.set_default_timeout(TIMEOUT_S * 1000)
            page.goto(BASE_URL, wait_until="networkidle")
            page.locator(f'input[name="ETYPETABLE_INPUT"][value="{FILTER_BICIKLISTI}"]').first.check()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)
            page.goto(BASE_URL + "/rss", wait_until="networkidle")
            if "Biciklisti" not in page.content():
                raise GreskaPreuzimanja("Playwright: /rss ne nudi „Biciklisti“ — filter nije postavljen")
            dugme = page.get_by_role("button", name=TEKST_DUGMETA)
            if dugme.count() == 0:
                dugme = page.locator(f'input[value="{TEKST_DUGMETA}"], text="{TEKST_DUGMETA}"')
            with page.expect_download() as preuzimanje:
                dugme.first.click()
            data = Path(preuzimanje.value.path()).read_bytes()
        finally:
            pregledac.close()
    proveri_sadrzaj(data)
    return data


# ---------------------------------------------------------------- javni API

def _playwright_dostupan() -> bool:
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    return True


def preuzmi_bicikliste(metod: str = "auto", ponavljanja: int = PONAVLJANJA) -> bytes:
    """Preuzima fajl sa biciklistima i proverava sadržaj.

    metod: "auto" (brza, pa Playwright ako je instaliran), "brza" ili "pregledac".
    Najviše `ponavljanja` ponovnih pokušaja sa pauzom 30–60 s.
    """
    greske = []
    for pokusaj in range(ponavljanja + 1):
        if pokusaj:
            pauza = random.uniform(*PAUZA_S)
            log.info("ponovni pokušaj %d za %.0f s", pokusaj, pauza)
            time.sleep(pauza)
        if metod in ("auto", "brza"):
            try:
                return preuzmi_brzo()
            except Exception as e:  # noqa: BLE001
                greske.append(f"brza: {type(e).__name__}: {e}")
                log.warning(greske[-1])
        if metod == "pregledac" or (metod == "auto" and _playwright_dostupan()):
            try:
                return preuzmi_pregledacem()
            except Exception as e:  # noqa: BLE001
                greske.append(f"pregledac: {type(e).__name__}: {e}")
                log.warning(greske[-1])
    raise GreskaPreuzimanja(" | ".join(greske))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--istrazi", type=Path, help="snimi sve odgovore i JS fajlove u folder")
    ap.add_argument("--metod", choices=["auto", "brza", "pregledac"], default="auto")
    ap.add_argument("--izlaz", type=Path, help="sačuvaj preuzeti XML")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if a.istrazi:
        _Brza(a.istrazi).istrazi()
        return 0
    data = preuzmi_bicikliste(a.metod, ponavljanja=0)
    if a.izlaz:
        a.izlaz.write_bytes(data)
    sys.stdout.write(data[:1500].decode("utf-8", "replace") + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
