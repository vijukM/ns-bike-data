"""Dnevnik čitanja: scraper upisuje pokretanja (podaci/biciklisti/pokretanja.csv), a sajt.citanja pravi pregled po satima."""
import csv
from datetime import date, datetime, timezone

from sajt import citanja
from scraper import citaj, konfig
from tests.test_struktura import PRIMER


def _citaj_u(t_utc):
    citaj.sacuvaj(PRIMER.read_bytes(), t_utc)


def test_pokretanje_se_upisuje_i_rezerva_se_preskace(tmp_path, monkeypatch):
    monkeypatch.setattr(konfig, "PODACI", tmp_path)
    monkeypatch.setattr(konfig, "GRESKE_LOG", tmp_path / "greske.log")
    monkeypatch.setattr(konfig, "POKRETANJA_LOG", tmp_path / "pokretanja.csv")
    monkeypatch.setattr(citaj, "preuzmi_bicikliste", lambda *a, **k: PRIMER.read_bytes())
    izlaz = tmp_path / "gh_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(izlaz))
    monkeypatch.setenv("GITHUB_EVENT_NAME", "workflow_dispatch")
    assert citaj.main(["--metod", "brza"]) == 0
    with open(tmp_path / "pokretanja.csv", encoding="utf-8") as f:
        r = list(csv.DictReader(f))
    assert len(r) == 1 and r[0]["okidac"] == "cron-job.org" and r[0]["ishod"] == "procitano" and r[0]["fajl"].count("/") == 3
    # rezerva u istom satu: preskače, ne upisuje pokretanje i javlja preskoceno=true (workflow tada ne pravi commit)
    monkeypatch.setenv("GITHUB_EVENT_NAME", "schedule")
    sada = datetime.now(timezone.utc)
    if sada.minute >= 10:
        assert citaj.main(["--metod", "brza", "--samo-ako-nema"]) == 0
        assert "preskoceno=true" in izlaz.read_text()
        assert len((tmp_path / "pokretanja.csv").read_text().strip().splitlines()) == 2   # zaglavlje + 1


def test_pregled_po_satima(tmp_path, monkeypatch):
    monkeypatch.setattr(konfig, "PODACI", tmp_path)
    # 14. 10. (letnje vreme, UTC+2): čitanja u 08:02 i 09:02, sat 10 bez čitanja (greška), 11:14 kasno, 12:05 ponovni pokušaj
    for h, m in [(6, 2), (7, 2), (9, 14), (10, 5)]:
        _citaj_u(datetime(2026, 10, 14, h, m, 30, tzinfo=timezone.utc))
    (tmp_path / "greske.log").write_text("2026-10-14T08:02:24Z\tmetod=brza\tGreskaPreuzimanja: brza: HTTPError 500\n", encoding="utf-8")
    kada = dict(danas=date(2026, 10, 15), sada_utc=datetime(2026, 10, 15, 10, tzinfo=timezone.utc))
    # probni fajl je od 9. 10, pa je izvor „star“ u svakom satu
    assert all("izvor" in s["p"] for s in citanja.napravi(tmp_path, **kada)["dani"][0]["sati"] if s["c"])
    monkeypatch.setattr(citanja, "STAR_IZVOR_MIN", 10**9)
    r = citanja.napravi(tmp_path, **kada)
    d = r["dani"][0]
    assert d["datum"] == "2026-10-14" and d["citanja"] == 4
    sati = {s["h"]: s for s in d["sati"]}
    assert sati[8]["p"] == [] and sati[8]["c"][0]["m"] == 2 and sati[8]["c"][0]["okidac"] == "cron-job.org?"
    assert set(sati[10]["p"]) == {"nema", "greska"} and sati[10]["g"][0]["metod"] == "brza"
    assert sati[11]["p"] == ["kasno"] and sati[12]["p"] == ["ponovo"]
    assert all(sati[h].get("van") for h in range(8))                         # prvi dan: pre prvog čitanja se ne računa
    assert sati[13]["p"] == ["nema"] and d["nepravilnosti"] == 3 + 11       # 10, 11, 12 i 13–23
    assert r["poslednje"]["f"] == "1205"


def test_promena_na_zimsko_vreme(tmp_path, monkeypatch):
    monkeypatch.setattr(konfig, "PODACI", tmp_path)
    # 25. 10. 2026: 02:02 letnje (00:02 UTC) i 02:02 zimsko (01:02 UTC) — dva čitanja u istom lokalnom satu su ispravna
    _citaj_u(datetime(2026, 10, 25, 0, 2, tzinfo=timezone.utc))
    _citaj_u(datetime(2026, 10, 25, 1, 2, tzinfo=timezone.utc))
    r = citanja.napravi(tmp_path, danas=date(2026, 10, 25), sada_utc=datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc))
    s = r["dani"][0]["sati"][2]
    assert len(s["c"]) == 2 and s["p"] == [] and "zimsko" in s["napomena"]
