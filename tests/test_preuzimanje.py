from scraper import preuzimanje


def test_pokusaji_posle_3_i_6_min(monkeypatch):
    sat = {"t": 1000.0}
    monkeypatch.setattr(preuzimanje.time, "time", lambda: sat["t"])
    monkeypatch.setattr(preuzimanje.time, "sleep", lambda s: sat.__setitem__("t", sat["t"] + s))
    pozivi = []

    def brzo():
        pozivi.append(sat["t"] - 1000)
        if len(pozivi) < 3:
            raise preuzimanje.GreskaPreuzimanja("500")
        return b"ok"

    monkeypatch.setattr(preuzimanje, "preuzmi_direktno", lambda: (_ for _ in ()).throw(RuntimeError("404")))
    monkeypatch.setattr(preuzimanje, "preuzmi_brzo", brzo)
    assert preuzimanje.preuzmi_bicikliste("brza", (0, 180, 360), pocetak=1000.0) == b"ok"
    assert pozivi == [0, 180, 360]


def test_svi_pokusaji_neuspesni(monkeypatch):
    monkeypatch.setattr(preuzimanje.time, "sleep", lambda s: None)
    monkeypatch.setattr(preuzimanje, "preuzmi_direktno", lambda: (_ for _ in ()).throw(RuntimeError("x")))
    monkeypatch.setattr(preuzimanje, "preuzmi_brzo", lambda: (_ for _ in ()).throw(RuntimeError("x")))
    import pytest
    with pytest.raises(preuzimanje.GreskaPreuzimanja, match=r"\+180 s.*\+360 s"):
        preuzimanje.preuzmi_bicikliste("brza", (0, 180, 360))


def test_direktno_prvo_bez_sesije(monkeypatch):
    """Javni fajl (jedan GET) ima prednost; sesija i pregledač se ne pokreću ako on uspe."""
    monkeypatch.setattr(preuzimanje, "preuzmi_direktno", lambda: b"direktno")
    monkeypatch.setattr(preuzimanje, "preuzmi_brzo", lambda: (_ for _ in ()).throw(AssertionError("sesija ne treba")))
    monkeypatch.setattr(preuzimanje, "preuzmi_pregledacem", lambda: (_ for _ in ()).throw(AssertionError("pregledač ne treba")))
    assert preuzimanje.preuzmi_bicikliste("auto", (0,)) == b"direktno"
    assert preuzimanje.preuzmi_bicikliste("brza", (0,)) == b"direktno"


def test_direktno_proverava_sadrzaj(monkeypatch):
    class Odgovor:
        content = b'<?xml version="1.0"?><feed><entry><counters:volume>1</counters:volume></entry></feed>'
        def raise_for_status(self):
            pass
    monkeypatch.setattr(preuzimanje.requests, "get", lambda *a, **k: Odgovor())
    import pytest
    with pytest.raises(preuzimanje.FajlSaVozilima):
        preuzimanje.preuzmi_direktno()
