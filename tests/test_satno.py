"""Satni obračun na veštačkim snimcima."""
from datetime import date, datetime, timedelta, timezone

import pandas as pd

from scraper.konfig import TZ
from scraper.satno import satno_po_seriji, satno_po_smeru

SMEROVI = [("26NS", "1", "Smer A", "26"), ("26NS", "2", "Smer B", "26")]


def citanja_dana(d: date, koraci=None):
    """UTC trenuci čitanja (pun sat + 1 min) za lokalni dan d i ponoć sledećeg dana."""
    pocetak = datetime(d.year, d.month, d.day, tzinfo=TZ).astimezone(timezone.utc)
    s = d + timedelta(days=1)
    kraj = datetime(s.year, s.month, s.day, tzinfo=TZ).astimezone(timezone.utc)
    t, out = pocetak, []
    while t <= kraj:
        out.append(t + timedelta(minutes=1))
        t += timedelta(hours=1)
    return out, kraj


def napravi(d: date, satni, izmene=None, preskoci=()):
    """Snimci za dan d. satni[smer][i] = broj bicikala u i-tom satu dana.

    izmene: {(indeks_citanja, smer): dict sa poljima koja se menjaju}; preskoci: indeksi propuštenih čitanja.
    """
    izmene = izmene or {}
    trenuci, ponoc = citanja_dana(d)
    redovi = []
    for i, t in enumerate(trenuci):
        if i in preskoci:
            continue
        for j, (lid, dirn, desc, serija) in enumerate(SMEROVI):
            posle_ponoci = t >= ponoc
            lok = (t - timedelta(seconds=30)).astimezone(TZ)
            red = {
                "vreme_citanja_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "feed_updated_utc": "",
                "location": lid[:2], "locationID": lid, "direction": dirn, "directionDesc": desc,
                "serija": serija, "datum_brojaca": lok.date().isoformat(), "vreme_brojaca": lok.strftime("%H:%M:%S"),
                "danas": 0 if posle_ponoci else sum(satni[j][:i]),
                "juce": sum(satni[j]) if posle_ponoci else 999,
                "ove_godine": 0, "state": 1, "stateDesc": "", "lat": 45.0, "lon": 19.0,
            }
            red.update(izmene.get((i, j), {}))
            redovi.append(red)
    return pd.DataFrame(redovi)


def satni_profil(n, baza):
    return [baza + 3 * i for i in range(n)]


def izracunaj(df):
    smerovi, provera = satno_po_smeru(df)
    return smerovi, satno_po_seriji(smerovi), provera


D = date(2026, 10, 5)


def test_normalan_dan():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    smerovi, serije, provera = izracunaj(napravi(D, satni))
    assert len(serije) == 24 and serije["y"].notna().all()
    assert serije["y"].tolist() == [a + b for a, b in zip(*satni)]
    assert serije["ts"].iloc[0] == pd.Timestamp("2026-10-05 01:00")
    assert serije["stanica_id"].unique().tolist() == ["26"]
    assert provera.empty
    for j in range(2):
        assert smerovi[smerovi["direction"] == SMEROVI[j][1]]["y"].sum() == sum(satni[j])


def test_ponoc_sat_24_iz_juce():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    _, serije, _ = izracunaj(napravi(D, satni))
    poslednji = serije.iloc[-1]
    assert poslednji["ts"] == pd.Timestamp("2026-10-06 00:00")  # 24:00
    assert poslednji["y"] == satni[0][23] + satni[1][23]


def test_ponoc_bez_citanja_u_0001_koristi_sledece():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    df = napravi(D, satni)
    # dodaj čitanje u 01:01 sledećeg dana, a ukloni ono u 00:01
    sled = napravi(D + timedelta(days=1), [[5] * 24, [5] * 24])
    sled = sled[sled["vreme_citanja_utc"] == "2026-10-05T23:01:00Z"].assign(juce=[sum(s) for s in satni])
    df = pd.concat([df[df["vreme_citanja_utc"] != "2026-10-05T22:01:00Z"], sled])
    _, serije, _ = izracunaj(df)
    assert serije.iloc[-1]["y"] == satni[0][23] + satni[1][23]


def test_propusteno_citanje():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    _, serije, _ = izracunaj(napravi(D, satni, preskoci={10}))
    nan = serije[serije["y"].isna()]
    assert nan["ts"].dt.hour.tolist() == [10, 11]
    assert set(nan["razlog"]) == {"nema_citanja"}
    assert serije["y"].notna().sum() == 22


def test_state_6_je_validna_nula():
    # state 6 = „nema saobraćaja“ u poslednjih 5 min — vrednost se računa normalno
    satni = [satni_profil(24, 10), [0] * 24]
    df = napravi(D, satni, izmene={(i, 1): {"state": 6} for i in range(26)})
    _, serije, provera = izracunaj(df)
    assert serije["y"].notna().all() and serije["y"].tolist() == satni[0]
    assert provera["napomena"].tolist() == ["nula_ceo_dan"] and provera["direction"].tolist() == ["2"]


