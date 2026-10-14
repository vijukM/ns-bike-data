# ns-bike-data

Prikupljanje **satnog biciklističkog saobraćaja** sa 27 brojačkih mesta u Novom Sadu (46 serija), za
primenu i ocenu modela predikcije iz master rada (FTN Novi Sad) na novim danima. Model je treniran na
istorijskim satnim podacima do 31.08.2026; ovaj repozitorijum od sada skuplja nove podatke uživo.

**Obim: samo biciklisti.** Podaci o motornim vozilima se ne preuzimaju, ne čuvaju i ne obrađuju.

## Šta radi

1. `scraper/citaj.py` — jednom na sat (u XX:02 po lokalnom vremenu) preuzima fajl sa biciklistima
   (`bicycles_georss_gps_sr.xml`, 57 unosa), čuva sirov XML i dodaje redove u dnevni CSV.
2. `scraper/satno.py` — iz čitanja „danas/juče" računa satne vrednosti po smeru i po seriji
   (posle prvog čitanja posle ponoći, za prethodni dan).
3. `.github/workflows/citaj.yml` — GitHub Actions pokreće čitanje i commit-uje `podaci/`.

## Izvor i preuzimanje

Izvor: UGZINS (Uprava za građevinsko zemljište i investicije Novi Sad), sistem Mikrobit QLTCnet —
<http://stari.ugzins.rs/SAUS/QLTCnetTrafficAgent> (samo http; IntraWeb 15 / IIS).

Filter na glavnoj stranici (ETYPETABLE: 0 = Sve, 1 = Vozila, 2 = Biciklisti) čuva se u **sesiji**, pa
`/rss` → „Preuzimanje" daje fajl sa biciklistima samo ako je u istoj sesiji izabrano „Biciklisti".
Inače se dobija fajl sa vozilima (`counters_georss_gps_sr.xml`).

`scraper/preuzimanje.py`, funkcija `preuzmi_bicikliste()`:

- **a) brza varijanta** (`requests.Session`, bez pregledača): glavna stranica → IntraWeb asinhroni događaj
  `$/callback?callback=ETYPETABLE.<Događaj>` sa ETYPETABLE=2 (rezerva: submit forme sa `IW_Action`) →
  `/rss` (mora da piše „Biciklisti") → klik na „Preuzimanje" (submit forme sa `IW_Action=<dugme>`, rezerva:
  asinhroni događaj dugmeta).
- **b) rezerva — Playwright** (headless Chromium): klik na radio „Biciklisti" → `/rss` →
  `page.expect_download()` + klik „Preuzimanje".
- **Obavezna provera sadržaja**: počinje sa `<?xml`, sadrži `<feed` i `counters:volume_today`; ako ima
  `counters:volume` / `counters:speed` / `counters:occ`, to je fajl sa vozilima → greška.

Istraživanje mehanizma (snima sve odgovore i IntraWeb JS fajlove):

```bash
python -m scraper.preuzimanje --istrazi istrazi/
```

Isto radi ručni workflow **istrazi** (Actions → istrazi → Run workflow) sa GitHub servera.

### Pristojno korišćenje

- jedno preuzimanje po čitanju, **jedno čitanje na sat**;
- običan User-Agent pregledača (Chrome); menja se promenljivom okruženja `NS_BIKE_USER_AGENT`;
- timeout 30 s; ako preuzimanje ne uspe, isto pokretanje pokušava ponovo posle 3 i posle 6 min (brza
  varijanta, pa Playwright) — najviše 3 preuzimanja na sat.

