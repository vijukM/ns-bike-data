"""Obavezan test podudarnosti sa model/referenca.parquet (model-v2 = E31, 7 dana, 25–31.08.2026): obeležja i predikcije moraju
biti iste kao u originalnom kodu (model/izvor/). Preskače se ako paket modela (model/) ili biblioteke nisu tu."""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

MODEL = Path(__file__).resolve().parent.parent / "model"
pytestmark = pytest.mark.skipif(not (MODEL / "referenca.parquet").exists(), reason="nema paketa modela (model/)")


@pytest.fixture(scope="module")
def osnova():
    from prognoza_biciklista.obelezja import Paket, napravi
    P = Paket.ucitaj(MODEL)
    from vremenska_prognoza.open_meteo import tabela_iz_ts
    # meteo u konvenciji modela-v2 (UTC+1, stvarno vreme); meteo_istorija.parquet je sirova tabela (kasni 1 h)
    meteo = tabela_iz_ts(pd.read_parquet(MODEL / "meteo_istorija_utc1.parquet"))
    df = napravi(pd.read_parquet(MODEL / "istorija.parquet"), meteo, P)
    return P, df, pd.read_parquet(MODEL / "referenca.parquet")


def test_xgb_obelezja_i_predikcija(osnova):
    pytest.importorskip("xgboost")
    from prognoza_biciklista.model import predvidi_xgb
    P, df, ref = osnova
    x = df.merge(ref, on=["stanica_id", "ts"], suffixes=("", "_ref"))
    assert len(x) == len(ref)
    for c in P.ob["xgb_obelezja"] + ["skala", "nivo_stanice"]:
        a, b = x[c].astype(float), x[c + "_ref"].astype(float)
        assert (a.isna() == b.isna()).all(), c
        assert np.nanmax((a - b).abs()) <= 1e-5, c
    p = predvidi_xgb(df[df["ts"].isin(ref["ts"].unique())], P).merge(ref, on=["stanica_id", "ts"], suffixes=("", "_ref"))
    for c in ["xgb_seed42", "xgb_seed1", "xgb_seed2", "xgb"]:
        assert (p[c] - p[c + "_ref"]).abs().max() <= 0.01, c


def test_tft_ulazi_i_predikcija_i_ansambl(osnova):
    pytest.importorskip("pytorch_forecasting")
    from prognoza_biciklista.model import ansambl, predvidi_tft, predvidi_xgb
    from prognoza_biciklista.obelezja import pripremi_tft
    P, df, ref = osnova
    tf = pripremi_tft(df, P)
    x = tf.merge(ref, on=["stanica_id", "ts"], suffixes=("", "_ref"))
    for c in P.ob["tft_poznata"]:
        assert (x[c].astype(float) - x["tft_" + c].astype(float)).abs().max() <= 1e-5, c
    for c in ["yn_cilj", "y_nema"]:
        assert (x[c].astype(float) - x[c + "_ref"].astype(float)).abs().max() <= 1e-5, c
    assert (x["time_idx"] == x["time_idx_ref"]).all()
    tft = pd.concat([predvidi_tft(tf, d, P) for d in pd.date_range("2026-08-25", "2026-08-31")])
    p = tft.merge(ref, on=["stanica_id", "ts"], suffixes=("", "_ref"))
    assert len(p) == len(ref)
    for c in [f"tft_{q}_seed{s}" for s in ("42", "1", "2") for q in ("q10", "q50", "q90")] + ["tft_q10", "tft_q50",
                                                                                              "tft_q90"]:
        assert (p[c] - p[c + "_ref"]).abs().max() <= 0.5, c
    e = ansambl(predvidi_xgb(df[df["ts"].isin(ref["ts"].unique())], P), tft, P).merge(ref, on=["stanica_id", "ts"],
                                                                                      suffixes=("", "_ref"))
    assert (e["pred"] - e["pred_ref"]).abs().max() <= 0.5


def test_praznici_kao_u_treningu():
    from prognoza_biciklista.praznici import praznici
    trening = set(pd.to_datetime(pd.read_csv(MODEL / "praznici.csv").iloc[:, 0]).dt.date)
    nase = {d for g in range(2021, 2027) for d in praznici(g) if d <= max(trening)}
    assert nase == trening
