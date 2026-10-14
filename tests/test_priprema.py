"""Pravila čišćenja novih sati (prognoza/priprema.py) na veštačkim podacima."""
import numpy as np
import pandas as pd

from prognoza.priprema import STARI_DVOSMERNI, pripremi

PROFIL = np.array([1, 0, 0, 0, 0, 2, 10, 40, 60, 50, 45, 50, 55, 60, 70, 80, 90, 70, 50, 30, 20, 10, 5, 2], float)


def serija(st, od, do, profil=PROFIL, faktor=1.0):
    ts = pd.date_range(od, do, freq="h")
    sat = (ts - pd.Timedelta(hours=1)).hour  # 0..23 = sat-1
    return pd.DataFrame({"stanica_id": st, "ts": ts, "y_A": profil[sat] * faktor, "razlog_A": "ok"})


def p90_konst(stanice, vrednost=60.0):
    return pd.DataFrame([(s, h, m, vrednost) for s in stanice for h in range(0, 24) for m in range(1, 13)],
                        columns=["stanica_id", "sat_pocetak", "mesec", "p90"])


IST_DO = "2026-08-31 23:00"


def osnovno(stanice=("15a",)):
    ist = pd.concat([serija(s, "2026-08-01 01:00", "2026-09-01 00:00") for s in stanice])
    novo = pd.concat([serija(s, "2026-10-09 01:00", "2026-10-15 00:00") for s in stanice])
    return ist, novo


def pokreni(ist, novo, smerovi=None, stanice=("15a",)):
    return pripremi(ist, novo, smerovi if smerovi is not None else pd.DataFrame(), p90_konst(stanice))


def test_rupa_i_istorija_nepromenjena():
    ist, novo = osnovno()
    df, izv = pokreni(ist, novo)
    rupa = df[(df["ts"] > "2026-09-01 00:00") & (df["ts"] < "2026-10-09 01:00")]
    assert len(rupa) == 38 * 24 and rupa["y_A"].isna().all() and set(rupa["razlog_A"]) == {"nema_reda"}
    assert df["ts"].is_monotonic_increasing and df["ts"].diff().dropna().eq(pd.Timedelta(hours=1)).all()
    pd.testing.assert_frame_equal(df[df["ts"] <= "2026-09-01 00:00"].reset_index(drop=True),
                                  ist.reset_index(drop=True), check_dtype=False)
    assert set(df.loc[df["ts"] >= "2026-10-09 01:00", "razlog_A"]) == {"ok"}


def test_outlier():
    ist, novo = osnovno()
    novo.loc[novo["ts"] == "2026-10-10 17:00", "y_A"] = 450
    df, izv = pokreni(ist, novo)
    r = df[df["ts"] == "2026-10-10 17:00"].iloc[0]
    assert np.isnan(r["y_A"]) and r["razlog_A"] == "outlier" and izv["outlier"] == 1


def test_niz_nula_168():
    ist, novo = osnovno()
    novo = pd.concat([novo, serija("15a", "2026-10-15 01:00", "2026-10-25 00:00")])
    nule = (novo["ts"] >= "2026-10-15 01:00") & (novo["ts"] < pd.Timestamp("2026-10-15 01:00") + pd.Timedelta(hours=170))
    novo.loc[nule, "y_A"] = 0
    df, izv = pokreni(ist, novo)
    assert (df.loc[df["razlog_A"] == "niz_nula", "ts"].count()) >= 168
    # kraći niz nula (noćne nule) se ne dira
    assert df.loc[df["ts"] == "2026-10-10 03:00", "razlog_A"].item() == "ok"


def test_nula_dan_jednosmerna():
    ist, novo = osnovno()
    dan = (novo["ts"] > "2026-10-11 00:00") & (novo["ts"] <= "2026-10-12 00:00")
    novo.loc[dan, "y_A"] = 0
    df, izv = pokreni(ist, novo)
    sati = df[(df["ts"] > "2026-10-11 00:00") & (df["ts"] <= "2026-10-12 00:00")]
    assert sati["y_A"].isna().all() and set(sati["razlog_A"]) == {"nula_dan"} and izv["nula_dan"] == 24