## Lokalno pokretanje

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest                                   # testovi
python -m scraper.citaj                  # jedno čitanje -> podaci/
python -m scraper.satno                  # satne vrednosti za juče -> podaci/YYYY/MM/DD/satno.csv
python -m scraper.satno --spoji          # svi dani u jedan fajl -> podaci/satno.parquet (samo lokalno)
# rezerva sa pregledačem (samo ako brza varijanta ne radi):
pip install playwright && python -m playwright install chromium
python -m scraper.citaj --metod pregledac
```

Opcije `citaj.py`: `--metod auto|brza|pregledac`, `--pokusaji-u 0,180,360` (trenuci pokušaja u sekundama od
početka pokretanja, env `NS_BIKE_POCETAK`), `--samo-ako-nema` (preskoči ako za
tekući sat već postoji čitanje), `--iz-fajla X.xml` (obrada lokalnog fajla, bez preuzimanja).
Izlazni kod je `2` ako preuzimanje ne uspe (zapis u `podaci/greske.log`).

## GitHub Actions + cron-job.org

**Podela posla:** cron-job.org je samo „budilnik“ — u XX:02 pošalje jedan HTTP zahtev GitHub-u. Samo
preuzimanje, obrada i commit se izvršavaju u GitHub Actions (za javne repozitorijume besplatno, bez
limita minuta na standardnim runner-ima; jedno pokretanje traje ≈ 30 s). GitHub-ov `schedule` kasni i
do desetine minuta i ponekad preskače pokretanja, zato je on samo rezerva. Workflow `citaj.yml`:

- `workflow_dispatch` (glavni) + `schedule` u XX:20 (rezerva: čita samo ako za tekući sat nema čitanja);
- Python 3.12 sa pip keš-om; Playwright Chromium se instalira **samo** ako brza varijanta ne uspe;
- u prvom čitanju dana i u čitanju u 01:xx pokreće i `satno.py` (obračun i Excel za juče);
- commit + push `podaci/` (`git pull --rebase` pre push-a, bez praznog commit-a); `concurrency` grupa
  sprečava preklapanje dva pokretanja.

### Token

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate:
- Repository access: **Only select repositories** → `ns-bike-data`;
- Permissions → Repository permissions → **Actions: Read and write** (ostalo ne treba);
- rok važenja po želji (zapišite kada ističe — po isteku čitanja preko cron-job.org prestaju).

### cron-job.org

Besplatan je; svaki posao sme da se izvršava najviše jednom u minuti (ovde: jednom na sat), broj poslova
po nalogu nije ograničen uz „fair use“. Na <https://console.cron-job.org/jobs/create>:

1. **Common** → Title: `ns-bike-data citaj`; URL: (vidi tabelu); Enable job: uključeno;
   Execution schedule: **Custom** → upisati izraz iz tabele (`2 * * * *`).
2. **Advanced** → Time zone, Request method, Headers (svaki header posebno: *Add header* → ključ i
   vrednost), Request body — kao u tabeli. Opciono: Notifications → obaveštenje mejlom kad poziv ne uspe.
3. **Test run** → očekivani odgovor je `204 No Content`; zatim **Create**. U GitHub-u (Actions → citaj)
   se pojavi novo pokretanje, a posle ~30 s i commit `podaci: čitanje …`.

| Polje | Vrednost |
|---|---|
| URL | `https://api.github.com/repos/<korisnik>/ns-bike-data/actions/workflows/citaj.yml/dispatches` |
| Execution schedule | Custom → `2 * * * *` (svakog sata u XX:02; sajt osvežava fajl na ~5 min, pa poslednje osvežavanje može biti do ~5 min pre ili posle punog sata — obračun to dozvoljava) |
| Time zone | `Europe/Belgrade` |
| Advanced → Request method | `POST` |
| Advanced → Headers | `Authorization: Bearer <fine-grained token>`<br>`Accept: application/vnd.github+json`<br>`X-GitHub-Api-Version: 2022-11-28` |
| Advanced → Request body | `{"ref":"main"}` |

Uspešan poziv vraća **HTTP 204** (bez sadržaja). `"ref"` mora biti grana na kojoj je `citaj.yml`
(podrazumevana grana repozitorijuma). Provera iz terminala:

```bash
curl -i -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<korisnik>/ns-bike-data/actions/workflows/citaj.yml/dispatches \
  -d '{"ref":"main"}'
```

Napomena: GitHub automatski gasi `schedule` posle 60 dana bez aktivnosti u repozitorijumu; ovde svaki
sat ima commit sa podacima, pa se to ne dešava dok čitanja rade.

