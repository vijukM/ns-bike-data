# Kontekst modela za ns-bike-data

> Napomena: ovaj fajl je prepisan iz odgovora koji je korisnik dostavio 12.10.2026 (izvor istine je Google
> Drive `master-rad/`: kod `src/`, config `configs/config_E26b.yaml`, rezultati `runs/`). Ako postoji
> originalni `MODEL_KONTEKST.md`, on ima prednost — zameniti ovaj fajl njime.

Konačni model se više ne menja (E28). Nove satne podatke treba prevesti u format istorijskog mastera
(`stanica_id, ts, y_A, razlog_A`), dodati ih na kraj mastera i koristiti istu logiku obeležja kao trening
(`src/features.napravi()`, `src/tft.pripremi()`).

## A. Podaci i ciljna promenljiva

1. **Cilj** `y = y_A` (samo bicikli). NOVI brojači (jedan smer po uređaju): `A1k`/`A2k` (k = 3 ako fajl ima
   `A13`, inače 4; kanal se bira po danu). STARI dvosmerni (25a, 26, 28, 41, 47, 40a/b, 46a/b, 51a/b):
   `Sum` = A01 + A02. Feed (`volume_today`) = A (provereno).
2. **Dvosmerne serije** = zbir oba smera. Istorija ima pravilo `otkaz_smera` (dan NaN kad jedan smer ne broji).
3. **46 serija**, nijedna izbačena. 15b: fiksna skala = prosek validacije (48,5). 28 ima mnogo NaN u testu
   (otkaz smera). 42a, 49b, 36b, 20a, 29b su „slabe“.
4. **Vreme**: `ts` = kraj sata, lokalno, naivno; sat 23–24 dana D = `D+1 00:00`. Puna satna mreža do
   `2026-09-01 00:00`. DST: prolećni nepostojeći sat = NaN (`nema_reda`); jesenji duplikat `ts` →
   `drop_duplicates("ts")`, zadržan prvi. Kalendar iz kalendarskog datuma dana D (meteo `Datum`), ne iz `ts`.
5. **Čišćenje** (`razlog_A`, redosled primene): `ok`; `nema_reda`; `status_prazan`; `outlier` (> 400);
   `niz_nula` (≥ 168 uzastopnih sati sa 0); `skok`, `skok_okolina` (E3: y > max(50, 4 × p90 za
   stanicu/sat/mesec); okolina ±3 h ako y > max(30, 2 × p90); dan sa skokom na ≥ 3 stanice = gradski
   događaj → ne dira se); `otkaz_smera` (E3, samo stari dvosmerni: slabiji smer < 2 % dnevnog zbira,
   ≥ 3 dana zaredom, uz ≥ 50 bicikala/dan → NaN); `odluka_*`, `stanica_izbacena` (ručne odluke).
   Prave nule ostaju. Konačni master: `data/processed/master_v4_E3.parquet`.
6. **Oblik mastera**: `stanica_id` (str), `ts` (datetime64, kraj sata, naivno), `y_A` (float64), `razlog_A` (str).

## B. Model

7. torch 2.11.0, lightning 2.6.6, pytorch-forecasting 1.8.0; XGBoost; pandas 2.x.
8. **Konačni model = 0,5 × TFT E27 (3 seed-a, medijana) + 0,5 × XGBoost E26b (3 seed-a).** Prognoza u
   ponoć za 24 sata dana D. TFT: enkoder 168 h, dekoder 24 h. XGBoost: istorija ≥ 24 h stara.
9. **Ulazi**: statičko `stanica_id`; meteo (temperatura, vlaznost, brzina_vetra, insolacija, oblacnost,
   padavine, sneg_U, vlaznost_zemljista — od pre 24 h); kiša (padavine_pre_1h, padavine_3h, padavine_dan,
   sati_kise_dan > 0,1 mm); kalendar (sat_sin/cos h = sat − 1, dan_sin/cos pon = 0, doy_sin/cos
   (dan u godini − 1)/365,25, is_weekend, is_holiday; trend samo XGB); istorija/skala (lag_24, lag_48,
   lag_168, isti_sat_7d, roll_24, roll_168 — do t−24 h); nivo_stanice = skala/skala_fiksna; TFT enkoder:
   yn_cilj (NaN → 0), y_nema. TFT bez `trend` i `log_skala`, istorija i kao poznata obeležja dekodera.
   XGBoost 29 obeležja (+ `st_idx`). is_holiday iz meteo fajla treninga (državni praznici Srbije, uz
   pravoslavni Uskrs). Školski raspust se ne koristi.
10. **Meteo**: Open-Meteo, lat 45.33, lon 19.85, lokalno, satno: temperature_2m, relative_humidity_2m,
    wind_speed_10m (km/h), shortwave_radiation, cloud_cover, precipitation, snow_depth (m), soil_moisture_0_to_7cm.
    Ocena: Previous Runs API (`*_previous_day1`); uživo: Forecast API. Format: `Datum` + `Cas` (01:00–24:00).
11. **Normalizacija**: yn = y / skala; dinamička skala = prosek y u poslednjih 720 h do t − 24 h
    (min_periods 180), inače fiksna; clip ≥ 1. TFT: TorchNormalizer(identity), QuantileLoss([0.1, 0.5, 0.9]),
    predikcija = clip(q, 0) × skala. XGB: MSE na yn. Interval: TFT 10–90 % bez pomeranja.
12. **Podela**: train do 2024-09-01, val do 2025-09-01, test do 2026-09-01. Test: konačni RMSE 12,04;
    **sa stvarnom prognozom vremena RMSE 12,85** (referenca za uživo); naive y(t−168) RMSE 23,58.

## C. Upotreba

13. TFT checkpoint-i (seed 42/1/2); XGBoost E26b treba ponovo istrenirati i sačuvati `model.json`.
14. TFT ulaz: 192 reda po seriji (168 h + 24 h), `time_idx = (ts − t0)/1 h`, t0 = 2021-01-01 01:00.
    Istorija ≥ 7,5 dana za skalu; puna skala posle 30 dana.
15. Rupe: yn_cilj = 0, y_nema = 1; istorijska obeležja NaN → isti_sat_7d → 1,0; meteo ffill/bfill.
18. Spajanje: rupa 01.09–08.10.2026 (nema podataka); prve validne prognoze ~17.10.2026, puna skala ~08.11.2026.
    Isto čišćenje kao istorija na strani modela; DST 25.10.2026; kalendar iz `datum`/`sat`.
