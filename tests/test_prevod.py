"""Prevod na engleski (docs/assets/prevod.js + rečnik docs/assets/i18n/en.js).

- svaka strana učitava prevod.js pre kapija.js (da i kapija bude na engleskom),
- rečnik: ispravan, bez duplih ključeva, ista mesta {n} u srpskom i engleskom tekstu, engleski bez srpskih slova
  (osim u vlastitim imenima koja su i u ključu),
- strane na engleskom (Node + Playwright, ako postoje): obiđu se sve strane dostupne iz menija, uz klikove, prozore
  i oblačiće grafika, i ne sme da ostane nijedan tekst bez prevoda (tests/prevod/obilazak.js).
"""
from __future__ import annotations

import json
import re
import shutil
import socket
import subprocess
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

KOREN = Path(__file__).resolve().parents[1]
DOCS = KOREN / "docs"
RECNIK = DOCS / "assets" / "i18n" / "en.js"
MESTO = re.compile(r"\{(\d+)(?::[^{}|]*\|[^{}]*)?\}")


def recnik() -> list[tuple[str, str]]:
    """Parovi (srpski, engleski) redom kao u fajlu; komentari // i /* */ se preskaču."""
    s = RECNIK.read_text(encoding="utf-8")
    telo = s[s.index("window.PREVOD_EN = {") + len("window.PREVOD_EN = "): s.rindex("}") + 1]
    telo = "\n".join(l for l in telo.splitlines() if not l.lstrip().startswith("//"))
    parovi: list[tuple[str, str]] = []
    json.loads(telo, object_pairs_hook=lambda p: parovi.extend(p) or {})
    return [(k, v) for k, v in parovi if k != "__kraj__"]


def test_strane_ucitavaju_prevod_pre_kapije():
    for f in DOCS.glob("*.html"):
        h = f.read_text(encoding="utf-8")
        i = h.find("assets/prevod.js")
        assert 0 < i < h.find("</head>"), f.name
        k = h.find("assets/kapija.js")
        if k > 0:
            assert i < k, f"{f.name}: prevod.js mora pre kapija.js"


def test_recnik_bez_duplikata_i_praznih():
    parovi = recnik()
    assert len(parovi) > 800
    kljucevi = [k for k, _ in parovi]
    dupli = {k for k in kljucevi if kljucevi.count(k) > 1}
    assert not dupli, dupli
    assert all(v.strip() for _, v in parovi), [k for k, v in parovi if not v.strip()]


def test_ista_mesta_u_oba_teksta():
    lose = []
    for k, v in recnik():
        a = {int(x) for x in MESTO.findall(k)}
        b = {int(x) for x in MESTO.findall(v)}
        if a != b or a != set(range(len(a))):
            lose.append((k, v))
    assert not lose, lose[:5]


def test_engleski_bez_srpskih_slova():
    """Reč sa č, ć, ž, š, đ u prevodu sme samo ako je ista reč i u srpskom (vlastito ime: Mišeluk, Kać…)."""
    lose = []
    for k, v in recnik():
        for rec in re.findall(r"[\wčćžšđČĆŽŠĐ]*[čćžšđČĆŽŠĐ][\wčćžšđČĆŽŠĐ]*", v):
            if rec[: max(4, len(rec) - 2)] not in k:              # padež: Fruška ↔ Frušku
                lose.append((k, v, rec))
    assert not lose, lose[:5]


def test_jezik_u_meniju():
    lj = (DOCS / "assets" / "ljuska.js").read_text(encoding="utf-8")
    assert 'data-jezik="${j}"' in lj and "PREVOD.postavi(j)" in lj


# ---------------------------------------------------------------- obilazak strana na engleskom (Node + Playwright)
def _node_playwright() -> str | None:
    node = shutil.which("node")
    if not node:
        return None
    try:
        koren = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=30).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return koren if (Path(koren) / "playwright").exists() else None


@pytest.mark.skipif(_node_playwright() is None, reason="nema Node + Playwright")
def test_sve_strane_prevedene(tmp_path):
    from sajt.server import Obradjivac

    class Tih(Obradjivac):
        def log_message(self, *a):                      # bez reda za svaki zahtev u izlazu testa
            pass

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Tih, directory=str(DOCS)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        izlaz = tmp_path / "promaseno.json"
        r = subprocess.run(["node", str(KOREN / "tests" / "prevod" / "obilazak.js"), f"http://127.0.0.1:{port}/", str(izlaz)],
                           capture_output=True, text=True, timeout=1800, cwd=KOREN,
                           env={**__import__("os").environ, "NODE_PATH": _node_playwright()})
        assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]
        promaseno = json.loads(izlaz.read_text(encoding="utf-8"))
        assert not promaseno, "\n".join(f"{k!r} — {v['gde']} ({', '.join(v['strane'][:3])})" for k, v in list(promaseno.items())[:40])
    finally:
        srv.shutdown()
