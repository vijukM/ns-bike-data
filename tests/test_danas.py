"""Strana „Danas uživo“ (sajt/danas.py): satni nizovi iz čitanja, null umesto 0, DST, stanja i prognoza po lokalnom satu."""
from datetime import date, datetime, timezone

import pandas as pd

from sajt import danas


def citanje(koren, utc: str, redovi: list[dict]):
    t = pd.Timestamp(utc, tz="UTC")
    lok = t.tz_convert("Europe/Belgrade")
    folder = koren / f"{lok:%Y}" / f"{lok:%m}" / f"{lok:%d}"
    folder.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame([{"vreme_citanja_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "datum_brojaca": "2026-10-20",
                        "juce": 100, "ove_godine": 5000, "state": 1, **r} for r in redovi])
    df.to_csv(folder / f"{lok:%H%M}.csv", index=False)


def test_sati_dana_dst():
    assert len(danas.sati_dana(date(2026, 10, 20))) == 24
    assert len(danas.sati_dana(date(2026, 10, 25))) == 25          # zimsko vreme: 02 h dva puta
    assert len(danas.sati_dana(date(2027, 3, 28))) == 23
    assert danas.oznake(danas.sati_dana(date(2026, 10, 25)))[:4] == ["00", "01", "02", "02"]


def test_satni_nizovi_null_i_stanja(tmp_path):
    # leto (CEST): čitanje u 01:02 lokalno = 23:02 UTC; vreme brojača ~00:56 → kraj sata 01:00
    for utc, brojac, a1, a2, b, st2 in [("2026-10-19 23:02:30", "00:56:10", 5, 3, 0, 1),
                                         ("2026-10-20 00:02:30", "01:56:10", 9, 4, 0, 0),    # smer 2: nema podataka
                                         ("2026-10-20 01:02:30", "02:55:50", 12, 6, 0, 1),
                                         ("2026-10-20 02:02:30", "03:56:00", 20, 9, 0, 1)]:
        citanje(tmp_path, utc, [
            {"serija": "a", "direction": "1", "vreme_brojaca": brojac, "danas": a1},
            {"serija": "a", "direction": "2", "vreme_brojaca": brojac, "danas": a2, "state": st2},
            {"serija": "28", "direction": "1", "vreme_brojaca": brojac, "danas": b},
            {"serija": "c", "direction": "1", "vreme_brojaca": "01:40:00", "danas": 7}])        # kasni
    d = danas.napravi(datetime(2026, 10, 20, 2, 5, tzinfo=timezone.utc), tmp_path)
    a = d["serije"]["a"]["sati"]
    # 00–01: 5+3; 01–02 i 02–03: smer 2 bez podataka na kraju 02:00 → null (ne 0); 03–04: (20+9) − (12+6)
    assert a[:4] == [8, None, None, 11] and a[4:] == [None] * 20
    assert d["serije"]["a"]["danas"] == 29 and d["serije"]["a"]["stanje"] == "radi"
    assert d["serije"]["28"]["stanje"] == "neispravan" and d["serije"]["c"]["stanje"] == "kasni"
    assert d["grad"][0] == 8 + 0 and d["grad"][1] is None                 # 28 (neispravan) ne ulazi u grad
    assert d["sati_gotovo"] == 4 and d["citanje_lokalno"] == "04:02" and len(d["sati"]) == 24


