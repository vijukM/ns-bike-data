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
