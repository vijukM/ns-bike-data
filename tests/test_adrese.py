"""Linkovi između strana sajta su bez .html (nasicu.rs/mapa, ne nasicu.rs/mapa.html)."""
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
STRANE = sorted(p.stem for p in DOCS.glob("*.html"))
RE_LINK = re.compile(r"(?<![\w./-])/?(" + "|".join(map(re.escape, STRANE)) + r")\.html(?=[?#\"'`]|$)")


def test_linkovi_bez_html():
    fajlovi = [*DOCS.glob("*.html"), *(p for p in (DOCS / "assets").glob("*.js"))]
    losi = [f"{f.name}: {m.group(0)}" for f in fajlovi for m in RE_LINK.finditer(f.read_text(encoding="utf-8"))]
    assert not losi, losi


def test_lokalni_server_otvara_adrese_bez_html():
    from sajt.server import Obradjivac
    o = Obradjivac.__new__(Obradjivac)
    o.directory = str(DOCS)
    assert o.translate_path("/mapa").endswith("mapa.html")
    assert o.translate_path("/stanica?id=23a").endswith("stanica.html")
    assert o.translate_path("/assets/stil.css").endswith("stil.css")