## Format podataka

```
podaci/
  2026/                              godina
    10/                              mesec
      satno_2026-10.parquet, .csv    satne vrednosti po seriji za ceo mesec (osvežava se posle ponoći)
      master_2026-10.parquet         isto u formatu istorijskog mastera: stanica_id, ts, y_A, razlog_A (+ datum, sat)
      09/                            dan (lokalni datum čitanja)
        0002.csv, 0002.xml.gz        čitanje u 00:02 — CSV (57 redova) i sirov XML
        0102.csv, 0102.xml.gz        …  24 čitanja dnevno (HHMM = lokalno vreme čitanja)
        …
        2302.csv, 2302.xml.gz
        satno.csv                    24 sata × 46 serija za ovaj dan (upisuje se posle ponoći)
        satno_smerovi.csv            isto, po smeru
        satno_provera.csv            samo ako zbir sati odstupa od „juče"
  excel/
    bicikli_2026-10.xlsx             Excel za ceo mesec: sheet po seriji (15a … 51b), kao istorijska tabela
  greske.log                         neuspela čitanja (UTC vreme, metod, greška)
```

**Excel** (`podaci/excel/bicikli_YYYY-MM.xlsx`, osvežava se svake noći posle ponoći): jedan sheet po
seriji, kolone `Date | Time (01:00–24:00) | y_A | razlog_A | oznaka`. Stari dvosmerni brojači (25a, 26, 28, 40a/b, 41,
46a/b, 47, 51a/b) imaju `Date | Time | A01 | A02 | Sum | razlog_A | oznaka` (A01 = smer 1x, A02 = smer 2x,
Sum = A01 + A02 = `y_A`, kao u istorijskom masteru); u parquet fajlovima za model kolona je uvek `y_A`. `y_A` = broj biciklista (cilj
modela; feed daje A = samo bicikli; dvosmerne serije = zbir oba smera), `razlog_A` = `ok` ili razlog zašto
vrednost nedostaje (vidi dole), `oznaka` = neobičan sat po smeru. Vrednosti > 400 su crvene, nedostajući
sati sivi. Neobični sati (`scraper/anomalije.py`, vrednosti se ne menjaju):

| oznaka | boja | pravilo |
|---|---|---|
| `nula_dan` | narandžasto | smer je ceo dan imao 0 (moguće neispravan senzor) |
| `nula_niz` | narandžasto | ≥ 3 uzastopna sata sa 0 između 07:00 i 21:00, a smer tog dana ima ≥ 100 |
| `skok` | žuto | vrednost ≥ 50 i ≥ 3× veća od oba susedna sata |

Klase vozila (A/B/C), OCC i GAP iz istorijskog izvoza sajt ne objavljuje, pa ih nema.

Svako čitanje je **novi fajl** — postojeći fajlovi se ne menjaju (osim mesečnog zbira i `greske.log`).
`python -m scraper.satno --spoji` lokalno pravi `podaci/satno.parquet` sa svim danima (nije u repozitorijumu).

### Zauzeće prostora

Jedno čitanje ≈ 17 KB (CSV 11,5 KB + XML.gz 5,7 KB), dnevni satni fajlovi ≈ 0,2 MB, dakle ≈ 0,6 MB
dnevno, ≈ 220 MB godišnje na disku; git čuva fajlove kompresovano (≈ 3–5× manje). GitHub preporučuje
repozitorijum do 1 GB (jako preporučeno do 5 GB) i fajlove do 100 MB, što je daleko iznad potreba
jedne do dve godine prikupljanja. Broj commit-ova (24 dnevno ≈ 8 760 godišnje) nije ograničen.

