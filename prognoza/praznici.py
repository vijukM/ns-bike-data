"""Državni praznici Srbije (neradni dani) — za obeležje is_holiday.

Zakon o državnim i drugim praznicima u Republici Srbiji:
  Nova godina 1–2.1, Božić 7.1, Sretenje 15–16.2, Praznik rada 1–2.5, Dan primirja 11.11,
  Vaskrs (pravoslavni): od Velikog petka zaključno sa drugim danom Vaskrsa (petak–ponedeljak).
  Ako Nova godina, Sretenje, Praznik rada ili Dan primirja padne u nedelju, ne radi se prvi naredni radni dan;
  ako se Praznik rada poklopi sa vaskršnjim danima, neradni dani se pomeraju na prve naredne radne dane.

Lista se mora poklapati sa is_holiday iz trening podataka (model/praznici.csv) — provera u testovima / ručno
`python -m prognoza.praznici --proveri model/praznici.csv`. Razlike se prijavljuju, lista se ne „popravlja“.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path


def pravoslavni_uskrs(godina: int) -> date:
    """Pravoslavni Vaskrs (julijanski računa, gregorijanski datum; važi za 1900–2099)."""
    a, b, c = godina % 4, godina % 7, godina % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    mesec, dan = divmod(d + e + 114, 31)
    return date(godina, mesec, dan + 1) + timedelta(days=13)


@lru_cache(maxsize=None)
def praznici(godina: int) -> frozenset[date]:
    u = pravoslavni_uskrs(godina)
    vaskrs = {u + timedelta(days=k) for k in (-2, -1, 0, 1)}
    dani = set(vaskrs) | {date(godina, 1, 7)}
    for grupa in ([date(godina, 1, 1), date(godina, 1, 2)], [date(godina, 2, 15), date(godina, 2, 16)],
                  [date(godina, 5, 1), date(godina, 5, 2)], [date(godina, 11, 11)]):
        for d in grupa:
            if d in vaskrs:  # Praznik rada u vaskršnje dane → pomera se
                continue
            dani.add(d)
        # nedelja ili poklapanje sa Vaskrsom → prvi naredni radni dan(i)
        za_pomeranje = sum(1 for d in grupa if d.weekday() == 6 or d in vaskrs)
        sledeci = max(grupa)
        while za_pomeranje:
            sledeci += timedelta(days=1)
            if sledeci.weekday() < 5 and sledeci not in dani:
                dani.add(sledeci)
                za_pomeranje -= 1
    return frozenset(dani)


def is_holiday(d: date) -> bool:
    return d in praznici(d.year)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proveri", type=Path, help="CSV sa danima is_holiday = 1 iz treninga (kolona sa datumom)")
    ap.add_argument("--od", type=int, default=2021)
    ap.add_argument("--do", type=int, default=2026)
    a = ap.parse_args(argv)
    nase = {d for g in range(a.od, a.do + 1) for d in praznici(g)}
    if not a.proveri:
        for d in sorted(nase):
            print(d.isoformat())
        return 0
    import pandas as pd
    t = pd.read_csv(a.proveri)
    kol = next(c for c in t.columns if "dat" in c.lower() or c.lower() in ("dan", "date"))
    trening = {d.date() for d in pd.to_datetime(t[kol])}
    trening = {d for d in trening if a.od <= d.year <= a.do}
    samo_nase, samo_trening = sorted(nase - trening), sorted(trening - nase)
    print(f"poklapa se: {len(nase & trening)}; samo naše pravilo: {len(samo_nase)}; samo trening: {len(samo_trening)}")
    for d in samo_nase:
        print("  samo pravilo:", d, d.strftime("%A"))
    for d in samo_trening:
        print("  samo trening:", d, d.strftime("%A"))
    return 0 if not samo_nase and not samo_trening else 1


if __name__ == "__main__":
    sys.exit(main())
