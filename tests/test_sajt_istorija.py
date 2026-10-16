"""Priprema istorije za sajt (sajt/pripremi_istoriju.py): vreme, kompletan dan, NaN ≠ 0, serija 28, zbirovi."""
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from sajt import pripremi_istoriju as pi

KOREN = Path(__file__).resolve().parents[1]


def test_dani_promene_vremena_23_i_25_sati():
    assert pi.sati_u_danu(date(2025, 3, 30)) == 23
    assert pi.sati_u_danu(date(2025, 10, 26)) == 25
    assert pi.sati_u_danu(date(2025, 10, 27)) == 24
    d = pi.lokalni_dani(date(2025, 10, 25), date(2025, 10, 27))
    assert d["sati"].tolist() == [24, 25, 24]
    assert str(d["pocetak_utc"].iloc[0]) == "2025-10-24 22:00:00"      # ponoć CEST


def test_master_utc1_u_lokalno():
    # ts = kraj sata u fiksnom UTC+1; leti je lokalni sat za 1 veći, zimi isti
    leto = pi.master_u_lokalno(pd.Series(pd.to_datetime(["2025-07-01 08:00"])))
    assert str(leto["pocetak_utc"].iloc[0]) == "2025-07-01 06:00:00" and leto["sat"].iloc[0] == 8
    zima = pi.master_u_lokalno(pd.Series(pd.to_datetime(["2025-01-15 08:00"])))
    assert zima["sat"].iloc[0] == 7
    # prvi sat istorije (01.01.2021 01:00 u UTC+1) je lokalno 00–01 h 1. januara
    prvi = pi.master_u_lokalno(pd.Series(pd.to_datetime(["2021-01-01 01:00"])))
    assert prvi["datum"].iloc[0] == date(2021, 1, 1) and prvi["sat"].iloc[0] == 0


def test_meteo_jesenji_sat_dva_puta_prolecni_nikad():
    w = pd.DataFrame({"Datum": ["2025-10-26"] * 4, "Cas": ["02:00", "03:00", "04:00", "05:00"],
                      "temperatura": [1.0, 2.0, 3.0, 4.0]})
    w = pd.concat([w, pi.meteo_u_utc(w["Datum"], w["Cas"])], axis=1).set_index("lok_pocetak")
    mreza = pd.date_range("2025-10-25 23:00", periods=5, freq="h")        # lokalno 01, 02 CEST, 02 CET, 03, 04
    assert pi.meteo_na_mrezi(w, mreza)["temperatura"].tolist() == [1.0, 2.0, 2.0, 3.0, 4.0]
    w = pd.DataFrame({"Datum": ["2025-03-30"] * 4, "Cas": ["02:00", "03:00", "04:00", "05:00"],
                      "temperatura": [1.0, 2.0, 3.0, 4.0]})                 # 03:00 = početak 02:00, ne postoji
    w = pd.concat([w, pi.meteo_u_utc(w["Datum"], w["Cas"])], axis=1).set_index("lok_pocetak")
    mreza = pd.date_range("2025-03-30 00:00", periods=3, freq="h")        # lokalno 01, 03, 04
    assert pi.meteo_na_mrezi(w, mreza)["temperatura"].tolist() == [1.0, 3.0, 4.0]


def _master(serija, od_lok, do_lok, vrednost=1.0):
    """Sintetički master: pune lokalne dane od_lok..do_lok, ts = kraj sata u UTC+1."""
    dani = pi.lokalni_dani(od_lok, do_lok)
    pocetak = pd.date_range(dani["pocetak_utc"].iloc[0], periods=int(dani["sati"].sum()), freq="h")
    return pd.DataFrame({"stanica_id": serija, "ts": pocetak + pd.Timedelta(hours=2),
                         "y_A": vrednost, "razlog_A": "ok"})


