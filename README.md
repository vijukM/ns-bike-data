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

- **direktno (prvo)**: isti fajl javno stoji u folderu servisa —
  <http://stari.ugzins.rs/SAUS/bicycles_georss_gps_sr.xml> (IIS ga osvežava na par minuta). Jedan GET, bez sesije i
  filtera; sadržaj je bajt po bajt isti kao preko „Preuzimanje" (provereno 16. 10. 2026.). Ostale varijante su rezerva.
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
python -m scraper.citaj                  # jedno čitanje -> podaci/biciklisti/
python -m scraper.satno                  # satne vrednosti za juče -> podaci/biciklisti/YYYY/MM/DD/satno.csv
python -m scraper.satno --spoji          # svi dani u jedan fajl -> podaci/biciklisti/satno.parquet (samo lokalno)
# rezerva sa pregledačem (samo ako brza varijanta ne radi):
pip install playwright && python -m playwright install chromium
python -m scraper.citaj --metod pregledac
```

Opcije `citaj.py`: `--metod auto|brza|pregledac`, `--pokusaji-u 0,180,360` (trenuci pokušaja u sekundama od
početka pokretanja, env `NS_BIKE_POCETAK`), `--samo-ako-nema` (preskoči ako za
tekući sat već postoji čitanje), `--iz-fajla X.xml` (obrada lokalnog fajla, bez preuzimanja).
Izlazni kod je `2` ako preuzimanje ne uspe (zapis u `podaci/biciklisti/greske.log`).

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

Sve što se preuzme se trajno čuva u repozitorijumu. Tri jasno odvojena dela:

```
podaci/
  biciklisti/                        BROJAČI BICIKLISTA (scraper, svakog sata)
    2026/10/09/
      0002.csv, 0002.xml.gz          čitanje u 00:02 — CSV (57 redova) i sirov XML; 24 čitanja dnevno
      …
      satno.csv, satno_smerovi.csv   24 sata × 46 serija za ovaj dan (po seriji / po smeru)
      satno_provera.csv              samo ako zbir sati odstupa od „juče" ili je smer ceo dan 0
    2026/10/satno_2026-10.parquet    satne vrednosti za ceo mesec; master_2026-10.parquet = format mastera
    excel/bicikli_2026-10.xlsx       Excel za ceo mesec, sheet po seriji (15a … 51b)
    greske.log                       neuspela čitanja
  vremenska_prognoza/                VREMENSKA PROGNOZA, uz svako izdavanje prognoze biciklista (01, 07, 13, 19 h)
    za_model/2026/10/14/0115.json    Open-Meteo best_match — ULAZ MODELA biciklista (sirov odgovor)
    drugi_izvori/<izvor>/2026/10/14/0115.json   samo za poređenje: open_meteo_icon_d2, _icon_eu, _ecmwf_ifs025,
                                     _gfs_seamless, _meteofrance_seamless, _ukmo_seamless, met_norway (yr.no)
    stvarno/2026/10/2026-10-13.json  „stvarno“ vreme za dan (Open-Meteo analiza sutradan, ERA5 posle ~5–7 dana)
    prognoza_vs_stvarno/2026/10/2026-10-13.csv  svaka prognoza × sat × promenljiva: datum, vreme_lokalno,
                                     promenljiva, izvor, izdato_utc, horizont_h, prognoza, stvarno, greska,
                                     aps_greska, stvarno_izvor
    prognoza_vs_stvarno/rezime.csv   koji izvor najbolje pogađa: izvor, promenljiva, horizont (0–24 / 24–48 /
                                     48+ h), n, MAE, RMSE, bias, dana, od, do
    excel/vremenska_prognoza_2026-10.xlsx   ceo grad, red po satu (poslednja prognoza izdata pre tog sata)
  prognoza_biciklista/               PROGNOZA BICIKLISTA (izlaz modela)
    2026/10/15/2026-10-15_0115_zvanicna.parquet, .json   prognoza za 15.10. izdata 15.10. u 01:15
    2026/10/15/2026-10-14_1915_osvezavanje.parquet, .json
    zvanicne/2026-10-15.parquet      zvanična prognoza (01:xx) — nikad se ne prepisuje
    prognoza_vs_stvarno/2026/10/2026-10-15.csv  svako izdanje × stanica × sat: datum, sat, ts, stanica_id, vrsta,
                                     izdato_utc, horizont_h, prognoza, q10, q90, tft, xgb, stvarno, razlog_A,
                                     greska, aps_greska, u_intervalu, naive_t168, nepouzdano
    prognoza_vs_stvarno/rezime_dnevno.csv   zvanične po danu: datum, prozor, n, RMSE, MAE, bias, WAPE_%,
                                     pokrivenost_%, RMSE_naive, MAE_naive, neobicne_stanice, gradski_dogadjaj
    prognoza_vs_stvarno/po_stanici.csv      zvanične kumulativno: prozor, stanica_id, n, RMSE, MAE, bias, WAPE_%,
                                     pokrivenost_%, RMSE_naive, dana
    iskljucene_serije.log            povratak isključene serije (28), ako se desi
    greske.log                       neuspela izdavanja
