# Kontekst modela za ns-bike-data (odgovori na pitanja Claude Code-a)

Izvor istine: Google Drive `master-rad/` (kod `src/`, config `configs/config_E31.yaml`, rezultati `runs/`).
Stanje: 20.10.2026. **Konačni model = E31 (model-v2)**; zamenio je E28 (model-v1) posle dve ispravke vremena (tačka 4b).

**Najvažnije u jednoj rečenici:** ne reimplementirati obeležja — nove satne podatke prevesti u format
istorijskog mastera (`stanica_id, ts, y_A, razlog_A`), dodati ih na kraj mastera i pozvati postojeće
`src/features.napravi()` i `src/tft.pripremi()`. Tako su obeležja garantovano ista kao na treningu.

---

## A. Podaci i ciljna promenljiva

### 1. Ciljna kolona
`y = y_A` (cilj „A" = samo bicikli). Ista definicija za sve serije, ali kolona u sirovom izvozu zavisi od formata fajla
(`src/prepare_data.py`, `napravi_seriju`):

| format | serije | `y_A` (cilj) | `y_S` (nije cilj) |
|---|---|---|---|
| NOVI (1 smer po uređaju) | 15a/b, 20a/b, 22a/b, 23a, 27a/b, 29a/b, 30a/b, 31b, 34a/b, 36a/b, 37a, 38a/b, 39a/b, 42a/b, 43a/b, 44a/b, 45a/b, 49a/b, 50a/b | `A1k` ili `A2k`, gde je `k = 3` ako fajl ima kolonu `A13`, inače `k = 4`. Bira se **po danu**: podrazumevano kolona sa većim ukupnim zbirom; druga kolona preuzima dan ako ima ≥ 10 bicikala i ≥ 5× više (promena kanala usred fajla: 29a od 2025, 42a od 09/2023, 50b od 05/2026; 43b i 44b imaju pogrešan A-kod u imenu fajla) | `S{k}` |
| STARI (dvosmerni uređaj) | 25a, 26, 28, 41, 47, 40a/b, 46a/b, 51a/b | `Sum` (= A01 + A02, oba smera; kod starih brojača A i S su ista kolona) | `Sum` |

**POTVRĐENO (P1, 12.10.2026): feed (`volume_today`, `volumethisyear`) = cilj A (samo bicikli), NE S.**
- `ove_godine` (12.10 u 14:55) − zbir sirove A kolone za 01.01–31.08.2026 = rupa 01.09–12.10 koja odgovara očekivanoj
  (iz istog perioda 2025 × rast): **medijana odnosa 1,03** preko 46 serija.
- Za S je medijana **−0,09**: kod NOVIH brojača je S 25–110% veći od A, pa sam zbir S za januar–avgust već premašuje
  feed za celu godinu. Feed dakle ne može biti S.
- **Smer u feed-u (13/14/23/24) NIJE isto što i indeks kolone u Excel-u** (A1k/A2k). Npr. 15a: feed smer 14,
  istorijska kolona A24; 45b: feed 24, kolona A14. Istorija bira kolonu koja ima podatke. Za model je bitno samo
  mapiranje `locationID → serija` (regex), a ono je tačno.
- Stari dvosmerni brojači, po smeru: **feed smer 11 = A01, smer 21 = A02** (potvrđeno na 26, 28, 41, 46a, 46b, 47,
  51a, 51b; 40a/40b su u skladu sa tim). Za 25a (smerovi 13/23) A01 ≈ A02, pa se ne može razlikovati — nebitno, serija je zbir.
- Odstupanja u odnosu su objašnjiva i nisu greška mapiranja:
  - 49a 8,4: feed ima podatke kojih nema u našem izvozu za 2026;
  - 36b, 39a, 50b > 1,5: skokovi ili promena kanala;
  - 49b 0,33, 42a 0,48, 29a 0,51, 34b 0,59: brojač radio delimično ili nije radio u septembru–oktobru (49b ne radi od ~septembra).

### 2. Dvosmerne serije
Serija = zbir oba smera = `Sum` (A01 + A02) iz istog fajla: **25a, 26, 28, 41, 47** (jedan uređaj) i **40a, 40b, 46a, 46b, 51a, 51b**
(svaki uređaj posebno). U scraper-u: zbir oba `direction` istog `locationID` — to je ispravno i isto kao istorija.
Mapiranje smerova: feed 11 = A01, feed 21 = A02.
Napomena: istorija je imala pravilo **`otkaz_smera`** (vidi 5) — kad jedan smer ne broji, dan je NaN, a ne pola vrednosti.
**28, smer 21 (= A02) ne broji najmanje od septembra 2026** (u rupi nije izbrojao ništa).

### 3. Spisak serija
Svih **46** (kao `OCEKIVANE_SERIJE` u `parsiranje.py`), nijedna nije izbačena iz modela. Posebnosti:
- **15b** nema nijedan validan sat u treningu (stvarni podaci tek od ~07.12.2024) → fiksna skala = prosek validacije (48,5).
- **28** ima mnogo NaN u testu (5.326 od 8.760 h) — upravo zbog otkaza jednog smera.
- **49a** ima malo podataka u testu (3.654 h).
- **42a, 49b, 36b, 20a, 29b** su „slabe" (mali promet, anomalije), ali su u modelu.

### 4b. KONAČNO (20.10.2026, model-v2 = E31): sve je u UTC+1 i u stvarnom vremenu — ovo važi, 4a je istorija
Dve ispravke posle 4a (detalji u stanju projekta):
- **E30:** meteo preveden sa lokalnog vremena (DST) na UTC+1, kao brojači.
- **E31:** izmerena meteo tabela je **kasnila 1 h** cele godine (P3: maksimum zračenja sat posle solarnog podneva;
  prognoza Open-Meteo se slagala sa izmerenim tek uz pomak +1 h). Ispravljeno; posle toga je težišni sat insolacije
  11,6–11,7 h UTC+1 (solarno podne Novi Sad = 10:41 UTC) i prognoza se slaže sa izmerenim bez pomaka.
- P4 (početak kiše) potvrdio da je oznaka sata brojača tačna (kraj sata, UTC+1).

**Pravila za aplikaciju (model-v2):**
- biciklisti iz scraper-a: `ts = ts_utc + 1 h` (naivno, UTC+1, kraj sata), cele godine;
- **meteo (Open-Meteo, `timezone=GMT`): vreme `t` (UTC) → `ts = t + 1 h`. Nikakav dodatni pomak.** Ista oznaka kao brojači;
- izvedena kiša: `padavine_pre_1h = pad(ts−1h)`, `padavine_3h = pad(ts−2h..ts)`, `padavine_dan`/`sati_kise_dan` po danu `(ts − 1 h).date()`;
- `vlaznost_zemljista` = vrednost od pre 24 h (`ts − 24 h`);
- kalendar iz oznake: sat = `(ts − 1 h).hour`, dan/praznik/doy/trend iz datuma `(ts − 1 h)`, sve u UTC+1;
- `model/meteo_istorija_utc1.parquet` = izmereni meteo već u ovoj konvenciji (proveren protiv treninga, razlika 0);
- sajt prikazuje lokalno vreme (`ts − 1 h` = UTC → Europe/Belgrade), leti +1 h u odnosu na oznaku modela;
- ocena po UTC+1 oznaci.
Tačna pravila su i u `model/obelezja.json → meteo_konvencija`.

### 4a. (14.10.2026, ZAMENJENO tačkom 4b) istorija biciklista je u fiksnom UTC+1 (bez letnjeg računanja)
Analiza jutarnjeg vrha (Claude Code, potvrđeno): u istoriji se vrh pomera tačno za 1 h na prelascima DST, u obe godine
i u oba smera → `ts` u masteru = vreme brojača u **UTC+1 tokom cele godine**. Meteo je lokalno vreme (Europe/Belgrade,
sa DST) i u treningu je spojen **po istoj oznaci sata** → leti je meteo pomeren 1 h u odnosu na bicikliste. Model je
naučen tako (model-v1, E28), pa su se uživo **reprodukovale iste konvencije** — VIŠE NE VAŽI za model-v2:
- novi podaci iz scraper-a → oznaka `ts = ts_utc + 1 h` (naivno, UTC+1), za ceo period (i leti);
- meteo → kao u treningu: lokalni `Datum`/`Cas` (DST), spoj po istoj naivnoj oznaci sata;
- kalendarska obeležja iz oznake sata (kao u treningu);
- na sajtu se vreme prikazuje lokalno (ts_utc → Europe/Belgrade), dakle leti +1 h u odnosu na oznaku modela;
- ocena: poređenje po ts_utc (ili po UTC+1 oznaci), dosledno.
Pravila za DST iz tačke 4 (23/25 sati, „zadržati prvi") za bicikliste otpadaju — u UTC+1 nema rupa ni duplikata.

### 4. Oznaka vremena (prvobitni opis; za bicikliste važi 4a)
- `ts` = **kraj sata**, lokalno vreme (Europe/Belgrade), **naivno (bez zone)**. Sat 23–24 dana D = `D+1 00:00`.
  Interval 13–14 h → `ts = 14:00`. Isto kao scraper (`ts`), pa je spajanje direktno.
- Master je **puna satna mreža** (`pd.date_range(..., freq="h")` nad naivnim vremenom) od prvog sata serije do
  `2026-09-01 00:00`.
- **DST:** prolećni dan (23 h) u mreži ima „nepostojeći" sat → NaN (`nema_reda`). Jesenji dan (25 h): duplikat `ts`
  je izbačen sa `drop_duplicates("ts")` → **zadržan je prvi** red. Meteo: prolećna rupa interpolirana, jesenji duplikat usrednjen.
  Za model: scraper-ove 23/25 sati prevesti na naivnu mrežu na isti način (jesen: zadržati prvi od dva sata sa istim `ts`).
  **Sledeći prelaz: 25.10.2026** — prvi pravi test za `satno.py`.
- (model-v1) **Kalendarska obeležja** (dan u nedelji, dan u godini) računaju se iz **kalendarskog datuma dana D** (meteo kolona `Datum`),
  ne iz `ts`. Za sat 24:00 dana D (`ts = D+1 00:00`) dan u nedelji je dan D. Koristiti scraper-ove `datum` i `sat` kolone.

### 5. Nedostajuće vrednosti i čišćenje — kolona `razlog_A`
Bez interpolacije, samo NaN + razlog. Vrednosti `razlog_A` (redosled primene):

| `razlog_A` | pravilo |
|---|---|
| `ok` | validan sat |
| `nema_reda` | sat ne postoji u sirovim podacima (rupa) |
| `status_prazan` | `Status` prazan (brojač nije javio, piše 0) — lažna nula |
| `outlier` | vrednost > 400 bicikala/sat |
| `niz_nula` | ≥ 168 uzastopnih sati sa 0 (uz popunjen Status) |
| `skok`, `skok_okolina` | (E3) y > max(50, 4 × p90 za stanicu/sat/mesec); okolina ±3 h ako y > max(30, 2 × p90); **dan sa skokom na ≥ 3 stanice = gradski događaj → ne dira se** |
| `otkaz_smera` | (E3, samo STARI dvosmerni) slabiji smer < 2% dnevnog zbira, ≥ 3 dana zaredom, uz ≥ 50 bicikala/dan → ti dani NaN |
| `odluka_nan`, `odluka_ok`, `odluka_zameni`, `stanica_izbacena` | ručne odluke iz `odluke.xlsx` (31 odluka, sve za nizove nula) |

Prave nule (noću, snežni dani januara 2026) ostaju. Konačni master: `data/processed/master_v4_E3.parquet`.
Napomena: čišćenje je kod nekih serija u 2026. izbacilo mnogo (29b: sirovo 182 hiljade, očišćeno 118 hiljada; 28: 305 / 183 hiljade).

### 6. Oblik master fajla
```
stanica_id   str         "23a"
ts           datetime64  2021-01-01 01:00:00   (kraj sata, naivno lokalno)
y_A          float64     15.0 | NaN
razlog_A     str         "ok" | "status_prazan" | ...
(+ tip, A_sirovo, S_sirovo, status_ok, kolona_A, A01, A02, postoji, y_S, razlog_S — model ih ne koristi)
```
```
stanica_id                  ts   y_A razlog_A
       23a 2021-01-01 01:00:00  15.0       ok
       23a 2021-01-01 02:00:00  20.0       ok
       23a 2021-01-01 03:00:00  46.0       ok
```
Model čita samo `stanica_id, ts, y_A, razlog_A`. Scraper → master: `y → y_A`, `razlog → razlog_A` (NaN razlog → `"ok"`).
Scraper to već pravi: `podaci/YYYY/MM/master_YYYY-MM.parquet`.

---

## B. Model

### 7. Biblioteke (Colab, T4)
torch 2.11.0+cu130, lightning 2.6.6, pytorch-forecasting 1.8.0 (TFT); XGBoost (Colab verzija, `tree_method=hist`, `device=cuda`);
pandas 2.x, numpy, pyarrow. Verzije iz `runs/tft/*_E27_seed42/izvestaj.md`.

### 8. Ulaz i horizont
**Konačni model (model-v2) = 0,5 × TFT E31t (prosek 3 seed-a, medijana) + 0,5 × XGBoost E31 (prosek 3 seed-a).**
(Isti hiperparametri, obeležja i podešavanja kao ranije E28 = TFT E27 + XGBoost E26b; razlika je samo vreme meteo podataka, tačka 4b.)
- Prognoza se izdaje **u ponoć** (kraj dana D−1) za **24 sata dana D** (01:00 … 24:00).
- TFT: enkoder **168 h** (poslednjih 7 dana do ponoći), dekoder **24 h**; `min_encoder_length = max_encoder_length = 168`.
- XGBoost: jedan red po satu, istorija **najmanje 24 h stara** (`min_lag_sati: 24`).
- Horizonti „sledeći sat" i „nedelja" nisu deo rada (budući rad).

### 9. Ulazi (27 poznatih + statička + nepoznata)
| grupa | obeležja | izvor | uživo |
|---|---|---|---|
| statičko | `stanica_id` (kategorija) | — | da |
| meteo (8) | temperatura, vlaznost, brzina_vetra, insolacija, oblacnost, padavine, sneg_U, vlaznost_zemljista | Open-Meteo | prognoza za dan D; `vlaznost_zemljista` = vrednost **od pre 24 h** (E23) |
| kiša, izvedeno (4) | padavine_pre_1h, padavine_3h, padavine_dan, sati_kise_dan (> 0,1 mm) | iz `padavine` | iz prognoze |
| kalendar | sat_sin/cos (h = sat − 1), dan_sin/cos (pon = 0), doy_sin/cos (dan u godini − 1, /365,25), is_weekend, is_holiday | računa se | da |
| kalendar (samo XGBoost) | trend = (datum − 2021-01-01) u godinama | računa se | da |
| istorija (/skala) | lag_24, lag_48, lag_168, isti_sat_7d (prosek istog sata prethodnih 7 dana), roll_24, roll_168 (prosek do t−24 h) | scraper | da, ako ima podataka |
| nivo | nivo_stanice = skala / skala_fiksna | scraper + trening | da |
| TFT nepoznato (enkoder) | yn_cilj (= y/skala, NaN → 0), y_nema (1 = sat nedostaje) | scraper | da |

- TFT ne koristi `trend` i `log_skala` (`--bez trend log_skala`); istoriju dobija i kao **poznata** obeležja dekodera (`--istorija_poznata`).
- XGBoost ima 29 obeležja (gornja + `st_idx`, indeks stanice).
- **is_holiday:** u treningu dolazi iz meteo fajla (`meteo_vazduh_2021_2026_ISPRAVLJENO.parquet`, kolona `is_holiday`).
  Za uživo napraviti istu listu (državni praznici Srbije, uz pravoslavni Uskrs) i **proveriti da se poklapa** sa istorijskom kolonom za 2021–2026.
- Školski raspust se ne koristi.

### 10. Vremenska prognoza
Open-Meteo, Novi Sad (lat 45.33, lon 19.85), satno, **`timezone=GMT`, pa `ts = t + 1 h` (tačka 4b)**. Mapiranje (`src/prognoza_vremena.py`, `OM`):
`temperature_2m, relative_humidity_2m, wind_speed_10m (km/h), shortwave_radiation (W/m²), cloud_cover (%),
precipitation (mm), snow_depth (m!), soil_moisture_0_to_7cm`.
Za ocenu je korišćen Previous Runs API (`*_previous_day1`), a za uživo običan Forecast API (prognoza izdata pre ponoći).
Za model-v2: format kao `model/meteo_istorija_utc1.parquet` (`ts` = kraj sata UTC+1 + 8 kolona). Stari format
`Datum`/`Cas` (lokalno, DST) je bio za model-v1 i izmerena tabela u tom formatu **kasni 1 h** — ne koristiti je za model.

### 11. Normalizacija, gubitak
- Cilj: `yn = y / skala`. **Dinamička skala** = prosek y te serije u poslednjih **720 h** koji se završavaju u **t − 24 h**
  (`min_periods = 180`), inače **fiksna skala** (prosek treninga; 15b prosek validacije); `clip(lower=1)`.
- TFT: `target_normalizer = TorchNormalizer(method="identity")` (skaliranje je već urađeno), `QuantileLoss([0.1, 0.5, 0.9])`,
  tačka = medijana; predikcija = `clip(q, 0) × skala`. Nedostajući sati: `yn_cilj = 0`, `y_nema = 1`, težina `w = 0`.
- XGBoost: MSE na `yn`, predikcija × skala.
- Interval u aplikaciji: TFT 10–90% **bez pomeranja** na ansambl (E31t pojedinačni seed-ovi: pokrivenost 75–78%).

### 12. Podela i rezultati
- train: do `2024-09-01 00:00`; val: do `2025-09-01 00:00`; test: do `2026-09-01 00:00` (kraj sata, uključivo).
- Baseline: sezonski naivni `y(t − 168)`.
- Test (380.350 sati, 46 serija, isti sati za sve):

| model | RMSE | MAE | R² | WAPE | bias | dnevni MAE |
|---|---|---|---|---|---|---|
| naive y(t−168) | 23,58 | 12,96 | 0,724 | 37,5% | 0,0 | 221,6 |
| XGBoost E31 (3 seed-a) | 12,63 | 7,33 | 0,921 | 21,2% | −0,36 | 89,8 |
| TFT E31t (3 seed-a) | 12,01 | 6,82 | 0,928 | 19,8% | −0,65 | 78,1 |
| **konačni E31** | **12,00** | 6,90 | **0,928** | 20,0% | −0,51 | 79,8 |
| **konačni E31, sa stvarnom prognozom vremena** | **12,71** | 7,21 | 0,920 | 20,9% | −0,65 | 88,8 |
| (stari E28: izmereno / prognoza) | 12,04 / 12,85 | | | | | |

Izvor: `runs/ansambli/20261019-054540_E31_ansambl`, poređenja `*_E31_odluka`, `*_E31_vs_E28`.
**Za uživo je referentna vrednost 12,71** (sa prognozom; E28 je imao 12,85 jer prognoza i trening nisu imali isto vreme).
Izbor: pravilo po validaciji dalo je praktično nerešeno E31 vs E30 (dval = +0,01%); odabran E31 jer je jedini fizički
tačno poravnat (P3, P4) i jer aplikacija tada koristi prognozu bez ikakvog pomeranja.

---

## C. Upotreba u aplikaciji

### 13. Čuvanje i učitavanje (model-v2: sve je u paketu `model.zip`, Release `model-v2`, notebook A2)
- `xgb_seed{42,1,2}.ubj`, `tft_seed{42,1,2}.ckpt`, `obelezja.json` (uklj. `meteo_konvencija`), `skale.json`, `istorija.parquet`,
  `p90.parquet`, `meteo_istorija_utc1.parquet`, `praznici.csv`, `referenca.parquet` (25–31.08.2026: obeležja + predikcije
  po seed-u, za test podudarnosti), `izvor/`. Ispod je stari opis (model-v1), samo za istoriju.
- TFT: `runs/tft/20261009-090342_E27_seed42/najbolji.ckpt`, `20261009-110917_E27_seed1/najbolji.ckpt`,
  `20261009-112944_E27_seed2/najbolji.ckpt` (Lightning checkpoint; `dataset_parameters` su u hparams).
  ```python
  from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
  m = TemporalFusionTransformer.load_from_checkpoint(ckpt, map_location="cpu")
  ds = TimeSeriesDataSet.from_parameters(m.dataset_parameters, df_pred, predict=True, stop_randomization=True)
  q = m.predict(ds.to_dataloader(train=False, batch_size=256), mode="quantiles", return_index=True)
  ```
- XGBoost E26b: run folderi `runs/2026100?-07*_xgb_A_E26b_seed{42,1,2}` čuvaju predikcije i izveštaj; **sačuvan model verovatno ne postoji**
  → za aplikaciju jednom ponovo istrenirati E26b (isti config, seed 42/1/2, ~40 s na GPU) i sačuvati `model.json`.
  To je zaseban korak u `master-rad` repou, ne u scraper-u.

### 14. Ulaz za TFT predikciju
DataFrame za svaku od 46 serija: **192 uzastopna reda** = 168 h enkodera (do ponoći) + 24 h dana D, na punoj satnoj mreži.
Kolone (tačno kao `src/tft.pripremi`):
```
stanica_id (str), time_idx (int64), yn_cilj (float32, NaN→0), y_nema (float32), w (float32),
+ 27 poznatih: temperatura, vlaznost, brzina_vetra, insolacija, oblacnost, padavine, sneg_U, vlaznost_zemljista,
  padavine_pre_1h, padavine_3h, padavine_dan, sati_kise_dan, sat_sin, sat_cos, dan_sin, dan_cos, doy_sin, doy_cos,
  is_weekend, is_holiday, lag_24, lag_48, lag_168, isti_sat_7d, roll_24, roll_168, nivo_stanice
```
- `time_idx = (ts − t0) / 1 h`, gde je `t0 = master["ts"].min()` (2021-01-01 01:00) — mreža mora biti neprekidna.
- Dekoder (dan D): `yn_cilj = 0`, `y_nema = 1`; poznata obeležja iz prognoze/kalendara.
- **Preporuka:** ne praviti ovo ručno — dodati nove sate u master i pozvati `src/tft.pripremi(cfg, master, istorija_poznata=True, bez=("trend","log_skala"))`,
  a meteo fajl produžiti merenim vremenom (prošlost) + prognozom (dan D).
- Za skalu i lag-ove treba istorija **≥ 7,5 dana** (min_periods 180 h); puna skala posle 30 dana.

### 15. Rupe u poslednjim satima
Model je treniran sa rupama:
- NaN sat u enkoderu → `yn_cilj = 0`, `y_nema = 1`;
- istorijska obeležja: NaN → `isti_sat_7d` → 1,0;
- skala bez dovoljno podataka → fiksna;
- meteo rupe → ffill/bfill po stanici.

Predikcija uvek radi, ali kvalitet pada sa brojem rupa. Serija bez podataka poslednjih 7 dana: oznaka „nepouzdano" u aplikaciji.

### 16. Arhitektura aplikacije (predlog, nije konačno)
- Podaci: aplikacija čita mesečne `master_YYYY-MM.parquet` iz ovog repoa (GitHub raw).
- Pipeline: jednom dnevno posle 01:xx, kada `satno.py` završi:
  1. scraper satno → format mastera;
  2. čišćenje (ista pravila kao istorija);
  3. meteo prognoza;
  4. predikcija za dan D;
  5. upis u DuckDB / parquet.
- Backend FastAPI, frontend mapa (Leaflet) + grafici (ECharts). Prikaz: „danas", „sutra", uz TFT interval.
- **Predikcije se upisuju unapred** (pre dana D) da bi prospektivna ocena bila poštena.

### 17. Ponovno treniranje
Nema ga do kraja rada (model-v2 = E31 zamrznut, treniran do 31.08.2026; dinamička skala sama prati promenu nivoa).
Eventualno posle godinu dana novih podataka (budući rad).

### 18. Na šta paziti pri spajanju scraper → istorija
a) **Rupa 01.09–08.10.2026 nema podataka** (istorija se završava 31.08, scraper počinje 09.10 ~15:40).
   - Prve validne prognoze (skala + 7 dana istorije): od **~17.10.2026**. Puna dinamička skala: od **~08.11.2026**.
   - Prospektivnu ocenu brojati od 17.10, a glavnu od 08.11.

b) **Isto čišćenje kao u istoriji, na strani modela** (scraper ostaje sirov, što je dobro):
   - > 400 → NaN;
   - otkaz smera kod dvosmernih → NaN. **Već se dešava: 28, smer 21 = 0** → serija 28 trenutno ima pola vrednosti;
   - ceo dan 0 na smeru sa inače ≥ 50/dan → NaN (42a 11.10, 49b od septembra);
   - skokovi po E3 pravilu.

   Čuvati i `satno_smerovi.csv`, jer otkaz smera može da se vidi samo po smeru.