**Ulazni fajl** (Atom + GeoRSS, Mikrobit; namespace `http://www.w3.org/2005/Atom` i
`http://www.mikrobit.si/schemas/counters/v1`): `volume_today` (danas do vremena brojača),
`volume_yesterday`, `volumethisyear`, `state` (1 = normalno, 6 = „nema saobraćaja“ u poslednjih 5 min —
validna nula, 0 = „nema podataka“ — uređaj > 30 min ne javlja, `danas` nije pouzdan), `date`/`time` =
lokalno vreme brojača (Europe/Belgrade), `<updated>` = UTC, decimalni zarez u `geoX`/`geoY`. Fajl se
osvežava otprilike svakog minuta. `<id>` **nije** jedinstven (npr. `0040-21` za 40NSa i 40NSb) —
ključ smera je `(locationID, direction, directionDesc)`.

**Čitanja** (`YYYY/MM/DD/HHMM.csv`): `vreme_citanja_utc, feed_updated_utc, location, locationID, direction,
directionDesc, serija, datum_brojaca (ISO), vreme_brojaca, danas, juce, ove_godine, state, stateDesc,
lat, lon`.

Dodatne kolone u svakom čitanju (`scraper/razlika.py`) — broj biciklista od prethodnog čitanja, po smeru:

| kolona | značenje |
|---|---|
| `bicikala_od_prethodnog` | `danas − danas_prethodno`; preko ponoći `juče − danas_prethodno + danas`. Kad su čitanja na sat, to je broj biciklista **u tom satu** |
| `minuta_od_prethodnog` | razmak vremena brojača (60 = tačno sat) |
| `prethodno_citanje_utc` | sa kojim čitanjem je poređeno |
| `razlog_razlike` | prazno, ili zašto vrednost nedostaje: `nema_prethodnog`, `nema_podataka` (state 0), `negativna_razlika`, `nema_vrednosti`, `razmak_vise_od_dana` |

Ovo je brzi pregled po smeru odmah posle čitanja; konačne satne vrednosti po seriji (sa proverom svežine
i zbira) daje `satno.py` posle ponoći.

**Mapiranje na serije**: regex `^(\d+)NS([ab]?)` nad `locationID` (34NSa → 34a, 26NS → 26,
15NSaPS → 15a). Vrednost serije = zbir svih smerova serije (25, 26, 28, 41, 47 i svaki uređaj
40/46/51 imaju 2 smera). Očekuje se 46 serija; `citaj.py` prijavljuje serije koje nedostaju ili su višak.

**Satne vrednosti** (`YYYY/MM/DD/satno.csv`, `YYYY/MM/satno_YYYY-MM.parquet`): `stanica_id, ts, y_A,
razlog_A, ts_utc, datum, sat` — kolone kao istorijski master (`stanica_id, ts, y_A, razlog_A`); feed daje
A (samo bicikli). `YYYY/MM/master_YYYY-MM.parquet` je isto na punoj naivnoj satnoj mreži kao master
(jesen: zadržan prvi od dva ista `ts`; proleće: nepostojeći sat = `nema_reda`).

- `ts` = **kraj sata**, lokalno vreme bez zone, konvencija 01:00–24:00; pošto tip datum-vreme ne poznaje
  „24:00“, sat 23–24 dana D ima `ts` = 00:00 dana D+1. Zato postoje i kolone **`datum`** (dan D) i
  **`sat`** (1–24): npr. biciklisti 13–14 h → `sat = 14`, a 23–24 h → `datum = D, sat = 24`;
- sat 00–01 = danas@01:02; sat (h−1)–h = danas@h:02 − danas@(h−1):02;
  sat 23–24 = „juče" iz prvog ispravnog čitanja posle ponoći (brojač već od novog dana) − danas@23:02;
- bez interpolacije; ispravan sat ima `razlog_A = ok`, inače je `y_A` prazno (NaN) uz razlog:
  - `nema_citanja` — čitanje u tom satu nije uspelo / ne postoji;
  - `nema_smera` — čitanje postoji, ali u njemu nema tog smera;
  - `zastarelo` — vreme brojača je više od 10 min pre punog sata ili je starije od 20 min od čitanja;
    od više ispravnih čitanja u istom satu uzima se ono čije je vreme brojača najbliže punom satu;
  - `nema_podataka` — `state = 0` („Nema podataka“) u nekom od dva čitanja koja omeđuju sat; brojač tada
    i dalje javlja sveže vreme, ali `danas` je zamrznut (često 0), pa to NIJE nula;
  - `negativna_razlika` — npr. reset brojača;
  - `nepotpun_sat` — vremena brojača dva čitanja nisu razmaknuta 50–70 min (npr. ručno dodatno čitanje);
