# Proksi za kamere (privremeno, za demo)

Server prenosa kamera (`srbija-nadlanu.ott.solutions`) pušta samo svoje sajtove — proverava `Referer` i vraća **403**
zahtevima sa `nasicu.rs`. Pregledač ne dozvoljava da JavaScript lažira `Referer`, pa čisto na sajtu (GitHub Pages)
to ne može da se reši. Dva načina su ugrađena u stranu:

1. **Bez Referer-a** — `kamere.html` ima `<meta name="referrer" content="no-referrer">`, pa pregledač ne šalje
   `nasicu.rs`. Radi **samo** ako server blokira strane sajtove, a pušta prazan Referer. Probaj prvo ovo — ništa se ne
   postavlja.
2. **Proksi (ovaj folder)** — mali Cloudflare Worker koji prenos dohvata server-side sa dozvoljenim `Referer` i dodaje
   CORS. Ovo **sigurno radi**. Upis adrese Worker-a u `docs/data/kamere.json → "proksi"` i kamere rade.

> **Napomena:** ovo je privremeno rešenje za demo iza admin lozinke (zaobilazi zaštitu linkovanja koju je vlasnik
> prenosa postavio). Za javni ili produkcijski rad — i za kasnije brojanje vozila sa kamera — potrebna je dozvola ili
> licenca vlasnika prenosa (ott.solutions / „Srbija na dlanu“, preko 24sedam.rs). Proksi radi samo za taj jedan izvor,
> nije otvoreni proksi.

## Postavljanje (jednom, besplatno)

Potreban je nalog na [Cloudflare](https://dash.cloudflare.com) (besplatan). Ima dva načina.

### A) Kroz pretraživač (bez instalacije)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Daj ime, npr. `ns-kamere`, pa **Deploy** (napraviće se prazan Worker).
3. **Edit code** → obriši sve i nalepi sadržaj fajla [`worker.js`](worker.js) → **Deploy**.
4. Adresa je oblika `https://ns-kamere.<tvoj-nalog>.workers.dev`.

### B) Komandna linija (Wrangler)

```bash
npm install -g wrangler
wrangler login
cd kamere-proksi
wrangler deploy worker.js --name ns-kamere
```

## Uključivanje na sajtu

U `docs/data/kamere.json` upiši adresu Worker-a (bez kose crte na kraju):

```json
{
  "proksi": "https://ns-kamere.tvoj-nalog.workers.dev",
  "kamere": [ ... ]
}
```

Prazno `"proksi": ""` = prenos ide direktno sa servera kamere (podrazumevano).

## Provera

```bash
# plejlista (očekivano: HTTP 200 i tekst koji počinje sa #EXTM3U)
curl -i "https://ns-kamere.tvoj-nalog.workers.dev/?u=https%3A%2F%2Fsrbija-nadlanu.ott.solutions%2Fsrbija-nadlanu%2Fposta-ns1%2Fchunks.m3u8"
```

Ako vraća `#EXTM3U`, proksi radi; otvori stranu **Admin → Kamere uživo**.
