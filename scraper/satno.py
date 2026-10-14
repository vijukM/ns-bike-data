"""Satne vrednosti iz čitanja „danas/juče" — po smeru, pa po seriji. Bez interpolacije.

Konvencija (kao istorijski podaci): oznaka sata = KRAJ sata, 01:00–24:00 lokalno (Europe/Belgrade);
24:00 se zapisuje kao 00:00 sledećeg dana. Za lokalni dan D i čitanja R(h) u satu h (≈ h:01):
    sat 00–01 = danas@R(1)
    sat (h−1)–h = danas@R(h) − danas@R(h−1)
    sat 23–24 = juče@(prvo ispravno čitanje posle ponoći) − danas@R(23)
Čitanje važi ako vreme brojača nije više od 10 min pre punog sata (sajt osvežava na ~5 min i ponekad
kasni do ~10 min, čitanje je u XX:02) i nije starije od 20 min od čitanja; „juče“ se uzima samo iz čitanja sa datumom brojača D+1.
Kolone datum (dan D) i sat (1–24) jednoznačno označavaju sat; ts = kraj sata (24:00 = 00:00 dana D+1).
Dan prelaska na letnje vreme ima 23 sata, na zimsko 25 (oznaka 02:00 se tada javlja dva puta —
jednoznačno je ts_utc). Računaju se samo završeni dani (za koje je počeo sledeći dan).

    python -m scraper.satno                  # jučerašnji dan (pokreće se posle ponoći)
    python -m scraper.satno --dan 2026-10-09 # zadati dan
    python -m scraper.satno --sve            # svi dani za koje postoje čitanja
    python -m scraper.satno --spoji          # sve dane spoji u podaci/satno.parquet i .csv (lokalno)

Izlaz za dan D (folder podaci/YYYY/MM/DD/): satno.csv (stanica_id, ts, y_A, razlog_A, ts_utc, datum, sat — po seriji),
satno_smerovi.csv (po smeru), satno_provera.csv (samo ako zbir sati odstupa od „juče" ili je smer ceo dan 0).
Mesečni zbir: podaci/YYYY/MM/satno_YYYY-MM.parquet i .csv; u formatu istorijskog mastera
(stanica_id, ts, y_A, razlog_A): podaci/YYYY/MM/master_YYYY-MM.parquet; Excel (sheet po seriji):
podaci/excel/bicikli_YYYY-MM.xlsx.
"""
from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from . import konfig
from .excel import napravi_mesec as napravi_excel

log = logging.getLogger(__name__)

# Sajt ponekad kasni 8–10 min (npr. 12. i 13.10. fajl osvežen u XX:52–54 pri čitanju u XX:02), a ponovni
# pokušaj u XX:08 može tada da vidi brojač od XX:52 → 16 min. „Nema podataka“ (> 30 min) je state 0.
MAKS_STAROST = timedelta(minutes=20)
# Čitanje je u XX:02; sajt osvežava fajl na ~5 min i ponekad kasni do ~10 min, pa vreme brojača bude
# od ~XX:52 do ~XX:02 (medijana XX:58,6 za 10.–13.10.). Takvo čitanje se prihvata kao stanje „na kraju sata“.
TOLERANCIJA_PRE_SATA = timedelta(minutes=10)
# Razmak vremena brojača dva čitanja koja omeđuju sat (≈ 60 min ± kašnjenje osvežavanja).
RAZMAK_SATA = (timedelta(minutes=50), timedelta(minutes=70))
KLJUC = ["locationID", "direction", "directionDesc"]

# razlozi (prioritet: prvi pronađeni po redosledu potrebnih čitanja)
NEMA_CITANJA = "nema_citanja"
NEMA_SMERA = "nema_smera"
ZASTARELO = "zastarelo"
NEGATIVNO = "negativna_razlika"
NEPOTPUN_SAT = "nepotpun_sat"
NEMA_PODATAKA = "nema_podataka"  # state 0: uređaj > 30 min bez podataka (danas je „zamrznut“)


def _citaj_csv(fajlovi) -> pd.DataFrame:
    fajlovi = list(fajlovi)
    if not fajlovi:
        return pd.DataFrame()
    return pd.concat([pd.read_csv(f, dtype={"location": str, "direction": str}, keep_default_na=False,
                                  na_values=[""]) for f in fajlovi], ignore_index=True)


