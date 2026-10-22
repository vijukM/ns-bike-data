"""Analiza mreže staza (sajt/staze_analiza.py) na izmišljenom kvartu: pravci, nazivi, brojači, prekidi, krajevi, udaljenost, delovi."""
from sajt import staze_analiza as sa

X0, Y0 = 19.80, 45.25


def ll(x, y):
    """metri od (X0, Y0) → [lon, lat]"""
    return [round(X0 + x / sa.KX, 6), round(Y0 + y / sa.KY, 6)]


def linija(*tacke):
    return {"type": "LineString", "coordinates": [ll(x, y) for x, y in tacke]}


def staza(i, t, *tacke):
    return {"type": "Feature", "properties": {"t": t, "id": i}, "geometry": linija(*tacke)}


def put(k, n, *tacke):
    return {"type": "Feature", "properties": {"k": k, **({"n": n} if n else {})}, "geometry": linija(*tacke)}


def podaci():
    # Bulevar (glavna, y=0, x 0–2000): staze sa obe strane (y=±12) od 0 do 1000 m; dalje bez staze
    # Severna (sporedna, y=400): staza 0–300, prekid 50 m, pa 350–800
    staze = {"type": "FeatureCollection", "preuzeto_utc": "2026-10-14T17:18Z", "features": [
        staza(1, "s", (0, 12), (1000, 12)), staza(2, "s", (0, -12), (1000, -12)),
        staza(3, "z", (0, 405), (300, 405)), staza(4, "z", (350, 405), (800, 405))]}
    putevi = {"type": "FeatureCollection", "preuzeto_utc": "2026-10-16T12:29Z", "features": [
        put("g", "Bulevar", (0, 0), (2000, 0)), put("s", "Severna", (0, 400), (800, 400)),
        put("s", "Daleka", (0, 1500), (500, 1500)), put("o", None, (0, 200), (100, 200))]}
    kvadrat = [ll(-50, -100), ll(2100, -100), ll(2100, 1600), ll(-50, 1600), ll(-50, -100)]
    delovi = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"n": "Kvart", "v": "quarter", "b": [*ll(-50, -100), *ll(2100, 1600)]}, "geometry": {"type": "Point", "coordinates": ll(1000, 700)}},
        {"type": "Feature", "properties": {"n": "Kvart", "v": "quarter"}, "geometry": {"type": "Polygon", "coordinates": [kvadrat]}}]}
    mesta = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"n": "Park", "t": "park"}, "geometry": {"type": "Point", "coordinates": ll(400, 900)}}]}
    stanice = {"serije": [
        {"serija": "1a", "mesto": 1, "naziv": "Bulevar (kod parka)", "lat": ll(500, 14)[1], "lon": ll(500, 14)[0], "prosek_12m": 800, "stanje": "radi"},
        {"serija": "1b", "mesto": 1, "naziv": "Bulevar (kod parka)", "lat": ll(500, -14)[1], "lon": ll(500, -14)[0], "prosek_12m": 700, "stanje": "radi"}]}
    return staze, putevi, delovi, mesta, stanice


def test_pravci_nazivi_i_brojaci():
    r = sa.analiziraj(*podaci())
    u = r["ukupno"]
    assert abs(u["km_linija"] - 2.8) < 0.05                       # 2 × 1000 + 300 + 450 m
    assert abs(u["km_pravaca"] - 1.8) < 0.05                      # obe strane bulevara = jedan pravac
    ulice = {x["n"]: x for x in r["ulice"]}
    assert set(ulice) == {"Bulevar", "Severna"}
    assert ulice["Bulevar"]["obe_strane"] > 1.9 and ulice["Bulevar"]["brojaci"] == [1] and ulice["Bulevar"]["prosek"] == 1500
    b = r["brojaci"][0]
    assert b["ulica"] == "Bulevar" and b["prosek"] == 1500 and b["udaljenost_m"] < 15          # sredina između a i b
    # obe deonice bulevara dobijaju brojač; staze Severne nemaju brojač
    assert r["deonice"]["1"][1] == 1 and r["deonice"]["2"][1] == 1 and r["deonice"]["3"][1] is None
    assert r["deonice"]["1"][2] < 0.6                             # pola linije je „pravac“


