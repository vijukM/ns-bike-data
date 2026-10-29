"""Kapija (docs/assets/kapija.js): svaka strana je učitava u <head>, a SO/HES odgovaraju PBKDF2 iz sajt/kapija.py."""
import re

from sajt import kapija as kp

DOCS = kp.KAPIJA.parents[1]


def test_svaka_strana_ucitava_kapiju_pre_sadrzaja():
    for f in DOCS.glob("*.html"):
        if f.name in ("404.html", "403.html"):
            continue
        h = f.read_text(encoding="utf-8")
        i = h.find('<script src="assets/kapija.js')
        assert 0 < i < h.find("</head>"), f.name
        assert '<meta name="robots" content="noindex, nofollow">' in h, f.name


def test_hes_iz_kapije_je_pbkdf2():
    s = kp.KAPIJA.read_text(encoding="utf-8")
    so, h = re.search(r'const SO = "([0-9a-f]{32})"', s)[1], re.search(r'const HES = "([0-9a-f]{64})"', s)[1]
    assert f"PONAVLJANJA = {kp.PONAVLJANJA}".replace("_", "") in s.replace("_", "")
    assert len(kp.hes("bilo šta", bytes.fromhex(so))) == len(h)