@pytest.fixture
def sinteticki(tmp_path):
    m = pd.concat([_master("20a", date(2025, 10, 25), date(2025, 10, 27), 2.0),
                   _master("28", date(2026, 4, 16), date(2026, 4, 19), 3.0),
                   _master("15a", date(2026, 4, 16), date(2026, 4, 19), 1.0)], ignore_index=True)
    # 27.10.2025: jedan sat NaN (kvar) → nepotpun dan; 0 je validna nula
    i = m.index[(m["stanica_id"] == "20a") & (m["ts"] == pd.Timestamp("2025-10-27 12:00"))][0]
    m.loc[i, ["y_A", "razlog_A"]] = [np.nan, "status_prazan"]
    j = m.index[(m["stanica_id"] == "20a") & (m["ts"] == pd.Timestamp("2025-10-25 05:00"))][0]
    m.loc[j, "y_A"] = 0.0
    m.to_parquet(tmp_path / "master.parquet")
    dani = pd.date_range("2025-10-24", "2026-04-20", freq="D")
    w = pd.DataFrame([(d.strftime("%Y-%m-%d"), f"{h:02d}:00") for d in dani for h in range(1, 25)],
                     columns=["Datum", "Cas"])
    w["temperatura"], w["padavine"], w["sneg_N"], w["is_holiday"] = 10.0, 0.0, 0.0, 0
    w.to_parquet(tmp_path / "meteo.parquet")
    pd.DataFrame({"serija": ["20a", "28", "28", "15a"], "locationID": ["20NSa S.Jovanovica", "28NS Bul", "28NS Bul",
                                                                         "15NSaPS Vojvodjanska"],
                  "direction": [13, 11, 21, 14], "directionDesc": ["A-B (b)", "X-Y", "Y-X", "C-D (b)"],
                  "lat": [45.25, 45.256, 45.256, 45.246], "lon": [19.80, 19.83, 19.83, 19.84]}
                 ).to_csv(tmp_path / "feed.csv", index=False)
    izlaz = tmp_path / "istorija"
    pi.pripremi(tmp_path / "master.parquet", tmp_path / "meteo.parquet", tmp_path / "feed.csv", izlaz)
    return izlaz


def _dan(izlaz, serija, d):
    j = json.loads((izlaz / "dnevno" / f"{serija}.json").read_text())
    i = (d - date.fromisoformat(j["od"])).days
    return j["v"][i], j["h"][i], dict(j["r"]).get(i)


def test_kompletan_dan_i_nan_nije_nula(sinteticki):
    assert _dan(sinteticki, "20a", date(2025, 10, 26)) == (50, 25, None)          # 25 sati × 2
    assert _dan(sinteticki, "20a", date(2025, 10, 25)) == (46, 24, None)          # validna nula ulazi u zbir
    v, h, r = _dan(sinteticki, "20a", date(2025, 10, 27))
    assert v is None and h == 23 and r == pi.KOD["status_prazan"]
    s = json.loads((sinteticki / "sati" / "2025-10.json").read_text())
    dan = {d: (i, n) for d, i, n in s["dani"]}
    i, n = dan["2025-10-27"]
    sati = s["v"]["20a"][i:i + n]
    assert n == 24 and sati.count(None) == 1 and 0 not in sati                    # NaN ostaje null
    i25, n25 = dan["2025-10-25"]
    assert s["v"]["20a"][i25:i25 + n25].count(0) == 1                            # prava nula ostaje 0
    assert dan["2025-10-26"][1] == 25 and len(s["v"]["20a"]) == s["n"] == 745
    rle = {(a, b): c for a, b, c in s["r"]["20a"]}
    assert rle[(i + 11, 1)] == pi.KOD["status_prazan"]                           # 27.10. 11–12 h lokalno
    assert set(rle.values()) == {pi.KOD["status_prazan"], pi.KOD["nije_postavljen"]}


def test_28_posle_18_aprila_neispravan_i_van_gradskog_zbira(sinteticki):
    assert _dan(sinteticki, "28", date(2026, 4, 17))[0] == 72
    v, h, r = _dan(sinteticki, "28", date(2026, 4, 18))
    assert v is None and h == 0 and r == pi.KOD["neispravan_brojac"]
    g = json.loads((sinteticki / "grad_dnevno.json").read_text())
    i17 = (date(2026, 4, 17) - date.fromisoformat(g["od"])).days
    assert (g["v"][i17], g["n"][i17]) == (72 + 24, 2)
    assert (g["v"][i17 + 1], g["n"][i17 + 1]) == (24, 1)                         # samo 15a
    st = {s["serija"]: s for s in json.loads((sinteticki / "stanice.json").read_text())["serije"]}
    assert st["28"]["napomena"] == "brojač neispravan od 04/2026" and st["28"]["do"] == "2026-04-17"
    assert st["15a"]["naziv"] == "Vojvođanska" and st["20a"]["smerovi"] == ["A – B"]


