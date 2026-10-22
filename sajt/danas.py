"""SAJT — „Danas uživo“: današnji dan iz satnih čitanja + prognoza + vreme → docs/data/danas.json (osvežava citaj.yml).

    python -m sajt.danas

Sve je po LOKALNOM vremenu (Europe/Belgrade): dan D ima 24 sata, a 23 ili 25 na dan promene vremena.
Sati se ređaju po UTC (pocetak_utc + i sati), a `sati` nosi lokalnu oznaku početka sata („07“ = 07–08 h).

Biciklisti (čitanja podaci/biciklisti/YYYY/MM/DD/HHMM.csv, kolona `danas` = zbir od ponoći po smeru):
  vreme brojača → kraj sata (zaokruženo na pun sat, važi ako je najviše 10 min od punog sata i najviše
  20 min pre čitanja, kao satno.py); sat = danas@kraj − danas@prethodni kraj; prvi sat = danas@01:00.
  Sat bez važećeg čitanja na nekom kraju = null (nikad 0). Serija = zbir smerova; state 0 → null.
  Stanje serije: radi | nema_podataka (state 0) | kasni (vreme brojača > 70 min pre poslednjeg čitanja) |
  nula (danas 0, a juče ≥ 50) | neispravan (isključena serija, npr. 28).
Prognoza (podaci/prognoza_biciklista): model ima oznaku UTC+1 (ts = kraj sata), lokalni sat = ts − 1 h u UTC.
  zvanicna — izdata u ponoć (samo podaci do 24:00 juče): za poređenje „prema prognozi“, jer je data unapred;
  najnovija — poslednje izdanje (i osvežavanja u 07/13/19 h): za „očekuje se do ponoći“.
Vreme: poslednje sačuvano preuzimanje Open-Meteo (UTC) → lokalni sati dana D.
Prosek istog dana: docs/data/istorija/prosek_dana.json (dan u nedelji × mesec × lokalni sat, zbir proseka serija).
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from scraper import konfig

log = logging.getLogger(__name__)

IZLAZ = konfig.KOREN / "docs" / "data" / "danas.json"
PROGNOZE = konfig.KOREN / "podaci" / "prognoza_biciklista"
VREME = konfig.KOREN / "podaci" / "vremenska_prognoza" / "za_model"
ISKLJUCENE = {"28": "brojač neispravan od 04/2026"}       # kao prognoza_biciklista.priprema.ISKLJUCENE
KASNI_MIN, TOLERANCIJA_MIN, STAROST_MIN, NULA_JUCE = 70, 10, 20, 50
# prognoze model-v1 (E28) su do 20.10.2026 imale pomeren sat (novi podaci u lokalnom vremenu) — ne prikazuju se
STARI_MODELI = ("E28",)


# ---------------------------------------------------------------- vreme dana

def sati_dana(dan: date) -> pd.DatetimeIndex:
    """Počeci lokalnih sati dana D u UTC (23, 24 ili 25 sati)."""
    od = pd.Timestamp(dan).tz_localize(konfig.TZ)
    do = pd.Timestamp(dan + timedelta(days=1)).tz_localize(konfig.TZ)
    return pd.date_range(od, do, freq="h", inclusive="left").tz_convert("UTC")


def oznake(sati_utc: pd.DatetimeIndex) -> list[str]:
    return [f"{t.hour:02d}" for t in sati_utc.tz_convert(konfig.TZ)]


# ---------------------------------------------------------------- biciklisti

def citanja_dana(dan: date, koren: Path = konfig.PODACI) -> pd.DataFrame:
    """Sva čitanja koja se tiču dana D: folder D i prvo čitanje posle ponoći (folder D+1, ako postoji)."""
    delovi = []
    for d in (dan, dan + timedelta(days=1)):
        for f in sorted((koren / f"{d:%Y}" / f"{d:%m}" / f"{d:%d}").glob("[0-9][0-9][0-9][0-9].csv")):
            delovi.append(pd.read_csv(f, dtype={"serija": str, "direction": str}))
    if not delovi:
        return pd.DataFrame()
    c = pd.concat(delovi, ignore_index=True)
    return c[c["datum_brojaca"] == dan.isoformat()].reset_index(drop=True)


def kraj_sata_utc(c: pd.DataFrame) -> pd.Series:
    """Vreme brojača (lokalno, naivno) → UTC kraj sata kome čitanje pripada; NaT ako čitanje ne važi za sat."""
    citanje = pd.to_datetime(c["vreme_citanja_utc"], utc=True)
    citanje_lok = citanje.dt.tz_convert(konfig.TZ).dt.tz_localize(None)
    brojac_lok = pd.to_datetime(c["datum_brojaca"] + " " + c["vreme_brojaca"].astype(str))
    zaostatak = citanje_lok - brojac_lok                      # isto i na dan promene vremena (razlika naivnih)
    brojac_utc = citanje - zaostatak
    kraj = brojac_utc.dt.round("h")
    ok = ((brojac_utc - kraj).abs() <= pd.Timedelta(minutes=TOLERANCIJA_MIN)) & \
         (zaostatak <= pd.Timedelta(minutes=STAROST_MIN)) & (zaostatak >= pd.Timedelta(minutes=-5))
    return kraj.where(ok)


def satno_danas(c: pd.DataFrame, sati_utc: pd.DatetimeIndex) -> dict[str, list]:
    """Po seriji: lista po satu dana (null = nema važećeg čitanja na nekom kraju sata ili state 0)."""
    n = len(sati_utc)
    if c.empty:
        return {}
    c = c.assign(kraj=kraj_sata_utc(c)).dropna(subset=["kraj"])
    c = c.sort_values("vreme_citanja_utc").drop_duplicates(["serija", "direction", "kraj"], keep="last")
    krajevi = {t: i for i, t in enumerate(sati_utc + pd.Timedelta(hours=1))}
    po_smeru = {}
    for (s, d), g in c.groupby(["serija", "direction"]):
        kum = [None] * (n + 1)
        kum[0] = 0                                            # ponoć: zbir 0
        for _, r in g.iterrows():
            i = krajevi.get(r["kraj"])
            if i is None:
                continue
            kum[i + 1] = None if r["state"] == 0 or pd.isna(r["danas"]) else int(r["danas"])
        po_smeru[(s, d)] = [kum[i + 1] - kum[i] if kum[i] is not None and kum[i + 1] is not None else None
                            for i in range(n)]
    serije = {}
    for (s, _), v in po_smeru.items():
        if s not in serije:
            serije[s] = v
        else:
            serije[s] = [a + b if a is not None and b is not None else None for a, b in zip(serije[s], v)]
    # negativna razlika (brojač resetovan / ispravka) nije validan sat
    return {s: [x if x is None or x >= 0 else None for x in v] for s, v in serije.items()}


def stanje_serija(poslednje: pd.DataFrame) -> dict[str, dict]:
    citanje = pd.to_datetime(poslednje["vreme_citanja_utc"], utc=True).max()
    cit_lok = citanje.tz_convert(konfig.TZ).tz_localize(None)
    out = {}
    for s, g in poslednje.groupby("serija"):
        nema = bool((g["state"] == 0).any() or g["danas"].isna().any())
        danas = None if nema else int(g["danas"].sum())
        juce = int(g["juce"].sum()) if g["juce"].notna().all() else None
        brojac = pd.to_datetime(g["datum_brojaca"] + " " + g["vreme_brojaca"].astype(str)).min()
        if s in ISKLJUCENE:
            st = "neispravan"
        elif nema:
            st = "nema_podataka"
        elif (cit_lok - brojac) > pd.Timedelta(minutes=KASNI_MIN):
            st = "kasni"
        elif danas == 0 and (juce or 0) >= NULA_JUCE:
            st = "nula"
        else:
            st = "radi"
        out[s] = {"danas": danas, "juce": juce, "stanje": st, "brojac": brojac.strftime("%H:%M")}
    return out


# ---------------------------------------------------------------- prognoza i vreme

def _ucitaj_prognoze(fajlovi: list[Path], sati_utc: pd.DatetimeIndex) -> pd.DataFrame:
    if not fajlovi:
        return pd.DataFrame()
    p = pd.concat([pd.read_parquet(f) for f in fajlovi], ignore_index=True)
    p = p[~p["verzija_modela"].astype(str).str.startswith(STARI_MODELI)]
    if p.empty:
        return p
    p["pocetak_utc"] = (pd.to_datetime(p["ts"]) - pd.Timedelta(hours=2)).dt.tz_localize("UTC")   # kraj UTC+1 → početak UTC
    return p[p["pocetak_utc"].isin(sati_utc)]


def _prognoza_iz(fajlovi: list[Path], sati_utc: pd.DatetimeIndex, dopuna: list[Path] | None = None) -> dict | None:
    """Prognoza modela (ts = kraj sata UTC+1) → lokalni sati dana; za svaki sat poslednje izdanje iz `fajlovi`.

    dopuna: sati koje `fajlovi` nemaju uzimaju se iz ovih izdanja, ali samo iz izdanja objavljenog PRE početka tog
    sata (prognoza i dalje data unapred). Primer: leti je lokalni sat 00–01 dana D sat 24 modela za dan D−1, pa
    dolazi iz jučerašnje zvanične; kad ona nije izdata (21.10.2026, ispad Open-Meteo), uzima se poslednje
    osvežavanje izdato pre ponoći."""
    p = _ucitaj_prognoze(fajlovi, sati_utc)
    dopunjeno = []
    if dopuna:
        d = _ucitaj_prognoze(dopuna, sati_utc)
        if not d.empty:
            d = d[pd.to_datetime(d["izdato_utc"], utc=True) < d["pocetak_utc"]]
            ima = set(zip(p["stanica_id"], p["pocetak_utc"])) if not p.empty else set()
            d = d[[(a, b) not in ima for a, b in zip(d["stanica_id"], d["pocetak_utc"])]]
            if not d.empty:
                dopunjeno = sorted({int(i) for i in np.searchsorted(sati_utc, d["pocetak_utc"].unique())})
                p = pd.concat([p, d], ignore_index=True) if not p.empty else d
    if p.empty:
        return None
    p = p.sort_values("izdato_utc").drop_duplicates(["stanica_id", "pocetak_utc"], keep="last")
    idx = {t: i for i, t in enumerate(sati_utc)}
    n = len(sati_utc)
    grad = {k: [None] * n for k in ("pred", "q10", "q90")}
    zbir = p.groupby("pocetak_utc")[["pred", "q10", "q90"]].sum()
    for t, r in zbir.iterrows():
        for k in grad:
            grad[k][idx[t]] = round(float(r[k]), 1)
    serije = {}
    for s, g in p.groupby("stanica_id"):
        v = [None] * n
        for t, x in zip(g["pocetak_utc"], g["pred"]):
            v[idx[t]] = round(float(x), 1)
        serije[s] = v
    return {"izdato_utc": str(p["izdato_utc"].max()), "verzija_modela": str(p["verzija_modela"].iloc[-1]),
            "grad": grad, "serije": serije, "dopunjeni_sati": dopunjeno}


def prognoze(dan: date, sati_utc: pd.DatetimeIndex, koren: Path = PROGNOZE) -> dict:
    """Model-dani koji pokrivaju lokalni dan: D−1 (sat 24 leti) i D. Zvanične + sva izdanja za najnoviju."""
    dani = [dan - timedelta(days=1), dan, dan + timedelta(days=1)]
    zv = [f for d in dani if (f := koren / "zvanicne" / f"{d}.parquet").exists()]
    sva = [f for d in dani for f in sorted((koren / f"{d:%Y}" / f"{d:%m}" / f"{d:%d}").glob("*.parquet"))]
    return {"zvanicna": _prognoza_iz(zv, sati_utc, dopuna=sva), "najnovija": _prognoza_iz(sva, sati_utc)}


def vreme(sati_utc: pd.DatetimeIndex, koren: Path = VREME) -> dict | None:
    from vremenska_prognoza.open_meteo import u_utc
    fajlovi = sorted(koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/*.json"))
    if not fajlovi:
        return None
    # najnovije preuzimanje koje pokriva ceo dan (za prošle dane: past_days je bliže izmerenom)
    od, do = sati_utc[0].tz_convert(None), (sati_utc[-1] + pd.Timedelta(hours=1)).tz_convert(None)
    j = None
    for f in reversed(fajlovi):
        x = json.loads(f.read_text(encoding="utf-8"))
        t = x["odgovor"]["hourly"]["time"]
        u_gmt = x["odgovor"].get("timezone") in ("GMT", "UTC")
        if u_gmt and pd.Timestamp(t[0]) <= od and pd.Timestamp(t[-1]) >= do:
            j = x
            break
    if j is None:
        j = json.loads(fajlovi[-1].read_text(encoding="utf-8"))
    df = u_utc(j["odgovor"])                                   # ts_utc = trenutak (padavine: kraj sata)
    df["ts_utc"] = pd.to_datetime(df["ts_utc"]).dt.tz_localize("UTC")
    s = df.set_index("ts_utc")
    def trenutno(k):                                           # trenutne veličine: prosek početka i kraja sata
        a = s[k].reindex(sati_utc).to_numpy(dtype=float)
        b = s[k].reindex(sati_utc + pd.Timedelta(hours=1)).to_numpy(dtype=float)
        return [None if np.isnan(x) else round(float(x), 1) for x in np.nanmean([a, b], axis=0)]
    from vremenska_prognoza.open_meteo import EKSTRA
    h = j["odgovor"]["hourly"]
    for nase, om in EKSTRA.items():                            # samo za prikaz (stariji odgovori ih nemaju)
        s[nase] = pd.Series(h[om], index=s.index, dtype=float) if om in h and len(h[om]) == len(s) else np.nan
    def kraj(k):                                               # zbir/prosek prethodnog sata = vrednost na kraju sata
        v = s[k].reindex(sati_utc + pd.Timedelta(hours=1)).to_numpy(dtype=float)
        return [None if np.isnan(x) else round(float(x), 1) for x in v]
    out = {"preuzeto_utc": j["preuzeto_utc"], "temperatura": trenutno("temperatura"), "oblacnost": trenutno("oblacnost"),
           "padavine": kraj("padavine"), "vetar": trenutno("brzina_vetra"), "vlaznost": trenutno("vlaznost"),
           "zracenje": kraj("insolacija"), "osecaj": trenutno("osecaj")}
    if all(x is None for x in out["osecaj"]):
        out["osecaj"] = None
    return out


def prosek_dana(dan: date, sati_utc: pd.DatetimeIndex, fajl: Path = konfig.KOREN / "docs" / "data" / "istorija" / "prosek_dana.json") -> list | None:
    if not fajl.exists():
        return None
    p = json.loads(fajl.read_text(encoding="utf-8"))
    niz = p["grad"].get(f"{dan.weekday()}-{dan.month}")
    return [niz[t.hour] for t in sati_utc.tz_convert(konfig.TZ)] if niz else None


# ---------------------------------------------------------------- glavno

def napravi(sada_utc: datetime, koren: Path = konfig.PODACI, dan: date | None = None) -> dict | None:
    """Danas (podrazumevano) ili zadati prošli dan (konačni snimak za arhivu docs/data/dani/)."""
    if dan is not None:
        c = citanja_dana(dan, koren)
        if c.empty:
            return None
        return _snimak(dan, c, sada_utc, ceo_dan=True)
    dan = sada_utc.astimezone(konfig.TZ).date()
    c = citanja_dana(dan, koren)
    if c.empty:                                                # posle ponoći, pre prvog čitanja: juče
        dan = dan - timedelta(days=1)
        c = citanja_dana(dan, koren)
        if c.empty:
            return None
    return _snimak(dan, c, sada_utc)


def _snimak(dan: date, c: pd.DataFrame, sada_utc: datetime, ceo_dan: bool = False) -> dict:
    sati_utc = sati_dana(dan)
    poslednje_citanje = c["vreme_citanja_utc"].max()
    # poslednje čitanje SVAKOG smera sa datumom D (za prošli dan: čitanje posle ponoći ima samo deo brojača)
    poslednje = c.sort_values("vreme_citanja_utc").groupby(["serija", "direction"]).tail(1)
    satno = satno_danas(c, sati_utc)
    krajevi = kraj_sata_utc(poslednje).dropna()
    poslednji_kraj = krajevi.max() if len(krajevi) else None
    gotovo = int(((sati_utc + pd.Timedelta(hours=1)) <= poslednji_kraj).sum()) if poslednji_kraj is not None else 0
    if ceo_dan:                                                # prošli dan: svi sati su završeni (prazni = nema podataka)
        gotovo = len(sati_utc)
    st = stanje_serija(poslednje)
    serije = {s: {**v, "sati": satno.get(s, [None] * len(sati_utc))} for s, v in sorted(st.items())}
    for s in ISKLJUCENE:
        if s in serije:
            serije[s]["napomena"] = ISKLJUCENE[s]
    # gradski sat = zbir serija koje imaju taj sat (bez isključenih); null ako nijedna nema
    ukljucene = [s for s, v in serije.items() if v["stanje"] != "neispravan"]
    grad = []
    for i in range(len(sati_utc)):
        v = [serije[s]["sati"][i] for s in ukljucene if serije[s]["sati"][i] is not None]
        grad.append(int(sum(v)) if v else None)
    cit = pd.Timestamp(poslednje_citanje).tz_convert(konfig.TZ) if pd.Timestamp(poslednje_citanje).tzinfo \
        else pd.Timestamp(poslednje_citanje, tz="UTC").tz_convert(konfig.TZ)
    brojaci_do = max(v["brojac"] for v in st.values())
    return {
        "datum": dan.isoformat(), "dan_u_nedelji": dan.weekday(),
        "citanje_utc": str(poslednje_citanje), "citanje_lokalno": cit.strftime("%H:%M"), "brojaci_do": brojaci_do,
        "napravljeno_utc": sada_utc.strftime("%Y-%m-%dT%H:%MZ"),
        "pocetak_utc": sati_utc[0].strftime("%Y-%m-%dT%H:%MZ"), "sati": oznake(sati_utc), "sati_gotovo": gotovo,
        "grad": grad, "danas": int(sum(v["danas"] or 0 for s, v in serije.items() if s in ukljucene)),
        "juce": int(sum(v["juce"] or 0 for s, v in serije.items() if s in ukljucene)),
        "ove_godine": int(poslednje["ove_godine"].sum()),
        "serije": serije, "prognoza": prognoze(dan, sati_utc), "vreme": vreme(sati_utc),
        "prosek_isti_dan": prosek_dana(dan, sati_utc),
    }


ARHIVA = konfig.KOREN / "docs" / "data" / "dani"
PRVI_DAN = date(2026, 10, 9)                                   # prvo čitanje scraper-a


def arhiviraj(dani: list[date], sada_utc: datetime, koren: Path = konfig.PODACI, arhiva: Path = ARHIVA) -> list[str]:
    """Konačni snimci prošlih dana → docs/data/dani/YYYY-MM-DD.json + spisak.json (svi arhivirani dani)."""
    arhiva.mkdir(parents=True, exist_ok=True)
    gotovi = []
    for d in dani:
        x = napravi(sada_utc, koren, dan=d)
        if x is None:
            continue
        (arhiva / f"{d}.json").write_text(json.dumps(x, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        gotovi.append(d.isoformat())
    spisak = sorted(f.stem for f in arhiva.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json"))
    zbir = {}                                                  # za izbor datuma: [zbir sati grada, brojača sa podacima]
    for d in spisak:
        x = json.loads((arhiva / f"{d}.json").read_text(encoding="utf-8"))
        n = sum(1 for v in x["serije"].values() if v["stanje"] != "neispravan" and any(y is not None for y in v["sati"]))
        zbir[d] = [int(sum(v for v in x["grad"] if v is not None)), n]
    (arhiva / "spisak.json").write_text(json.dumps({"dani": spisak, "zbir": zbir}, separators=(",", ":")), encoding="utf-8")
    return gotovi


def main(argv=None) -> int:
    import argparse
    import warnings
    warnings.filterwarnings("ignore", category=DeprecationWarning)      # numpy: „generic“ timedelta u pandas-u
    warnings.filterwarnings("ignore", category=RuntimeWarning)          # prosek praznog para (sat bez podataka)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--juce", action="store_true", help="arhiviraj jučerašnji dan (posle ponoći)")
    ap.add_argument("--dan", type=date.fromisoformat, help="arhiviraj zadati dan")
    ap.add_argument("--sve", action="store_true", help="arhiviraj sve dane od 9. 10. 2026. do juče")
    a = ap.parse_args(argv)
    sada = datetime.now(timezone.utc)
    danas = sada.astimezone(konfig.TZ).date()
    if a.juce or a.dan or a.sve:
        dani = [a.dan] if a.dan else [danas - timedelta(days=1)] if a.juce else \
            [PRVI_DAN + timedelta(days=i) for i in range((danas - PRVI_DAN).days)]
        print("arhivirano:", ", ".join(arhiviraj(dani, sada)) or "ništa")
        return 0
    d = napravi(sada)
    if d is None:
        print("nema čitanja za danas")
        return 0
    IZLAZ.parent.mkdir(parents=True, exist_ok=True)
    IZLAZ.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"danas.json: {d['datum']} do {d['brojaci_do']}, {d['danas']} biciklista")
    return 0


if __name__ == "__main__":
    sys.exit(main())
