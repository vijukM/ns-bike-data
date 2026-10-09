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

    def nadji_dugme(self, tekst: str) -> dict | None:
        for b in self.dugmad:
            if tekst.lower() in (b.get("_tekst") or "").lower():
                return b
        # IntraWeb ponekad crta dugme kao <div>/<span> sa tekstom — traži id elementa sa tim tekstom
        m = re.search(r'id="([A-Za-z0-9_]+)"[^>]*>\s*(?:<[^>]+>\s*)*' + re.escape(tekst), self.html)
        return {"id": m.group(1), "name": m.group(1), "_tekst": tekst} if m else None


def _iw_ime(el: dict) -> str:
    """IntraWeb ime kontrole (IW_Action / callback) — velikim slovima, bez sufiksa _INPUT/_BTN."""
    ime = el.get("name") or el.get("id") or ""
    return re.sub(r"_(INPUT|BTN|IMG|BUTTON)$", "", ime.upper())


# ---------------------------------------------------------------- a) brza varijanta

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

    def get(self, url, oznaka, **kw) -> requests.Response:
        r = self.s.get(url, timeout=TIMEOUT_S, **kw)
        self._zapamti(r, oznaka)
        r.raise_for_status()
        return r

    def post(self, url, oznaka, **kw) -> requests.Response:
        r = self.s.post(url, timeout=TIMEOUT_S, **kw)
        self._zapamti(r, oznaka)
        r.raise_for_status()
        return r

    # -- postavljanje filtera

    def _callback_urlovi(self, st: _Stranica) -> list[str]:
        kandidati = []
        akcija = st.action()
        if "$/" in akcija:
            kandidati.append(akcija[: akcija.index("$/") + 2] + "callback")
        kandidati += [urljoin(st.url, "$/callback"), BASE_URL + "/$/callback"]
        return list(dict.fromkeys(kandidati))

    def pokusaji_filtera(self, st: _Stranica):
        """Generator: svaki korak pokušava da u sesiji postavi ETYPETABLE = 2 (pozivalac proverava /rss)."""
        polja = st.podaci_forme()
        polja["ETYPETABLE"] = FILTER_BICIKLISTI
        dogadjaji = re.findall(r"ETYPETABLE\.(DoOnAsync\w+)", st.html, flags=re.I)
        dogadjaji = list(dict.fromkeys(dogadjaji + ["DoOnAsyncChange", "DoOnAsyncClick"]))
        # 1) IntraWeb asinhroni poziv $/callback?callback=ETYPETABLE.<Događaj>
        for url in self._callback_urlovi(st):
            for dog in dogadjaji:
                try:
                    r = self.post(url, "filter_callback",
                                  params={"callback": f"ETYPETABLE.{dog}", "x": 0, "y": 0, "which": 0, "modifiers": ""},
                                  data={**polja, "IW_Action": "ETYPETABLE", "IW_ActionParam": ""})
                except requests.RequestException as e:
                    log.debug("callback %s %s: %s", url, dog, e)
                    continue
                m = re.search(r"<trackid>(\d+)</trackid>", r.text, flags=re.I)
                if m:
                    polja["IW_TrackID_"] = m.group(1)
                yield f"callback {url} ETYPETABLE.{dog}"
        # 2) klasičan submit forme sa IW_Action=ETYPETABLE
        self.post(st.action(), "filter_submit", data={**polja, "IW_Action": "ETYPETABLE", "IW_ActionParam": ""})
        yield "submit forme"

    # -- /rss i „Preuzimanje“

    def preuzmi_sa_rss(self) -> bytes:
        r = self.get(BASE_URL + "/rss", "rss")
        if _je_xml(r.content):
            return r.content
        if "Biciklisti" not in r.text:
            raise FilterNijePostavljen("/rss ne nudi „Biciklisti“ — filter nije postavljen u sesiji")
        st = _Stranica(r.text, r.url)
        dugme = st.nadji_dugme(TEKST_DUGMETA)
        if not dugme:
            raise GreskaPreuzimanja(f"na /rss nije nađeno dugme „{TEKST_DUGMETA}“")
        ime = _iw_ime(dugme)
        polja = st.podaci_forme()
        # 1) submit forme kao da je kliknuto dugme (IntraWeb: IW_Action = ime dugmeta)
        podaci = {**polja, "IW_Action": ime, "IW_ActionParam": ""}
        if dugme.get("name"):
            podaci[dugme["name"]] = dugme.get("value", TEKST_DUGMETA)
        r = self.post(st.action(), "preuzimanje_submit", data=podaci)
        if _je_xml(r.content):
            return r.content
        # 2) asinhroni događaj dugmeta; odgovor može da sadrži URL fajla za preuzimanje
        for url in self._callback_urlovi(st):
            try:
                r = self.post(url, "preuzimanje_callback",
                              params={"callback": f"{ime}.DoOnAsyncClick", "x": 0, "y": 0, "which": 0, "modifiers": ""},
                              data=podaci)
            except requests.RequestException:
                continue
            if _je_xml(r.content):
                return r.content
            for link in re.findall(r"""["'(]([^"'()<>\s]*(?:\$/[^"'()<>\s]+|\.xml)[^"'()<>\s]*)""", r.text):
                rr = self.get(urljoin(r.url, link.replace("&amp;", "&")), "preuzimanje_link")
                if _je_xml(rr.content):
                    return rr.content
        raise GreskaPreuzimanja("klik na „Preuzimanje“ nije vratio XML")

    def preuzmi(self) -> bytes:
        r = self.get(BASE_URL, "glavna")
        st = _Stranica(r.text, r.url)
        poslednja: Exception = GreskaPreuzimanja("nijedan način postavljanja filtera nije pokušan")
        for opis in self.pokusaji_filtera(st):
            try:
                data = self.preuzmi_sa_rss()
                proveri_sadrzaj(data)
                log.info("brza varijanta uspela (filter: %s)", opis)
                return data
            except FilterNijePostavljen as e:
                log.info("filter (%s) nije delovao: %s", opis, e)
                poslednja = e
        raise poslednja

    def istrazi(self) -> None:
        """Snima glavnu stranicu, /rss (pre i posle filtera) i IntraWeb JS fajlove."""
        r = self.get(BASE_URL, "glavna")
        st = _Stranica(r.text, r.url)
        for src in st.skripte:
            try:
                self.get(src, "js_" + re.sub(r"\W+", "_", src.rsplit("/", 1)[-1])[:60])
            except requests.RequestException as e:
                log.warning("JS %s: %s", src, e)
        self.get(BASE_URL + "/rss", "rss_pre_filtera")
        try:
            data = self.preuzmi()
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
            radio = page.locator(f'input[name="ETYPETABLE"][value="{FILTER_BICIKLISTI}"]')
            if radio.count() == 0:
                radio = page.get_by_label("Biciklisti")
            radio.first.check()
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
