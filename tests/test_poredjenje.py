"""Poređenja prognoza i stvarnog: vremenska prognoza (izvori) i prognoza biciklista."""
import numpy as np
import pandas as pd

from prognoza_biciklista.poredjenje import prozor, rezime_dana
from vremenska_prognoza.izvori import u_tabelu


def test_met_norway_u_open_meteo_konvenciju():
    o = {"properties": {"timeseries": [
        {"time": "2026-10-14T10:00:00Z", "data": {"instant": {"details": {"air_temperature": 15.0, "relative_humidity": 60,
         "wind_speed": 2.0, "cloud_area_fraction": 50}}, "next_1_hours": {"details": {"precipitation_amount": 0.4}}}},
        {"time": "2026-10-14T11:00:00Z", "data": {"instant": {"details": {"air_temperature": 16.0, "relative_humidity": 55,
         "wind_speed": 3.0, "cloud_area_fraction": 40}}, "next_1_hours": {"details": {"precipitation_amount": 0.0}}}}]}}
    t = u_tabelu("met_norway", o).set_index("vreme_lokalno")
    assert t.loc[pd.Timestamp("2026-10-14 12:00"), "temperatura"] == 15.0          # 10 UTC = 12 lokalno (CEST)
    assert t.loc[pd.Timestamp("2026-10-14 12:00"), "brzina_vetra"] == 7.2          # m/s → km/h
    assert t.loc[pd.Timestamp("2026-10-14 13:00"), "padavine"] == 0.4              # sat 12–13 → kraj 13:00


def test_open_meteo_tabela():
    o = {"hourly": {"time": ["2026-10-14T00:00", "2026-10-14T01:00"], "temperature_2m": [10, 11],
                    "relative_humidity_2m": [80, 81], "wind_speed_10m": [5, 6], "cloud_cover": [10, 20],
                    "precipitation": [0, 0.2], "shortwave_radiation": [0, 0]}}
    t = u_tabelu("open_meteo_icon_d2", o)
    assert list(t.columns) == ["vreme_lokalno", "temperatura", "vlaznost", "brzina_vetra", "oblacnost", "padavine",
                               "insolacija"]


def test_prozori_ocene():
    assert prozor("2026-10-16") == "pre_ocene" and prozor("2026-10-17") == "probni" and prozor("2026-11-08") == "glavni"


def test_rezime_dana_i_neobicne_stanice():
    redovi = []
    for st in ["a", "b", "c", "d"]:
        for sat in range(1, 25):
            y = 50.0
            van = st != "d" and 7 <= sat <= 14          # a, b, c: 8 dnevnih sati van intervala
            redovi.append({"datum": "2026-10-20", "sat": sat, "stanica_id": st, "vrsta": "zvanicna", "razlog_A": "ok",
                           "stvarno": y, "prognoza": 40.0, "naive_t168": 60.0,
                           "u_intervalu": 0.0 if van else 1.0})
    r = rezime_dana(pd.DataFrame(redovi))
    assert r["prozor"] == "probni" and r["n"] == 96 and r["RMSE"] == 10 and r["bias"] == -10
    assert r["RMSE_naive"] == 10 and r["neobicne_stanice"] == "a b c" and r["gradski_dogadjaj"]
    assert np.isclose(r["pokrivenost_%"], 100 * (1 - 24 / 96))
