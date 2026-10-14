/* Zajedničko za sve strane: učitavanje podataka, formati (srpski), vreme (Europe/Belgrade), boje teme, ECharts osnova.
   Podaci: data/istorija/*.json (pravi ih sajt/pripremi_istoriju.py). Satni nizovi idu redom po UTC satima od pocetak_utc. */
"use strict";

const NS = (() => {
  const TZ = "Europe/Belgrade";
  const PODACI = "data/istorija/";
  const fBroj = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });
  const fDec = new Intl.NumberFormat("sr-Latn-RS", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fSat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
  const DANI = ["nedelja", "ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota"];
  const DANI_KRATKO = ["pon", "uto", "sre", "čet", "pet", "sub", "ned"];
  const MESECI = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar",
    "novembar", "decembar"];
  const MESECI_KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
  const SEZONE = { ukupno: "cela godina", zima: "zima", prolece: "proleće", leto: "leto", jesen: "jesen" };
  const TIPOVI = { radni: "radni dan", subota: "subota", nedelja_praznik: "nedelja i praznik" };

  // ---------------------------------------------------------------- formati
  const broj = (x) => (x == null || Number.isNaN(x) ? "—" : fBroj.format(x));
  const dec = (x) => (x == null || Number.isNaN(x) ? "—" : fDec.format(x));
  const iso2d = (iso) => iso.split("-").map(Number);
  const datum = (iso) => { const [g, m, d] = iso2d(iso); return `${d}. ${m}. ${g}.`; };
  const utcDan = (iso) => { const [g, m, d] = iso2d(iso); return Date.UTC(g, m - 1, d); };
  const danUNedelji = (iso) => new Date(utcDan(iso)).getUTCDay();          // 0 = nedelja
  const datumDug = (iso) => { const d = DANI[danUNedelji(iso)]; return d[0].toUpperCase() + d.slice(1) + ", " + datum(iso); };
  const dodajDane = (iso, n) => new Date(utcDan(iso) + n * 864e5).toISOString().slice(0, 10);
  const razlikaDana = (a, b) => Math.round((utcDan(b) - utcDan(a)) / 864e5);
  const mesecNaziv = (ym) => { const [g, m] = ym.split("-").map(Number); return `${MESECI[m - 1]} ${g}.`; };
  const dvaMesta = (h) => String(h).padStart(2, "0");
  const lokalniSat = (ms) => Number(fSat.format(ms));

  /** Oznake sati lokalnog dana („07–08 h“); jesenji ponovljeni sat dobija „(2.)“. */
  function satneOznake(pocetakUtcMs, i0, n) {
    const out = [];
    let pret = -1;
    for (let k = 0; k < n; k++) {
      const h = lokalniSat(pocetakUtcMs + (i0 + k) * 3600e3);
      out.push({ sat: h, oznaka: `${dvaMesta(h)}–${dvaMesta(h + 1)} h${h === pret ? " (2.)" : ""}` });
      pret = h;
    }
    return out;
  }

  // ---------------------------------------------------------------- podaci
  const kes = new Map();
  function json(put) {
    if (!kes.has(put)) {
      kes.set(put, fetch(PODACI + put).then((r) => {
        if (!r.ok) throw new Error(`${put}: HTTP ${r.status}`);
        return r.json();
      }));
    }
    return kes.get(put);
  }
  let razlozi = [];
  async function stanice() {
    const s = await json("stanice.json");
    razlozi = s.razlozi;
    return s;
  }
  const razlog = (kod) => (razlozi[kod] ? razlozi[kod].opis : "nema podataka");

  /** Šifra razloga za indeks sata iz RLE liste [[početak, dužina, šifra], …] (0 = validno). */
  function razlogSata(rle, i) {
    for (const [a, n, k] of rle || []) { if (i >= a && i < a + n) return k; if (a > i) break; }
    return 0;
  }

  // ---------------------------------------------------------------- tema i ECharts
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  function boje() {
    const b = {};
    for (const k of ["strana", "povrsina", "ink", "ink-2", "ink-3", "mreza", "osa", "bicikl", "bicikl-blago", "temp",
      "kisa", "nema", "nema-tekst", "upozorenje", "tip-1", "tip-2", "tip-3", "god-0", "god-1", "god-2", "god-3", "god-4",
      "god-5", "toplota-0", "toplota-1", "toplota-2", "toplota-3", "toplota-4", "toplota-5"]) b[k] = css("--" + k);
    return b;
  }
  const tamna = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

  function osnova(b) {
    return {
      animation: false,
      textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: b["ink-2"] },
      tooltip: {
        trigger: "axis", confine: true, backgroundColor: b.povrsina, borderColor: b.osa,
        textStyle: { color: b.ink, fontSize: 13 }, axisPointer: { type: "line", lineStyle: { color: b["ink-3"] } },
      },
    };
  }
  const osaX = (b, extra = {}) => ({
    axisLine: { lineStyle: { color: b.osa } }, axisTick: { show: false },
    axisLabel: { color: b["ink-3"], hideOverlap: true }, splitLine: { show: false }, ...extra,
  });
  const osaY = (b, extra = {}) => ({
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: b["ink-3"], formatter: (v) => broj(v) },
    splitLine: { lineStyle: { color: b.mreza } }, nameTextStyle: { color: b["ink-3"], align: "left" }, ...extra,
  });

  /** Napravi ECharts grafik; crtaj(b) vraća opcije. Ponovo crta na promenu teme i veličine. */
  const grafici = [];
  function grafik(el, crtaj) {
    const g = { el, crtaj, ec: echarts.init(el, null, { renderer: "canvas" }) };
    g.osvezi = () => { g.ec.setOption(g.crtaj(boje()), { notMerge: true }); };
    g.osvezi();
    grafici.push(g);
    return g;
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    grafici.forEach((g) => g.osvezi());
    document.dispatchEvent(new Event("tema"));
  });
  let tajmer;
  window.addEventListener("resize", () => {
    clearTimeout(tajmer);
    tajmer = setTimeout(() => grafici.forEach((g) => g.ec.resize()), 120);
  });

  /** Prekidač dugmadi (aria-pressed); vraća trenutnu vrednost preko callback-a. */
  function prekidac(el, vrednosti, pocetna, promena) {
    el.innerHTML = "";
    for (const [v, t] of vrednosti) {
      const d = document.createElement("button");
      d.type = "button"; d.textContent = t; d.dataset.v = v;
      d.setAttribute("aria-pressed", String(v === pocetna));
      d.addEventListener("click", () => {
        el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === d)));
        promena(v);
      });
      el.appendChild(d);
    }
  }

  /** Padajući spisak stanica u zaglavlju (grupisano po mestu). */
  function spisakStanica(sel, s, izabrana) {
    sel.innerHTML = '<option value="">Izaberi stanicu…</option>' + s.serije.map((r) =>
      `<option value="${r.serija}" ${r.serija === izabrana ? "selected" : ""}>${r.serija} · ${r.naziv}</option>`).join("");
    sel.addEventListener("change", () => { if (sel.value) location.href = `stanica.html?id=${encodeURIComponent(sel.value)}`; });
  }

  /** Grupisanje dnevnog niza po nedelji (pon) ili mesecu: prosek dnevnog zbira preko dana sa podatkom. */
  function grupisi(od, vrednosti, gustina, minDana) {
    if (gustina === "dan") return { x: vrednosti.map((_, i) => dodajDane(od, i)), v: vrednosti.slice(), dana: null };
    const grupe = new Map();
    vrednosti.forEach((v, i) => {
      const d = dodajDane(od, i);
      const kljuc = gustina === "mesec" ? d.slice(0, 7) : dodajDane(d, -((danUNedelji(d) + 6) % 7));
      if (!grupe.has(kljuc)) grupe.set(kljuc, { s: 0, n: 0, ukupno: 0 });
      const g = grupe.get(kljuc);
      g.ukupno++;
      if (v != null) { g.s += v; g.n++; }
    });
    const x = [], v = [], dana = [];
    for (const [k, g] of grupe) {
      x.push(k);
      v.push(g.n >= Math.min(minDana, g.ukupno) && g.n > 0 ? Math.round(g.s / g.n) : null);
      dana.push([g.n, g.ukupno]);
    }
    return { x, v, dana };
  }
  const oznakaPerioda = (k, gustina) => (gustina === "mesec" ? mesecNaziv(k)
    : gustina === "nedelja" ? `nedelja od ${datum(k)}` : datumDug(k));

  /** Opsezi uzastopnih null vrednosti → [[od, do], …] (za sive trake „nema podataka“). */
  function rupe(x, v) {
    const out = [];
    let pocetak = null;
    v.forEach((y, i) => {
      if (y == null && pocetak == null) pocetak = i;
      if (y != null && pocetak != null) { out.push([x[pocetak], x[i - 1]]); pocetak = null; }
    });
    if (pocetak != null) out.push([x[pocetak], x[x.length - 1]]);
    return out;
  }

  function greska(el, e) {
    console.error(e);
    el.insertAdjacentHTML("afterbegin", `<div class="upozorenje">Podaci nisu učitani: ${e.message}</div>`);
  }

  return {
    TZ, DANI, DANI_KRATKO, MESECI, MESECI_KRATKO, SEZONE, TIPOVI,
    broj, dec, datum, datumDug, dodajDane, razlikaDana, danUNedelji, mesecNaziv, dvaMesta, utcDan,
    satneOznake, json, stanice, razlog, razlogSata, boje, tamna, osnova, osaX, osaY, grafik, prekidac,
    spisakStanica, grupisi, oznakaPerioda, rupe, greska,
  };
})();
