"""Faza 4: predikcija biciklista za dan D — 0,5 × TFT (3 seed-a, medijana) + 0,5 × XGBoost (3 seed-a).
Interval = TFT q10–q90 bez pomeranja. Logika: model/izvor/tft.py (predvidi) i model/README.md.
"""
from __future__ import annotations

import logging
import warnings

import numpy as np
import pandas as pd

from .obelezja import Paket, pripremi_tft, xgb_matrica

log = logging.getLogger(__name__)
SEEDOVI = ("42", "1", "2")


def predvidi_xgb(df_dan: pd.DataFrame, paket: Paket) -> pd.DataFrame:
    """df_dan: redovi dana D iz obelezja.napravi. Vraća stanica_id, ts, xgb_seed*, xgb."""
    import xgboost as xgb

    X = xgb_matrica(df_dan, paket)
    d = xgb.DMatrix(X, enable_categorical=True)
    out = df_dan[["stanica_id", "ts"]].copy()
    for s in SEEDOVI:
        b = xgb.Booster(model_file=str(paket.folder / f"xgb_seed{s}.ubj"))
        out[f"xgb_seed{s}"] = np.clip(b.predict(d), 0, None) * df_dan["skala"].to_numpy()
    out["xgb"] = out[[f"xgb_seed{s}" for s in SEEDOVI]].mean(axis=1)
    return out


def _tft_prozor(df_tft: pd.DataFrame, dan: pd.Timestamp, paket: Paket) -> pd.DataFrame:
    """192 uzastopna sata po stanici: 168 h enkodera do ponoći + 24 h dana D (01:00 … 24:00)."""
    prvi = dan + pd.Timedelta(hours=1)
    od = prvi - pd.Timedelta(hours=paket.ob["tft_enkoder"])
    do = dan + pd.Timedelta(hours=paket.ob["tft_dekoder"])
    w = df_tft[(df_tft["ts"] >= od) & (df_tft["ts"] <= do)].copy()
    dek = w["ts"] >= prvi                       # dan D: cilj nepoznat
    w.loc[dek, "yn_cilj"] = np.float32(0.0)
    w.loc[dek, "y_nema"] = np.float32(1.0)
    w.loc[dek, "w"] = np.float32(0.0)
    return w


def ucitaj_tft(putanja):
    """TFT checkpoint sačuvan na GPU-u → CPU. Metrike (torchmetrics) u hiperparametrima pamte uređaj „cuda“ i pri
    učitavanju pokušavaju da ga inicijalizuju; pre učitavanja im se uređaj postavlja na CPU (težine se ne menjaju)."""
    import io

    import torch
    import torchmetrics
    from pytorch_forecasting import TemporalFusionTransformer

    ck = torch.load(putanja, map_location="cpu", weights_only=False)
    viđeni = set()

    def na_cpu(o):
        if id(o) in viđeni:
            return
        viđeni.add(id(o))
        if isinstance(o, torchmetrics.Metric):
            o._device = torch.device("cpu")
        if isinstance(o, torch.nn.Module):
            for c in o.children():
                na_cpu(c)
        elif isinstance(o, dict):
            for v in o.values():
                na_cpu(v)
        elif isinstance(o, (list, tuple)):
            for v in o:
                na_cpu(v)

    na_cpu(ck.get("hyper_parameters", {}))
    buf = io.BytesIO()
    torch.save(ck, buf)
    buf.seek(0)
    return TemporalFusionTransformer.load_from_checkpoint(buf, map_location="cpu")


def predvidi_tft(df_tft: pd.DataFrame, dan: pd.Timestamp, paket: Paket) -> pd.DataFrame:
    """df_tft: izlaz obelezja.pripremi_tft; dan: datum dana D (00:00). Vraća stanica_id, ts, tft_q*_seed*, tft_q*."""
    import torch  # noqa: F401
    from pytorch_forecasting import TimeSeriesDataSet

    warnings.filterwarnings("ignore", ".*does not have many workers.*")
    w = _tft_prozor(df_tft, dan, paket)
    H = paket.ob["tft_dekoder"]
    skala = w.set_index(["stanica_id", "time_idx"])["skala"]
    rez = None
    for s in SEEDOVI:
        m = ucitaj_tft(paket.folder / f"tft_seed{s}.ckpt")
        ds = TimeSeriesDataSet.from_parameters(m.dataset_parameters, w, predict=True, stop_randomization=True)
        pr = m.predict(ds.to_dataloader(train=False, batch_size=256, num_workers=0), mode="quantiles",
                       return_index=True, trainer_kwargs=dict(accelerator="cpu", devices=1, logger=False,
                                                              enable_progress_bar=False))
        q = pr.output.detach().cpu().numpy()                                  # (n, 24, 3)
        ix = pr.index.reset_index(drop=True)
        R = pd.DataFrame({"stanica_id": np.repeat(ix["stanica_id"].astype(str).to_numpy(), H),
                          "time_idx": (ix["time_idx"].to_numpy()[:, None] + np.arange(H)[None, :]).ravel()})
        sk = skala.reindex(pd.MultiIndex.from_arrays([R["stanica_id"], R["time_idx"]])).to_numpy()
        for j, k in enumerate(("q10", "q50", "q90")):
            R[f"tft_{k}_seed{s}"] = np.clip(q[:, :, j].ravel(), 0, None) * sk
        rez = R if rez is None else rez.merge(R, on=["stanica_id", "time_idx"])
    for k in ("q10", "q50", "q90"):
        rez[f"tft_{k}"] = rez[[f"tft_{k}_seed{s}" for s in SEEDOVI]].mean(axis=1)
    rez["ts"] = paket.t0 + pd.to_timedelta(rez["time_idx"], unit="h")
    return rez.drop(columns="time_idx")


def ansambl(xgb: pd.DataFrame, tft: pd.DataFrame, paket: Paket) -> pd.DataFrame:
    w = float(paket.ob["w_tft"])
    p = xgb.merge(tft, on=["stanica_id", "ts"], how="outer")
    p["pred"] = w * p["tft_q50"] + (1 - w) * p["xgb"]
    return p
