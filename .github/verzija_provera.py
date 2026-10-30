"""Provera verzije aplikacije: svaki commit (bez merge-a) između BAZA i VRH koji menja nešto van podataka
mora da poveća VERZIJA u docs/assets/ljuska.js (oblik 1.X.YY) za tačno 1: 1.1.27 → 1.1.28, a posle .99 ide 1.(X+1).00.
Veći skok srednjeg ili prvog broja je dozvoljen (nova celina). Ne računaju se fajlovi koji u celom PR-u ostaju
isti (npr. privremeni workflow koji se doda pa obriše) — oni ne menjaju aplikaciju.

    python .github/verzija_provera.py <baza> <vrh>
"""
from __future__ import annotations

import re
import subprocess
import sys

FAJL = "docs/assets/ljuska.js"
PODACI = ("podaci/", "docs/data/", "sajt/podaci/", "docs/assets/slike/nsbike/")
RE = re.compile(r'const VERZIJA = "(\d+)\.(\d+)\.(\d{2})";')


def git(*a: str) -> str:
    return subprocess.run(["git", *a], check=True, capture_output=True, text=True).stdout


def verzija(rev: str) -> tuple[int, int, int] | None:
    try:
        m = RE.search(git("show", f"{rev}:{FAJL}"))
    except subprocess.CalledProcessError:
        return None
    return tuple(map(int, m.groups())) if m else None


def sledeca(v: tuple[int, int, int]) -> tuple[int, int, int]:
    return (v[0], v[1], v[2] + 1) if v[2] < 99 else (v[0], v[1] + 1, 0)


def tekst(v: tuple[int, int, int]) -> str:
    return f"{v[0]}.{v[1]}.{v[2]:02d}"


def main(baza: str, vrh: str) -> int:
    greske = []
    konacno = set(git("diff", "--name-only", f"{baza}...{vrh}").split())       # šta PR stvarno menja
    for c in git("rev-list", "--reverse", "--no-merges", f"{baza}..{vrh}").split():
        fajlovi = [f for f in git("diff-tree", "--no-commit-id", "--name-only", "-r", c).split()
                   if not f.startswith(PODACI) and f in konacno]
        if not fajlovi:
            continue
        pre, posle = verzija(f"{c}^"), verzija(c)
        naslov = git("log", "-1", "--format=%h %s", c).strip()
        if posle is None:
            greske.append(f"{naslov}: nema VERZIJA u {FAJL}")
        elif pre is None:
            print(f"ok  {naslov}: uvedena verzija {tekst(posle)}")
        elif posle == sledeca(pre) or posle[:2] > pre[:2]:
            print(f"ok  {naslov}: {tekst(pre)} → {tekst(posle)}")
        else:
            greske.append(f"{naslov}: verzija {tekst(pre)} → {tekst(posle)} (treba {tekst(sledeca(pre))}); menja {', '.join(fajlovi[:4])}")
    for g in greske:
        print("GREŠKA", g)
    return 1 if greske else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