docs/data/ocena_prognoze_biciklista.json   ocena za sajt (dnevni RMSE model vs. naive, referenca 12,85)
docs/data/prognoza_biciklista.json   poslednja prognoza biciklista za sajt (danas, sutra; isključene serije)
model/                               paket modela (GitHub Release model-v1; nije u git-u)
model_podaci/                        privremeni ulazi modela (nije u git-u)
```

**Excel** (`podaci/biciklisti/excel/bicikli_YYYY-MM.xlsx`, osvežava se svake noći posle ponoći): jedan sheet po
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
`python -m scraper.satno --spoji` lokalno pravi `podaci/biciklisti/satno.parquet` sa svim danima (nije u repozitorijumu).

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

## Priprema podataka za model (`prognoza_biciklista/priprema.py`)

`python -m prognoza_biciklista.priprema` → `model_podaci/istorija.parquet` = `model/istorija.parquet` (očišćena istorija
iz paketa modela, 01.06–31.08.2026) + novi sati iz `podaci/biciklisti/YYYY/MM/master_YYYY-MM.parquet`, na punoj satnoj
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

## Vremenska prognoza (`vremenska_prognoza/open_meteo.py`) i praznici (`prognoza_biciklista/praznici.py`)

`python -m vremenska_prognoza.open_meteo` preuzima Open-Meteo Forecast API (bez ključa; lat 45.33, lon 19.85,
`timezone=GMT` — sirov odgovor se čuva **u UTC**, `past_days=8`, `forecast_days=3` — sa 2 dana fali Cas 24:00 za
sutra, satno), čuva ga u `podaci/vremenska_prognoza/za_model/YYYY/MM/DD/HHMM.json` (stariji fajlovi su u
Europe/Belgrade i čitaju se isto) i pravi tabelu u formatu treninga: `Datum` + `Cas` 01:00–24:00 (kraj sata).
Sat modela bira **jedna** funkcija, `oznaka_modela(df, meteo_vreme)`:
`"lokalno"` (podrazumevano, model-v1: lokalno vreme T → Cas T + 1 h; DST: prolećna rupa interpolirana, jesenji
duplikat usrednjen) ili `"utc1"` (kandidat za model-v2: isti trenutak na satu UTC+1, bez DST rupa i duplikata). Promenljive: temperatura ←
temperature_2m, vlaznost ← relative_humidity_2m, brzina_vetra ← wind_speed_10m (km/h), insolacija ←
shortwave_radiation, oblacnost ← cloud_cover, padavine ← precipitation, sneg_U ← snow_depth (m),
vlaznost_zemljista ← soil_moisture_0_to_7cm (od pre 24 h). Izvedeno: padavine_pre_1h, padavine_3h,
padavine_dan, sati_kise_dan (> 0,1 mm), sat/dan/doy sin-cos, is_weekend, is_holiday, trend.

`is_holiday`: državni praznici Srbije po zakonu (Nova godina, Božić, Sretenje, Praznik rada, Dan primirja,
pravoslavni Vaskrs petak–ponedeljak; prenos sa nedelje na prvi radni dan). Provera prema trening listi:
`python -m prognoza_biciklista.praznici --proveri model/praznici.csv` (razlike se prijavljuju, lista se ne menja).

## Sajt — istorija 2021–2026 (faza 7a, `docs/`)

Statički sajt (GitHub Pages iz `docs/`, bez build koraka; MapLibre GL 4.7.1 i ECharts 5.5.1 sa jsDelivr-a, sa SRI
proverom; fontovi Inter / Inter Tight / JetBrains Mono), srpski latinicom. Izgled po uzoru na Adminator (MIT):
levi meni, gornja traka (putanja, pretraga stanica `Ctrl K` ili `/`, jezik SR/EN — engleski za sada samo poruka
„uskoro“, obaveštenja o brojačima koji ne rade, prečica za svetlu/tamnu temu i panel **Prilagodi** — tema (svetla, tamna, sistemska), boja naglaska (6), gustina, raspored menija (bočni, uzak, plutajući, gornji), širina sadržaja, smer teksta; `data-*` atributi na `<html>`, pamti se u localStorage (`ns-tema`, `ns-izgled`)), **podrazumevana tamna tema**. Za sada samo
istorija 01.01.2021 – 31.08.2026, bez prognoza i bez podataka uživo (grafici su spremni da ih dobiju kao nove serije).

| strana | sadržaj |
|---|---|
| `index.html` | kontrolna tabla: KPI kartice, mapa brojača i staza, najprometnija mesta, prstenovi, **priča koja se otkriva skrolovanjem** (6 koraka, grafik ostaje fiksiran), najprometnije stanice, brojači koji traže pažnju |
| `mapa.html` | velika mapa (MapLibre: pomeranje, rotacija, nagib, dugme 3D sa zgradama; izabrani pin postaje 3D model (Three.js, `assets/pin3d.js`, učitava se tek tada) koji se okreće posle odskakivanja; Tip mape: Standardna (OSM pločice, svetla — podrazumevana — ili tamna kroz filter boja) / Satelitska (Esri World Imagery) / Vektor sa nijansama tamno plavo–belo, sivo–belo, belo–crno; padajući meni „Natpisi“ na samoj mapi: nazivi ulica, delovi grada (klik na naziv zumira deo i ocrtava mu granicu; „Prikaži granice“ boji i ocrtava gradske delove, „Okolna naselja“ granice Petrovaradina, Kamenice, Veternika, Futoga…), parkovi i trgovi, važna mesta (samo vektorska i satelitska; glifovi Noto u `assets/glifovi/`, podaci `data/mapa/delovi.geojson`, `mesta.geojson`); grupa „Na mapi“: biciklističke staze i tačke za bicikliste (OSM + zvanični spisak 317 parkirališta JKP „Parking servis“ iz `sajt/podaci/parking_parkingns.json`, spojeni u `sajt/osnova_mape.py`; 16 zvaničnih NS bike stanica iz `sajt/podaci/nsbike_stanice.json` sa nazivom, opisom i brojem mesta, slikom (zvanična Google My Maps mapa → `docs/assets/slike/nsbike/`, `sajt/nsbike.py`) i stanjem uživo (`app.nsbike.rs/stanje`, preuzima se čim se uključe stanice); glavna štikla pali ili gasi sve 4 vrste, svaka ikonica se pali posebno: parking, NS bike, servisi, stanice za popravku); dugme za prikaz preko celog ekrana), staze, spisak sa pretragom i filterom po stanju, **dan na mapi** (`?rezim=dan&dan=2025-09-05&sat=7`, `?id=23a`) |
| `grafici.html` | grad po danu sa čipovima (biciklisti, prosek 7 dana, broj brojača, temperatura, padavine), poređenje godina, temperatura × biciklisti, dani u nedelji, mesec × godina; izvoz PNG |
| `stanice.html` | tabela: pretraga, filter po stanju, sortiranje, straničenje, izvoz CSV |
| `stanica.html?id=23a` | KPI, dnevno za ceo period, satni profil, toplotna mapa sat × dan, meseci po godinama, izabrani dan |
| `kalendar.html` | svaki dan 2021–2026 kao polje (grad po brojaču ili stanica; broj ili „prema uobičajenom“), detalji i satni grafik izabranog dana (`?id=34a&dan=…`) |
| `rekordi.html` | top dani, izbrojano po godini, vremenski rekordi, zanimljivosti, rekordi po brojaču |
| `ritam.html` | sat × dan u nedelji, brojčanik 24 h, godišnja doba, „kad grad ustaje“, radni dan kroz godine |
| ostale strane iz menija | „uskoro“ — skica kako će strana izgledati (ilustrativni podaci) i plan (`assets/uskoro.js`) |
| `o-projektu.html`, `404.html` | izvori i pravila, strana za nepostojeće adrese |

Ikonice pinova (`docs/assets/slike/pinovi/`) pokazuju stanje brojača u poslednjih 30 dana istorije: plava = radi
(≥ 90 % kompletnih dana), narandžasta = delimično, crvena = ne radi, crna = neispravan (28), obris = još nije
postavljen (dan na mapi), svetloplava = izabrana. Grafici se crtaju i animiraju tek kad dođu na ekran; gde podaci
fale, linija je isprekidana i siva (nikad 0).

Biciklističke staze: `python -m sajt.staze` (Overpass API, OpenStreetMap) → `docs/data/staze.geojson`
(izdvojena staza / traka na kolovozu / zajednička sa pešacima); pokreće se workflow-om `sajt_istorija` sa
`sta=staze` (kontejner za razvoj nema pristup Overpass-u).

Poster mape (vektorske, oštre na svakom zumu): `python -m sajt.osnova_mape` (Overpass) → `docs/data/mapa/`
(`putevi` sa klasom a/g/s/o, `voda`, `zelenilo`, `pruga`, `zgrade` sa visinom za 3D, samo uži centar, `parking` — parking za bicikle, NS bike, servisi, stanice za popravku); workflow
`sajt_istorija` sa `sta=mapa`. Sajt ih crta u MapLibre-u u tri stila (tamno plava, siva, bela); učitavaju se tek kad
se izabere poster podloga ili 3D.

Podaci (`docs/data/istorija/`, ~7,4 MB, ~2 MB komprimovano) se prave iz Release-a `istorija-v1` (parquet ne ide u git):

```bash
gh release download istorija-v1 -D istorija      # ili workflow „sajt_istorija“ (ručno)
python -m sajt.pripremi_istoriju                   # → docs/data/istorija/
cd docs && python -m http.server 8000              # http://localhost:8000
```

Pravila prikaza: master `ts` je kraj sata u fiksnom UTC+1 → `ts − 2 h` = početak u UTC → Europe/Belgrade
(dani promene vremena imaju 23/25 sati); meteo (`Datum`/`Cas`, lokalno) se spaja po lokalnom času. NaN se nikad
ne prikazuje kao 0; dnevni zbir postoji samo za kompletan lokalni dan; serija 28 je od 18.04.2026 neispravna i
van gradskih zbirova; gradski zbir ide uz broj uključenih brojača. Fajlovi:

| fajl | sadržaj |
|---|---|
| `stanice.json` | serije, naziv, smerovi, lat/lon (+ razmaknute za mapu), period rada, prosek 12 m, udeo kompletnih dana, napomena, šifre razloga |
| `grad_dnevno.json` | gradski zbir i broj serija po danu, dnevno vreme, praznici, mesečni proseci po seriji, činjenice |
| `dnevno/<serija>.json` | `v` dnevni zbir (null = nepotpun dan), `h` broj validnih sati, `r` [[dan, šifra razloga]] |
| `profili/<serija>.json` | profil po satu (godišnje doba × tip dana), toplotna mapa, meseci po godinama, godine |
| `sati/<YYYY-MM>.json` | satne vrednosti svih serija od `pocetak_utc` (UTC sati), `dani` [[datum, indeks, sati]], `r` razlozi (RLE) |
| `meteo_sati/<YYYY-MM>.json` | temperatura, padavine, novi sneg na istoj satnoj mreži |
| `rekordi.json` | top dani (zbir i po brojaču), najprometniji sat i nedelja, vremenski rekordi, godine, rekordi po seriji, zanimljivosti |
| `ritam.json` | prosečan brojač po satu: sat × dan u nedelji, godišnja doba × tip dana, meseci (špice, „ustaje“), radni dan po godini |

## Ograničenja

- Granice sati određuju vremena brojača, ne pun sat. Sajt osvežava fajl na ~5 min i ponekad kasni do
  ~10 min, pa je pri čitanju u XX:02 vreme brojača od ~XX:52 do ~XX:02 (10.–13.10.: medijana XX:58,6,
  najranije XX:52). Svaki sat je zato približno (h−1):58 → h:58, a pri kašnjenju sajta do (h−1):52 → h:52;
  zbir sati dana je ipak tačno „juče“.
- Rezolucija je ograničena tačnošću pokretanja: ako čitanje kasni više od 15 min posle vremena brojača
  ili pređe u sledeći sat, pogođeni sati su NaN.
- Prvi (nepotpun) dan prikupljanja ima NaN za sate pre prvog čitanja.
- Izvor je javna veb-aplikacija bez dokumentovanog API-ja; promena IntraWeb stranice može da pokvari brzu
  varijantu (tada radi rezerva sa pregledačem, a greške se vide u `podaci/biciklisti/greske.log`).
- Podaci pripadaju UGZINS-u / Mikrobit sistemu; ovde se koriste isključivo za istraživanje u okviru
  master rada.