def test_meseci_bez_serije_i_razmak_parova():
    st = pd.DataFrame({"serija": ["1a", "1b"], "mesto": [1, 1], "lat": [45.25, 45.25], "lon": [19.8, 19.8]})
    r = pi.razmakni_parove(st, 90)
    m_lon = 111_320 * np.cos(np.radians(45.25))
    assert abs((r["lon_mapa"].iloc[1] - r["lon_mapa"].iloc[0]) * m_lon - 90) < 0.5
    assert r["lat"].tolist() == [45.25, 45.25]                                   # prave koordinate ostaju


ISTORIJA = KOREN / "istorija" / "master_v4_E3.parquet"
JSON = KOREN / "docs" / "data" / "istorija"


@pytest.mark.skipif(not ISTORIJA.exists() or not (JSON / "stanice.json").exists(),
                    reason="nema istorija/ (gh release download istorija-v1) ili generisanog docs/data/istorija")
@pytest.mark.parametrize("serija, mesec", [("15a", "2024-03"), ("34a", "2025-10"), ("28", "2026-04"),
                                           ("49a", "2023-11"), ("40b", "2022-07")])
def test_zbir_json_jednak_zbiru_mastera(serija, mesec):
    m = pi.ucitaj_master(ISTORIJA)
    m = m[m["stanica_id"] == serija]
    lok_mesec = pd.to_datetime(m["datum"]).dt.strftime("%Y-%m")
    ocekivano = m.loc[lok_mesec == mesec, "y_A"].sum()
    s = json.loads((JSON / "sati" / f"{mesec}.json").read_text())
    assert sum(x for x in s["v"][serija] if x is not None) == pytest.approx(ocekivano)
    # dnevni zbirovi = zbir satnih vrednosti istog lokalnog dana (samo kompletni dani)
    d = json.loads((JSON / "dnevno" / f"{serija}.json").read_text())
    od = date.fromisoformat(d["od"])
    for dan, i, n in s["dani"]:
        k = (date.fromisoformat(dan) - od).days
        sati = s["v"][serija][i:i + n]
        if 0 <= k < len(d["v"]) and d["v"][k] is not None:
            assert None not in sati and d["v"][k] == sum(sati)
        elif 0 <= k < len(d["v"]):
            assert d["h"][k] == n - sati.count(None)


def test_stanje_brojaca():
    assert pi.stanje_brojaca("28", 30, 720) == "neispravan"
    assert pi.stanje_brojaca("23a", 27, 700) == "radi"
    assert pi.stanje_brojaca("23a", 26, 700) == "delimicno"
    assert pi.stanje_brojaca("27a", 0, 0) == "ne_radi"


def test_staze_tipovi_i_geojson():
    from sajt import staze
    assert staze.tip({"highway": "cycleway"}) == "s"
    assert staze.tip({"highway": "primary", "cycleway:right": "lane"}) == "t"
    assert staze.tip({"highway": "secondary", "cycleway": "track"}) == "s"
    assert staze.tip({"highway": "footway", "bicycle": "designated"}) == "z"
    assert staze.tip({"highway": "residential"}) is None
    g = staze.u_geojson({"elements": [
        {"type": "way", "id": 2, "tags": {"highway": "cycleway"},
         "geometry": [{"lat": 45.2512345, "lon": 19.8312345}, {"lat": 45.252, "lon": 19.832}]},
        {"type": "way", "id": 1, "tags": {"highway": "residential"}, "geometry": [{"lat": 45, "lon": 19}] * 2},
        {"type": "node", "id": 3}]})
    assert len(g["features"]) == 1 and g["obelezja_po_tipu"] == {"s": 1, "t": 0, "z": 0}
    assert g["features"][0]["geometry"]["coordinates"][0] == [19.83123, 45.25123]
    assert "cycleway:both" in staze.upit()


