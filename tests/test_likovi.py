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
    assert (DOCS / "reka" / "reka-panorama.svg").is_file()


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
      console.log(JSON.stringify([
        P.valjan({{ lik_id: ids[7], mesto: 'reka', vreme: 'sunce', doba: 'dan', brzina: 1.5, velicina: 0.5 }}, ids),
        P.valjan({{ lik_id: 'nepostojeci' }}, ids),
        P.valjan({{ lik_id: ids[0], mesto: 'centar', vreme: 'kisa', doba: 'noc', brzina: 9, velicina: '0.5' }}, ids),
        P.valjan(null, ids), P.valjan({{ lik_id: 5 }}, ids),
      ]));"""
    r = json.loads(subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True).stdout)
    assert r[0] == {"lik_id": IDS[7], "mesto": "reka", "vreme": "sunce", "doba": "dan", "brzina": 1.5, "velicina": 0.5}
    assert r[1] is None and r[3] is None and r[4] is None
    # opcije u izradi i brojevi van opsega → podrazumevano
    assert r[2] == {"lik_id": IDS[0], "mesto": "reka", "vreme": "sunce", "doba": "dan", "brzina": 1, "velicina": 0.62}