c) **Provera definicije cilja — URAĐENA (P1, 12.10.2026): feed = A.** Detalji u tački 1.

d) **DST 25.10.2026:** za model nebitno (UTC+1 nema rupa ni duplikata, tačka 4b); za sajt proveriti prikaz 25 lokalnih sati.
   Proveriti da li `satno.py` tada daje tačno 25 redova po seriji i zbir = „juče".

e) Kalendar (model-v2): iz UTC+1 oznake, datum = `(ts − 1 h).date()`, sat = `(ts − 1 h).hour` (tačka 4b). Ne iz lokalnog `datum`/`sat` scraper-a.

f) **Pomak od ~5 min:** vreme brojača u čitanju u XX:02 je ~XX:55–57 (sajt osvežava sa kašnjenjem), pa je svaki
   sat ~(h−1):55 → h:55; prvi sat dana ~55 min, poslednji ~65 min. Mala, sistematska razlika — navodi se kao ograničenje.

g) Događaji (masovna okupljanja) i kvarovi brojača nisu greška scraper-a. Ne izbacivati ih iz ocene, nego ih označiti
   (vidi E29: na takvim danima stvarni promet je 25–50% veći od prognoze).

h) **`state = 0` („Nema podataka")** sa svežim vremenom brojača i `danas = 0` (29a, 12.10.2026) mora biti NaN
   (`nema_podataka`), a ne prava nula. `state = 6` („Nema saobraćaja") je validna nula.
