"""„Dan na mapi“ posle istorije (sajt/sati_novi.py): format kao istorija, lokalni sati, prazni dani."""
import json

import pandas as pd

from sajt import sati_novi


def test_mesec_iz_satnog_obracuna(tmp_path):
    koren, izlaz = tmp_path / "podaci", tmp_path / "izlaz"
    (koren / "2026" / "10").mkdir(parents=True)
    # 19.10. lokalni sat 07–08 (CEST) = UTC 05–06 → kraj sata ts_utc 06:00
    pd.DataFrame({"stanica_id": ["34a", "34a", "28"], "ts_utc": pd.to_datetime(["2026-10-19 06:00", "2026-10-19 07:00", "2026-10-19 06:00"], utc=True),
                  "y_A": [108.0, None, 5.0], "razlog_A": ["ok", "nema_citanja", "ok"]}).to_parquet(koren / "2026" / "10" / "satno_2026-10.parquet")
    sati_novi.napravi(koren, izlaz)
    m = json.loads((izlaz / "sati" / "2026-10.json").read_text())
    _, i0, n = next(x for x in m["dani"] if x[0] == "2026-10-19")
    assert n == 24 and m["v"]["34a"][i0 + 7] == 108 and m["v"]["34a"][i0 + 8] is None
    kod = next(k for a, d, k in m["r"]["28"] if a <= i0 + 7 < a + d)
    assert m["v"]["28"][i0 + 7] is None and kod == 8                           # 28: brojač neispravan
    sep = json.loads((izlaz / "sati" / "2026-09.json").read_text())
    assert sep["v"] == {} and len(sep["dani"]) == 30
    d = json.loads((izlaz / "sati_dostupno.json").read_text())
    assert d["do"] == "2026-10-19" and "2026-09-15" in d["prazni_dani"] and "2026-10-19" not in d["prazni_dani"]


def test_dnevno_novo_i_vreme(tmp_path):
    """Posle istorije: dnevni zbir samo za kompletan dan, grad = zbir i broj takvih serija, satno vreme iz izmerenog."""
    koren, izlaz, vreme = tmp_path / "podaci", tmp_path / "izlaz", tmp_path / "vreme"
    (koren / "2026" / "10").mkdir(parents=True)
    # 20.10. (CEST): 34a ima svih 24 sata po 10, 15a samo jedan sat
    ts = pd.date_range("2026-10-19 23:00", periods=24, freq="h", tz="UTC")       # kraj sata 00–24 lokalno
    redovi = pd.DataFrame({"stanica_id": "34a", "ts_utc": ts, "y_A": 10.0, "razlog_A": "ok"})
    jedan = pd.DataFrame({"stanica_id": ["15a"], "ts_utc": [ts[8]], "y_A": [7.0], "razlog_A": ["ok"]})
    pd.concat([redovi, jedan]).to_parquet(koren / "2026" / "10" / "satno_2026-10.parquet")
    (vreme / "2026" / "10").mkdir(parents=True)
    sati = [f"2026-10-20T{h:02d}:00" for h in range(24)]
    (vreme / "2026" / "10" / "2026-10-20.json").write_text(json.dumps({"odgovor": {"hourly": {
        "time": sati, "temperature_2m": [10.0 + h / 2 for h in range(24)], "precipitation": [0.5 if h == 7 else 0.0 for h in range(24)]}}}))
    sati_novi.napravi(koren, izlaz, vreme)
    d = json.loads((izlaz / "dnevno_novo.json").read_text())
    j = d["serije"]["34a"]["v"].__len__() - 1
    assert d["do"] == "2026-10-20" and d["od"] == "2026-09-01"
    assert d["serije"]["34a"]["v"][j] == 240 and d["serije"]["15a"]["v"][j] is None and d["serije"]["15a"]["h"][j] == 1
    assert d["grad"]["v"][j] == 240 and d["grad"]["n"][j] == 1 and d["grad"]["postoji"][j] == 2
    assert d["vreme"]["tmin"][j] == 10.0 and d["vreme"]["tmax"][j] == 21.5 and d["vreme"]["pad"][j] == 0.5
    m = json.loads((izlaz / "meteo_sati" / "2026-10.json").read_text())
    sat = json.loads((izlaz / "sati" / "2026-10.json").read_text())
    _, i0, _ = next(x for x in sat["dani"] if x[0] == "2026-10-20")
    assert m["temp"][i0 + 7] == 13.5 and m["pad"][i0 + 7] == 0.5 and len(m["temp"]) == sat["n"]
