/* Izbor datuma (zamena za <input type="date"> na celom sajtu).
   Polje ostaje u stranici (skriveno) i dalje nosi vrednost, min/max i događaj „change“, pa kod strana ne mora da se menja;
   preko njega se crta dugme sa datumom i kalendar koji zna za podatke:
   - ispod svakog dana je traka prometa (biciklista po brojaču tog dana; 5 nivoa kao na Kalendaru),
     za stanicu (data-serija na polju) promet te stanice;
   - dani bez podataka (rupa 01.09–08.10.2026, van min/max) su ugašeni i ne mogu da se izaberu;
   - vikend i praznici narandžasto, danas uokviren, izabran dan pun;
   - prelaz na mesec / godinu klikom na naslov, prečice (Danas, Juče, Pre nedelju dana, Najprometniji dan);
   - pređeš mišem preko dana → dole piše koliko je biciklista bilo; tastatura: strelice, PgUp/PgDn, Home/End, Enter, Esc. */
"use strict";

const IZBOR_DATUMA = (() => {
  const MESECI = ["Januar", "Februar", "Mart", "April", "Maj", "Jun", "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar"];
  const DANI = ["Po", "Ut", "Sr", "Če", "Pe", "Su", "Ne"];
  const DANI_DUGO = ["nedelja", "ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota"];
  const KRATKO = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];
  const IK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
  const STRELICA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (g, m, d) => `${g}-${pad(m + 1)}-${pad(d)}`;
  const deli = (s) => s.split("-").map(Number);
  const utc = (s) => { const [g, m, d] = deli(s); return Date.UTC(g, m - 1, d); };
  const plus = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
  const dow = (s) => new Date(utc(s)).getUTCDay();                       // 0 = nedelja
  const danasIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
  const broj = (x) => (x == null ? "—" : new Intl.NumberFormat("sr-Latn-RS").format(Math.round(x)));
  const lepo = (s) => { const [g, m, d] = deli(s); return `${d}. ${m}. ${g}.`; };

  // ---------------------------------------------------------------- podaci (deljeni, učitavaju se jednom)
  let podaci = null;
  const serijeKes = {};
  function ucitajPodatke() {
    if (podaci) return podaci;
    const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    podaci = Promise.all([j("data/istorija/grad_dnevno.json"), j("data/istorija/sati_dostupno.json"), j(`data/dani/spisak.json?h=${Date.now() / 36e5 | 0}`)])
      .then(([g, dost, arh]) => {
        const promet = new Map(), praznik = new Set(), prazni = new Set((dost && dost.prazni_dani) || []);
        if (g) {
          g.v.forEach((v, i) => { if (v != null && g.n[i]) promet.set(plus(g.od, i), v / g.n[i]); });
          (g.praznik || []).forEach((i) => praznik.add(plus(g.od, i)));
        }
        if (arh && arh.zbir) for (const [d, [z, n]] of Object.entries(arh.zbir)) if (n) promet.set(d, z / n);
        return { promet, praznik, prazni, ukupno: g, arhiva: arh, pragovi: pragovi([...promet.values()]),
          najprometniji: g && g.cinjenice && g.cinjenice.najprometniji_dan ? g.cinjenice.najprometniji_dan.datum : null };
      });
    return podaci;
  }
  function pragovi(v) {
    const s = v.filter((x) => x > 0).sort((a, b) => a - b);
    return s.length ? [0.2, 0.4, 0.6, 0.8].map((q) => s[Math.floor(q * (s.length - 1))]) : [];
  }
  /** Promet jedne stanice (data-serija): biciklista tog dana, samo kompletni dani. */
  function prometSerije(serija) {
    if (!serijeKes[serija]) {
      serijeKes[serija] = fetch(`data/istorija/dnevno/${serija}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
        const m = new Map();
        if (d) d.v.forEach((v, i) => { if (v != null) m.set(plus(d.od, i), v); });
        return { promet: m, pragovi: pragovi([...m.values()]) };
      });
    }
    return serijeKes[serija];
  }

  // ---------------------------------------------------------------- jedno polje
  function poboljsaj(polje) {
    if (polje.dataset.izbor) return;
    polje.dataset.izbor = "1";
    const omot = document.createElement("span");
    omot.className = "izbor-datuma";
    polje.parentNode.insertBefore(omot, polje);
    omot.appendChild(polje);
    polje.classList.add("izbor-datuma-polje");
    polje.tabIndex = -1;
    polje.setAttribute("aria-hidden", "true");
    const dugme = document.createElement("button");
    dugme.type = "button";
    dugme.className = "izbor-datuma-dugme";
    dugme.setAttribute("aria-haspopup", "dialog");
    dugme.setAttribute("aria-label", polje.getAttribute("aria-label") || "Datum");
    omot.appendChild(dugme);

    const natpis = () => {
      const v = polje.value;
      dugme.innerHTML = `${IK}<span>${v ? `<b>${KRATKO[dow(v)]}</b> ${lepo(v)}` : "izaberi dan"}</span>${v === danasIso() ? '<em class="izbor-datuma-danas">danas</em>' : ""}`;
    };
    // vrednost koju strana postavi iz koda (polje.value = …) odmah se vidi i na dugmetu
    const opis = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(polje, "value", { configurable: true, get() { return opis.get.call(this); }, set(v) { opis.set.call(this, v); natpis(); if (panel) crtaj(); } });
    new MutationObserver(() => natpis()).observe(polje, { attributes: true, attributeFilter: ["min", "max", "disabled"] });
    natpis();

    let panel = null, prikaz = "dani", gm = null, fokus = null, podatakSerije = null;
    const granice = () => [polje.min || "2021-01-01", polje.max || danasIso()];

    function zatvori(vratiFokus = true) {
      if (!panel) return;
      panel.remove(); panel = null;
      dugme.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", van, true);
      if (vratiFokus) dugme.focus();
    }
    const van = (e) => { if (panel && !omot.contains(e.target)) zatvori(false); };
    function izaberi(d) {
      const [min, max] = granice();
      if (d < min || d > max) return;
      polje.value = d;
      polje.dispatchEvent(new Event("input", { bubbles: true }));
      polje.dispatchEvent(new Event("change", { bubbles: true }));
      zatvori();
    }
    async function otvori() {
      if (panel) { zatvori(); return; }
      const [min, max] = granice();
      const v = polje.value && polje.value >= min && polje.value <= max ? polje.value : max;
      const [g, m] = deli(v);
      gm = [g, m - 1]; fokus = v; prikaz = "dani";
      panel = document.createElement("div");
      panel.className = "izbor-datuma-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Izbor dana");
      omot.appendChild(panel);
      dugme.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", van, true);
      panel.addEventListener("click", klik);
      panel.addEventListener("keydown", tastatura);
      panel.addEventListener("pointerover", (e) => { const c = e.target.closest("[data-d]"); if (c) opisDana(c.dataset.d); });
      panel.addEventListener("pointerleave", () => opisDana(fokus));
      panel.addEventListener("focusin", (e) => { const c = e.target.closest(".izd-dan"); if (c && c.dataset.d !== fokus) { fokus = c.dataset.d; opisDana(fokus); } });
      crtaj();
      const P = await ucitajPodatke();
      podatakSerije = polje.dataset.serija ? await prometSerije(polje.dataset.serija) : null;
      if (panel) { panel.__p = P; crtaj(); }
      // panel ne sme da izađe van ekrana desno
      requestAnimationFrame(() => {
        if (!panel) return;
        const r = panel.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) panel.classList.add("desno");
      });
    }
    dugme.addEventListener("click", otvori);
    dugme.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" && !panel) { e.preventDefault(); otvori(); } });

    // ---------------------------------------------------------------- crtanje
    function nivo(d) {
      const P = panel && panel.__p;
      if (!P) return -1;
      const izvor = podatakSerije || P;
      const x = izvor.promet.get(d);
      if (x == null) return -1;
      return izvor.pragovi.filter((t) => x > t).length;                  // 0–4
    }
    function stanjeDana(d) {
      const [min, max] = granice(), P = panel && panel.__p;
      if (d < min || d > max) return "van";
      if (P && P.prazni.has(d)) return "prazan";
      return "ok";
    }
    function crtaj() {
      if (!panel) return;
      const P = panel.__p;
      const [min, max] = granice();
      const [g, m] = gm;
      const glava = `<div class="izd-glava">
          <button type="button" class="izd-strelica" data-k="-1" aria-label="${prikaz === "dani" ? "Prethodni mesec" : "Prethodna godina"}">${STRELICA}</button>
          <div class="izd-naslov">
            <button type="button" class="izd-mesec${prikaz === "meseci" ? " aktivno" : ""}" data-prikaz="meseci" aria-label="Izaberi mesec">${MESECI[m]}</button>
            <button type="button" class="izd-godina${prikaz === "godine" ? " aktivno" : ""}" data-prikaz="godine" aria-label="Izaberi godinu">${g}</button>
          </div>
          <button type="button" class="izd-strelica" data-k="1" aria-label="${prikaz === "dani" ? "Sledeći mesec" : "Sledeća godina"}">${STRELICA}</button>
        </div>`;
      let telo = "";
      if (prikaz === "dani") {
        const prvi = iso(g, m, 1), n = new Date(Date.UTC(g, m + 1, 0)).getUTCDate();
        const pomak = (dow(prvi) + 6) % 7;                                // ponedeljak prvi
        const celije = [];
        for (let i = 0; i < pomak; i++) celije.push('<span class="izd-prazno"></span>');
        for (let d = 1; d <= n; d++) {
          const s = iso(g, m, d), st = stanjeDana(s), w = dow(s);
          const kl = ["izd-dan", st !== "ok" ? "ugaseno" : "", s === polje.value ? "izabran" : "", s === danasIso() ? "danas" : "",
            w === 0 || w === 6 || (P && P.praznik.has(s)) ? "vikend" : "", s === fokus ? "fokus" : ""].filter(Boolean).join(" ");
          const nv = st === "ok" ? nivo(s) : -1;
          celije.push(`<button type="button" class="${kl}" data-d="${s}" ${st !== "ok" ? 'aria-disabled="true"' : ""} tabindex="${s === fokus ? 0 : -1}"
            aria-label="${DANI_DUGO[w]}, ${lepo(s)}${st === "prazan" ? ", nema podataka" : ""}" aria-pressed="${s === polje.value}">
            <span>${d}</span><i class="izd-traka${nv >= 0 ? ` n${nv}` : ""}"></i></button>`);
        }
        telo = `<div class="izd-nedelja">${DANI.map((x, i) => `<span class="${i >= 5 ? "vikend" : ""}">${x}</span>`).join("")}</div>
          <div class="izd-mreza">${celije.join("")}</div>`;
      } else if (prikaz === "meseci") {
        telo = `<div class="izd-mreza-veliko">${MESECI.map((x, i) => {
          const od = iso(g, i, 1), kraj = iso(g, i, new Date(Date.UTC(g, i + 1, 0)).getUTCDate());
          const ok = kraj >= min && od <= max;
          return `<button type="button" class="izd-veliko${i === m ? " izabran" : ""}${ok ? "" : " ugaseno"}" data-mesec="${i}" ${ok ? "" : 'aria-disabled="true"'}>${x.slice(0, 3)}</button>`;
        }).join("")}</div>`;
      } else {
        const g0 = +min.slice(0, 4), g1 = +max.slice(0, 4), god = [];
        for (let x = g0; x <= g1; x++) god.push(x);
        telo = `<div class="izd-mreza-veliko">${god.map((x) => `<button type="button" class="izd-veliko${x === g ? " izabran" : ""}" data-godina="${x}">${x}</button>`).join("")}</div>`;
      }
      const precice = [["Danas", max >= danasIso() ? danasIso() : null], ["Juče", plus(danasIso(), -1)], ["Pre 7 dana", plus(danasIso(), -7)],
        ["Najprometniji dan", P && P.najprometniji]].filter(([, d]) => d && d >= min && d <= max && stanjeDana(d) === "ok");
      const dno = `<div class="izd-precice">${precice.map(([t, d]) => `<button type="button" class="izd-precica" data-d="${d}">${t}</button>`).join("")}</div>
        <div class="izd-dno"><span class="izd-opis" aria-live="polite"></span>
          <span class="izd-legenda" title="biciklista po brojaču tog dana">manje <i class="n0"></i><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i> više</span></div>`;
      panel.innerHTML = glava + telo + dno;
      opisDana(fokus);
      const f = panel.querySelector(".izd-dan.fokus");
      if (f && panel.contains(document.activeElement)) f.focus();
    }
    function opisDana(d) {
      const el = panel && panel.querySelector(".izd-opis");
      if (!el || !d) return;
      const P = panel.__p, st = stanjeDana(d);
      if (st === "van") { el.textContent = `${lepo(d)} · van perioda podataka`; return; }
      if (st === "prazan") { el.textContent = `${lepo(d)} · nema podataka (pauza između istorije i čitanja uživo)`; return; }
      if (!P) { el.textContent = lepo(d); return; }
      if (podatakSerije) {
        const x = podatakSerije.promet.get(d);
        el.innerHTML = `${KRATKO[dow(d)]} ${lepo(d)} · ${x == null ? "nepotpun dan" : `<b>${broj(x)}</b> biciklista`}`;
        return;
      }
      let z = null, n = null;
      const g = P.ukupno;
      if (g && d >= g.od && d <= g.do) { const i = Math.round((utc(d) - utc(g.od)) / 864e5); z = g.v[i]; n = g.n[i]; }
      else if (P.arhiva && P.arhiva.zbir && P.arhiva.zbir[d]) [z, n] = P.arhiva.zbir[d];
      el.innerHTML = `${KRATKO[dow(d)]} ${lepo(d)}${P.praznik.has(d) ? " · praznik" : ""} · ${z == null ? (d === danasIso() ? "u toku" : "—") : `<b>${broj(z)}</b> biciklista${n ? ` · ${n} brojača` : ""}`}`;
    }

    // ---------------------------------------------------------------- događaji
    function klik(e) {
      const b = e.target.closest("button");
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.k) {
        const k = +b.dataset.k;
        if (prikaz === "dani") { const x = new Date(Date.UTC(gm[0], gm[1] + k, 1)); gm = [x.getUTCFullYear(), x.getUTCMonth()]; }
        else gm = [gm[0] + k, gm[1]];
        const [min, max] = granice(); fokus = clamp(iso(gm[0], gm[1], 1), min, max); crtaj(); return;
      }
      if (b.dataset.prikaz) { prikaz = prikaz === b.dataset.prikaz ? "dani" : b.dataset.prikaz; crtaj(); return; }
      if (b.dataset.mesec != null && !b.getAttribute("aria-disabled")) { gm = [gm[0], +b.dataset.mesec]; prikaz = "dani"; fokus = clamp(iso(gm[0], gm[1], 1), ...granice()); crtaj(); return; }
      if (b.dataset.godina) { gm = [+b.dataset.godina, gm[1]]; prikaz = "meseci"; crtaj(); return; }
      if (b.dataset.d && !b.getAttribute("aria-disabled")) izaberi(b.dataset.d);
    }
    const clamp = (d, a, b) => (d < a ? a : d > b ? b : d);
    function tastatura(e) {
      if (e.key === "Escape") { e.preventDefault(); zatvori(); return; }
      if (prikaz !== "dani") return;
      const pomaci = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let d = fokus;
      if (pomaci[e.key]) d = plus(fokus, pomaci[e.key]);
      else if (e.key === "PageUp" || e.key === "PageDown") { const [g, m, dd] = deli(fokus); const x = new Date(Date.UTC(g, m - 1 + (e.key === "PageUp" ? -1 : 1), dd)); d = x.toISOString().slice(0, 10); }
      else if (e.key === "Home") d = plus(fokus, -((dow(fokus) + 6) % 7));
      else if (e.key === "End") d = plus(fokus, 6 - ((dow(fokus) + 6) % 7));
      else if (e.key === "Enter" || e.key === " ") { if (e.target.closest(".izd-dan") && stanjeDana(fokus) === "ok") { e.preventDefault(); izaberi(fokus); } return; }
      else return;
      e.preventDefault();
      const [min, max] = granice();
      fokus = clamp(d, min, max);
      const [g, m] = deli(fokus); gm = [g, m - 1];
      crtaj();
      const f = panel.querySelector(".izd-dan.fokus"); if (f) f.focus();
    }
  }

  function sve(koren = document) { koren.querySelectorAll('input[type="date"]').forEach(poboljsaj); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => sve()); else sve();
  return { poboljsaj, sve };
})();
