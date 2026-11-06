"""SAJT — glavni bulevari za malu mapu na strani „Poređenje stanica“ → docs/data/mapa/bulevari.geojson.

Iz docs/data/mapa/putevi.geojson (pravi ga sajt/osnova_mape.py) uzima ulice (bez servisnih i pešačkih) čiji naziv počinje sa
„Bulevar“, pojednostavljuje linije (Douglas–Peucker, ~15 m) i zaokružuje koordinate, da sloj bude mali.

    python -m sajt.bulevari          # posle osveženja osnove mape
"""
from __future__ import annotations

import json
import math
from pathlib import Path

KOREN = Path(__file__).resolve().parent.parent
ULAZ = KOREN / "docs" / "data" / "mapa" / "putevi.geojson"
IZLAZ = KOREN / "docs" / "data" / "mapa" / "bulevari.geojson"
TOLERANCIJA_M = 15


def _dp(tacke: list, tol: float) -> list:
    """Douglas–Peucker u metrima (lokalna projekcija oko Novog Sada)."""
    if len(tacke) < 3:
        return tacke
    kx = 111_320 * math.cos(math.radians(45.25))
    xy = [(x * kx, y * 110_540) for x, y in tacke]

    def rast(p, a, b):
        (px, py), (ax, ay), (bx, by) = p, a, b
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    zadrzi = [False] * len(tacke)
    zadrzi[0] = zadrzi[-1] = True
    stek = [(0, len(tacke) - 1)]
    while stek:
        i, j = stek.pop()
        m, k = 0.0, None
        for n in range(i + 1, j):
            d = rast(xy[n], xy[i], xy[j])
            if d > m:
                m, k = d, n
        if k is not None and m > tol:
            zadrzi[k] = True
            stek += [(i, k), (k, j)]
    return [t for t, z in zip(tacke, zadrzi) if z]


def napravi(ulaz: Path = ULAZ, izlaz: Path = IZLAZ) -> dict:
    g = json.loads(ulaz.read_text(encoding="utf-8"))
    po_nazivu: dict[str, list] = {}
    for f in g["features"]:
        p = f["properties"]
        n = p.get("n") or ""
        if p.get("k") not in ("a", "g", "s") or not n.startswith("Bulevar"):
            continue
        geo = f["geometry"]
        linije = [geo["coordinates"]] if geo["type"] == "LineString" else geo["coordinates"] if geo["type"] == "MultiLineString" else []
        for l in linije:
            po_nazivu.setdefault(n, []).append([[round(x, 5), round(y, 5)] for x, y in _dp(l, TOLERANCIJA_M)])
    out = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"n": n}, "geometry": {"type": "MultiLineString", "coordinates": l}}
        for n, l in sorted(po_nazivu.items())]}
    izlaz.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


if __name__ == "__main__":
    o = napravi()
    print(f"{IZLAZ.relative_to(KOREN)}: {len(o['features'])} bulevara, {IZLAZ.stat().st_size // 1024} KB")