def test_reset_brojaca():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    _, serije, _ = izracunaj(napravi(D, satni, izmene={(15, 0): {"danas": 4}}))
    s = serije.set_index(serije["ts"].dt.hour)
    assert pd.isna(s.loc[15, "y"]) and s.loc[15, "razlog"] == "negativna_razlika"
    assert s.loc[16, "y"] == (sum(satni[0][:16]) - 4) + satni[1][15]  # posle reseta razlika je pozitivna


def test_zastarelo():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    _, serije, _ = izracunaj(napravi(D, satni, izmene={(12, 0): {"vreme_brojaca": "11:50:00"}}))
    nan = serije[serije["y"].isna()]
    assert nan["ts"].dt.hour.tolist() == [12, 13]
    assert set(nan["razlog"]) == {"zastarelo"}


def test_prelaz_na_letnje_vreme_23_sata():
    d = date(2027, 3, 28)
    satni = [satni_profil(23, 10), satni_profil(23, 1)]
    _, serije, provera = izracunaj(napravi(d, satni))
    assert len(serije) == 23 and serije["y"].notna().all()
    assert 2 not in serije["ts"].dt.hour.tolist()
    assert serije["y"].sum() == sum(map(sum, satni)) and provera.empty


def test_prelaz_na_zimsko_vreme_25_sati():
    d = date(2026, 10, 25)
    satni = [satni_profil(25, 10), satni_profil(25, 1)]
    _, serije, provera = izracunaj(napravi(d, satni))
    assert len(serije) == 25 and serije["y"].notna().all()
    assert serije["ts"].dt.hour.tolist().count(2) == 2
    assert serije["ts_utc"].is_unique
    assert serije["y"].tolist() == [a + b for a, b in zip(*satni)]
    assert provera.empty


def test_serija_nan_ako_fali_smer():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    df = napravi(D, satni)
    df = df[~((df["direction"] == "2") & (df["vreme_citanja_utc"] == "2026-10-05T03:01:00Z"))]
    smerovi, serije, _ = izracunaj(df)
    nan = serije[serije["y"].isna()]
    assert nan["ts"].dt.hour.tolist() == [5, 6] and set(nan["razlog"]) == {"nema_smera"}
    assert smerovi[smerovi["direction"] == "1"]["y"].notna().all()


def test_citanje_xx02_sa_brojacem_pre_punog_sata():
    # čitanje u XX:01 vidi brojač 3 min pre punog sata — prihvata se (tolerancija 6 min)
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    izmene = {(i, j): {"vreme_brojaca": f"{i - 1:02d}:57:00"} for i in range(2, 23) for j in (0, 1)}
    _, serije, _ = izracunaj(napravi(D, satni, izmene=izmene))
    assert serije["y"].notna().all() and len(serije) == 24


def test_datum_i_sat_kolone():
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    _, serije, _ = izracunaj(napravi(D, satni))
    assert serije["sat"].tolist() == list(range(1, 25))
    assert set(serije["datum"]) == {"2026-10-05"}
    poslednji = serije.iloc[-1]
    assert (poslednji["sat"], str(poslednji["ts"])) == (24, "2026-10-06 00:00:00")


def test_ponoc_brojac_jos_od_prethodnog_dana():
    # čitanje u 00:01 vidi brojač u 23:58 dana D -> njegovo „juče“ je za D−1, ne sme se koristiti;
    # „juče“ za D uzima se iz sledećeg čitanja (01:01) čiji je brojač već od dana D+1
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    df = napravi(D, satni, izmene={(24, j): {"datum_brojaca": "2026-10-05", "vreme_brojaca": "23:58:00",
                                             "danas": sum(satni[j]) - 1, "juce": 7} for j in (0, 1)})
    sled = napravi(D + timedelta(days=1), [[5] * 24, [5] * 24])
    sled = sled[sled["vreme_citanja_utc"] == "2026-10-05T23:01:00Z"].copy()
    sled["juce"] = [sum(s) for s in satni]
    _, serije, provera = izracunaj(pd.concat([df, sled]))
    assert serije.iloc[-1]["y"] == satni[0][23] + satni[1][23] and provera.empty


def test_nepotpun_sat():
    # umesto čitanja u 10:01 postoji samo ručno čitanje u 10:40 -> sati 10 i 11 nisu puni sati
    satni = [satni_profil(24, 10), satni_profil(24, 1)]
    df = napravi(D, satni, izmene={(10, j): {"vreme_citanja_utc": "2026-10-05T08:40:00Z",
                                             "vreme_brojaca": "10:39:30"} for j in (0, 1)})
    _, serije, _ = izracunaj(df)
    nan = serije[serije["y"].isna()]
    assert nan["sat"].tolist() == [10, 11] and set(nan["razlog"]) == {"nepotpun_sat"}
