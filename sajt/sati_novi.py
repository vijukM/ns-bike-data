"""SAJT — „Dan na mapi“ posle istorije: satni fajlovi docs/data/istorija/sati/YYYY-MM.json od 09/2026, iz satnog
obračuna scraper-a (podaci/biciklisti/YYYY/MM/satno_YYYY-MM.parquet), u ISTOM formatu kao istorija
(sajt/pripremi_istoriju.py): satna mreža po UTC od lokalne ponoći 1. u mesecu, dani [datum, i0, sati], v (vrednosti),
r (razlozi kao RLE). Plus docs/data/istorija/sati_dostupno.json: poslednji obrađen dan i dani bez ijednog podatka.

Za iste mesece pravi i:
  meteo_sati/YYYY-MM.json   satna temperatura i padavine (izmereno, Open-Meteo „analiza“ iz
                            podaci/vremenska_prognoza/stvarno/), ista satna mreža kao istorija
  dnevno_novo.json          dnevni zbirovi posle istorije: po seriji (samo kompletni dani) i za grad (zbir i broj
                            brojača koji su radili ceo dan), uz dnevno vreme — kalendar i strana stanice ih dodaju
                            na istoriju (grad_dnevno.json, dnevno/<serija>.json se ne menjaju)

    python -m sajt.sati_novi          # pokreće citaj.yml posle noćnog satnog obračuna (scraper.satno)

Današnji dan (sati koji su prošli) strana uzima iz docs/data/danas.json, pa se ovi fajlovi menjaju samo jednom dnevno.
Razlozi iz scraper-a (nema_citanja, nepotpun_sat, nema_podataka) → „nema podataka“; serija 28 → „brojač neispravan“.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from scraper import konfig

from . import pripremi_istoriju as pi

OD_MESECA = pd.Period("2026-09", freq="M")                 # istorija (istorija-v1) se završava 31. 8. 2026.
VREME_STVARNO = konfig.KOREN / "podaci" / "vremenska_prognoza" / "stvarno"


def ucitaj_vreme(folder: Path = VREME_STVARNO) -> pd.DataFrame:
    """Izmereno vreme po satu (Open-Meteo „analiza“, jedan fajl po danu; lokalno vreme) → pocetak_utc (bez zone),
    temperatura, padavine. Kasnije preuzimanje istog sata ima prednost."""
    delovi = []
    for f in sorted(folder.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/*.json")):
        try:
            h = json.loads(f.read_text(encoding="utf-8"))["odgovor"]["hourly"]
            t = pd.to_datetime(pd.Series(h["time"]))
            lok = t.dt.tz_localize(konfig.TZ, ambiguous="infer", nonexistent="shift_forward")
        except Exception:  # noqa: BLE001 — oštećen ili nepotpun fajl se preskače
            continue
        delovi.append(pd.DataFrame({"pocetak_utc": lok.dt.tz_convert("UTC").dt.tz_localize(None),
                                    "temperatura": h.get("temperature_2m"), "padavine": h.get("precipitation")}))
    if not delovi:
        return pd.DataFrame(columns=["pocetak_utc", "temperatura", "padavine"])
    return pd.concat(delovi, ignore_index=True).drop_duplicates("pocetak_utc", keep="last")


def ucitaj_satno(koren: Path = konfig.PODACI) -> pd.DataFrame:
    f = sorted(koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/satno_[0-9][0-9][0-9][0-9]-[0-9][0-9].parquet"))
    if not f:
        return pd.DataFrame(columns=["stanica_id", "pocetak_utc", "y_A", "kod"])
    d = pd.concat([pd.read_parquet(x) for x in f], ignore_index=True)
    d["pocetak_utc"] = pd.to_datetime(d["ts_utc"], utc=True).dt.tz_convert(None) - pd.Timedelta(hours=1)
    d["razlog_A"] = d["razlog_A"].fillna("ok")
    d["kod"] = np.where(d["razlog_A"] == "ok", pi.KOD["ok"], pi.KOD["nema_reda"])
    d.loc[d["y_A"].isna() & (d["kod"] == 0), "kod"] = pi.KOD["nema_reda"]
    for serija, (od, popravka, razlog, _) in pi.NEISPRAVNE.items():
        maska = (d["stanica_id"] == serija) & ((d["pocetak_utc"] < popravka) if popravka is not None else True)
        d.loc[maska, "y_A"] = np.nan
        d.loc[maska, "kod"] = pi.KOD[razlog]
    return d.drop_duplicates(["stanica_id", "pocetak_utc"], keep="last")


def napravi(koren: Path = konfig.PODACI, izlaz: Path = pi.IZLAZ, vreme: Path = VREME_STVARNO) -> dict:
    d = ucitaj_satno(koren)
    velicine = {}
    if d.empty:
        return velicine
    poslednji = (d["pocetak_utc"].max() + pd.Timedelta(hours=1)).tz_localize("UTC").tz_convert(konfig.TZ)
    poslednji_dan = (poslednji - pd.Timedelta(minutes=1)).date()          # kraj poslednjeg sata, 24:00 = isti dan
    serije = sorted(d["stanica_id"].unique())
    # sat u mesecu kao ceo broj (nezavisno od preciznosti datetime64: us/ns se razlikuju među verzijama pandas-a,
    # pa je reindex po vremenu u GitHub Actions dao prazne mesece)
    t_ns = pd.to_datetime(d["pocetak_utc"]).dt.as_unit("ns").astype("int64")
    w = ucitaj_vreme(vreme)
    w_ns = pd.to_datetime(w["pocetak_utc"]).dt.as_unit("ns").astype("int64").to_numpy() if not w.empty else np.array([], dtype="int64")
    prazni = []
    dnevno = {"dani": [], "serije": {s: {"v": [], "h": []} for s in serije},
              "grad": {"v": [], "n": [], "postoji": []}, "vreme": {"tmin": [], "tmax": [], "tsr": [], "pad": []}}
    for per in pd.period_range(OD_MESECA, pd.Period(poslednji_dan, freq="M"), freq="M"):
        pocetak, n, dani_meseca = pi._mreza_meseca(per.year, per.month)
        p0 = pd.Timestamp(pocetak).as_unit("ns").value
        i = ((t_ns - p0) // 3_600_000_000_000).to_numpy()
        u_mesecu = (i >= 0) & (i < n)
        obj = {"mesec": str(per), "pocetak_utc": pocetak.strftime("%Y-%m-%dT%H:%MZ"), "n": n, "dani": dani_meseca,
               "v": {}, "r": {}}
        validnih = np.zeros(n, dtype=int)
        for s in serije:
            m = u_mesecu & (d["stanica_id"] == s).to_numpy()
            y = np.full(n, np.nan)
            kod = np.full(n, pi.KOD["nema_reda"], dtype=int)
            y[i[m]] = d.loc[m, "y_A"].to_numpy(dtype=float)
            kod[i[m]] = d.loc[m, "kod"].to_numpy(dtype=int)
            if np.isnan(y).all() and (kod == pi.KOD["nema_reda"]).all():
                continue                                   # serija bez ijednog podatka u mesecu (npr. ceo septembar)
            obj["v"][s] = [pi._i(x) for x in y]
            obj["r"][s] = pi.razlozi_rle(kod)
            validnih += ~np.isnan(y)
        # satno vreme na istoj mreži
        temp, pad = np.full(n, np.nan), np.full(n, np.nan)
        if len(w_ns):
            j = (w_ns - p0) // 3_600_000_000_000
            u = (j >= 0) & (j < n)
            temp[j[u]] = w["temperatura"].to_numpy(dtype=float)[u]
            pad[j[u]] = w["padavine"].to_numpy(dtype=float)[u]
        velicine[f"meteo_sati/{per}.json"] = pi._pisi(izlaz / "meteo_sati" / f"{per}.json", {
            "mesec": str(per), "pocetak_utc": obj["pocetak_utc"], "n": n,
            "temp": [pi._r1(x) for x in temp], "pad": [pi._r1(x) for x in pad], "sneg": [None] * n})
        for iso, i0, sati in dani_meseca:
            if date.fromisoformat(iso) > poslednji_dan:
                continue
            if not validnih[i0:i0 + sati].any():
                prazni.append(iso)
            # dnevni zbirovi: serija ulazi samo sa kompletnim danom (svi sati validni), kao u istoriji
            dnevno["dani"].append(iso)
            zbir, n_pun, postoji = 0, 0, 0
            for s_ in serije:
                niz = obj["v"].get(s_)
                deo = [x for x in (niz[i0:i0 + sati] if niz else []) if x is not None]
                pun = niz is not None and len(deo) == sati
                dnevno["serije"][s_]["v"].append(int(sum(deo)) if pun else None)
                dnevno["serije"][s_]["h"].append(len(deo))
                postoji += bool(deo)
                if pun:
                    zbir += sum(deo); n_pun += 1
            dnevno["grad"]["v"].append(int(zbir) if n_pun else None)
            dnevno["grad"]["n"].append(n_pun)
            dnevno["grad"]["postoji"].append(postoji)
            t_dan, p_dan = temp[i0:i0 + sati], pad[i0:i0 + sati]
            ima = not np.isnan(t_dan).all()
            dnevno["vreme"]["tmin"].append(pi._r1(np.nanmin(t_dan)) if ima else None)
            dnevno["vreme"]["tmax"].append(pi._r1(np.nanmax(t_dan)) if ima else None)
            dnevno["vreme"]["tsr"].append(pi._r1(np.nanmean(t_dan)) if ima else None)
            dnevno["vreme"]["pad"].append(pi._r1(np.nansum(p_dan)) if not np.isnan(p_dan).all() else None)
        velicine[f"sati/{per}.json"] = pi._pisi(izlaz / "sati" / f"{per}.json", obj)
    velicine["sati_dostupno.json"] = pi._pisi(izlaz / "sati_dostupno.json", {
        "od": pi.OD.isoformat(), "do": poslednji_dan.isoformat(), "prazni_dani": prazni,
        "opis": "dani do „do“ imaju satne fajlove; „prazni_dani“ nemaju nijedan podatak (rupa između istorije i "
                "scraper-a 01.09–08.10.2026); današnji dan je u data/danas.json"})
    velicine["dnevno_novo.json"] = pi._pisi(izlaz / "dnevno_novo.json", {
        "od": dnevno["dani"][0] if dnevno["dani"] else None, "do": poslednji_dan.isoformat(),
        "serije": {s_: x for s_, x in dnevno["serije"].items() if any(v is not None for v in x["v"]) or any(x["h"])},
        "grad": dnevno["grad"], "vreme": dnevno["vreme"],
        "opis": "dnevni zbirovi posle istorije (od 1. 9. 2026.): serija samo sa kompletnim danom (v), validnih sati (h); "
                "grad = zbir serija sa kompletnim danom (v) i njihov broj (n), postoji = serija sa bar jednim satom; "
                "vreme iz izmerenog Open-Meteo (analiza)"})
    return velicine


def main(argv=None) -> int:
    v = napravi()
    for k, n in v.items():
        print(f"{k}: {n / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
