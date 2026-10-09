from datetime import datetime, timezone

from scraper import citaj, konfig
from scraper.razlika import izracunaj, prethodno_citanje
from tests.test_struktura import PRIMER


def red(datum, vreme, danas, juce=500, state="1", t="2026-10-09T19:02:27Z"):
    return {"vreme_citanja_utc": t, "locationID": "26NS", "direction": "11", "directionDesc": "A",
            "datum_brojaca": datum, "vreme_brojaca": vreme, "danas": str(danas), "juce": str(juce), "state": state}


def test_isti_dan():
    r = izracunaj(red("2026-10-09", "21:00:20", 1244), red("2026-10-09", "20:00:00", 1189))
    assert r["bicikala_od_prethodnog"] == 55 and r["minuta_od_prethodnog"] == 60 and r["razlog_razlike"] == ""


def test_preko_ponoci():
    # 23:05 danas=1300; 00:05 sledećeg dana danas=12, juče=1340 -> 40 do ponoći + 12 posle
    r = izracunaj(red("2026-10-10", "00:05:00", 12, juce=1340), red("2026-10-09", "23:05:00", 1300))
    assert r["bicikala_od_prethodnog"] == 52 and r["minuta_od_prethodnog"] == 60


def test_kvar_negativno_prvo():
    assert izracunaj(red("2026-10-09", "21:00", 0, state="6"), red("2026-10-09", "20:00", 0))["razlog_razlike"] \
        == "kvar_state_6"
    assert izracunaj(red("2026-10-09", "21:00", 5), red("2026-10-09", "20:00", 90))["razlog_razlike"] \
        == "negativna_razlika"
    assert izracunaj(red("2026-10-09", "21:00", 5), None)["razlog_razlike"] == "nema_prethodnog"


def test_sacuvaj_upisuje_razliku(tmp_path, monkeypatch):
    monkeypatch.setattr(konfig, "PODACI", tmp_path)
    data = PRIMER.read_bytes()
    t1 = datetime(2026, 10, 9, 11, 8, tzinfo=timezone.utc)
    citaj.sacuvaj(data, t1)
    # isti fajl sat kasnije: brojač isti -> razlika 0 za smerove u stanju 1
    p, _, _ = citaj.sacuvaj(data, t1.replace(hour=12))
    redovi = prethodno_citanje("2026-10-09T13:00:00Z")
    assert len(redovi) == 57 and redovi[0]["prethodno_citanje_utc"] == "2026-10-09T11:08:00Z"
    vrednosti = {r["razlog_razlike"] or r["bicikala_od_prethodnog"] for r in redovi}
    assert vrednosti == {"0", "kvar_state_6"}