def ucitaj_snimke(dani, koren: Path | None = None) -> pd.DataFrame:
    """Učitava čitanja (podaci/YYYY/MM/DD/HHMM.csv) za date lokalne dane."""
    return _citaj_csv(f for d in dani for f in sorted(konfig.folder_dana(d, koren).glob("[0-9]*.csv")))


def dani_sa_citanjima(koren: Path | None = None) -> list[date]:
    koren = koren or konfig.PODACI
    dani = set()
    for f in koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/[0-9]*.csv"):
        g, m, d = f.parts[-4:-1]
        dani.add(date(int(g), int(m), int(d)))
    return sorted(dani)


def _vreme_brojaca(datum: str, vreme: str, citanje: datetime) -> datetime | None:
    """Lokalno vreme brojača -> UTC; dvosmislen sat (zimsko vreme) razrešava se prema vremenu čitanja."""
    try:
        naivno = datetime.fromisoformat(f"{datum}T{vreme}")
    except (TypeError, ValueError):
        return None
    kandidati = {naivno.replace(tzinfo=konfig.TZ, fold=f).astimezone(timezone.utc) for f in (0, 1)}
    # najbliže vremenu čitanja, ali ne posle njega (uz 2 min tolerancije za satove)
    ispravni = [k for k in kandidati if k <= citanje + timedelta(minutes=2)] or list(kandidati)
    return max(ispravni)


