from datetime import date

import numpy as np
import pandas as pd
import pytest

from prognoza_biciklista.obelezja import ucitaj_meteo
from vremenska_prognoza.open_meteo import PROMENLJIVE, oznaka_modela, u_format_treninga, u_utc
from prognoza_biciklista.praznici import is_holiday, pravoslavni_uskrs, praznici


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


def test_cas_je_open_meteo_vreme_plus_1h_i_24():
    # kao u treningu: Open-Meteo T → Cas T + 1 h; T = 23:00 → Cas 24:00 istog dana
    t = [f"2026-10-14T{h:02d}:00" for h in range(24)] + ["2026-10-15T00:00", "2026-10-15T01:00"]
    df = u_format_treninga(odgovor(t))
    r = df[(df["Datum"] == "2026-10-14") & (df["Cas"] == "24:00")].iloc[0]
    assert r["temperatura"] == 23
    r = df[(df["Datum"] == "2026-10-14") & (df["Cas"] == "13:00")].iloc[0]
    assert r["temperatura"] == 12 and r["dan_u_nedelji"] == 3 and r["is_weekend"] == 0 and r["is_holiday"] == 0


def test_dst_jesen_prosek_prolece_interpolacija():
    jesen = ["2026-10-25T01:00", "2026-10-25T02:00", "2026-10-25T02:00", "2026-10-25T03:00"]
    df = u_format_treninga(odgovor(jesen, lambda i: [1.0, 2.0, 4.0, 5.0][i]))
    assert len(df) == 3 and df.loc[df["Cas"] == "03:00", "temperatura"].item() == 3.0
    prolece = ["2027-03-28T01:00", "2027-03-28T03:00"]
    df = u_format_treninga(odgovor(prolece, lambda i: [1.0, 3.0][i]))
    assert len(df) == 3 and df.loc[df["Cas"] == "03:00", "temperatura"].item() == 2.0


def test_izvedena_obelezja_kroz_kod_iz_treninga():
    t = [str(x)[:16].replace(" ", "T") for x in pd.date_range("2026-10-13 00:00", "2026-10-14 23:00", freq="h")]
    o = odgovor(t)
    o["hourly"]["precipitation"] = [0, 0.5, 0.2, 0, 1.0] + [0] * (len(t) - 5)
    o["hourly"]["soil_moisture_0_to_7cm"] = list(range(len(t)))
    m = ucitaj_meteo(u_format_treninga(o), {"vlaznost_zemljista": 24})
    assert m["padavine_pre_1h"].iloc[2] == 0.5 and m["padavine_3h"].iloc[4] == pytest.approx(1.2)
    prvi = m[m["Datum"] == "2026-10-13"]
    assert prvi["padavine_dan"].iloc[0] == pytest.approx(1.7) and prvi["sati_kise_dan"].iloc[0] == 3
    assert np.isnan(m["vlaznost_zemljista"].iloc[23]) and m["vlaznost_zemljista"].iloc[24] == 0
    r = m.iloc[0]                                  # utorak 13.10.2026, Cas 01:00 → h = 0
    assert r["sat_sin"] == 0 and r["sat_cos"] == 1 and r["dan_sin"] == pytest.approx(np.sin(2 * np.pi / 7))


def test_arhiva_i_excel(tmp_path):
    from datetime import datetime, timezone
    from vremenska_prognoza.open_meteo import napravi_excel, sacuvaj_sirovo
    t = [str(x)[:16].replace(" ", "T") for x in pd.date_range("2026-10-13 00:00", "2026-10-15 23:00", freq="h")]
    sacuvaj_sirovo(odgovor(t), datetime(2026, 10, 13, 23, 15, tzinfo=timezone.utc), tmp_path)
    sacuvaj_sirovo(odgovor(t, lambda i: float(i) + 100), datetime(2026, 10, 14, 5, 15, tzinfo=timezone.utc), tmp_path)
    assert (tmp_path / "2026/10/14/0115.json").exists() and (tmp_path / "2026/10/14/0715.json").exists()
    x = pd.read_excel(napravi_excel("2026-10", tmp_path), sheet_name="po_satu")
    assert x[["Datum", "Cas"]].duplicated().sum() == 0 and len(x) == 72
    # za 14.10. 10:00 važi novije izdanje (07:15), za 14.10. 05:00 starije (01:15)
    r = x[(x["Datum"] == "2026-10-14") & (x["Cas"] == "10:00")].iloc[0]
    assert r["izdato_utc"] == "2026-10-14T05:15:00Z"
    r = x[(x["Datum"] == "2026-10-14") & (x["Cas"] == "05:00")].iloc[0]
    assert r["izdato_utc"] == "2026-10-13T23:15:00Z"


def _isti_odgovor_u_utc(lokalna_vremena, vrednost):
    """Isti podaci kao da su traženi sa timezone=GMT (kako se čuvaju od 10/2026)."""
    lok = odgovor(lokalna_vremena, vrednost)
    utc = u_utc(lok)
    o = odgovor([t.strftime("%Y-%m-%dT%H:%M") for t in utc["ts_utc"]], vrednost)
    o["timezone"] = "GMT"
    return lok, o


@pytest.mark.parametrize("dan", ["2026-10-25", "2027-03-28", "2026-10-14"])
def test_utc_cuvanje_daje_isti_format_treninga(dan):
    t = [str(x)[:16].replace(" ", "T") for x in pd.date_range(f"{dan} 00:00", periods=30, freq="h", tz="Europe/Belgrade")
         .tz_localize(None)]
    lok, utc = _isti_odgovor_u_utc(t, lambda i: float(i))
    pd.testing.assert_frame_equal(u_format_treninga(lok), u_format_treninga(utc))


def test_meteo_vreme_utc1_bez_dst_rupa():
    t = [f"2026-10-24T{h:02d}:00" for h in range(22, 24)] + [f"2026-10-25T{h:02d}:00" for h in range(0, 6)]
    o = odgovor(t)
    o["timezone"] = "GMT"
    df = oznaka_modela(u_utc(o), "utc1")
    # UTC 22:00 → UTC+1 23:00 → Cas = 24:00 (kraj sata); svaki sat tačno jednom
    assert df.iloc[0][["Datum", "Cas"]].tolist() == ["2026-10-24", "24:00"]
    assert len(df) == len(t) and df["temperatura"].tolist() == [float(i) for i in range(len(t))]
    with pytest.raises(ValueError):
        oznaka_modela(u_utc(o), "utc")
