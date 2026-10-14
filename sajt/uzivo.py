"""SAJT — „danas do Xh“ po stanici iz poslednjeg čitanja scraper-a → docs/data/uzivo.json (osvežava citaj.yml).

    python -m sajt.uzivo

Za svaku seriju: zbir kolone `danas` preko smerova (state 0 = nema podataka → null; state 6 = validna nula)
i sat do kog važi: vreme brojača zaokruženo na pun sat (20:56 → 21 h). Ne ulazi u istoriju ni u model.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from scraper import konfig

IZLAZ = konfig.KOREN / "docs" / "data" / "uzivo.json"


def poslednje_citanje(koren: Path = konfig.PODACI) -> Path | None:
    f = sorted(koren.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9].csv"))
    return f[-1] if f else None


def do_sata(vreme: str) -> int:
    h, m = (int(x) for x in str(vreme).split(":")[:2])
    return h + (1 if m >= 30 else 0)


def napravi(csv: Path) -> dict:
    c = pd.read_csv(csv, dtype={"serija": str})
    serije = {}
    for s, g in c.groupby("serija"):
        nema = (g["state"] == 0).any() or g["danas"].isna().any()
        serije[s] = [None if nema else int(g["danas"].sum()), do_sata(g["vreme_brojaca"].max())]
    return {"datum": str(c["datum_brojaca"].max()), "citanje_utc": str(c["vreme_citanja_utc"].iloc[0]),
            "napravljeno_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "serije": serije}


def main(argv=None) -> int:
    csv = poslednje_citanje()
    if csv is None:
        print("nema čitanja"); return 0
    IZLAZ.parent.mkdir(parents=True, exist_ok=True)
    IZLAZ.write_text(json.dumps(napravi(csv), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"uzivo.json iz {csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
