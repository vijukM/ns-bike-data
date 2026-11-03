"""Linije brojanja u kamere.json: ispravan oblik (krajevi u razmeri 0–1, jedinstveni id, boja)."""
import json
import re
from pathlib import Path

KAMERE = json.loads((Path(__file__).resolve().parent.parent / "docs" / "data" / "kamere.json").read_text(encoding="utf-8"))


def test_linije_ispravne():
    ukupno = 0
    for k in KAMERE["kamere"]:
        ids = [l["id"] for l in k.get("linije", [])]
        assert len(ids) == len(set(ids)), k["id"]
        for l in k.get("linije", []):
            ukupno += 1
            assert l["naziv"] and re.fullmatch(r"#[0-9a-fA-F]{6}", l["boja"]), l
            for t in (l["a"], l["b"]):
                assert len(t) == 2 and all(0 <= x <= 1 for x in t), l
            assert l["a"] != l["b"]
    assert ukupno >= 9
