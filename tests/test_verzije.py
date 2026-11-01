"""Istorija verzija (docs/data/verzije.json) i polazni spisak zadataka (docs/data/zadaci.json)."""
import json
import re
from pathlib import Path

from sajt.verzije import stavke_iz_tela

KOREN = Path(__file__).resolve().parent.parent
V = json.loads((KOREN / "docs/data/verzije.json").read_text(encoding="utf-8"))
Z = json.loads((KOREN / "docs/data/zadaci.json").read_text(encoding="utf-8"))
VERZIJA = re.search(r'const VERZIJA = "([\d.]+)"', (KOREN / "docs/assets/ljuska.js").read_text(encoding="utf-8")).group(1)


def test_prva_verzija_je_trenutna():
    # svaki commit koji podiže VERZIJA pravi i unos: python -m sajt.verzije --poruka <poruka commit-a>
    assert V["verzije"][0]["verzija"] == VERZIJA


def test_verzije_po_redu_i_potpune():
    brojevi = [tuple(int(x) for x in v["verzija"].split(".")) for v in V["verzije"]]
    assert brojevi == sorted(brojevi, reverse=True) and len(set(brojevi)) == len(brojevi)
    for v in V["verzije"]:
        assert v["naslov"] and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d", v["datum"])
    assert V["pre_verzija"] and all(d["stavke"] for d in V["pre_verzija"])


def test_stavke_iz_tela_poruke():
    telo = "- prva stavka\n  nastavak reda\n  - podstavka\n- verzija 1.1.50\n\nCo-Authored-By: X <x@y>\n"
    assert stavke_iz_tela(telo) == ["prva stavka nastavak reda", "— podstavka"]


def test_zadaci():
    ids = [z["id"] for z in Z["zadaci"]]
    assert len(ids) == len(set(ids)) and all(re.fullmatch(r"ZAH-\d{3}", i) for i in ids)
    for z in Z["zadaci"]:
        assert z["hitnost"] in {"niska", "srednja", "visoka", "hitno"}
        assert z["status"] in {"na_cekanju", "primljeno", "u_izradi", "gotovo"}
        assert z["autor"] and z["naslov"] and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d", z["zatrazeno"])
