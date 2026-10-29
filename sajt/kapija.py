"""SAJT — nova lozinka za kapiju (docs/assets/kapija.js): ispisuje SO i HES (PBKDF2-SHA256, 300.000 ponavljanja).

    python -m sajt.kapija "nova lozinka"            # samo ispiše
    python -m sajt.kapija "nova lozinka" --upisi    # upiše SO i HES u docs/assets/kapija.js

Posle promene svi raniji ulazi prestaju da važe (pregledač pamti HES uz ulaz).
"""
from __future__ import annotations

import hashlib
import re
import secrets
import sys
from pathlib import Path

KAPIJA = Path(__file__).resolve().parents[1] / "docs" / "assets" / "kapija.js"
PONAVLJANJA = 300_000


def hes(lozinka: str, so: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", lozinka.encode("utf-8"), so, PONAVLJANJA).hex()


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    so = secrets.token_bytes(16)
    h = hes(argv[0], so)
    print(f"SO  = {so.hex()}\nHES = {h}")
    if "--upisi" in argv[1:]:
        s = KAPIJA.read_text(encoding="utf-8")
        s = re.sub(r'const SO = "[0-9a-f]*";', f'const SO = "{so.hex()}";', s, count=1)
        s = re.sub(r'const HES = "[0-9a-f]*";', f'const HES = "{h}";', s, count=1)
        KAPIJA.write_text(s, encoding="utf-8")
        print(f"upisano u {KAPIJA.relative_to(KAPIJA.parents[2])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
