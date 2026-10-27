"""Kvar smera (priprema.KVAR_SMERA): procena ulazi samo u lag/roll/dinamičku skalu, ne u cilj ni u ocenu."""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

MODEL = Path(__file__).resolve().parent.parent / "model"
pytestmark = pytest.mark.skipif(not (MODEL / "istorija.parquet").exists(), reason="nema paketa modela (model/)")


def test_procena_u_ulazu_a_ne_u_cilju():
    from prognoza_biciklista.obelezja import Paket, napravi
    from vremenska_prognoza.open_meteo import tabela_iz_ts
    P = Paket.ucitaj(MODEL)
    meteo = tabela_iz_ts(pd.read_parquet(MODEL / "meteo_istorija_utc1.parquet"))
    ist = pd.read_parquet(MODEL / "istorija.parquet")
    ist = ist[ist["ts"] >= ist["ts"].max() - pd.Timedelta(days=45)].reset_index(drop=True)
    kvar = (ist["stanica_id"] == "15a") & ist["ts"].between(ist["ts"].max() - pd.Timedelta(days=10), ist["ts"].max() - pd.Timedelta(days=3)) \
        & ist["y_A"].notna()
    sa_kvarom = ist.copy()
    sa_kvarom["y_procena"] = np.where(kvar, ist["y_A"], np.nan)          # procena = prava vrednost
    sa_kvarom.loc[kvar, "y_A"] = np.nan
    sa_kvarom.loc[kvar, "razlog_A"] = "kvar_smera"
    a, b = napravi(ist, meteo, P), napravi(sa_kvarom, meteo, P)
    st = (a["stanica_id"] == "15a") & (a["ts"] > ist["ts"].max() - pd.Timedelta(days=3))
    for c in P.ob["istorija"] + ["skala"]:                                # ulaz: kao da je izmereno
        assert np.allclose(a.loc[st, c], b.loc[st, c], equal_nan=True), c
    k = b["stanica_id"].eq("15a") & b["razlog"].eq("kvar_smera")
    assert k.sum() == kvar.sum() and b.loc[k, "y"].isna().all() and b.loc[k, "yn"].isna().all()   # cilj: bez procene
