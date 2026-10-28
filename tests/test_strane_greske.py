"""Strane greške (sajt/strane_greske.py): ugrađen NaSicu logo, apsolutne adrese ikonica, isti naslov taba."""
from sajt import strane_greske as sg


def test_404_i_403():
    for kod in (404, 403):
        h = sg.strana(kod)
        assert "<title>NaSicu</title>" in h and f'<div class="broj">{kod}</div>' in h
        assert '<svg class="logo"' in h and 'id="natpis"' in h and "<?xml" not in h
        assert 'href="/assets/slike/brend/NaSicu_ikonica_NS.svg"' in h
        assert 'x="1214.0"' in h                                    # dodatna crtica staze za pomeranje linije


def test_generisane_strane_su_azurne():
    for kod in (404, 403):
        assert (sg.DOCS / f"{kod}.html").read_text(encoding="utf-8") == sg.strana(kod)
