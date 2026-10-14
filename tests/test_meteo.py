from datetime import date

import numpy as np
import pandas as pd
import pytest

from prognoza.meteo import PROMENLJIVE, obradi
from prognoza.praznici import is_holiday, pravoslavni_uskrs, praznici


@pytest.mark.parametrize("g, d", [(2021, date(2021, 5, 2)), (2022, date(2022, 4, 24)), (2023, date(2023, 4, 16)),
                                  (2024, date(2024, 5, 5)), (2025, date(2025, 4, 20)), (2026, date(2026, 4, 12))])
def test_pravoslavni_uskrs(g, d):
    assert pravoslavni_uskrs(g) == d


def test_praznici_2025():
    assert praznici(2025) == {date(2025, 1, 1), date(2025, 1, 2), date(2025, 1, 7), date(2025, 2, 15),
                              date(2025, 2, 16), date(2025, 2, 17),  # 16.2. nedelja → 17.2.
                              date(2025, 4, 18), date(2025, 4, 19), date(2025, 4, 20), date(2025, 4, 21),
                              date(2025, 5, 1), date(2025, 5, 2), date(2025, 11, 11)}


def test_nedelja_pomera_na_radni_dan():
    assert is_holiday(date(2023, 1, 3))      # 1.1.2023 nedelja
    assert is_holiday(date(2026, 2, 17))     # 15.2.2026 nedelja
    assert not is_holiday(date(2026, 10, 14))


def odgovor(vremena, vrednost=lambda i: float(i)):
    n = len(vremena)
    return {"hourly": {"time": vremena, **{om: [vrednost(i) for i in range(n)] for om in PROMENLJIVE.values()}}}


def test_kraj_sata_i_24():
    t = [f"2026-10-14T{h:02d}:00" for h in range(24)] + ["2026-10-15T00:00", "2026-10-15T01:00"]
    df = obradi(odgovor(t))
    r = df[df["ts"] == pd.Timestamp("2026-10-15 00:00")].iloc[0]
    assert r["Datum"] == pd.Timestamp("2026-10-14") and r["Cas"] == "24:00" and r["sat"] == 24
    r = df[df["ts"] == pd.Timestamp("2026-10-14 13:00")].iloc[0]
    assert r["Cas"] == "13:00" and r["temperatura"] == 13


def test_dst_jesen_prosek_prolece_interpolacija():
    jesen = ["2026-10-25T01:00", "2026-10-25T02:00", "2026-10-25T02:00", "2026-10-25T03:00"]
    df = obradi(odgovor(jesen, lambda i: [1.0, 2.0, 4.0, 5.0][i]))
    assert len(df) == 3 and df.loc[df["Cas"] == "02:00", "temperatura"].item() == 3.0
    prolece = ["2027-03-28T01:00", "2027-03-28T03:00"]
    df = obradi(odgovor(prolece, lambda i: [1.0, 3.0][i]))
    assert len(df) == 3 and df.loc[df["Cas"] == "02:00", "temperatura"].item() == 2.0


def test_izvedena_obelezja():
    t = [str(x)[:16].replace(" ", "T") for x in pd.date_range("2026-10-13 01:00", "2026-10-15 00:00", freq="h")]
    padavine = [0, 0.5, 0.2, 0, 1.0] + [0] * (len(t) - 5)
    o = odgovor(t)
    o["hourly"]["precipitation"] = padavine
    o["hourly"]["soil_moisture_0_to_7cm"] = list(range(len(t)))
    df = obradi(o)
    assert df["padavine_pre_1h"].iloc[2] == 0.5
    assert df["padavine_3h"].iloc[4] == pytest.approx(1.2)
    prvi = df[df["Datum"] == pd.Timestamp("2026-10-13")]
    assert prvi["padavine_dan"].iloc[0] == pytest.approx(1.7) and prvi["sati_kise_dan"].iloc[0] == 3
    assert np.isnan(df["vlaznost_zemljista"].iloc[23]) and df["vlaznost_zemljista"].iloc[24] == 0
    r = df[df["Cas"] == "01:00"].iloc[0]          # utorak 13.10.2026, sat 1 → h = 0
    assert r["sat_sin"] == 0 and r["sat_cos"] == 1 and r["dan_sin"] == pytest.approx(np.sin(2 * np.pi / 7))
    assert r["is_weekend"] == 0 and r["is_holiday"] == 0
    assert r["trend"] == pytest.approx((pd.Timestamp("2026-10-13") - pd.Timestamp("2021-01-01")).days / 365.25)
