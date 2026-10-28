"""Provera verzije aplikacije: svaki commit (bez merge-a) između BAZA i VRH koji menja nešto van podataka
mora da poveća VERZIJA u docs/assets/ljuska.js za tačno 1 na poslednjem broju (npr. 1.0.125 → 1.0.126).

    python .github/verzija_provera.py <baza> <vrh>
"""
from __future__ import annotations

import re
import subprocess
import sys

FAJL = "docs/assets/ljuska.js"
PODACI = ("podaci/", "docs/data/", "sajt/podaci/", "docs/assets/slike/nsbike/")
RE = re.compile(r'const VERZIJA = "(\d+)\.(\d+)\.(\d+)";')


def git(*a: str) -> str:
    return subprocess.run(["git", *a], check=True, capture_output=True, text=True).stdout


def verzija(rev: str) -> tuple[int, int, int] | None:
    try:
        m = RE.search(git("show", f"{rev}:{FAJL}"))
    except subprocess.CalledProcessError:
        return None
    return tuple(map(int, m.groups())) if m else None


def main(baza: str, vrh: str) -> int:
    greske = []
    for c in git("rev-list", "--reverse", "--no-merges", f"{baza}..{vrh}").split():
        fajlovi = [f for f in git("diff-tree", "--no-commit-id", "--name-only", "-r", c).split() if not f.startswith(PODACI)]
        if not fajlovi:
            continue
        pre, posle = verzija(f"{c}^"), verzija(c)
        naslov = git("log", "-1", "--format=%h %s", c).strip()
        if posle is None:
            greske.append(f"{naslov}: nema VERZIJA u {FAJL}")
        elif pre is None:
            print(f"ok  {naslov}: uvedena verzija {'.'.join(map(str, posle))}")
        elif posle[:2] == pre[:2] and posle[2] == pre[2] + 1 or posle[:2] > pre[:2]:
            print(f"ok  {naslov}: {'.'.join(map(str, pre))} → {'.'.join(map(str, posle))}")
        else:
            greske.append(f"{naslov}: verzija {'.'.join(map(str, pre))} → {'.'.join(map(str, posle))} (treba +1); menja {', '.join(fajlovi[:4])}")
    for g in greske:
        print("GREŠKA", g)
    return 1 if greske else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