def test_prekid_i_kraj():
    r = sa.analiziraj(*podaci())
    assert len(r["prekidi"]) == 1
    p = r["prekidi"][0]
    assert p["ulica"] == "Severna" and 45 <= p["m"] <= 55 and not p["raskrsnica"]
    # staza bulevara staje na 1000 m, a glavna ulica ide do 2000 m: jedan kraj za obe strane
    assert len(r["krajevi"]) == 1
    k = r["krajevi"][0]
    assert k["ulica"] == "Bulevar" and k["strane"] == 2 and 900 <= k["m"] <= 1000 and len(k["put"]) > 10


def test_udaljenost_i_delovi():
    st, pu, de, me, sn = podaci()
    r = sa.analiziraj(st, pu, de, me, sn)
    c = r["udaljenost_puteva"]
    assert len(c) == len(pu["features"])
    assert c[0] == "0" and c[1] == "0" and c[3] == "-"             # bulevar i Severna imaju stazu; servisna se ne računa
    assert c[2] == "3"                                              # Daleka: ~1100 m od najbliže staze
    d = r["delovi"][0]
    assert d["n"] == "Kvart" and d["km_glavnih"] == 2.0
    assert abs(d["pokr_glavnih"] - 0.5) < 0.03                    # staza uz pola bulevara
    assert d["do_300"] < 1 and d["medijana_m"] < 300


def test_bez_naziva_po_mestu():
    st, pu, de, me, sn = podaci()
    st["features"].append(staza(5, "s", (300, 1000), (600, 1000)))          # kroz park, daleko od ulica
    r = sa.analiziraj(st, pu, de, me, sn)
    u = r["ulice"][r["deonice"]["5"][0]]
    assert u["n"] == "kod: Park" and u["van_ulice"]


def test_prelaz_nije_ulica():
    # kratka deonica preko bulevara (x=500, od y=−12 do y=12) spaja dve strane: prelaz, ne „Poprečna“ ulica
    st, pu, de, me, sn = podaci()
    st["features"].append(staza(6, "s", (500, -12), (500, 12)))
    pu["features"].append(put("s", "Poprečna", (500, -300), (500, 300)))
    r = sa.analiziraj(st, pu, de, me, sn)
    assert "Poprečna" not in {u["n"] for u in r["ulice"]}
    d = r["deonice"]["6"]
    assert d[0] == -1 and d[3] == "Bulevar"                                    # prelaz preko Bulevara
    assert r["ukupno"]["prelaza"] == 1


def test_l_deonica_se_deli_po_ulicama():
    # jedna OSM deonica: 400 m uz Severnu, pa skreće 300 m niz Zapadnu
    st, pu, de, me, sn = podaci()
    st["features"].append(staza(7, "s", (900, 405), (1300, 405), (1305, 100)))
    pu["features"] += [put("s", "Severna", (800, 400), (1400, 400)), put("s", "Zapadna", (1300, 400), (1300, 50))]
    r = sa.analiziraj(st, pu, de, me, sn)
    assert r["podela"]["7"] == [[0, 1], [1, 2]]
    imena = {r["ulice"][r["deonice"][k][0]]["n"] for k in ("7:0", "7:1")}
    assert imena == {"Severna", "Zapadna"}


def test_staza_uz_ulicu_bez_naziva():
    # staza uz bezimeni put (10 m), a ulica sa nazivom je 60 m dalje: ne uzima njen naziv
    st, pu, de, me, sn = podaci()
    st["features"].append(staza(8, "s", (0, 1010), (600, 1010)))
    pu["features"] += [put("s", None, (0, 1000), (600, 1000)), put("s", "Daleka2", (0, 1070), (600, 1070))]
    r = sa.analiziraj(st, pu, de, me, sn)
    u = r["ulice"][r["deonice"]["8"][0]]
    assert u["van_ulice"] and u["n"] != "Daleka2"
