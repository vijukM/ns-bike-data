/* Zajedničko: podaci (data/istorija/*.json), formati (srpski), vreme (Europe/Belgrade), boje grafika iz CSS tokena,
   ECharts osnova (grafik se crta i animira tek kad dođe na ekran), pinovi po stanju brojača.
   Satni nizovi u JSON-u idu redom po UTC satima od pocetak_utc. */
"use strict";

const NS = (() => {
  const TZ = "Europe/Belgrade";
  const PODACI = "data/istorija/";
  // oznaka verzije sajta (iz ?v= na skripti) ide i na JSON, da pregledač ne meša stare i nove podatke
  const VERZIJA = (() => { try { return new URL(document.currentScript.src).searchParams.get("v") || ""; } catch (e) { return ""; } })();
  const fBroj = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });
  const fDec = new Intl.NumberFormat("sr-Latn-RS", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fSat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
  const DANI = ["nedelja", "ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota"];
  const DANI_KRATKO = ["pon", "uto", "sre", "čet", "pet", "sub", "ned"];
  const MESECI = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar", "novembar", "decembar"];
  const MESECI_KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
  const SEZONE = { ukupno: "cela godina", zima: "zima", prolece: "proleće", leto: "leto", jesen: "jesen" };
  const TIPOVI = { radni: "radni dan", subota: "subota", nedelja_praznik: "nedelja i praznik" };
  const STANJA = { radi: "radi", delimicno: "delimično radi", ne_radi: "ne radi", neispravan: "neispravan" };

  // ---------------------------------------------------------------- formati i vreme
  const broj = (x) => (x == null || Number.isNaN(x) ? "—" : fBroj.format(x));
  const dec = (x) => (x == null || Number.isNaN(x) ? "—" : fDec.format(x));
  const iso2d = (iso) => iso.split("-").map(Number);
  const datum = (iso) => { const [g, m, d] = iso2d(iso); return `${d}. ${m}. ${g}.`; };
  const utcDan = (iso) => { const [g, m, d] = iso2d(iso); return Date.UTC(g, m - 1, d); };
  const danUNedelji = (iso) => new Date(utcDan(iso)).getUTCDay();
  const datumDug = (iso) => { const d = DANI[danUNedelji(iso)]; return d[0].toUpperCase() + d.slice(1) + ", " + datum(iso); };
  const dodajDane = (iso, n) => new Date(utcDan(iso) + n * 864e5).toISOString().slice(0, 10);
  const razlikaDana = (a, b) => Math.round((utcDan(b) - utcDan(a)) / 864e5);
  const mesecNaziv = (ym) => { const [g, m] = ym.split("-").map(Number); return `${MESECI[m - 1]} ${g}.`; };
  const dvaMesta = (h) => String(h).padStart(2, "0");
  const lokalniSat = (ms) => Number(fSat.format(ms));
  const procenat = (x) => `${x < 0 ? "−" : "+"}${dec(Math.abs(x))} %`;

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
  function json(put, koren = PODACI) {
    const kljuc = koren + put;
    if (!kes.has(kljuc)) {
      kes.set(kljuc, fetch(VERZIJA ? `${kljuc}?v=${VERZIJA}` : kljuc).then((r) => {
        if (!r.ok) throw new Error(`${put}: HTTP ${r.status}`);
        return r.json();
      }));
    }
    return kes.get(kljuc);
  }
  let razlozi = [];
  async function stanice() {
    const s = await json("stanice.json");
    razlozi = s.razlozi;
    return s;
  }
  const razlog = (kod) => (razlozi[kod] ? razlozi[kod].opis : "nema podataka");
  function razlogSata(rle, i) {
    for (const [a, n, k] of rle || []) { if (i >= a && i < a + n) return k; if (a > i) break; }
    return 0;
  }
  const pin = (stanje) => `assets/slike/pinovi/${stanje}.png`;

  // ---------------------------------------------------------------- boje i ECharts
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  function boje() {
    const b = {};
    for (const k of ["bicikl", "bicikl-blago", "temp", "kisa", "nema", "mreza", "osa", "tip-1", "tip-2", "tip-3",
      "god-0", "god-1", "god-2", "god-3", "god-4", "god-5", "top-0", "top-1", "top-2", "top-3", "top-4", "top-5"]) b[k] = css("--g-" + k);
    Object.assign(b, { ink: css("--t-base"), "ink-2": css("--t-muted"), "ink-3": css("--t-light"), povrsina: css("--bg-card"),
      primary: css("--primary"), warning: css("--warning") });
    return b;
  }
  const tamna = () => document.documentElement.dataset.theme !== "light";

  function osnova(b) {
    return {
      animation: true, animationDuration: 1100, animationEasing: "cubicOut", animationDurationUpdate: 600,
      textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: b["ink-2"] },
      tooltip: {
        trigger: "axis", confine: true, backgroundColor: b.povrsina, borderColor: b.osa, borderWidth: 1, padding: [8, 12],
        textStyle: { color: b.ink, fontSize: 12.5 }, extraCssText: "border-radius:10px;box-shadow:0 10px 15px -3px rgb(0 0 0 / .3)",
        axisPointer: { type: "line", lineStyle: { color: b["ink-3"] } },
      },
    };
  }
  const osaX = (b, extra = {}) => ({
    axisLine: { lineStyle: { color: b.osa } }, axisTick: { show: false },
    axisLabel: { color: b["ink-3"], hideOverlap: true, fontSize: 11 }, splitLine: { show: false }, ...extra,
  });
  const osaY = (b, extra = {}) => ({
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: b["ink-3"], fontSize: 11, formatter: (v) => broj(v) },
    splitLine: { lineStyle: { color: b.mreza } }, nameTextStyle: { color: b["ink-3"], align: "left", fontSize: 11 }, ...extra,
  });

  /** ECharts grafik: crta se (i animira) tek kad dođe na ekran; ponovo na promenu teme i veličine. */
  const grafici = [];
  function grafik(el, crtaj, { odmah = false } = {}) {
    const g = { el, crtaj, ec: null, spreman: null };
    g.spreman = new Promise((ok) => {
      const pokreni = () => {
        g.ec = echarts.init(el, null, { renderer: "canvas" });
        g.ec.setOption(g.crtaj(boje()), { notMerge: true });
        ok(g);
      };
      if (odmah || typeof LJ === "undefined") pokreni(); else LJ.kadVidljivo(el, pokreni);
    });
    g.osvezi = () => { if (g.ec) g.ec.setOption(g.crtaj(boje()), { notMerge: true }); };
    grafici.push(g);
    return g;
  }
  document.addEventListener("tema", () => grafici.forEach((g) => g.osvezi()));
  let tajmer;
  window.addEventListener("resize", () => {
    clearTimeout(tajmer);
    tajmer = setTimeout(() => grafici.forEach((g) => g.ec && g.ec.resize()), 120);
  });

  /** Segmentni prekidač (aria-pressed). */
  function prekidac(el, vrednosti, pocetna, promena) {
    el.innerHTML = "";
    el.classList.add("segment");
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
  /** Čipovi za uključivanje serija: [[id, naziv, boja, uključeno]] → promena(skupUključenih). */
  function cipovi(el, stavke, promena) {
    const ukljuceno = new Set(stavke.filter((x) => x[3]).map((x) => x[0]));
    el.innerHTML = "";
    el.classList.add("cipovi");
    for (const [id, t, boja] of stavke) {
      const d = document.createElement("button");
      d.type = "button"; d.className = "cip"; d.style.setProperty("--boja", boja);
      d.innerHTML = `<i></i>${t}`;
      d.setAttribute("aria-pressed", String(ukljuceno.has(id)));
      d.addEventListener("click", () => {
        if (ukljuceno.has(id)) ukljuceno.delete(id); else ukljuceno.add(id);
        d.setAttribute("aria-pressed", String(ukljuceno.has(id)));
        promena(ukljuceno);
      });
      el.appendChild(d);
    }
    return ukljuceno;
  }

  /** Grupisanje dnevnog niza po nedelji (pon) ili mesecu: prosek dnevnih vrednosti sa podatkom. */
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
  const kljucPerioda = (d, gustina) => (gustina === "mesec" ? d.slice(0, 7)
    : gustina === "nedelja" ? dodajDane(d, -((danUNedelji(d) + 6) % 7)) : d);

  /** Opsezi uzastopnih null vrednosti → [[od, do], …]. */
  function rupe(x, v) {
    const out = [];
    let p = null;
    v.forEach((y, i) => {
      if (y == null && p == null) p = i;
      if (y != null && p != null) { out.push([x[p], x[i - 1]]); p = null; }
    });
    if (p != null) out.push([x[p], x[x.length - 1]]);
    return out;
  }
  /** Premošćavanje rupa: niz koji postoji samo preko rupa (sa ivičnim tačkama), linearno — za isprekidanu liniju. */
  function premosti(v) {
    const out = v.map(() => null);
    let i = 0;
    while (i < v.length) {
      if (v[i] != null) { i++; continue; }
      let j = i;
      while (j < v.length && v[j] == null) j++;
      const a = i - 1, z = j;
      if (a >= 0 && z < v.length) {
        for (let k = a; k <= z; k++) out[k] = Math.round(v[a] + (v[z] - v[a]) * (k - a) / (z - a));
      }
      i = j;
    }
    return out;
  }

  /** Gradske analize iz grad_dnevno.json — sve po uključenom brojaču (zbir / broj brojača), jer se mreža menjala. */
  function analizaGrada(g) {
    const praznik = new Set(g.praznik);
    const po = g.v.map((v, i) => (v != null && g.n[i] ? v / g.n[i] : null));
    const mes = Array.from({ length: 12 }, () => [0, 0]);
    const dan = Array.from({ length: 7 }, () => [0, 0]);                 // pon … ned
    po.forEach((x, i) => {
      if (x == null) return;
      const d = dodajDane(g.od, i);
      const m = +d.slice(5, 7) - 1;
      mes[m][0] += x; mes[m][1]++;
      if (!praznik.has(i)) { const w = (danUNedelji(d) + 6) % 7; dan[w][0] += x; dan[w][1]++; }
    });
    const sezona = mes.map(([a, n]) => (n ? a / n : null));
    const dani = dan.map(([a, n]) => (n ? a / n : null));
    const radni = dani.slice(0, 5).reduce((a, x) => a + x, 0) / 5;
    const vikend = (dani[5] + dani[6]) / 2;
    const n0 = g.n.find((x) => x > 0), nMaks = Math.max(...g.n);
    return { po, sezona, dani, radni, vikend, vikendOdnos: vikend / radni, n0, nMaks, praznik };
  }

  function greska(el, e) {
    console.error(e);
    el.insertAdjacentHTML("afterbegin", `<div class="upozorenje">⚠ <span>Podaci nisu učitani: ${e.message}</span></div>`);
  }

  return {
    TZ, DANI, DANI_KRATKO, MESECI, MESECI_KRATKO, SEZONE, TIPOVI, STANJA,
    broj, dec, datum, datumDug, dodajDane, razlikaDana, danUNedelji, mesecNaziv, dvaMesta, utcDan, procenat,
    satneOznake, json, stanice, razlog, razlogSata, pin, boje, tamna, osnova, osaX, osaY, grafik, prekidac, cipovi,
    grupisi, oznakaPerioda, kljucPerioda, rupe, premosti, greska, analizaGrada,
  };
})();
