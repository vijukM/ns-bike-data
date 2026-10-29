"""SAJT — lozinka kapije i ključ za privremene linkove (docs/assets/kapija.js).

    python -m sajt.kapija "lozinka"            # samo ispiše nove vrednosti
    python -m sajt.kapija "lozinka" --upisi    # upiše ih u docs/assets/kapija.js

- SO, HES: PBKDF2-SHA256 lozinke (300.000 ponavljanja) — provera ulaza.
- JAVNI, TAJNI, SO_K: par ključeva ECDSA P-256 za privremene linkove. Javni ključ proverava potpis linka;
  tajni ključ (PKCS8) je šifrovan AES-GCM ključem iz iste lozinke (PBKDF2 sa SO_K), pa link može da
  napravi samo onaj ko zna lozinku. Uvek se pravi novi par: posle promene lozinke stari linkovi i ulazi ne važe.
Potreban je paket `cryptography` (samo za ovaj alat, ne i za sajt).
"""
from __future__ import annotations

import base64
import hashlib
import re
import secrets
import sys
from pathlib import Path

KAPIJA = Path(__file__).resolve().parents[1] / "docs" / "assets" / "kapija.js"
PONAVLJANJA = 300_000


def hes(lozinka: str, so: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", lozinka.encode("utf-8"), so, PONAVLJANJA).hex()


def napravi(lozinka: str) -> dict[str, str]:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    so, so_k, iv = secrets.token_bytes(16), secrets.token_bytes(16), secrets.token_bytes(12)
    tajni = ec.generate_private_key(ec.SECP256R1())
    javni = tajni.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    pkcs8 = tajni.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    aes = hashlib.pbkdf2_hmac("sha256", lozinka.encode("utf-8"), so_k, PONAVLJANJA)
    sifra = AESGCM(aes).encrypt(iv, pkcs8, None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {"SO": so.hex(), "HES": hes(lozinka, so), "SO_K": so_k.hex(), "JAVNI": b64(javni), "TAJNI": b64(iv + sifra)}


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    v = napravi(argv[0])
    for k, x in v.items():
        print(f"{k:6}= {x}")
    if "--upisi" in argv[1:]:
        s = KAPIJA.read_text(encoding="utf-8")
        for k, x in v.items():
            s, n = re.subn(rf'const {k} = "[^"]*";', f'const {k} = "{x}";', s, count=1)
            assert n == 1, k
        KAPIJA.write_text(s, encoding="utf-8")
        print("upisano u docs/assets/kapija.js")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
