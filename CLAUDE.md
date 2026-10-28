# NaSicu — biciklisti Novog Sada

Sajt: **https://nasicu.rs** (GitHub Pages iz `docs/`, domen u `docs/CNAME`). Sajt je u korenu domena:
linkovi unutar sajta su relativni (`danas.html`, `assets/...`), a apsolutni (strane 404/403, `og:image`) počinju sa `/` ili `https://nasicu.rs/`.

Jezik projekta (kod, komentari, tekst na sajtu, commit poruke): srpski, latinica.

## Verzija aplikacije

Verzija je `const VERZIJA = "1.0.N"` na vrhu `docs/assets/ljuska.js` i prikazuje se u dnu menija („v 1.0.N“).

- **Svaki commit koji menja aplikaciju povećava poslednji broj za 1** (1.0.125 → 1.0.126), u istom commit-u.
  Aplikacija je sve osim podataka: kod sajta (`docs/*.html`, `docs/assets/`), stil, generatori (`sajt/`),
  model i priprema (`prognoza_biciklista/`, `vremenska_prognoza/`), workflow-i, testovi, dokumentacija.
- **Ne računa se** commit koji samo dodaje podatke: automatska čitanja brojača („podaci: čitanje …“),
  prognoze i preuzeti slojevi — putanje `podaci/`, `docs/data/`, `sajt/podaci/`, `docs/assets/slike/nsbike/`.
- Veća promena (novi deo sajta, backend, nalozi) može da poveća srednji broj: 1.0.N → 1.1.0.
- Proverava je workflow `.github/workflows/verzija.yml` (`.github/verzija_provera.py`) na svakom PR-u ka `main`.

## Pri svakoj izmeni sajta

- Povećati `?v=` (oblik `GGGGMMDDhhmm`) u svim `docs/*.html` kada se menja bilo koji fajl u `docs/assets/`,
  da posetioci ne dobiju stari keš.
- Strane 404/403 se ne menjaju ručno: `python -m sajt.strane_greske`.
- Testovi: `python -m pytest -q tests`.
- Strane u meniju: `MENI` u `docs/assets/ljuska.js`. `uskoro: true` = oznaka USKORO i skica strane;
  `zakljucano: true` = katanac, klik u meniju ne otvara stranu (nema je ni u pretrazi), a adresa i dalje radi.

## Ne menjati bez izričitog zahteva

- `docs/MODEL_KONTEKST.md` (opis modela prognoze).
- Na sajtu nema linkova ka kodu na GitHub-u.