- serija ima vrednost samo ako je imaju svi njeni smerovi;
- dan prelaska na letnje vreme ima 23 sata (nema oznake 02:00), na zimsko 25 (oznaka 02:00 dva puta —
  jednoznačno je `ts_utc`);
- `state = 6` („SIVO – nema saobraćaja“) znači da u poslednjih 5 min niko nije prošao — validna nula;
  `state = 0` („CRNO – nema podataka“) → `nema_podataka` (vidi gore);
- provera (`satno_provera.csv`): zbir sati ≠ „juče" (`zbir_sati_razlicit_od_juce`) i smerovi koji su ceo
  dan 0 (`nula_ceo_dan` — moguće neispravan senzor; odluka o seriji je na korisniku).

## Priprema podataka za model (`prognoza/priprema.py`)

`python -m prognoza.priprema` → `model_podaci/istorija.parquet` = `model/istorija.parquet` (očišćena istorija
iz paketa modela, 01.06–31.08.2026) + novi sati iz `podaci/YYYY/MM/master_YYYY-MM.parquet`, na punoj satnoj
mreži (rupa 01.09–08.10.2026 = `nema_reda`). Novi sati se čiste istim pravilima kao istorijski master
(`docs/MODEL_KONTEKST.md`, tačka 5); vrednost postaje NaN uz razlog:

| `razlog_A` | pravilo |
|---|---|
| `outlier` | y > 400 |
| `niz_nula` | ≥ 168 uzastopnih sati sa 0 |
| `nula_dan` | serija sa jednim smerom ceo dan 0, a inače (medijana 28 prethodnih dana) ima ≥ 50 dnevno |
| `skok`, `skok_okolina` | y > max(50, 4 × p90[stanica, sat, mesec]); okolina ±3 h ako y > max(30, 2 × p90); dan sa skokom na ≥ 3 stanice (gradski događaj) se ne dira |
| `otkaz_smera` | stari dvosmerni: slabiji smer < 2 % dnevnog zbira ≥ 3 dana zaredom **i** zbir serije < 60 % očekivanog (isti dan u nedelji, poslednje 4 nedelje) |
| `ok_jedan_smer` | isto, ali zbir je normalan (npr. 28: smer 11 broji oba smera) — vrednost je **validna** |

Fajl se ne commit-uje (pravi se iznova pre svake prognoze, za nekoliko sekundi), da repozitorijum ne raste
za ~1 MB dnevno. Potrebni su `model/istorija.parquet` i `model/p90.parquet` iz paketa modela.

## Ograničenja

- Granice sati određuju vremena brojača, ne pun sat. Sajt osvežava fajl na ~5 min i ponekad kasni do
  ~10 min, pa je pri čitanju u XX:02 vreme brojača od ~XX:52 do ~XX:02 (10.–13.10.: medijana XX:58,6,
  najranije XX:52). Svaki sat je zato približno (h−1):58 → h:58, a pri kašnjenju sajta do (h−1):52 → h:52;
  zbir sati dana je ipak tačno „juče“.
- Rezolucija je ograničena tačnošću pokretanja: ako čitanje kasni više od 15 min posle vremena brojača
  ili pređe u sledeći sat, pogođeni sati su NaN.
- Prvi (nepotpun) dan prikupljanja ima NaN za sate pre prvog čitanja.
- Izvor je javna veb-aplikacija bez dokumentovanog API-ja; promena IntraWeb stranice može da pokvari brzu
  varijantu (tada radi rezerva sa pregledačem, a greške se vide u `podaci/greske.log`).
- Podaci pripadaju UGZINS-u / Mikrobit sistemu; ovde se koriste isključivo za istraživanje u okviru
  master rada.
