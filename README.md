# ns-bike-data

Prikupljanje **satnog biciklističkog saobraćaja** sa 27 brojačkih mesta u Novom Sadu (46 serija), za
primenu i ocenu modela predikcije iz master rada (FTN Novi Sad) na novim danima. Model je treniran na
istorijskim satnim podacima do 31.08.2026; ovaj repozitorijum od sada skuplja nove podatke uživo.

**Obim: samo biciklisti.** Podaci o motornim vozilima se ne preuzimaju, ne čuvaju i ne obrađuju.

## Šta radi

1. `scraper/citaj.py` — jednom na sat (u XX:01 po lokalnom vremenu) preuzima fajl sa biciklistima
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
- `User-Agent: ns-bike-data / master rad FTN Novi Sad (kontakt: …)` — kontakt se zadaje promenljivom
  okruženja `NS_BIKE_KONTAKT` (podrazumevano adresa ovog repozitorijuma);
- timeout 30 s, najviše 2 ponovna pokušaja sa pauzom 30–60 s.

## Lokalno pokretanje

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest                                   # testovi
python -m scraper.citaj                  # jedno čitanje -> podaci/
python -m scraper.satno                  # satne vrednosti -> podaci/satno.parquet, .csv
# rezerva sa pregledačem (samo ako brza varijanta ne radi):
pip install playwright && python -m playwright install chromium
python -m scraper.citaj --metod pregledac
```

Opcije `citaj.py`: `--metod auto|brza|pregledac`, `--ponavljanja N`, `--samo-ako-nema` (preskoči ako za
tekući sat već postoji čitanje), `--iz-fajla X.xml` (obrada lokalnog fajla, bez preuzimanja).
Izlazni kod je `2` ako preuzimanje ne uspe (zapis u `podaci/greske.log`).

## GitHub Actions + cron-job.org

GitHub-ov `schedule` kasni i do desetine minuta i ponekad preskače pokretanja, pa je glavni okidač
`workflow_dispatch` koji spoljni servis poziva tačno u XX:01. Workflow `citaj.yml`:

- `workflow_dispatch` (glavni) + `schedule` u XX:20 (rezerva: čita samo ako za tekući sat nema čitanja);
- Python 3.12 sa pip keš-om; Playwright Chromium se instalira **samo** ako brza varijanta ne uspe;
- u prvom čitanju posle ponoći pokreće i `satno.py`;
- commit + push `podaci/` (`git pull --rebase` pre push-a, bez praznog commit-a); `concurrency` grupa
  sprečava preklapanje dva pokretanja.

### Token

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate:
- Repository access: **Only select repositories** → `ns-bike-data`;
- Permissions → Repository permissions → **Actions: Read and write** (ostalo ne treba);
- rok važenja po želji (zapišite kada ističe — po isteku čitanja preko cron-job.org prestaju).

### cron-job.org

Create cronjob:

| Polje | Vrednost |
|---|---|
| URL | `https://api.github.com/repos/<korisnik>/ns-bike-data/actions/workflows/citaj.yml/dispatches` |
| Execution schedule | Custom → `1 * * * *` (svakog sata u XX:01) |
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
  sirovo/YYYY-MM-DD/HHMM.xml.gz   sirov XML (lokalni datum/vreme čitanja)
  snimci/YYYY-MM-DD.csv           jedan red po smeru po čitanju
  satno.parquet, satno.csv        satne vrednosti po seriji
  satno_smerovi.csv               satne vrednosti po smeru
  satno_provera.csv               odstupanja zbira sati od „juče"
  greske.log                      neuspela čitanja (UTC vreme, metod, greška)
```

**Ulazni fajl** (Atom + GeoRSS, Mikrobit; namespace `http://www.w3.org/2005/Atom` i
`http://www.mikrobit.si/schemas/counters/v1`): `volume_today` (danas do vremena brojača),
`volume_yesterday`, `volumethisyear`, `state` (1 = normalno, 6 = nema saobraćaja/kvar), `date`/`time` =
lokalno vreme brojača (Europe/Belgrade), `<updated>` = UTC, decimalni zarez u `geoX`/`geoY`. Fajl se
osvežava otprilike svakog minuta. `<id>` **nije** jedinstven (npr. `0040-21` za 40NSa i 40NSb) —
ključ smera je `(locationID, direction, directionDesc)`.

**Snimci** (`snimci/*.csv`): `vreme_citanja_utc, feed_updated_utc, location, locationID, direction,
directionDesc, serija, datum_brojaca (ISO), vreme_brojaca, danas, juce, ove_godine, state, stateDesc,
lat, lon`.

**Mapiranje na serije**: regex `^(\d+)NS([ab]?)` nad `locationID` (34NSa → 34a, 26NS → 26,
15NSaPS → 15a). Vrednost serije = zbir svih smerova serije (25, 26, 28, 41, 47 i svaki uređaj
40/46/51 imaju 2 smera). Očekuje se 46 serija; `citaj.py` prijavljuje serije koje nedostaju ili su višak.

**Satne vrednosti** (`satno.parquet`/`.csv`): `stanica_id, ts, y, razlog, ts_utc` — isti oblik kao
istorijski master (`stanica_id, ts, y_A, razlog_A`) uz dodatnu kolonu `ts_utc`.

- `ts` = **kraj sata**, lokalno vreme bez zone, konvencija 01:00–24:00; 24:00 = 00:00 sledećeg dana;
- sat 00–01 = danas@01:01; sat (h−1)–h = danas@h:01 − danas@(h−1):01;
  sat 23–24 = „juče" iz prvog ispravnog čitanja posle ponoći − danas@23:01;
- bez interpolacije; `y` je prazno (NaN) uz `razlog`:
  - `nema_citanja` — čitanje u tom satu nije uspelo / ne postoji;
  - `nema_smera` — čitanje postoji, ali u njemu nema tog smera;
  - `zastarelo` — vreme brojača nije posle pune sata ili je starije od 15 min od čitanja;
  - `kvar_state_N` — `state != 1` u nekom od potrebnih čitanja;
  - `negativna_razlika` — npr. reset brojača;
- serija ima vrednost samo ako je imaju svi njeni smerovi;
- dan prelaska na letnje vreme ima 23 sata (nema oznake 02:00), na zimsko 25 (oznaka 02:00 dva puta —
  jednoznačno je `ts_utc`);
- provera: kada su svi sati smera prisutni, zbir == „juče" (odstupanja idu u `satno_provera.csv`).

## Ograničenja

- Sat 00–01 sadrži i prvi minut sledećeg sata (čitanje je u 01:01); svaki sat je pomeren za ~1 min.
- Rezolucija je ograničena tačnošću pokretanja: ako čitanje kasni više od 15 min posle vremena brojača
  ili pređe u sledeći sat, pogođeni sati su NaN.
- Prvi (nepotpun) dan prikupljanja ima NaN za sate pre prvog čitanja.
- Izvor je javna veb-aplikacija bez dokumentovanog API-ja; promena IntraWeb stranice može da pokvari brzu
  varijantu (tada radi rezerva sa pregledačem, a greške se vide u `podaci/greske.log`).
- Podaci pripadaju UGZINS-u / Mikrobit sistemu; ovde se koriste isključivo za istraživanje u okviru
  master rada.
