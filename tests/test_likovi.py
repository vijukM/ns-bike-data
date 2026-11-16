"""Biciklisti za izbor (docs/likovi, docs/assets/nasicu, docs/assets/profil.js): spisak, sličice, filteri i provera sačuvanog izbora."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

DOCS = Path(__file__).resolve().parents[1] / "docs"
LIKOVI = json.loads((DOCS / "likovi" / "likovi.json").read_text(encoding="utf-8"))
IDS = [x["id"] for x in LIKOVI]


def test_spisak_likova_i_slicice():
    assert len(LIKOVI) == 52 and len(set(IDS)) == 52
    for x in LIKOVI:
        assert set(x) >= {"id", "ime", "opis", "grupa", "mini"}
        assert not {"svg", "png", "animacija"} & set(x)          # ti fajlovi nisu na sajtu
        assert x["mini"] == f"likovi/mini/{x['id']}.webp" and (DOCS / x["mini"]).is_file()
    assert sorted(p.stem for p in (DOCS / "likovi" / "mini").glob("*.webp")) == sorted(IDS)
    assert (DOCS / "mesto-voznje" / "reka" / "reka-dan.svg").is_file()


def test_katalog_panorama():
    """mesto-voznje/panorame.json: svaki fajl postoji, širina = viewBox fajla, visina 300; nema fajlova van kataloga."""
    K = json.loads((DOCS / "mesto-voznje" / "panorame.json").read_text(encoding="utf-8"))
    assert set(K["mesta"]) == {"reka", "centar", "bulevari", "periferija"}
    u_katalogu = set()
    for mesto, m in K["mesta"].items():
        for kljuc, put in m["panorame"].items():
            doba = kljuc.split("-")[0]
            assert doba in {"jutro", "dan", "predvece", "noc"}, kljuc
            assert put.startswith(f"{mesto}/{mesto}-"), put                  # mesto-voznje/<mesto>/<mesto>-<doba>.svg
            f = DOCS / "mesto-voznje" / put
            glava = f.read_text(encoding="utf-8")[:400]
            assert re.search(rf'viewBox="0 -?\d+ {m["sirina"]} 300"', glava), put   # y može biti pomeren (nivo staze)
            u_katalogu.add(put)
    na_disku = {p.relative_to(DOCS / "mesto-voznje").as_posix() for p in (DOCS / "mesto-voznje").rglob("*.svg")}
    assert na_disku == u_katalogu


def test_svaki_lik_ima_filter():
    profil = (DOCS / "assets" / "profil.js").read_text(encoding="utf-8")
    dozvoljene = set(re.findall(r'\["([a-z]+)", "[^"]+"\]', profil[profil.index("const KATEGORIJE"):profil.index("const podrazumevano")])) - {"svi"}
    assert dozvoljene == {"svakodnevni", "posao", "deca", "sportisti", "rekreativci", "specijalni"}
    for x in LIKOVI:
        assert x["kategorije"] and set(x["kategorije"]) <= dozvoljene, x["id"]
    assert all(any(k in x["kategorije"] for x in LIKOVI) for k in dozvoljene)


@pytest.mark.skipif(not shutil.which("node"), reason="nema node")
def test_spisak_odgovara_podesavanjima_likova():
    """Svaki lik iz likovi.json ima podešavanja u likovi-probni.js (koje crta scena „Reka“), i obrnuto."""
    js = f"""const K = require({json.dumps(str(DOCS / 'assets' / 'nasicu' / 'likovi-probni.js'))});
      console.log(JSON.stringify(Object.values(K).flat().map((l) => l.id)));"""
    probni = json.loads(subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True).stdout)
    assert sorted(probni) == sorted(IDS)


@pytest.mark.skipif(not shutil.which("node"), reason="nema node")
def test_provera_sacuvanog_izbora():
    """PROFIL.valjan: lik_id mora biti jedan od 52; mesto/vreme/doba samo gotove opcije, brzina/veličina u opsegu, inače podrazumevano."""
    js = f"""
      const P = require({json.dumps(str(DOCS / 'assets' / 'profil.js'))});
      const ids = {json.dumps(IDS)};
      const K = {json.dumps(json.loads((DOCS / "mesto-voznje" / "panorame.json").read_text(encoding="utf-8")))};
      console.log(JSON.stringify([
        P.valjan({{ lik_id: ids[7], mesto: 'reka', vreme: 'sunce', doba: 'dan', brzina: 1.5, velicina: 0.5 }}, ids),
        P.valjan({{ lik_id: ids[0], mesto: 'centar', vreme: 'kisa', doba: 'noc' }}, ids, K),
        P.valjan({{ lik_id: ids[0], mesto: 'reka', vreme: 'vedro', doba: 'noc' }}, ids, K),
        P.valjan({{ lik_id: ids[0], mesto: 'bulevari', vreme: 'vedro', doba: 'jutro' }}, ids, K),
        P.valjan({{ lik_id: 'nepostojeci' }}, ids),
        P.valjan({{ lik_id: ids[0], mesto: 'centar', vreme: 'kisa', doba: 'noc', brzina: 9, velicina: '0.5' }}, ids),
        P.valjan(null, ids), P.valjan({{ lik_id: 5 }}, ids),
      ]));"""
    r = json.loads(subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True).stdout)
    # staro „sunce“ → „vedro“
    assert r[0] == {"lik_id": IDS[7], "mesto": "reka", "vreme": "vedro", "doba": "dan", "brzina": 1.5, "velicina": 0.5}
    # sa katalogom: centar noću postoji, kiša još ne → vedro; reka noću postoji; bulevari ne postoje → reka (jutro ostaje)
    assert {k: r[1][k] for k in ("mesto", "doba", "vreme")} == {"mesto": "centar", "doba": "noc", "vreme": "vedro"}
    assert {k: r[2][k] for k in ("mesto", "doba", "vreme")} == {"mesto": "reka", "doba": "noc", "vreme": "vedro"}
    assert {k: r[3][k] for k in ("mesto", "doba", "vreme")} == {"mesto": "reka", "doba": "jutro", "vreme": "vedro"}
    assert r[4] is None and r[6] is None and r[7] is None
    # bez kataloga: samo podrazumevano; brojevi van opsega → podrazumevano
    assert r[5] == {"lik_id": IDS[0], "mesto": "reka", "vreme": "vedro", "doba": "dan", "brzina": 1, "velicina": 0.62}
