"""SAJT — dnevnik čitanja brojača → docs/data/citanja.json (strana „Preuzimanje podataka“, deo „Dobavljanje uživo“).

    python -m sajt.citanja

Za svaki dan i svaki lokalni sat: koliko je čitanja bilo, kada (minut), ko ga je pokrenuo, koliko je star bio izvor,
koliko redova je stiglo, koliko brojača javlja da radi normalno, koliko je biciklista izbrojano od prethodnog čitanja
i koje su greške upisane u tom satu. Uz svaki sat idu oznake nepravilnosti (vidi NEPRAVILNOSTI).

Izvori (svi u podaci/biciklisti/): YYYY/MM/DD/HHMM.csv (jedno čitanje = jedan fajl), greske.log (neuspeli pokušaji)
i pokretanja.csv (okidač svakog pokretanja; postoji od 29. 10. 2026 — za ranija čitanja okidač se procenjuje po minutu).
"""
from __future__ import annotations

import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from scraper import konfig

KOREN = Path(__file__).resolve().parents[1]
IZLAZ = KOREN / "docs" / "data" / "citanja.json"

OCEKIVANI_MINUT = 2          # cron-job.org pokreće čitanje u XX:02
KASNO_OD_MINUTA = 10         # čitanje posle XX:10 = kasni (rezerva ili kasni ponovni pokušaj)
STAR_IZVOR_MIN = 20          # izvor (feed) stariji od ovoga u trenutku čitanja
REDOVA = 57                  # toliko redova (smerova) šalje izvor
NEPRAVILNOSTI = {
    "nema": "nema čitanja za ovaj sat",
    "kasno": f"čitanje posle XX:{KASNO_OD_MINUTA:02d}",
    "ponovo": "čitanje je uspelo tek u ponovnom pokušaju",
    "greska": "neuspeo pokušaj (greška u dnevniku)",
    "dva": "više čitanja u istom satu",
    "izvor": f"izvor stariji od {STAR_IZVOR_MIN} min ili sa vremenom iz budućnosti",
    "redovi": f"izvor nije poslao svih {REDOVA} redova",
}


