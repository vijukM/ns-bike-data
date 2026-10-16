"""Geokodiranje adresa iz zvaničnog spiska parkirališta za bicikle (Nominatim, 1 upit/s) → geokod.json.
Privremeno, samo za poređenje sa OSM-om i PDF mapom (ne ide na sajt)."""
import json, re, time, pathlib, requests
D = pathlib.Path(__file__).parent
CIR = dict(zip("абвгдђежзијклљмнњопрстћуфхцчџшАБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШ",
               ["a","b","v","g","d","đ","e","ž","z","i","j","k","l","lj","m","n","nj","o","p","r","s","t","ć","u","f","h","c","č","dž","š",
                "A","B","V","G","D","Đ","E","Ž","Z","I","J","K","L","Lj","M","N","Nj","O","P","R","S","T","Ć","U","F","H","C","Č","Dž","Š"]))
lat = lambda t: "".join(CIR.get(c, c) for c in t)
MESTA = ["Kać", "Kisač", "Čenej", "Futog", "Veternik", "Rumenka", "Petrovaradin"]
def upiti(opis):
    o = lat(opis)
    mesto = next((x for x in MESTA if x in o), "Novi Sad")
    q = []
    ulica0 = re.sub(r"^(Ulica|Ugao ulica|Ugao)\s+", "", re.split(r"[,(]", o)[0]).strip()
    for x in ("Kać", "Kisač", "Čenej", "Rumenka", "Futog", "Veternik"):
        ulica0 = re.sub(rf",?\s*{x}$", "", ulica0).strip()
    broj = re.search(r"kućn\w* broj\w* (\d+\w?)", o)
    if broj and ulica0 and ulica0 not in MESTA:
        q.append(f"{ulica0} {broj.group(1)}, {mesto}")
    ime = re.findall(r"[„\"”“]([^„\"”“]+)[”“\"]", o)
    zagrada = re.findall(r"\(([^()]+)\)", o)
    for z in zagrada + ime:
        z = re.sub(r"^(plato ispred|ispred|kod|na uglu sa|u dvorištu|dvorište)\s+", "", z.strip()).replace("Doma zdravlja", "Dom zdravlja")
        z = re.sub(r",?\s*(Kać|Futog|Veternik|Petrovaradin|Rumenka|Čenej|Kisač)$", "", z)
        if z and z not in MESTA:
            q.append(f"{z}, {mesto}")
    if ulica0 and ulica0 not in MESTA:
        q.append(f"{ulica0}, {mesto}")
    return list(dict.fromkeys(q))
spisak = json.load(open(D / "spisak.json", encoding="utf-8"))
H = {"User-Agent": "ns-bike-data master rad (github.com/vijukM/ns-bike-data)"}
out = {}
dodatno = D / "dodatno.json"
if dodatno.exists():                       # drugi krug: samo ručno sastavljeni upiti, prethodni rezultati ostaju
    out = json.loads((D / "geokod.json").read_text(encoding="utf-8")) if (D / "geokod.json").exists() else {}
    spisak = {k: v for k, v in spisak.items() if k in json.loads(dodatno.read_text(encoding="utf-8"))}
    rucno = json.loads(dodatno.read_text(encoding="utf-8"))
    upiti = lambda opis, _r=rucno, _s=dict(spisak): next(v for k, v in _r.items() if _s.get(k) == opis)
for k in sorted(spisak, key=int):
    for q in upiti(spisak[k]):
        try:
            r = requests.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "jsonv2", "limit": 1, "countrycodes": "rs",
                             "viewbox": "19.60,45.40,20.05,45.13", "bounded": 1, "addressdetails": 0}, headers=H, timeout=30)
            time.sleep(1.1)
            j = r.json()
        except Exception as e:  # noqa: BLE001
            print(k, q, "greška", e); time.sleep(3); continue
        if j:
            out[k + ("_dod" if dodatno.exists() else "")] = {"q": q, "lon": float(j[0]["lon"]), "lat": float(j[0]["lat"]), "tip": j[0].get("addresstype") or j[0].get("type"), "ime": j[0].get("display_name", "")[:120]}
            break
    kk = k + ("_dod" if dodatno.exists() else "")
    print(k, out.get(kk, {}).get("q"), out.get(kk, {}).get("tip"), out.get(kk, {}).get("ime", "")[:80], flush=True)
(D / "geokod.json").write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
print("geokodirano", len(out), "od", len(spisak))
