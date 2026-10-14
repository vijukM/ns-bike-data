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

    monkeypatch.setattr(preuzimanje, "preuzmi_brzo", brzo)
    assert preuzimanje.preuzmi_bicikliste("brza", (0, 180, 360), pocetak=1000.0) == b"ok"
    assert pozivi == [0, 180, 360]


def test_svi_pokusaji_neuspesni(monkeypatch):
    monkeypatch.setattr(preuzimanje.time, "sleep", lambda s: None)
    monkeypatch.setattr(preuzimanje, "preuzmi_brzo", lambda: (_ for _ in ()).throw(RuntimeError("x")))
    import pytest
    with pytest.raises(preuzimanje.GreskaPreuzimanja, match=r"\+180 s.*\+360 s"):
        preuzimanje.preuzmi_bicikliste("brza", (0, 180, 360))