def test_uzivo_danas_do_sata(tmp_path):
    from sajt import uzivo
    assert uzivo.do_sata("20:56:07") == 21 and uzivo.do_sata("17:02:00") == 17
    f = tmp_path / "1702.csv"
    pd.DataFrame({"serija": ["15a", "28", "28", "29a"], "danas": [555, 10, 20, 7], "state": [1, 1, 6, 0],
                  "vreme_brojaca": ["16:58:00"] * 4, "datum_brojaca": ["2026-10-14"] * 4,
                  "vreme_citanja_utc": ["2026-10-14T15:02:00Z"] * 4}).to_csv(f, index=False)
    j = uzivo.napravi(f)
    assert j["serije"] == {"15a": [555, 17], "28": [30, 17], "29a": [None, 17]} and j["datum"] == "2026-10-14"


def test_lepi_nazivi_smerova():
    d = {"Bul. M. Pupina": "Bulevar Mihajla Pupina", "Maksima Gorkog": "Maksima Gorkog", "Bul.Evrope": "Bulevar Evrope", "Rumenacka": "Rumenačka"}
    assert pi.lep_smer("Maksima Gorkog - Bul. M. Pupina", d) == "Maksima Gorkog – Bulevar Mihajla Pupina"
    assert pi.lep_smer("Bul.Evrope-Rumenacka (u oba smera)", d) == "Bulevar Evrope – Rumenačka (u oba smera)"
    assert pi.lep_smer("X - Y", d) == "X – Y"


def test_najduzi_niz_i_rekordi_ritam(sinteticki):
    d = [date(2025, 1, 1), date(2025, 1, 2), date(2025, 1, 4), date(2025, 1, 5), date(2025, 1, 6)]
    assert pi.najduzi_niz(d) == (3, date(2025, 1, 4), date(2025, 1, 6))
    assert pi.najduzi_niz([]) == (0, None, None)
    r = json.loads((sinteticki / "rekordi.json").read_text())
    assert r["top_dani"][0]["zbir"] == 72 + 24 and r["top_dani"][0]["n"] == 2     # 28 do 17. 4. + 15a
    st = {x["serija"]: x for x in r["po_stanici"]}
    assert st["20a"]["dan"]["v"] == 50 and st["20a"]["niz"]["dana"] == 2           # 25. i 26. 10. kompletni
    assert st["28"]["sat"]["v"] == 3 and "dan" in st["15a"]
    t = json.loads((sinteticki / "ritam.json").read_text())
    assert len(t["toplotna_mapa"]) == 7 and all(len(x) == 24 for x in t["toplotna_mapa"])
    assert len(t["po_mesecu"]) == 12 and abs(sum(t["udeo_po_satu"]) - 100) < 0.5


def test_osnova_mape_prstenovi_visine_klase():
    from sajt import osnova_mape as om
    a, b, c, d = [0, 0], [1, 0], [1, 1], [0, 1]
    # tri dela jednog prstena, jedan obrnut
    assert om.spoji_prstenove([[a, b], [c, b], [c, d, a]]) == [[a, b, c, d, a]]
    assert om.spoji_prstenove([[a, b, c]]) == []                                   # otvoren ostatak se odbacuje
    g = lambda pts: [{"lon": x, "lat": y} for x, y in pts]
    rel = {"type": "relation", "members": [
        {"type": "way", "role": "outer", "geometry": g([(0, 0), (4, 0), (4, 4)])},
        {"type": "way", "role": "outer", "geometry": g([(4, 4), (0, 4), (0, 0)])},
        {"type": "way", "role": "inner", "geometry": g([(1, 1), (2, 1), (2, 2), (1, 1)])}]}
    p = om.poligoni(rel)
    assert len(p) == 1 and len(p[0]) == 2                                          # spoljni + rupa
    assert om.visina({"height": "12,5 m"}) == 12 and om.visina({"building:levels": "4"}) == 13
    assert om.visina({"building": "house"}) == 6 and om.visina({"building": "yes"}) == 7
    s = om.napravi({"putevi": {"elements": [
        {"type": "way", "tags": {"highway": "primary"}, "geometry": g([(19.8, 45.25), (19.81, 45.25)])},
        {"type": "way", "tags": {"highway": "footway"}, "geometry": g([(19.8, 45.25), (19.81, 45.26)])}]},
        "pruga": {"elements": []}, "voda": {"elements": []}, "zelenilo": {"elements": []}, "zgrade": {"elements": []}})
    assert [f["properties"]["k"] for f in s["putevi"]["features"]] == ["g"]
    assert "relation" in om.upiti()["voda"] and "building" in om.upiti()["zgrade"]
    tk = om.tacke_za_bicikliste({"elements": [
        {"type": "node", "lat": 45.25, "lon": 19.84, "tags": {"amenity": "bicycle_parking", "capacity": "10", "covered": "yes", "bicycle_parking": "stands"}},
        {"type": "way", "center": {"lat": 45.26, "lon": 19.83}, "tags": {"shop": "bicycle", "name": "Servis"}},
        {"type": "node", "lat": 45.2, "lon": 19.8, "tags": {"amenity": "bench"}}]})["features"]
    assert om.latinica("Булевар ослобођења") == "Bulevar oslobođenja"
    assert om.svojstva_puta({"highway": "primary", "name": "Футошка"}) == {"k": "g", "n": "Futoška"}
    assert om.svojstva_puta({"highway": "secondary", "name": "Футошка", "name:sr-Latn": "Futoška ulica"})["n"] == "Futoška ulica"
    assert om.svojstva_puta({"highway": "service", "name": "Parking"}) == {"k": "o"}           # servisni bez naziva
    po_tipu = {f["properties"]["t"]: f for f in tk}
    assert sorted(po_tipu) == ["p", "s"]                                           # klupa se ne uzima
    assert po_tipu["p"]["properties"] == {"t": "p", "kap": 10, "pok": 1, "vrsta": "stands"}
    assert po_tipu["s"]["properties"]["ime"] == "Servis" and po_tipu["s"]["geometry"]["coordinates"] == [19.83, 45.26]