def _utc(s: str) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def citaj_dnevnike(koren: Path) -> tuple[dict, dict]:
    """(greške po lokalnom (datum, sat), okidači po fajlu 'YYYY/MM/DD/HHMM')."""
    greske = defaultdict(list)
    gl = koren / "greske.log"
    if gl.exists():
        for red in gl.read_text(encoding="utf-8").splitlines():
            if "\t" not in red:
                continue
            t, poruka = red.split("\t", 1)
            lok = _utc(t).astimezone(konfig.TZ)
            # „metod=brza GreskaPreuzimanja: brza: HTTPError: 500 …“ (scraper spaja sve u jedan red)
            m = re.match(r"metod=(\S+)\s+(.*)", " ".join(poruka.split()))
            metod, opis = (m.group(1), m.group(2)) if m else ("", poruka)
            opis = re.sub(r"^GreskaPreuzimanja:\s*", "", opis)
            greske[(lok.date().isoformat(), lok.hour)].append({"t": f"{lok:%H:%M}", "metod": metod, "opis": opis[:140]})
    okidaci = {}
    pl = koren / "pokretanja.csv"
    if pl.exists():
        with open(pl, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("ishod") == "procitano" and r.get("fajl"):
                    okidaci[r["fajl"]] = r["okidac"]
    return greske, okidaci


def citanje(put: Path) -> dict:
    with open(put, encoding="utf-8") as f:
        redovi = list(csv.DictReader(f))
    if not redovi:
        return {"f": put.stem, "n": 0}
    r0 = redovi[0]
    t, izvor = _utc(r0["vreme_citanja_utc"]), _utc(r0.get("feed_updated_utc", ""))
    lok = t.astimezone(konfig.TZ)
    bicikala = [int(r["bicikala_od_prethodnog"]) for r in redovi if (r.get("bicikala_od_prethodnog") or "").lstrip("-").isdigit()]
    return {
        "f": put.stem,
        "t": f"{lok:%H:%M:%S}",
        "m": lok.minute,
        "izvor_min": round((t - izvor).total_seconds() / 60) if izvor else None,
        "n": len(redovi),
        "normalno": sum(1 for r in redovi if r.get("state") == "1"),
        "bicikala": sum(b for b in bicikala if b >= 0) if bicikala else None,
    }


def napravi(koren: Path | None = None, danas: date | None = None, sada_utc: datetime | None = None) -> dict:
    koren = koren or konfig.PODACI
    sada_utc = sada_utc or datetime.now(timezone.utc)
    sada = sada_utc.astimezone(konfig.TZ)
    danas = danas or sada.date()
    greske, okidaci = citaj_dnevnike(koren)
    folderi = sorted(p for p in koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]") if p.is_dir())
    dani = []
    for fol in folderi:
        d = date(int(fol.parent.parent.name), int(fol.parent.name), int(fol.name))
        po_satu = defaultdict(list)
        for p in sorted(fol.glob("[0-9][0-9][0-9][0-9]*.csv")):
            c = citanje(p)
            kljuc = f"{fol.relative_to(koren).as_posix()}/{p.stem}"
            c["okidac"] = okidaci.get(kljuc) or ("cron-job.org?" if c.get("m", 0) <= KASNO_OD_MINUTA else "rezerva?")
            po_satu[int(p.stem[:2])].append(c)
        prvi = min(po_satu) if fol == folderi[0] and po_satu else 0      # prvi dan: od prvog čitanja (početak prikupljanja)
        poslednji = sada.hour if d == danas else 23
        # promena vremena: u oktobru sat 02–03 postoji dva puta (dva čitanja su ispravna), u martu ga nema
        pomak = (datetime(d.year, d.month, d.day, 12, tzinfo=konfig.TZ).utcoffset() - datetime(d.year, d.month, d.day, tzinfo=konfig.TZ).utcoffset()).total_seconds()
        sati = []
        for h in range(24):
            cit, gr = po_satu.get(h, []), greske.get((d.isoformat(), h), [])
            if h < prvi or (d == danas and h > poslednji) or d > danas:
                sati.append({"h": h, "c": cit, "g": gr, "p": [], "van": True})
                continue
            p = []
            if not cit:
                # tekući sat: čitanje stiže u XX:02, a ponovni pokušaji do XX:08
                if not (d == danas and h == sada.hour and sada.minute < KASNO_OD_MINUTA):
                    p.append("nema")
            else:
                if len(cit) > 1:
                    p.append("dva")
                if any(c.get("m", 0) > KASNO_OD_MINUTA for c in cit):
                    p.append("kasno")
                elif any(c.get("m", 0) > OCEKIVANI_MINUT + 1 for c in cit):
                    p.append("ponovo")
                if any(c.get("izvor_min") is not None and (c["izvor_min"] > STAR_IZVOR_MIN or c["izvor_min"] < -1) for c in cit):
                    p.append("izvor")
                if any(c.get("n") != REDOVA for c in cit):
                    p.append("redovi")
            if gr:
                p.append("greska")
            napomena = ""
            if h == 2 and pomak < 0:
                p = [x for x in p if x not in ("dva", "izvor")]
                napomena = "prelazak na zimsko vreme: sat 02–03 se ponavlja, pa su dva čitanja ispravna (izvor tada kratko kasni sa satom)"
            elif h == 2 and pomak > 0:
                p = [x for x in p if x != "nema"]
                napomena = "prelazak na letnje vreme: sata 02–03 nema"
            sati.append({"h": h, "c": cit, "g": gr, "p": p, **({"napomena": napomena} if napomena else {})})
        dani.append({"datum": d.isoformat(), "sati": sati,
                     "citanja": sum(len(s["c"]) for s in sati), "nepravilnosti": sum(1 for s in sati if s["p"])})
    poslednje = None
    for dd in reversed(dani):
        cit = [c for s in dd["sati"] for c in s["c"]]
        if cit:
            poslednje = {"datum": dd["datum"], **cit[-1]}
            break
    return {
        "napravljeno_utc": f"{sada_utc:%Y-%m-%dT%H:%M:%SZ}",
        "ocekivani_minut": OCEKIVANI_MINUT, "kasno_od_minuta": KASNO_OD_MINUTA, "redova": REDOVA,
        "nepravilnosti": NEPRAVILNOSTI,
        "poslednje": poslednje,
        "dani": list(reversed(dani)),          # najnoviji dan prvi
    }


def main() -> int:
    r = napravi()
    IZLAZ.parent.mkdir(parents=True, exist_ok=True)
    IZLAZ.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(d["nepravilnosti"] for d in r["dani"])
    print(f"docs/data/citanja.json: {len(r['dani'])} dana, {n} sati sa nepravilnostima")
    return 0


if __name__ == "__main__":
    sys.exit(main())
