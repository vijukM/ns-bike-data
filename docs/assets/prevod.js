/* Prevod sajta (srpski → engleski) bez izmene ostalih skripti: tekst se prevodi u DOM-u, čim se pojavi.

   - Jezik: localStorage „ns-jezik“ (sr | en), ili ?lang=en / ?lang=sr u adresi (zapamti se). Podrazumevano srpski.
   - Učitava se u <head> pre kapija.js; za engleski odmah učita rečnik assets/i18n/en.js (isti ?v=), pa se tekst
     prevede pre prvog iscrtavanja (MutationObserver, i za sve što skripte kasnije dodaju).
   - Rečnik: ključ je srpski tekst u kome su brojevi, datumi, vreme, nazivi meseci, oznake stanica i vlastita imena
     zamenjeni sa {0}, {1}…; vrednost je engleski tekst sa istim mestima. U prevodu se brojevi pišu engleski
     (12.345 → 12,345; 3,5 → 3.5), datumi „20. 11. 2026.“ → „20 Nov 2026“, meseci po engleski.
     Množina: {0:cyclist|cyclists} — reč po broju na mestu 0 (1 → prva, inače druga).
   - Prevode se tekstualni čvorovi i atributi title, aria-label, placeholder, alt, data-info, data-natpis, value (dugmad).
     Preskaču se script, style, code, pre, textarea i sve u [translate="no"] / .bez-prevoda.
   - PREVOD.t(tekst) prevodi tekst iz koda (npr. ECharts natpisi na platnu); PREVOD.imena([...]) dodaje vlastita
     imena (stanice, ulice) koja ostaju ista; PREVOD.promaseno = tekstovi bez prevoda (za proveru, tests/prevod). */
"use strict";