def test_delovi_grada_i_mesta():
    from sajt import osnova_mape as om
    kv = [{"lon": 19.80, "lat": 45.24}, {"lon": 19.82, "lat": 45.24}, {"lon": 19.82, "lat": 45.25}, {"lon": 19.80, "lat": 45.25}, {"lon": 19.80, "lat": 45.24}]
    odg = {"elements": [
        {"type": "node", "lat": 45.245, "lon": 19.81, "tags": {"place": "suburb", "name": "Лиман"}},
        {"type": "node", "lat": 45.26, "lon": 19.83, "tags": {"place": "quarter", "name": "Podbara"}},
        {"type": "node", "lat": 45.25, "lon": 19.84, "tags": {"place": "city", "name": "Novi Sad"}},
        {"type": "relation", "tags": {"boundary": "administrative", "admin_level": "10", "name": "Mesna zajednica Liman"},
         "members": [{"type": "way", "role": "outer", "geometry": kv}]},
        {"type": "way", "tags": {"place": "neighbourhood", "name": "Telep"}, "geometry": [{"lon": x["lon"] - 0.05, "lat": x["lat"]} for x in kv]},
    ]}
    f = om.delovi_grada(odg)["features"]
    granice = {x["properties"]["n"]: x for x in f if x["geometry"]["type"] != "Point"}
    tacke = {x["properties"]["n"]: x for x in f if x["geometry"]["type"] == "Point"}
    assert set(granice) == {"Liman", "Telep"} and set(tacke) == {"Liman", "Podbara", "Telep"}
    assert tacke["Liman"]["properties"] == {"n": "Liman", "v": "suburb", "b": [19.8, 45.24, 19.82, 45.25]}
    assert tacke["Liman"]["geometry"]["coordinates"] == [19.81, 45.245]           # natpis na čvoru place=*
    assert tacke["Telep"]["geometry"]["coordinates"] == [19.76, 45.245]           # bez čvora: težište granice
    assert "b" not in tacke["Podbara"]["properties"]
    # pojednostavljenje zadržava krajeve i uglove
    assert om.pojednostavi([[0, 0], [1e-6, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) == [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]

    mesta = om.mesta_sa_nazivom({"elements": [
        {"type": "way", "center": {"lat": 45.25, "lon": 19.85}, "tags": {"leisure": "park", "name": "Дунавски парк"}},
        {"type": "way", "center": {"lat": 45.25, "lon": 19.85}, "tags": {"leisure": "park", "name": "Дунавски парк"}},
        {"type": "node", "lat": 45.255, "lon": 19.845, "tags": {"place": "square", "name": "Trg slobode"}},
        {"type": "way", "center": {"lat": 45.24, "lon": 19.85}, "tags": {"amenity": "university", "name": "Fakultet tehničkih nauka"}},
        {"type": "node", "lat": 45.2, "lon": 19.8, "tags": {"amenity": "hospital"}},
    ]})["features"]
    assert [(x["properties"]["t"], x["properties"]["n"]) for x in mesta] == [
        ("f", "Fakultet tehničkih nauka"), ("park", "Dunavski park"), ("trg", "Trg slobode")]


def test_unija_osm_i_zvanicnih_parkinga():
    from sajt import osnova_mape as om
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"t": "p"}, "geometry": {"type": "Point", "coordinates": [19.8400, 45.2500]}},
        {"type": "Feature", "properties": {"t": "p"}, "geometry": {"type": "Point", "coordinates": [19.8500, 45.2600]}},
        {"type": "Feature", "properties": {"t": "s"}, "geometry": {"type": "Point", "coordinates": [19.8300, 45.2400]}},
    ]}
    zv = [{"sif": 1, "adr": "Trg galerija", "lon": 19.84020, "lat": 45.25010},     # ~19 m od prvog OSM parkinga → isto mesto
          {"sif": 2, "adr": "Isti ugao", "lon": 19.84025, "lat": 45.25005},        # i on je blizu, ali je prvi već uparen → nova tačka
          {"sif": 3, "adr": "Daleko", "lon": 19.8700, "lat": 45.2400},
          {"sif": 4, "adr": "Kod servisa", "lon": 19.8300, "lat": 45.2400}]       # servis (t = s) se ne uparuje sa parkingom
    out = om.spoji_zvanicne(fc, zv)
    assert (out["uparenih"], out["dodatih"]) == (1, 3)
    osm1 = next(f for f in out["features"] if f["geometry"]["coordinates"] == [19.84, 45.25])
    assert osm1["properties"] == {"t": "p", "sif": 1, "adr": "Trg galerija"}
    novi = sorted(f["properties"]["sif"] for f in out["features"] if f["properties"].get("zv"))
    assert novi == [2, 3, 4]
    assert len(out["features"]) == 6


