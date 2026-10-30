# NaSicu — biciklisti Novog Sada

Sajt: **https://nasicu.rs** (GitHub Pages iz `docs/`, domen u `docs/CNAME`). Sajt je u korenu domena:
linkovi unutar sajta su relativni (`danas.html`, `assets/...`), a apsolutni (strane 404/403, `og:image`) počinju sa `/` ili `https://nasicu.rs/`.

Jezik projekta (kod, komentari, tekst na sajtu, commit poruke): srpski, latinica.

## Verzija aplikacije

Verzija je `const VERZIJA = "1.X.YY"` na vrhu `docs/assets/ljuska.js` i prikazuje se u dnu menija („v 1.1.27“).
Poslednji broj ima uvek dve cifre (00–99).

- **Svaki commit koji menja aplikaciju povećava poslednji broj za 1** (1.1.27 → 1.1.28), u istom commit-u;
  posle 1.X.99 ide 1.(X+1).00.
  Aplikacija je sve osim podataka: kod sajta (`docs/*.html`, `docs/assets/`), stil, generatori (`sajt/`),
  model i priprema (`prognoza_biciklista/`, `vremenska_prognoza/`), workflow-i, testovi, dokumentacija.
- **Ne računa se** commit koji samo dodaje podatke: automatska čitanja brojača („podaci: čitanje …“),
  prognoze i preuzeti slojevi — putanje `podaci/`, `docs/data/`, `sajt/podaci/`, `docs/assets/slike/nsbike/`.
- Veća promena (novi deo sajta, backend, nalozi) može da poveća srednji broj: 1.1.YY → 1.2.00.
- Proverava je workflow `.github/workflows/verzija.yml` (`.github/verzija_provera.py`) na svakom PR-u ka `main`.

## Pri svakoj izmeni sajta

- Povećati `?v=` (oblik `GGGGMMDDhhmm`) u svim `docs/*.html` kada se menja bilo koji fajl u `docs/assets/`,
  da posetioci ne dobiju stari keš.
- Strane 404/403 se ne menjaju ručno: `python -m sajt.strane_greske`.
- Testovi: `python -m pytest -q tests`.
- Strane u meniju: `MENI` u `docs/assets/ljuska.js`. `uskoro: true` = oznaka USKORO i skica strane;
  `zakljucano: true` = katanac, klik u meniju ne otvara stranu (nema je ni u pretrazi), a adresa i dalje radi.

## Kapija (lozinka dok sajt nije gotov)

- `docs/assets/kapija.js` se učitava u `<head>` svake strane (posle skripta za temu), uz `<meta name="robots" content="noindex, nofollow">`;
  `docs/robots.txt` zabranjuje indeksiranje. Nova strana mora imati oba reda (proverava `tests/test_kapija.py`).
- Proverava PBKDF2-SHA256 (300.000 ponavljanja) prema `SO` i `HES`; lozinka se ne čuva nigde u repozitorijumu.
- Privremeni pristup: dugme sa satom u dnu menija pravi link `?pristup=<istek>.<potpis>` koji važi 5 min – 1 dan.
  Potpis je ECDSA P-256; sajt ima `JAVNI` ključ, a `TAJNI` je šifrovan lozinkom (AES-GCM, PBKDF2 sa `SO_K`).
  Privremeni ulaz se zatvara čim istekne (i na otvorenoj strani).
- Nova lozinka: `python -m sajt.kapija "nova lozinka" --upisi` — pravi i nove ključeve, pa stari ulazi i linkovi prestaju da važe.
- Kada sajt postane javan: ukloniti oba reda iz strana, `kapija.js`, dugme „Zaključaj“ u `ljuska.js` i `robots.txt`.
- Ovo je zavesa, ne zaštita: `docs/data/*.json` i kod su i dalje javni.

## Profil, biciklista (avatar) i scena „Reka“

- Prijava/registracija (`docs/assets/prijava.js`) i profil sa biciklistom (`docs/assets/profil.js`) su odvojeni prozori.
  Ljuska ih učitava tek na klik (`LJ.ucitajSkript`): „Prijava“ u gornjoj traci, profil klikom na dno menija (`LJ.otvoriProfil`).
- Profil tek tada učitava `docs/assets/nasicu/` (`nasicu-likovi.js`, `likovi-probni.js`, `reka-scena.js`),
  `docs/likovi/likovi.json` i `docs/reka/reka-panorama.svg`.
- **Gotov materijal, ne menjati:** `docs/assets/nasicu/*.js` i `docs/reka/reka-panorama.svg` (crteži i logika likova/scene).
- Na sajtu su samo `likovi/mini/<id>.webp` (240×180) — bez svg/png/animacija verzija. `likovi.json` nema putanje do njih,
  a ima `kategorije` za filtere (svakodnevni, posao, deca, sportisti, rekreativci, specijalni; lik može biti u više).
- Čarobnjak u 4 koraka: biciklista (5 sličica po strani, filteri; pregled samo lika bez pozadine) → mesto → vreme → doba dana.
  Izbor koraka (oznake, pozadina) se ne prikazuje pre nego što se do njega dođe. Brzina i veličina: klizači, čuvaju se uz izbor.