def test_nula_dan_ne_dira_slabu_stanicu():
    ist, novo = osnovno()
    ist["y_A"] = (ist["y_A"] > 50).astype(float)  # ~1–2 bicikla dnevno
    novo["y_A"] = (novo["y_A"] > 50).astype(float)
    novo.loc[(novo["ts"] > "2026-10-11 00:00") & (novo["ts"] <= "2026-10-12 00:00"), "y_A"] = 0
    _, izv = pokreni(ist, novo)
    assert izv["nula_dan"] == 0


def test_skok_i_okolina():
    ist, novo = osnovno()
    novo.loc[novo["ts"] == "2026-10-12 15:00", "y_A"] = 300   # > max(50, 4·60)
    novo.loc[novo["ts"] == "2026-10-12 16:00", "y_A"] = 150   # okolina: > max(30, 2·60)
    novo.loc[novo["ts"] == "2026-10-12 20:00", "y_A"] = 150   # van ±3 h → ostaje
    df, _ = pokreni(ist, novo)
    r = df.set_index("ts")["razlog_A"]
    assert r["2026-10-12 15:00"] == "skok" and r["2026-10-12 16:00"] == "skok_okolina"
    assert r["2026-10-12 20:00"] == "ok"


def test_skok_gradski_dogadjaj_ne_dira():
    st = ("15a", "15b", "20a")
    ist, novo = osnovno(st)
    novo.loc[novo["ts"] == "2026-10-12 15:00", "y_A"] = 300
    _, izv = pokreni(ist, novo, stanice=st)
    assert izv["skok"] == 0


def smerovi_za(novo, st, udeo_smera2, od_dana=None):
    redovi = []
    for _, r in novo[novo["stanica_id"] == st].iterrows():
        dan = (r["ts"] - pd.Timedelta(hours=1)).normalize()
        sat = (r["ts"] - pd.Timedelta(hours=1)).hour + 1
        u = udeo_smera2 if (od_dana is None or dan >= pd.Timestamp(od_dana)) else 0.5
        redovi += [{"serija": st, "direction": "11", "datum": dan.strftime("%Y-%m-%d"), "sat": sat, "y_A": r["y_A"] * (1 - u)},
                   {"serija": st, "direction": "21", "datum": dan.strftime("%Y-%m-%d"), "sat": sat, "y_A": r["y_A"] * u}]
    return pd.DataFrame(redovi)


def test_otkaz_smera_zbir_normalan_ok_jedan_smer():
    # 28 od septembra: smer 21 = 0, smer 11 broji oba smera → zbir normalan → ok_jedan_smer
    ist, novo = osnovno(("28",))
    df, izv = pokreni(ist, novo, smerovi_za(novo, "28", 0.0), stanice=("28",))
    novi = df[df["ts"] >= "2026-10-09 01:00"]
    assert set(novi["razlog_A"]) == {"ok_jedan_smer"} and novi["y_A"].notna().all()


def test_otkaz_smera_zbir_pao_nan():
    # smer 21 otkazao od 11.10, zbir pao na pola → ti dani NaN otkaz_smera
    ist, novo = osnovno(("28",))
    pola = novo["ts"] > "2026-10-11 00:00"
    novo.loc[pola, "y_A"] = novo.loc[pola, "y_A"] * 0.5
    sm = smerovi_za(novo, "28", 0.5)
    sm.loc[pd.to_datetime(sm["datum"]) >= "2026-10-11", "y_A"] = sm["y_A"] * (sm["direction"] == "11") * 2
    df, izv = pokreni(ist, novo, sm, stanice=("28",))
    d = df.set_index("ts")["razlog_A"]
    assert d["2026-10-10 12:00"] == "ok"
    assert d["2026-10-12 12:00"] == "otkaz_smera" and izv["otkaz_smera"] >= 3 * 24


def test_otkaz_smera_kratak_niz_ne_dira():
    ist, novo = osnovno(("26",))
    sm = smerovi_za(novo, "26", 0.5)
    sm.loc[(sm["datum"] == "2026-10-11") & (sm["direction"] == "21"), "y_A"] = 0  # samo 1 dan
    df, izv = pokreni(ist, novo, sm, stanice=("26",))
    assert izv["otkaz_smera"] == 0 and izv["ok_jedan_smer"] == 0


def test_dvosmerne_konstanta():
    assert set(STARI_DVOSMERNI) == {"25a", "26", "28", "40a", "40b", "41", "46a", "46b", "47", "51a", "51b"}