def test_prognoza_po_lokalnom_satu_bez_starog_modela(tmp_path):
    zv = tmp_path / "zvanicne"
    zv.mkdir()
    # oznaka modela: ts = kraj sata UTC+1; 08:00 UTC+1 = 07:00 UTC kraj = 06–07 UTC = 08–09 lokalno (CEST)
    pd.DataFrame({"stanica_id": ["a", "a", "b"], "ts": pd.to_datetime(["2026-10-20 08:00", "2026-10-20 09:00", "2026-10-20 08:00"]),
                  "pred": [10.0, 20.0, 5.0], "q10": [1.0, 2.0, 1.0], "q90": [30.0, 40.0, 9.0],
                  "izdato_utc": "2026-10-19T23:03:00Z", "verzija_modela": "E31 (…)"}).to_parquet(zv / "2026-10-20.parquet")
    pd.DataFrame({"stanica_id": ["a"], "ts": pd.to_datetime(["2026-10-20 10:00"]), "pred": [99.0], "q10": [0.0], "q90": [0.0],
                  "izdato_utc": "2026-10-19T23:03:00Z", "verzija_modela": "E28 (…)"}).to_parquet(zv / "2026-10-19.parquet")
    p = danas.prognoze(date(2026, 10, 20), danas.sati_dana(date(2026, 10, 20)), tmp_path)["zvanicna"]
    assert p["grad"]["pred"][8] == 15.0 and p["grad"]["pred"][9] == 20.0 and p["serije"]["a"][8] == 10.0
    assert p["grad"]["pred"][10] is None                                   # E28 se ne prikazuje


def test_zvanicna_dopuna_samo_iz_ranijeg_izdanja(tmp_path):
    # leti: lokalni sat 00–01 dana D = sat 24 modela za D−1 (ts D 00:00 UTC+1); zvanična za D−1 ne postoji
    zv = tmp_path / "zvanicne"; zv.mkdir()
    pd.DataFrame({"stanica_id": ["a"], "ts": pd.to_datetime(["2026-10-22 02:00"]), "pred": [5.0], "q10": [1.0], "q90": [9.0],
                  "izdato_utc": "2026-10-21T23:03:00Z", "verzija_modela": "E31"}).to_parquet(zv / "2026-10-22.parquet")
    f = tmp_path / "2026" / "10" / "21"; f.mkdir(parents=True)
    pd.DataFrame({"stanica_id": ["a"], "ts": pd.to_datetime(["2026-10-22 00:00"]), "pred": [27.0], "q10": [1.0], "q90": [40.0],
                  "izdato_utc": "2026-10-21T17:03:00Z", "verzija_modela": "E31"}).to_parquet(f / "2026-10-21_1903_osvezavanje.parquet")
    g = tmp_path / "2026" / "10" / "22"; g.mkdir(parents=True)
    pd.DataFrame({"stanica_id": ["a"], "ts": pd.to_datetime(["2026-10-22 03:00"]), "pred": [99.0], "q10": [1.0], "q90": [99.0],
                  "izdato_utc": "2026-10-22T05:03:00Z", "verzija_modela": "E31"}).to_parquet(g / "2026-10-22_0703_osvezavanje.parquet")
    p = danas.prognoze(date(2026, 10, 22), danas.sati_dana(date(2026, 10, 22)), tmp_path)["zvanicna"]
    # ts 00:00 UTC+1 → lokalno 00–01 (indeks 0), 02:00 → 02–03 (2), 03:00 → 03–04 (3)
    assert p["serije"]["a"][0] == 27.0 and p["serije"]["a"][2] == 5.0 and p["dopunjeni_sati"] == [0]
    assert p["serije"]["a"][3] is None          # izdanje u 07:03 je posle početka sata 03–04 → ne sme u zvaničnu


def test_poslednji_sat_iz_juce_kad_brojac_predje_u_novi_dan(tmp_path):
    # čitanje u 00:05 zatekne brojač već u novom danu (danas 0): zbir dana je u „juče“ → sat 23–24 nije prazan
    citanje(tmp_path, "2026-10-20 21:02:30", [{"serija": "a", "direction": "1", "vreme_brojaca": "22:56:00", "danas": 50}])
    citanje(tmp_path, "2026-10-20 22:05:10", [{"serija": "a", "direction": "1", "vreme_brojaca": "00:01:30", "danas": 0,
                                               "datum_brojaca": "2026-10-21", "juce": 58}])
    c = danas.citanja_dana(date(2026, 10, 20), tmp_path)
    s = danas.satno_danas(c, danas.sati_dana(date(2026, 10, 20)))
    assert s["a"][23] == 8