const PREVOD = (() => {
  const KLJUC = "ns-jezik";
  let jezik = "sr";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "sr") localStorage.setItem(KLJUC, q);
    if (localStorage.getItem(KLJUC) === "en") jezik = "en";
  } catch (e) { /* bez memorije: srpski */ }
  const en = jezik === "en";
  const skript = document.currentScript;

  const api = {
    jezik, en, promaseno: new Map(),
    t: (s) => s, imena: () => {}, imenaIz: () => {}, opcije: (o) => o,
    postavi(j) { try { localStorage.setItem(KLJUC, j); } catch (e) { /* */ } },
  };
  if (!en) return api;

  document.documentElement.lang = "en";
  // rečnik se učitava sinhrono (pre ostatka strane), iz istog foldera i sa istom oznakom verzije
  const v = (() => { try { return new URL(skript.src).searchParams.get("v") || ""; } catch (e) { return ""; } })();
  const putRecnika = skript ? new URL("i18n/en.js" + (v ? "?v=" + v : ""), skript.src).href : "assets/i18n/en.js";
  document.write(`<script src="${putRecnika}"><\/script>`);

  // ---------------------------------------------------------------- tokeni (ostaju isti ili se samo preformatiraju)
  const MES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MES_PUNO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December"];
  const OSNOVE = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar", "novembar", "decembar"];
  const KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
  const mesecPoReci = new Map();
  OSNOVE.forEach((o, i) => {
    // padeži: januar, januara, januaru, januarom (septembar → septembra, septembru)
    const koren = /bar$/.test(o) ? o.slice(0, -3) + "br" : o;
    for (const f of [o, koren + "a", koren + "u", koren + "om"]) mesecPoReci.set(f, MES_PUNO[i]);
    mesecPoReci.set(o[0].toUpperCase() + o.slice(1), MES_PUNO[i]);
    for (const f of [koren + "a", koren + "u"]) mesecPoReci.set(f[0].toUpperCase() + f.slice(1), MES_PUNO[i]);
  });
  KRATKO.forEach((k, i) => { mesecPoReci.set(k, MES[i]); mesecPoReci.set(k + ".", MES[i]); mesecPoReci.set(k[0].toUpperCase() + k.slice(1), MES[i]); });

  const enBroj = (s) => {
    // srpski: 12.345,6 → engleski 12,345.6 (tačka je hiljade samo u grupama od 3 cifre)
    const m = /^([−+\-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(s);
    if (!m) return s;
    return m[1] + m[2].replace(/\./g, ",") + (m[3] != null ? "." + m[3] : "");
  };
  let imenaRe = null;
  const imena = new Set();
  const izbegni = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // dani u nedelji: pun naziv (Petak → Friday), skraćen samo ispred datuma (pet 20. 11. → Fri 20 Nov)
  const DANI_SR = ["ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota", "nedelja"];
  const DANI_KR = ["pon", "uto", "sre", "čet", "pet", "sub", "ned"];
  const DANI_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const danPoReci = new Map();
  const DANI_TOK = DANI_SR.slice(0, 6);           // „nedelja“ je i sedmica: ostaje u rečniku (Nedelja, {0} …)
  DANI_SR.forEach((d, i) => { danPoReci.set(d, DANI_EN[i]); danPoReci.set(d[0].toUpperCase() + d.slice(1), DANI_EN[i]); });
  DANI_KR.forEach((d, i) => { danPoReci.set(d, DANI_EN[i].slice(0, 3)); danPoReci.set(d[0].toUpperCase() + d.slice(1), DANI_EN[i].slice(0, 3)); });
  const velikoMalo = (l) => l.flatMap((x) => [x, x[0].toUpperCase() + x.slice(1)]).join("|");

  // redosled je bitan: imena, verzije, datumi, vreme, oznake stanica, dani, meseci, brojevi
  const DELOVI = [
    ["ime", null],
    ["verzija", /\b\d+\.\d{1,2}\.\d{1,2}\b/],
    ["datum", /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\.?/],
    ["dan", /\b(\d{1,2})\.\s?(\d{1,2})\.(?!\s?\d{3,})(?!\d)/],
    ["vreme", /\b\d{1,2}:\d{2}(?::\d{2})?\b/],
    ["stanica", /\b\d{1,2}[ab](?:,\s\d{1,2}(?:[ab]|(?![.\d])))*\b/],          // 23a ili spisak „34a, 34b, 41“
    ["danNed", new RegExp(`(?<![\\p{L}])(?:(?:${velikoMalo(DANI_TOK)})|(?:${velikoMalo(DANI_KR)})(?=,?\\s\\d))(?![\\p{L}])`, "u")],
    // „jun 2021.“ / „novembru 2024.“: mesec sa godinom je jedan deo (tačka iza godine je srpski redni broj)
    ["mesecGod", null],
    ["mesec", new RegExp(`(?<![\\p{L}])(?:${[...new Set([...OSNOVE.flatMap((o) => { const k = /bar$/.test(o) ? o.slice(0, -3) + "br" : o; return [o, k + "a", k + "u", k + "om"]; })])]
      .sort((a, b) => b.length - a.length).map((x) => `${x}|${x[0].toUpperCase()}${x.slice(1)}`).join("|")}|(?:${velikoMalo(KRATKO)})\\.?)(?![\\p{L}])`, "u")],
    ["broj", /(?:(?<![\p{L}\p{N}])-|[−+])?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(?:\s?%)?/u],
  ];
  function sablon() {
    const izv = DELOVI.filter(([, r]) => r).map(([k, r]) => `(?<${k}>${r.source})`);
    if (imenaRe) izv.unshift(`(?<ime>(?<![\\p{L}])(?:${imenaRe})(?![\\p{L}]))`);
    return new RegExp(izv.join("|"), "gu");
  }
  { const mes = DELOVI.find(([k]) => k === "mesec")[1].source.replace(/\(\?!\[\\p\{L\}\]\)$/, "");
    DELOVI.find(([k]) => k === "mesecGod")[1] = new RegExp(`${mes}\\s\\d{4}\\b\\.?`, "u"); }
  let RE = sablon();

  function token(g, s) {
    if (g.ime || g.verzija || g.vreme || g.stanica) return { s, n: null };
    if (g.datum) { const m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/.exec(s); return { s: `${+m[1]} ${MES[+m[2] - 1] || m[2]} ${m[3]}`, n: null }; }
    if (g.dan) { const m = /(\d{1,2})\.\s?(\d{1,2})\./.exec(s); return { s: `${+m[1]} ${MES[+m[2] - 1] || m[2]}`, n: null }; }
    if (g.danNed) return { s: danPoReci.get(s) || s, n: null };
    if (g.mesecGod) {
      const m = /^(.*\S)\s(\d{4})\.?$/.exec(s);
      return { s: `${mesecPoReci.get(m[1]) || mesecPoReci.get(m[1].toLowerCase()) || m[1]} ${m[2]}`, n: null };
    }
    if (g.mesec) return { s: mesecPoReci.get(s) || mesecPoReci.get(s.toLowerCase()) || s, n: null };
    const pr = /%$/.test(s);
    const golo = s.replace(/\s?%$/, "");
    const vr = Number(golo.replace(/[−]/g, "-").replace(/\./g, "").replace(",", "."));
    return { s: enBroj(golo) + (pr ? "%" : ""), n: vr };
  }

  /** Srpski tekst → { kljuc, tokeni }. */
  function rastavi(tekst) {
    const tokeni = [];
    RE.lastIndex = 0;
    const kljuc = tekst.replace(RE, (s, ...a) => {
      const g = a[a.length - 1];
      tokeni.push(token(g, s));
      return `{${tokeni.length - 1}}`;
    });
    return { kljuc, tokeni };
  }
  function sastavi(sab, tokeni) {
    return sab.replace(/\{(\d+)(?::([^{}|]*)\|([^{}]*))?\}/g, (m, i, jedan, vise) => {
      const t = tokeni[+i];
      if (!t) return m;
      if (jedan != null) return Math.abs(t.n) === 1 ? jedan : vise;
      return t.s;
    });
  }

  const SLOVO = /[A-Za-zČĆŽŠĐčćžšđ]/;
  // slova van mesta za brojeve i van ECharts oznaka ({value}, {a|…} bogati tekst)
  const imaSlova = (k) => SLOVO.test(k.replace(/\{\d+\}|\{[A-Za-z_]+\||\{(?:value|a|b|c|d|e)\}/g, ""));
  const R = () => window.PREVOD_EN || {};
  /** Prevod jednog teksta (sa razmacima oko njega); null = nema prevoda (i tekst ima slova). */
  function prevedi(tekst) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(tekst);
    const jezgro = m[2].replace(/\s+/g, " ");
    if (!jezgro) return tekst;
    const rec = R();
    if (Object.prototype.hasOwnProperty.call(rec, jezgro)) return m[1] + rec[jezgro] + m[3];
    const { kljuc, tokeni } = rastavi(jezgro);
    if (Object.prototype.hasOwnProperty.call(rec, kljuc)) return m[1] + sastavi(rec[kljuc], tokeni) + m[3];
    if (!imaSlova(kljuc)) return m[1] + sastavi(kljuc, tokeni) + m[3]; // samo brojevi/znaci
    if (vecEngleski(jezgro)) return tekst;
    // „naziv:“ (oblačići grafika: ime serije + dvotačka) → prevod bez dvotačke + dvotačka
    const dv = /^(.*\S)\s?:$/.exec(jezgro);
    if (dv) { const p = prevedi(dv[1]); if (p != null) return m[1] + p + ":" + m[3]; }
    return null;
  }
  /** Engleski šabloni iz rečnika: tekst koji je već na engleskom ostaje isti (i ne beleži se kao promašaj). */
  // (npr. skripta pročita natpis i upiše ga ponovo, ili ECharts formatter dobije već prevedeno ime serije)
  let engleski = null;
  const EN_DELOVI = [
    ["datum", new RegExp(`\\b\\d{1,2} (?:${MES.join("|")})(?: \\d{4})?\\b`)],
    ["verzija", /\b\d+\.\d{1,2}\.\d{1,2}\b/],
    ["vreme", /\b\d{1,2}:\d{2}(?::\d{2})?\b/],
    ["stanica", /\b\d{1,2}[ab](?:,\s\d{1,2}(?:[ab]|(?![.\d])))*\b/],
    ["rec", new RegExp(`\\b(?:${[...MES_PUNO, ...DANI_EN, ...MES, ...DANI_EN.map((d) => d.slice(0, 3))].join("|")})\\b`)],
    ["broj", /[−+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|[−+-]?\d+(?:\.\d+)?%?/],
  ];
  let EN_RE = null;
  const rastaviEn = (t) => {
    if (!EN_RE) EN_RE = new RegExp((imenaRe ? `(?<![\\p{L}])(?:${imenaRe})(?![\\p{L}])|` : "") + EN_DELOVI.map(([, r]) => r.source).join("|"), "gu");
    let i = 0;
    EN_RE.lastIndex = 0;
    return t.replace(EN_RE, () => `{${i++}}`);
  };
  const vecEngleski = (jezgro) => {
    if (!engleski || !engleski.size) {
      engleski = new Set();
      for (const v of Object.values(R())) {
        // množina {n:one|other}: oba oblika; zatim mesta {n} → redom {0}, {1}… kao u rastaviEn
        for (const oblik of [1, 2]) {
          let i = 0;
          const t = v.replace(/\{(\d+):([^{}|]*)\|([^{}]*)\}/g, (x, n, a, b) => (oblik === 1 ? a : b)).replace(/\{\d+\}/g, () => `{${i++}}`);
          engleski.add(t);
        }
      }
    }
    return engleski.has(jezgro) || engleski.has(rastaviEn(jezgro));
  };
  const zabelezi = (kljuc, gde) => { if (!api.promaseno.has(kljuc)) api.promaseno.set(kljuc, gde); };

  // ---------------------------------------------------------------- DOM
  const PRESKOCI = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT", "TEMPLATE"]);
  const ATRIBUTI = ["title", "aria-label", "placeholder", "alt", "data-info", "data-natpis", "data-tip"];
  const gotovo = new WeakMap();                    // čvor → tekst koji smo upisali (da se ne prevodi ponovo)
  const gotovoAtr = new WeakMap();                 // element → { atribut: upisano }
  const preskocen = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (PRESKOCI.has(e.tagName) || e.getAttribute("translate") === "no" || e.classList.contains("bez-prevoda")) return true;
    }
    return false;
  };
  const opis = (el) => (el ? el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.classList && el.classList[0] ? "." + el.classList[0] : "") : "");

  function tekstCvor(n) {
    const s = n.data;
    if (gotovo.get(n) === s || !SLOVO.test(s) && !/\d/.test(s)) return;
    if (!n.parentElement || preskocen(n.parentElement)) return;
    const p = prevedi(s);
    if (p == null) { zabelezi(rastavi(s.trim().replace(/\s+/g, " ")).kljuc, opis(n.parentElement)); gotovo.set(n, s); return; }
    gotovo.set(n, p);
    if (p !== s) n.data = p;
  }
  function atribut(el, ime) {
    const s = el.getAttribute(ime);
    if (s == null || !SLOVO.test(s)) return;
    let mapa = gotovoAtr.get(el);
    if (mapa && mapa[ime] === s) return;
    if (preskocen(el)) return;
    if (!mapa) gotovoAtr.set(el, (mapa = {}));
    const p = prevedi(s);
    if (p == null) { zabelezi(rastavi(s.trim().replace(/\s+/g, " ")).kljuc, opis(el) + "@" + ime); mapa[ime] = s; return; }
    mapa[ime] = p;
    if (p !== s) el.setAttribute(ime, p);
  }
  /** Naslov u više delova („Poređenje <em>stanica</em>“): ceo HTML je jedan ključ, da red reči bude engleski. */
  function naslov(el) {
    if (el.tagName !== "H1" || !el.firstElementChild || gotovo.get(el) === el.innerHTML) return false;
    const k = el.innerHTML.trim().replace(/\s+/g, " ");
    const rec = R();
    if (!Object.prototype.hasOwnProperty.call(rec, k)) return false;
    el.innerHTML = rec[k];
    gotovo.set(el, el.innerHTML);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) gotovo.set(n, n.data);
    return true;
  }
  function element(el) {
    naslov(el);
    for (const a of ATRIBUTI) if (el.hasAttribute(a)) atribut(el, a);
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && el.hasAttribute("value")) atribut(el, "value");
  }
  function obidji(koren) {
    if (koren.nodeType === 3) { tekstCvor(koren); return; }
    if (koren.nodeType !== 1 && koren.nodeType !== 9 && koren.nodeType !== 11) return;
    if (koren.nodeType === 1) { if (preskocen(koren)) return; element(koren); }
    const w = document.createTreeWalker(koren, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && PRESKOCI.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? tekstCvor(n) : element(n);
  }
  const posmatrac = new MutationObserver((zapisi) => {
    for (const z of zapisi) {
      if (z.type === "childList") z.addedNodes.forEach(obidji);
      else if (z.type === "characterData") tekstCvor(z.target);
      else if (z.type === "attributes") atribut(z.target, z.attributeName);
    }
  });
  posmatrac.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATRIBUTI, "value"],
  });
  document.addEventListener("DOMContentLoaded", () => obidji(document.documentElement));

  // ---------------------------------------------------------------- tekst iz koda (ECharts platno i sl.)
  function t(s) {
    if (typeof s !== "string" || !SLOVO.test(s) && !/\d/.test(s)) return s;
    if (/<[a-z][^>]*>/i.test(s)) return s;                       // HTML (oblačić) prevodi DOM sloj
    return s.split("\n").map((red) => {
      const p = prevedi(red);
      if (p == null) { zabelezi(rastavi(red.trim().replace(/\s+/g, " ")).kljuc, "kod"); return red; }
      return p;
    }).join("\n");
  }
  api.t = t;
  api.imena = (lista) => {
    let novo = false;
    for (const x of lista || []) if (x && typeof x === "string" && SLOVO.test(x) && !imena.has(x)) { imena.add(x); novo = true; }
    if (!novo) return;
    imenaRe = [...imena].sort((a, b) => b.length - a.length).map(izbegni).join("|");
    RE = sablon();
    EN_RE = null;
  };
  /** ECharts opcije: natpisi na platnu (name, text, kategorije na osi, formatter-i) — DOM sloj ih ne vidi. */
  //  Formatter-i dobijaju originalne (srpske) nazive — kod ih poredi sa svojim spiskovima — a prevodi se njihov rezultat.
  const KLJUCEVI = new Set(["name", "text", "subtext", "formatter", "nameMap"]);   // nameMap: dani i meseci u kalendaru
  const nazad = new Map();                                   // engleski naziv → srpski original
  const tPamti = (s) => { const p = t(s); if (p !== s) nazad.set(p, s); return p; };
  const POLJA_NAZIVA = ["name", "seriesName", "axisValue", "axisValueLabel"];
  function vrati(x) {
    if (typeof x === "string") return nazad.has(x) ? nazad.get(x) : x;
    if (Array.isArray(x)) return x.map(vrati);
    if (x && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype) {
      const n = { ...x };
      for (const k of POLJA_NAZIVA) if (typeof n[k] === "string" && nazad.has(n[k])) n[k] = nazad.get(n[k]);
      if (n.data && typeof n.data === "object" && typeof n.data.name === "string" && nazad.has(n.data.name)) n.data = { ...n.data, name: nazad.get(n.data.name) };
      return n;
    }
    return x;
  }
  function opcije(o, kljuc = "") {
    if (typeof o === "string") return KLJUCEVI.has(kljuc) || kljuc === "data" ? tPamti(o) : o;
    if (typeof o === "function") {
      if (kljuc !== "formatter" && kljuc !== "valueFormatter") return o;
      if (o.__prevod) return o;
      const f = function (...a) { return t(o.apply(this, a.map(vrati))); };
      f.__prevod = true;
      return f;
    }
    // nova kopija (bez menjanja originala: nizovi kao NS.DANI_KRATKO su zajednički za celu stranu)
    if (Array.isArray(o)) {
      if (o.length > 0 && typeof o[0] === "number") return o;                       // brojevi: ništa za prevod
      return o.map((x) => opcije(x, kljuc === "data" || KLJUCEVI.has(kljuc) ? kljuc : ""));   // i text: ["više", "manje"]
    }
    if (o && typeof o === "object" && Object.getPrototypeOf(o) === Object.prototype) {
      const n = {};
      for (const k of Object.keys(o)) n[k] = opcije(o[k], k);
      return n;
    }
    return o;
  }
  api.opcije = (o) => opcije(o);

  /** Vlastita imena iz podataka (ostaju ista i ne smetaju šablonu oko njih). */
  api.imenaIz = (put, d) => {
    if (!d || typeof d !== "object") return;
    const lista = [];
    const smer = (x) => String(x || "").replace(/\s*\([^)]*\)\s*$/, "").split(/\s+–\s+/).forEach((y) => lista.push(y.trim()));
    if (/mapa\/(mesta|delovi)\.geojson$/.test(put)) for (const f of d.features || []) lista.push(f.properties && f.properties.n);
    if (/stanice\.json$/.test(put)) for (const s of d.serije || []) { lista.push(s.naziv); (s.smerovi || []).forEach(smer); }
    if (/staze_analiza\.json$/.test(put)) {
      for (const u of d.ulice || []) {
        const n = String(u.n || "");
        if (/^pravac: /.test(n)) smer(n.slice(8)); else if (/^kod: /.test(n)) lista.push(n.slice(5)); else if (!/^uz /.test(n)) lista.push(n);
      }
      for (const x of d.delovi || []) lista.push(x.n);
      for (const k of ["prekidi", "krajevi"]) for (const x of d[k] || []) { lista.push(x.ulica); if (x.uz) lista.push(x.uz); }
      for (const k of Object.keys(d.deonice || {})) (d.deonice[k] || []).forEach((x) => lista.push(x));
      for (const b of d.brojaci || []) { lista.push(b.naziv); lista.push(b.ulica); }
    }
    api.imena(lista.filter((x) => x && x.length > 2));
  };
  api.prevedi = prevedi;
  api.rastavi = rastavi;
  return api;
})();