def pripremi(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["t_citanja"] = pd.to_datetime(df["vreme_citanja_utc"], utc=True)
    df["t_brojaca"] = [
        _vreme_brojaca(d, v, c.to_pydatetime())
        for d, v, c in zip(df["datum_brojaca"], df["vreme_brojaca"], df["t_citanja"])
    ]
    df["t_brojaca"] = pd.to_datetime(df["t_brojaca"], utc=True)
    df["sat_utc"] = df["t_citanja"].dt.floor("h")
    for k in KLJUC + ["serija"]:
        df[k] = df[k].astype(str)
    return df


def _sat(t) -> str:
    """Ključ UTC sata (nezavisan od rezolucije/tz objekta pandas Timestamp-a)."""
    return pd.Timestamp(t).tz_convert("UTC").strftime("%Y-%m-%dT%H")


@dataclass
class _Citanje:
    danas: float | None
    juce: float | None
    state: int | None
    razlog: str | None  # None = ispravno
    t: pd.Timestamp | None = None  # vreme brojača (UTC)


def _granice_dana(d: date) -> tuple[datetime, datetime]:
    pocetak = datetime(d.year, d.month, d.day, tzinfo=konfig.TZ).astimezone(timezone.utc)
    sledeci = d + timedelta(days=1)
    kraj = datetime(sledeci.year, sledeci.month, sledeci.day, tzinfo=konfig.TZ).astimezone(timezone.utc)
    return pocetak, kraj


def _ocitaj(red: pd.Series | None, ima_citanja: bool, pocetak_sata: datetime,
            tolerancija: timedelta = TOLERANCIJA_PRE_SATA) -> _Citanje:
    if not ima_citanja:
        return _Citanje(None, None, None, NEMA_CITANJA)
    if red is None:
        return _Citanje(None, None, None, NEMA_SMERA)
    tb, tc = red["t_brojaca"], red["t_citanja"]
    if pd.isna(tb) or tb < pocetak_sata - tolerancija or tc - tb > MAKS_STAROST:
        return _Citanje(None, None, None, ZASTARELO)
    st = None if pd.isna(red["state"]) else int(red["state"])
    if st == 0:
        return _Citanje(None, None, st, NEMA_PODATAKA)
    return _Citanje(red["danas"], red["juce"], st, None, tb)


def _razlika(citanja: list[_Citanje], vrednost, od=None, do=None) -> tuple[float | None, str | None]:
    """od/do = vremena brojača koja omeđuju sat; razmak mora biti RAZMAK_SATA (inače nije pun sat)."""
    for c in citanja:
        if c.razlog:
            return None, c.razlog
    if od is not None and do is not None and not (RAZMAK_SATA[0] <= do - od <= RAZMAK_SATA[1]):
        return None, NEPOTPUN_SAT
    # state se NE koristi kao uslov: 6 = „nema saobraćaja“ u poslednjih 5 min (validna nula, npr. noću),
    # a ispad uređaja („nema podataka“ > 30 min) hvata provera svežine vremena brojača.
    y = vrednost()
    if y is None or pd.isna(y):
        return None, NEMA_SMERA
    if y < 0:
        return None, NEGATIVNO
    return float(y), None


def satno_po_smeru(df: pd.DataFrame, do_dana: date | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Vraća (satne vrednosti po smeru, provera zbira) za sve završene lokalne dane."""
    if df.empty:
        return pd.DataFrame(), pd.DataFrame()
    df = pripremi(df)
    lok_dan = df["t_citanja"].dt.tz_convert(konfig.TZ).dt.date
    prvi, poslednji = lok_dan.min(), lok_dan.max()
    do_dana = do_dana or poslednji  # isključivo: dan D se računa samo ako je počeo D+1
    # prvo čitanje u svakom UTC satu (svaki lokalni sat je tačno jedan UTC sat)
    # sva čitanja po UTC satu, redom po vremenu — za svaki smer se uzima ISPRAVNO čitanje u satu čije je
    # vreme brojača najbliže punom satu (npr. zakasnela rezerva u XX:00 sa brojačem od XX:53 se preskače)
    po_satu = {_sat(s): g.sort_values("t_citanja").set_index(KLJUC).sort_index(kind="mergesort")
               for s, g in df.groupby("sat_utc")}

    redovi, provera = [], []
    d = prvi
    while d < do_dana:
        pocetak, kraj = _granice_dana(d)
        sati = list(pd.date_range(pocetak, kraj, freq="h", inclusive="left"))
        n = len(sati)  # 23 / 24 / 25
        u_danu = df[(df["t_citanja"] >= pocetak) & (df["t_citanja"] < kraj)]
        sledeci = df[(df["t_citanja"] >= kraj) & (df["t_citanja"] < kraj + timedelta(days=1))]
        izvor = u_danu if not u_danu.empty else sledeci
        kljucevi = izvor[KLJUC + ["serija"]].drop_duplicates()
        for _, kr in kljucevi.iterrows():
            k = tuple(kr[KLJUC])

            def citanje(i: int) -> _Citanje:
                s = sati[i]
                g = po_satu.get(_sat(s))
                if g is None or k not in g.index:
                    return _ocitaj(None, g is not None, s)
                # od ispravnih čitanja u satu uzima se ono čije je vreme brojača najbliže punom satu
                citanja = [_ocitaj(red, True, s) for _, red in g.loc[[k]].iterrows()]
                ispravna = [c for c in citanja if c.razlog is None]
                if ispravna:
                    return min(ispravna, key=lambda c: abs(c.t - s))
                return citanja[0]

            # „juče" iz prvog ispravnog čitanja posle ponoći
            kand = sledeci[(sledeci[KLJUC] == list(k)).all(axis=1)].sort_values("t_citanja")
            J = _Citanje(None, None, None, NEMA_CITANJA if sledeci.empty else NEMA_SMERA)
            for _, red in kand.iterrows():
                c = _ocitaj(red, True, kraj, tolerancija=timedelta(0))  # „juče“ mora biti od dana D+1
                J = c
                if c.razlog is None:
                    break
            R = [citanje(i) for i in range(n)]
            vrednosti = []
            for i in range(n):
                ponoc_d, ponoc_d1 = pd.Timestamp(pocetak), pd.Timestamp(kraj)
                if i == 0:
                    y, razlog = _razlika([R[1]], lambda: R[1].danas, ponoc_d, R[1].t)
                elif i < n - 1:
                    y, razlog = _razlika([R[i], R[i + 1]], lambda: R[i + 1].danas - R[i].danas, R[i].t, R[i + 1].t)
                else:
                    y, razlog = _razlika([R[i], J], lambda: J.juce - R[i].danas, R[i].t, ponoc_d1)
                kraj_sata = sati[i + 1] if i + 1 < n else pd.Timestamp(kraj)
                vrednosti.append(y)
                redovi.append({
                    "serija": kr["serija"], "locationID": k[0], "direction": k[1], "directionDesc": k[2],
                    "datum": d.isoformat(), "sat": kraj_sata.tz_convert(konfig.TZ).hour or 24,
                    "ts": kraj_sata.tz_convert(konfig.TZ).tz_localize(None),
                    "ts_utc": kraj_sata,
                    "y_A": y, "razlog_A": razlog,
                })
            napomena = None
            if all(v is not None for v in vrednosti) and J.juce is not None and sum(vrednosti) != J.juce:
                napomena = "zbir_sati_razlicit_od_juce"
            elif J.juce == 0:
                napomena = "nula_ceo_dan"  # moguće neispravan senzor koji javlja „nema saobraćaja“
            if napomena:
                zbir = sum(vrednosti) if all(v is not None for v in vrednosti) else None
                provera.append({"datum": d.isoformat(), "locationID": k[0], "direction": k[1],
                                "directionDesc": k[2], "zbir_sati": zbir, "juce": J.juce,
                                "napomena": napomena})
        d += timedelta(days=1)
    smerovi = pd.DataFrame(redovi)
    if not smerovi.empty:
        smerovi["razlog_A"] = smerovi["razlog_A"].fillna("ok")
    return smerovi, pd.DataFrame(provera)


def satno_po_seriji(smerovi: pd.DataFrame) -> pd.DataFrame:
    """Serija = zbir svih smerova, samo ako svi smerovi imaju vrednost; inače NaN sa razlogom prvog smera."""
    if smerovi.empty:
        return pd.DataFrame(columns=["stanica_id", "ts", "y_A", "razlog_A", "ts_utc", "datum", "sat"])
    redovi = []
    for (serija, ts_utc), g in smerovi.groupby(["serija", "ts_utc"], sort=True):
        if g["y_A"].notna().all():
            y, razlog = float(g["y_A"].sum()), "ok"
        else:
            y, razlog = None, g.loc[g["y_A"].isna(), "razlog_A"].iloc[0]
        redovi.append({"stanica_id": serija, "ts": g["ts"].iloc[0], "y_A": y, "razlog_A": razlog, "ts_utc": ts_utc,
                       "datum": g["datum"].iloc[0], "sat": int(g["sat"].iloc[0])})
    out = pd.DataFrame(redovi)
    out["y_A"] = out["y_A"].astype("float64")
    return out.sort_values(["stanica_id", "ts_utc"]).reset_index(drop=True)


def obradi_dan(d: date, koren: Path | None = None) -> pd.DataFrame:
    """Računa dan d (potrebna su čitanja dana d i prvog čitanja dana d+1) i upisuje u folder dana."""
    df = ucitaj_snimke([d, d + timedelta(days=1)], koren)
    df = df[pd.to_datetime(df["vreme_citanja_utc"], utc=True).dt.tz_convert(konfig.TZ).dt.date >= d] \
        if not df.empty else df
    smerovi, provera = satno_po_smeru(df, do_dana=d + timedelta(days=1))
    serije = satno_po_seriji(smerovi)
    folder = konfig.folder_dana(d, koren)
    if serije.empty:
        log.info("%s: nema čitanja", d)
        return serije
    folder.mkdir(parents=True, exist_ok=True)
    serije.to_csv(folder / "satno.csv", index=False)
    smerovi.to_csv(folder / "satno_smerovi.csv", index=False)
    if not provera.empty:
        provera.to_csv(folder / "satno_provera.csv", index=False)
        log.warning("%s: napomene u satno_provera.csv: %s", d, provera["napomena"].value_counts().to_dict())
    log.info("%s: serija %d, sati %d, popunjeno %d, NaN %d %s", d, serije["stanica_id"].nunique(), len(serije),
             serije["y_A"].notna().sum(), serije["y_A"].isna().sum(),
             serije.loc[serije["razlog_A"] != "ok", "razlog_A"].value_counts().to_dict())
    return serije


def _ucitaj_satno(fajlovi) -> pd.DataFrame:
    df = _citaj_csv(fajlovi)
    if df.empty:
        return df
    df["stanica_id"] = df["stanica_id"].astype(str)
    df["ts"] = pd.to_datetime(df["ts"])
    df["ts_utc"] = pd.to_datetime(df["ts_utc"], utc=True)
    df["y_A"] = df["y_A"].astype("float64")
    return df.sort_values(["stanica_id", "ts_utc"]).reset_index(drop=True)


def spoji_mesec(d: date, koren: Path | None = None) -> None:
    folder = konfig.folder_meseca(d, koren)
    df = _ucitaj_satno(sorted(folder.glob("[0-9][0-9]/satno.csv")))
    if df.empty:
        return
    ime = folder / f"satno_{d:%Y-%m}"
    df.to_parquet(ime.with_suffix(".parquet"), index=False)
    df.to_csv(ime.with_suffix(".csv"), index=False)
    u_master(df).to_parquet(folder / f"master_{d:%Y-%m}.parquet", index=False)


def u_master(df: pd.DataFrame) -> pd.DataFrame:
    """Format istorijskog mastera: stanica_id, ts, y_A, razlog_A (+ datum, sat) na punoj naivnoj satnoj mreži.

    Kao master: dan prelaska na zimsko vreme — od dva sata sa istim ts zadržava se PRVI; dan prelaska na
    letnje vreme — nepostojeći sat 02:00 postoji u mreži kao NaN sa razlogom „nema_reda“. Ispravan sat → „ok“.
    Čišćenje (> 400, otkaz smera, skokovi…) radi se na strani modela, kao za istoriju.
    """
    kolone = ["stanica_id", "ts", "y_A", "razlog_A", "datum", "sat"]
    if df.empty:
        return pd.DataFrame(columns=kolone)
    df = df.sort_values(["stanica_id", "ts_utc"]).drop_duplicates(["stanica_id", "ts"], keep="first")
    delovi = []
    for st, g in df.groupby("stanica_id"):
        mreza = pd.date_range(g["ts"].min(), g["ts"].max(), freq="h")
        g = g.set_index("ts").reindex(mreza).rename_axis("ts").reset_index()
        g = g.astype({"razlog_A": object, "datum": object})
        nema = g["stanica_id"].isna()
        g["stanica_id"] = st
        g.loc[nema, "razlog_A"] = "nema_reda"
        kraj = g["ts"] - pd.Timedelta(hours=1)  # dan kome sat pripada (24:00 → prethodni dan)
        g.loc[nema, "datum"] = kraj[nema].dt.strftime("%Y-%m-%d")
        g.loc[nema, "sat"] = kraj[nema].dt.hour + 1
        delovi.append(g)
    m = pd.concat(delovi, ignore_index=True)
    m["razlog_A"] = m["razlog_A"].fillna("ok")
    m["y_A"] = m["y_A"].astype("float64")
    m["sat"] = m["sat"].astype("int64")
    return m[kolone].sort_values(["stanica_id", "ts"]).reset_index(drop=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dan", type=date.fromisoformat, help="lokalni datum (podrazumevano: juče)")
    ap.add_argument("--sve", action="store_true", help="preračunaj sve dane sa čitanjima")
    ap.add_argument("--spoji", action="store_true", help="spoji sve dane u podaci/satno.parquet i .csv")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    danas = datetime.now(konfig.TZ).date()
    if a.sve:
        dani = [d for d in dani_sa_citanjima() if d < danas]
    else:
        dani = [a.dan or danas - timedelta(days=1)]
    for d in dani:
        obradi_dan(d)
    for m in sorted({d.replace(day=1) for d in dani}):
        spoji_mesec(m)
        napravi_excel(m)
    if a.spoji:
        df = _ucitaj_satno(sorted(konfig.PODACI.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/satno.csv")))
        df.to_parquet(konfig.PODACI / "satno.parquet", index=False)
        u_master(df).to_parquet(konfig.PODACI / "master_novo.parquet", index=False)
        df.to_csv(konfig.PODACI / "satno.csv", index=False)
        log.info("spojeno: %d redova -> podaci/satno.parquet", len(df))
    return 0


if __name__ == "__main__":
    sys.exit(main())
