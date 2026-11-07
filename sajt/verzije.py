"""SAJT — istorija verzija za admin stranu „Verzije i zadaci“ → docs/data/verzije.json.

Sve se čita iz git istorije: za svaki commit koji menja aplikaciju uzima se VERZIJA iz docs/assets/ljuska.js u tom
trenutku, naslov (prvi red poruke) i stavke (redovi „- …“ iz tela poruke). Commit-ovi koji samo dodaju podatke
(„podaci: čitanje …“, prognoze, preuzeti slojevi) i privremeni/istraživački commit-ovi se preskaču. Commit-ovi pre
uvođenja oznake verzije (pre 28. 10. 2026) grupišu se po danu.

Novi commit još nema hash, pa se njegov unos dodaje iz poruke koja ide u commit (isti fajl kao za `git commit -F`):
    python -m sajt.verzije --poruka poruka.txt     # pre commit-a: istorija iz gita + unos za trenutnu VERZIJA
    python -m sajt.verzije                         # samo istorija iz gita
Sledeće pokretanje isti unos ponovo napravi iz gita (sa hash-om). Test proverava da je prvi unos = VERZIJA.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

KOREN = Path(__file__).resolve().parent.parent
IZLAZ = KOREN / "docs" / "data" / "verzije.json"
LJUSKA = "docs/assets/ljuska.js"
TZ = ZoneInfo("Europe/Belgrade")
RE_VERZIJA = re.compile(r'const VERZIJA = "([\d.]+)"')

# commit-ovi koji samo dodaju podatke (ne menjaju aplikaciju)
PODACI = re.compile(r"^(podaci[: ]|prognoza biciklista \(|prognoza[: ]|vreme[: ]|vremenska prognoza|satni podaci|"
                    r"stanje brojača:|osnova mape|parking|staze:|sajt: podaci)", re.I)
# privremeni, istraživački i tehnički commit-ovi bez promene za korisnika
SUM = re.compile(r"^(istraživanje|istrazivanje|alat:|istrazi\.yml|proba:|create cname|delete cname|privremeno|"
                 r"brisanje privremene|sajt_istorija: sta=)", re.I)
PRIKOLICA = re.compile(r"^(co-authored-by|claude-session|signed-off-by):", re.I)


def _git(*a: str) -> str:
    return subprocess.run(["git", *a], cwd=KOREN, capture_output=True, text=True, check=True).stdout


def stavke_iz_tela(telo: str) -> list[str]:
    """Redovi „- …“ (nastavak u sledećim uvučenim redovima) → lista stavki; bez prikolica i stavke „verzija X“."""
    out: list[str] = []
    for red in telo.splitlines():
        if not red.strip() or PRIKOLICA.match(red.strip()):
            continue
        r = red.rstrip()
        m = re.match(r"^(\s*)[-*] (.*)$", r)
        if m:
            out.append(("— " if m.group(1) else "") + m.group(2).strip())
        elif out:
            out[-1] += " " + r.strip()
        else:
            out.append(r.strip())
    return [s for s in out if not re.fullmatch(r"(— )?verzija [\d.]+", s, re.I)]


def lokalno(iso: str) -> datetime:
    return datetime.fromisoformat(iso).astimezone(TZ)


def iz_gita() -> tuple[list[dict], list[dict]]:
    # %B (cela poruka) umesto %s/%b: kad posle naslova nema praznog reda, git %s spoji sve redove u jedan „naslov“
    zapis = _git("log", "--no-merges", "--reverse", "--format=%H%x1f%aI%x1f%B%x1e")
    po_verziji: dict[str, dict] = {}
    pre: dict[str, list[dict]] = {}
    for rec in zapis.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        h, kad, poruka = rec.split("\x1f")
        naslov, _, telo = poruka.strip("\n").partition("\n")
        naslov = naslov.strip()
        if PODACI.match(naslov) or SUM.match(naslov):
            continue
        try:
            m = RE_VERZIJA.search(_git("show", f"{h}:{LJUSKA}"))
        except subprocess.CalledProcessError:
            m = None
        t = lokalno(kad)
        if m:
            v = m.group(1)
            if v not in po_verziji:
                po_verziji[v] = {"verzija": v, "datum": t.strftime("%Y-%m-%dT%H:%M"), "naslov": naslov,
                                 "stavke": stavke_iz_tela(telo), "commit": h[:7]}
            else:   # isti broj u više commit-ova (npr. ispravka u istom PR-u): stavke se dodaju
                po_verziji[v]["stavke"] += [naslov] + stavke_iz_tela(telo)
        else:
            dan = t.strftime("%Y-%m-%d")
            lista = pre.setdefault(dan, [])
            if any(x["naslov"] == naslov for x in lista):
                continue
            lista.append({"vreme": t.strftime("%H:%M"), "naslov": naslov, "stavke": stavke_iz_tela(telo), "commit": h[:7]})
    kljuc = lambda v: tuple(int(x) for x in v["verzija"].split("."))
    verzije = sorted(po_verziji.values(), key=kljuc, reverse=True)
    dani = [{"dan": d, "stavke": pre[d]} for d in sorted(pre, reverse=True)]
    return verzije, dani


def iz_poruke(put: Path) -> dict:
    tekst = put.read_text(encoding="utf-8").strip().splitlines()
    m = RE_VERZIJA.search((KOREN / LJUSKA).read_text(encoding="utf-8"))
    return {"verzija": m.group(1), "datum": datetime.now(TZ).strftime("%Y-%m-%dT%H:%M"), "naslov": tekst[0].strip(),
            "stavke": stavke_iz_tela("\n".join(tekst[1:])), "commit": None}


def napravi(poruka: Path | None = None) -> dict:
    verzije, dani = iz_gita()
    if poruka:
        nova = iz_poruke(poruka)
        verzije = [v for v in verzije if v["verzija"] != nova["verzija"]]
        verzije.insert(0, nova)
    return {"generisano_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "opis": "Istorija verzija aplikacije (iz git commit-ova; python -m sajt.verzije).",
            "verzije": verzije, "pre_verzija": dani}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--poruka", type=Path, help="poruka commit-a koji se sprema (unos za trenutnu VERZIJA)")
    a = ap.parse_args()
    d = napravi(a.poruka)
    IZLAZ.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{IZLAZ.relative_to(KOREN)}: {len(d['verzije'])} verzija, {sum(len(x['stavke']) for x in d['pre_verzija'])} "
          f"izmena pre oznake verzije ({len(d['pre_verzija'])} dana)")


if __name__ == "__main__":
    main()