- Vektorski se animira samo jedan lik (pauza van ekrana, u sakrivenom tabu, kad je prozor zatvoren i uz „manje pokreta“).
  Podešavanja scene i opsezi klizača su na vrhu `profil.js` (`SCENA`, `BRZINA`, `VELICINA`).
- Dok nema naloga, izbor se čuva u pregledaču (`localStorage` „ns-profil“: `lik_id`, `mesto`, `vreme`, `doba`, `brzina`, `velicina`),
  proveren sa `PROFIL.valjan`; dno menija prikazuje sličicu lika. Kad dođe backend: uz korisnika polje `lik_id` (nullable),
  provera da je jedan od 52 iz `likovi.json`.

## Dnevnik čitanja (strana „Preuzimanje podataka“)

- Čitanje brojača: `.github/workflows/citaj.yml` — cron-job.org u XX:02 (`workflow_dispatch`), ponovni pokušaji +3 i +6 min,
  rezerva u XX:20 (`schedule`, GitHub je zna zakasniti) čita samo ako za sat nema čitanja. Rezerva koja ne čita
  (`preskoceno=true`) ne obnavlja sajt i ne pravi commit.
- `scraper/citaj.py` upisuje svako pokretanje (pročitano ili greška) u `podaci/biciklisti/pokretanja.csv` (okidač, metod, ishod, fajl);
  greške su u `podaci/biciklisti/greske.log`.
- `python -m sajt.citanja` → `docs/data/citanja.json` (svaki dan × sat: minut čitanja, okidač, starost izvora, redovi, greške,
  nepravilnosti); pokreće se posle svakog čitanja. Strana: `docs/preuzimanje.html` + `docs/assets/preuzimanje.js`.

## Drumski saobraćaj (automobili)

- `scraper/drumski.py` čita `http://stari.ugzins.rs/SAUS/counters_georss_sr.xml` (rezerva `counters_georss_gps_sr.xml`,
  isti sadržaj sa decimalnim zarezom) u istom pokretanju kao biciklisti — poseban korak u `citaj.yml` sa `continue-on-error`,
  logika biciklista se ne menja.
- Fajl nema dnevnih zbirova: 172 trake (44 lokacije), stanje poslednjeg 5-minutnog intervala (vozila/h, km/h, sleđenje,
  zauzetost u promilima, stanje 1–6). Jedno čitanje na sat = jedan uzorak po satu.
- Čuva se `podaci/drumski/YYYY/MM/DD/HHMM.csv.gz` (sva polja; bez sirovog XML-a zbog veličine), greške u `podaci/drumski/greske.log`.
  Za sada se nigde ne prikazuje.

## Admin (grupa u meniju)

- Strane samo za upravljanje: **Kamere uživo** (`docs/kamere.html` + `assets/kamere.js`) i **Preuzimanje podataka**.
  Obe traže admin lozinku (`KAPIJA.trazAdmina`), i kad je sajt otključan.
- Kamere: spisak u `docs/data/kamere.json` (naziv, opis, `url` HLS prenosa) — menja se bez izmene koda. Strana sama
  proverava da li prenos radi (i drugi naziv fajla chunks.m3u8 ↔ playlist.m3u8), kamera koja ne radi dobija sivo
  „NE RADI“ i proverava se ponovo na 2 min; prenos se pauzira van ekrana. hls.js 1.5.20 sa jsdelivr (SRI).
  Opciono polje `slika` (snimak kamere, `docs/assets/slike/kamere/<id>.webp`) se prikazuje dok prenos ne radi;
  kamera bez slike dobija placeholder `nema-slike.svg`.
- Prenosi `srbija-nadlanu.ott.solutions` vraćaju 403 za zahteve sa nasicu.rs (server pušta samo svoje sajtove, npr.
  kamere.24sedam.rs; proverava Referer). Pregledač ne da JS-u da lažira Referer, pa strana (1) ne šalje Referer
  (`<meta name="referrer" content="no-referrer">` u `kamere.html`) i (2) ume da prenos provuče kroz proksi iz polja
  `proksi` u `kamere.json` (Cloudflare Worker u `kamere-proksi/`, šalje dozvoljeni Referer). Ovo je privremeno, za
  demo iza admin lozinke; za javni rad i za brojanje vozila treba dozvola/licenca vlasnika prenosa. Proksi radi samo
  za taj jedan izvor (nije otvoreni proksi).
- Preuzimanje: dnevnik čitanja biciklista, stanje prikupljanja drumskog saobraćaja (`stanje.json` iz repozitorijuma
  ns-trafic-data, adresa u `docs/data/admin.json`) i podsetnik za tokene (datumi isteka u `docs/data/admin.json`).
- `LJ.stalnoUzivo(sveze, tekst)` = isti znak „UŽIVO“ kao „Danas uživo“, ali ne zavisi od čitanja brojača.

## Ne menjati bez izričitog zahteva

- `docs/MODEL_KONTEKST.md` (opis modela prognoze).
- Na sajtu nema linkova ka kodu na GitHub-u.