def test_nsbike_stanice_spajanje():
    from sajt import osnova_mape as om
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"t": "i", "op": "JKP"}, "geometry": {"type": "Point", "coordinates": [19.8301, 45.2647]}},
        {"type": "Feature", "properties": {"t": "i", "ime": "eMTB.rs"}, "geometry": {"type": "Point", "coordinates": [19.8700, 45.2500]}},
    ]}
    st = [{"sif": "NSB03", "ime": "Železnička stanica", "adr": "Bulevar Jaše Tomića", "mesta": 14, "lat": 45.264725, "lon": 19.8304},
          {"sif": "NSB08", "ime": "Liman 3 (Dom zdravlja)", "adr": "Balzakova ulica", "mesta": 14, "lat": 45.241178, "lon": 19.831586}]
    out = om.spoji_nsbike(fc, st)
    assert out["nsbike_dodato"] == 1 and len(out["features"]) == 3
    stanica = next(f for f in out["features"] if f["properties"].get("sif") == "NSB03")
    assert stanica["geometry"]["coordinates"] == [19.8304, 45.264725] and stanica["properties"]["kap"] == 14
    assert any(f["properties"].get("ime") == "eMTB.rs" for f in out["features"])       # privatna ostaje


def test_nsbike_slike_iz_kml():
    from sajt import nsbike
    kml = """<kml><Document><Placemark><name>ШТРАНД/STRAND</name>
      <description><![CDATA[<img src="https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s16383" height="200" />]]></description>
      <ExtendedData><Data name="gx_media_links"><value>https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s16383</value></Data></ExtendedData>
      <Point><coordinates>19.848036,45.238023,0</coordinates></Point></Placemark>
      <Placemark><name>Daleko</name><Point><coordinates>19.70,45.30,0</coordinates></Point></Placemark></Document></kml>"""
    t = nsbike.tacke_iz_kml(kml)
    assert t[0]["slike"] == ["https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s800"]      # jedna, manja
    st = [{"sif": "NSB01", "lon": 19.848378, "lat": 45.238311}, {"sif": "NSB99", "lon": 19.9, "lat": 45.2}]
    assert nsbike.dodaj_slike(st, t) == 1 and "slike" in st[0] and "slike" not in st[1]
