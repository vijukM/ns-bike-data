import pandas as pd

from scraper.anomalije import oznaci


def dan(vrednosti, datum="2026-10-10"):
    n = len(vrednosti)
    return pd.DataFrame({"ts_utc": pd.date_range(f"{datum} 00:00", periods=n, freq="h", tz="UTC"),
                         "datum": datum, "sat": range(1, n + 1), "y": vrednosti})


def test_obican_dan_bez_oznaka():
    y = [1, 0, 0, 0, 0, 2, 10, 40, 60, 50, 45, 50, 55, 60, 70, 80, 90, 70, 50, 30, 20, 10, 5, 2]
    assert oznaci(dan(y)).isna().all()


def test_nula_dan():
    assert (oznaci(dan([0] * 24)) == "nula_dan").all()


def test_nula_niz_danju():
    y = [1, 0, 0, 0, 0, 2, 10, 40, 60, 0, 0, 0, 55, 60, 70, 80, 90, 70, 50, 30, 20, 10, 5, 2]
    o = oznaci(dan(y))
    assert o[o.notna()].index.tolist() == [9, 10, 11] and set(o.dropna()) == {"nula_niz"}


def test_skok():
    y = [1, 0, 0, 0, 0, 2, 10, 40, 60, 50, 45, 300, 55, 60, 70, 80, 90, 70, 50, 30, 20, 10, 5, 2]
    o = oznaci(dan(y))
    assert o.dropna().to_dict() == {11: "skok"}
