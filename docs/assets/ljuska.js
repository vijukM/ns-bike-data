/* Ljuska sajta (po uzoru na Adminator): levi meni, gornja traka (putanja, pretraga Ctrl+K, jezik, obaveštenja,
   tema), tost poruke, pojava sadržaja pri skrolovanju, brojanje KPI vrednosti, prstenovi.
   Strana zadaje <body data-strana="…" data-putanja="Grupa|Strana"> i <main class="sadrzaj">…</main>. */
"use strict";

const LJ = (() => {
  const IK = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    bars: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
    table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    cloud: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    play: '<path d="M6 3l14 9-14 9z"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    rain: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 14v6M8 14v6M12 16v6"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    thermo: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    collapse: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    compare: '<path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    pulse: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  };
  const ik = (ime, klasa = "") => `<svg class="ik ${klasa}" viewBox="0 0 24 24" aria-hidden="true">${IK[ime] || ""}</svg>`;
  /** Mala „i“ ikonica: objašnjenje se vidi na prelaz mišem ili fokus. */
  const info = (tekst) => `<span class="info" tabindex="0" role="note" aria-label="${tekst}" data-info="${tekst}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>`;

  // uskoro: strana je u izradi — u meniju dobija oznaku USKORO, a strana prikazuje skicu kako će izgledati
  const MENI = [
    { grupa: "Pregled", stavke: [
      { id: "kontrolna", t: "Kontrolna tabla", href: "index.html", ik: "home" },
      { id: "danas", t: "Danas uživo", href: "danas.html", ik: "activity", uskoro: true }] },
    { grupa: "Mapa", stavke: [
      { id: "mapa", t: "Mapa brojača", href: "mapa.html", ik: "map" },
      { id: "dan", t: "Dan na mapi", href: "mapa.html?rezim=dan", ik: "clock" },
      { id: "toplotna", t: "Toplotna mapa grada", href: "toplotna.html", ik: "flame", uskoro: true },
      { id: "staze", t: "Biciklističke staze", href: "staze.html", ik: "route", uskoro: true }] },
    { grupa: "Podaci", stavke: [
      { id: "grafici", t: "Grafici", href: "grafici.html", ik: "chart" },
      { id: "stanice", t: "Stanice", href: "stanice.html", ik: "table", oznaka: "46", klasa: "plava" },
      { id: "poredjenje", t: "Poređenje stanica", href: "poredjenje.html", ik: "compare", uskoro: true },
      { id: "godine", t: "Poređenje godina", href: "grafici.html#godine", ik: "bars" },
      { id: "kalendar", t: "Kalendar", href: "kalendar.html", ik: "calendar", oznaka: "NOVO" },
      { id: "rekordi", t: "Rekordi i zanimljivosti", href: "rekordi.html", ik: "trophy", uskoro: true }] },
    { grupa: "Analize", stavke: [
      { id: "vreme", t: "Vreme i biciklisti", href: "vreme.html", ik: "rain", uskoro: true },
      { id: "praznici", t: "Praznici i događaji", href: "praznici.html", ik: "star", uskoro: true },
      { id: "ritam", t: "Ritam grada", href: "ritam.html", ik: "pulse", uskoro: true },
      { id: "kvalitet", t: "Kvalitet podataka", href: "kvalitet.html", ik: "shield", uskoro: true }] },
    { grupa: "Prognoza", stavke: [
      { id: "prognoza", t: "Prognoza za sutra", href: "prognoza.html", ik: "cloud", uskoro: true },
      { id: "tacnost", t: "Tačnost prognoze", href: "tacnost.html", ik: "target", uskoro: true },
      { id: "model", t: "Model — kako radi", href: "model.html", ik: "cpu", uskoro: true }] },
    { grupa: "Projekat", stavke: [
      { id: "o-projektu", t: "O projektu", href: "o-projektu.html", ik: "info" },
      { id: "preuzimanje", t: "Preuzimanje podataka", href: "preuzimanje.html", ik: "download", uskoro: true },
      { id: "recnik", t: "Rečnik pojmova", href: "recnik.html", ik: "book", uskoro: true }] },
  ];
  for (const g of MENI) for (const x of g.stavke) if (x.uskoro) Object.assign(x, { oznaka: "USKORO", klasa: "siva" });

  // ---------------------------------------------------------------- tema
  const tema = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  function postaviTemu(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("ns-tema", t); } catch (e) { /* bez memorije */ }
    const d = document.getElementById("tema-dugme");
    if (d) d.innerHTML = ik(t === "dark" ? "sun" : "moon");
    document.dispatchEvent(new Event("tema"));
  }

  // ---------------------------------------------------------------- tost
  let tostTajmer;
  function tost(tekst, ikona = "info") {
    let el = document.querySelector(".tost");
    if (!el) { el = document.createElement("div"); el.className = "tost"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = `${ik(ikona)}<span>${tekst}</span>`;
    requestAnimationFrame(() => el.classList.add("vidljiv"));
    clearTimeout(tostTajmer);
    tostTajmer = setTimeout(() => el.classList.remove("vidljiv"), 3200);
  }

  // ---------------------------------------------------------------- pojava, brojanje, prstenovi
  const posmatrac = "IntersectionObserver" in window ? new IntersectionObserver((unosi) => {
    for (const u of unosi) {
      if (!u.isIntersecting) continue;
      posmatrac.unobserve(u.target);
      u.target.classList.add("vidljivo");
      const fn = u.target.__kadVidljivo;
      if (fn) { u.target.__kadVidljivo = null; fn(); }
    }
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }) : null;

  /** Pozovi fn kad element prvi put dođe na ekran (grafici se tada crtaju i animiraju). */
  function kadVidljivo(el, fn) {
    if (!posmatrac) { fn(); return; }
    el.__kadVidljivo = fn;
    posmatrac.observe(el);
  }
  function pojave(koren = document) { koren.querySelectorAll(".pojava:not(.vidljivo)").forEach((el) => kadVidljivo(el, () => {})); }

  const manjeKretanja = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Broji od 0 do cilja kad se element vidi; format(x) vraća HTML. */
  function brojanje(el, cilj, format) {
    kadVidljivo(el, () => {
      if (manjeKretanja()) { el.innerHTML = format(cilj); return; }
      const t0 = performance.now(), trajanje = 1300;
      const korak = (t) => {
        const p = Math.min(1, (t - t0) / trajanje);
        el.innerHTML = format(cilj * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(korak);
      };
      requestAnimationFrame(korak);
    });
  }
  function prsten(el, udeo, boja) {
    const r = 28, obim = 2 * Math.PI * r;
    el.innerHTML = `<div class="unutra"><svg viewBox="0 0 66 66"><circle class="pozadina" cx="33" cy="33" r="${r}"/>
      <circle class="luk" cx="33" cy="33" r="${r}" style="--boja:${boja}" stroke-dasharray="${obim}" stroke-dashoffset="${obim}"/></svg>
      <div class="procenat">${Math.round(udeo * 100)}%</div></div>`;
    kadVidljivo(el, () => { el.querySelector(".luk").style.strokeDashoffset = String(obim * (1 - udeo)); });
  }

  // ---------------------------------------------------------------- pretraga (Ctrl+K)
  const bezKvacica = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
  let paleta = null;
  async function otvoriPretragu() {
    if (paleta) return;
    const s = await NS.stanice().catch(() => ({ serije: [] }));
    const stavke = [
      ...MENI.flatMap((g) => g.stavke.map((x) => ({ grupa: "Strane", t: x.t, opis: g.grupa + (x.uskoro ? " · uskoro" : ""), href: x.href, ik: x.ik }))),
      ...s.serije.map((r) => ({ grupa: "Stanice", t: `${r.serija} · ${r.naziv}`, opis: r.smerovi.join(" · "),
        href: `stanica.html?id=${encodeURIComponent(r.serija)}`, pin: r.stanje })),
    ];
    paleta = document.createElement("div");
    paleta.className = "paleta-pozadina";
    paleta.innerHTML = `<div class="paleta" role="dialog" aria-label="Pretraga">
      <div class="unos">${ik("search")}<input type="text" placeholder="Pretraži stanice, ulice, strane…" aria-label="Pretraga"><kbd>Esc</kbd></div>
      <div class="rezultati" role="listbox"></div></div>`;
    document.body.appendChild(paleta);
    const unos = paleta.querySelector("input");
    const rez = paleta.querySelector(".rezultati");
    let aktivan = 0, vidljive = [];
    const crtaj = () => {
      const q = bezKvacica(unos.value.trim());
      vidljive = stavke.filter((x) => !q || bezKvacica(`${x.t} ${x.opis}`).includes(q)).slice(0, 40);
      aktivan = Math.min(aktivan, Math.max(0, vidljive.length - 1));
      let grupa = "";
      rez.innerHTML = vidljive.length ? vidljive.map((x, i) => {
        const glava = x.grupa !== grupa ? `<div class="grupa-rez eyebrow">${(grupa = x.grupa)}</div>` : "";
        const ikona = x.pin ? `<img src="${NS.pin(x.pin)}" alt="">` : ik(x.ik);
        return `${glava}<a href="${x.href}" class="${i === aktivan ? "aktivan" : ""}" data-i="${i}">${ikona}<span>${x.t}<small>${x.opis}</small></span></a>`;
      }).join("") : '<p class="sitno" style="padding:12px">Nema rezultata.</p>';
    };
    const zatvori = () => { paleta.remove(); paleta = null; document.removeEventListener("keydown", tasteri); };
    const tasteri = (e) => {
      if (e.key === "Escape") zatvori();
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        aktivan = (aktivan + (e.key === "ArrowDown" ? 1 : -1) + vidljive.length) % Math.max(1, vidljive.length);
        crtaj();
        rez.querySelector("a.aktivan")?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && vidljive[aktivan]) location.href = vidljive[aktivan].href;
    };
    document.addEventListener("keydown", tasteri);
    paleta.addEventListener("click", (e) => { if (e.target === paleta) zatvori(); });
    unos.addEventListener("input", () => { aktivan = 0; crtaj(); });
    crtaj();
    unos.focus();
  }

  // ---------------------------------------------------------------- padajući paneli
  function padajuce(dugme, sadrzaj) {
    const omot = dugme.parentElement;
    dugme.addEventListener("click", async (e) => {
      e.stopPropagation();
      const postoji = omot.querySelector(".panel");
      document.querySelectorAll(".padajuce .panel").forEach((p) => p.remove());
      if (postoji) return;
      const p = document.createElement("div");
      p.className = "panel";
      p.innerHTML = await sadrzaj(p);
      omot.appendChild(p);
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".padajuce")) document.querySelectorAll(".padajuce .panel").forEach((p) => p.remove());
  });

  // ---------------------------------------------------------------- postavljanje
  function postavi() {
    const body = document.body;
    const strana = body.dataset.strana || "";
    const putanja = (body.dataset.putanja || "Pregled|Kontrolna tabla").split("|");
    const main = document.querySelector("main.sadrzaj");
    const ljuska = document.createElement("div");
    ljuska.className = "ljuska";
    try { if (localStorage.getItem("ns-meni-uzak") === "1") ljuska.classList.add("uzak"); } catch (e) { /* bez memorije */ }

    const meni = document.createElement("aside");
    meni.className = "meni";
    meni.setAttribute("aria-label", "Glavni meni");
    meni.innerHTML = `<a class="brend" href="index.html"><img src="assets/slike/logo.png" alt="">
        <span><b>Biciklisti NS</b><small>istorija · 2021–2026</small></span></a>` +
      MENI.map((g) => `<nav class="grupa"><span class="eyebrow">${g.grupa}</span>${g.stavke.map((x) =>
        `<a class="stavka ${x.id === strana ? "aktivna" : ""}" href="${x.href}" ${x.spolja ? 'target="_blank" rel="noopener"' : ""}
          ${x.id === strana ? 'aria-current="page"' : ""} title="${x.t}">${ik(x.ik)}<span class="tekst">${x.t}</span>
          ${x.oznaka ? `<span class="oznaka-meni ${x.klasa || ""}">${x.oznaka}</span>` : ""}</a>`).join("")}</nav>`).join("") +
      `<div class="dno"><span class="avatar">NS</span><div><b>Master rad</b><span class="sitno">FTN Novi Sad</span></div></div>`;

    const glavno = document.createElement("div");
    glavno.className = "glavno";
    const gornja = document.createElement("header");
    gornja.className = "gornja";
    gornja.innerHTML = `
      <button class="ikonica-dugme" id="meni-dugme" aria-label="Meni">${ik("menu")}</button>
      <nav class="putanja" aria-label="Putanja">${putanja.map((p, i) => i === putanja.length - 1 ? `<b>${p}</b>`
        : `<span class="${i ? "srednje" : ""}">${p}</span>${ik("chevron", i ? "srednje" : "")}`).join("")}</nav>
      <span class="razmak"></span>
      <button class="pretraga-dugme" id="pretraga-dugme" aria-label="Pretraga">${ik("search")}<span>Pretraži stanice…</span><kbd>Ctrl K</kbd></button>
      <div class="padajuce"><button class="ikonica-dugme jezik" id="jezik-dugme" aria-label="Jezik">SR</button></div>
      <div class="padajuce"><button class="ikonica-dugme" id="obavestenja-dugme" aria-label="Obaveštenja">${ik("bell")}<span class="brojac skriveno"></span></button></div>
      <button class="ikonica-dugme" id="tema-dugme" aria-label="Promeni temu">${ik(tema() === "dark" ? "sun" : "moon")}</button>`;
    const podnozje = document.createElement("footer");
    podnozje.className = "podnozje";
    podnozje.innerHTML = `Brojači: UGZINS / Mikrobit (očišćeni satni podaci iz master rada, FTN Novi Sad) · vreme: Open-Meteo ·
      staze i podloga: © OpenStreetMap saradnici, © CARTO · grafici: Apache ECharts, mapa: Leaflet ·
      izgled po uzoru na Adminator (MIT). Sati su po lokalnom vremenu (Europe/Belgrade).`;

    main.parentNode.insertBefore(ljuska, main);
    glavno.append(gornja, main, podnozje);
    ljuska.append(meni, glavno);

    // događaji
    document.getElementById("meni-dugme").addEventListener("click", () => {
      if (window.matchMedia("(max-width: 960px)").matches) ljuska.classList.toggle("otvoren");
      else {
        ljuska.classList.toggle("uzak");
        try { localStorage.setItem("ns-meni-uzak", ljuska.classList.contains("uzak") ? "1" : "0"); } catch (e) { /* */ }
        setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
      }
    });
    ljuska.addEventListener("click", (e) => { if (ljuska.classList.contains("otvoren") && !e.target.closest(".meni") && !e.target.closest("#meni-dugme")) ljuska.classList.remove("otvoren"); });
    document.getElementById("tema-dugme").addEventListener("click", () => postaviTemu(tema() === "dark" ? "light" : "dark"));
    document.getElementById("pretraga-dugme").addEventListener("click", otvoriPretragu);
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); otvoriPretragu(); }
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); otvoriPretragu(); }
    });
    padajuce(document.getElementById("jezik-dugme"), async (p) => {
      p.classList.add("mali");
      setTimeout(() => p.querySelector("[data-jezik=en]").addEventListener("click", () => {
        p.remove(); tost("English version is coming soon — the site is in Serbian for now.", "globe");
      }));
      return `<div class="naslov-panela eyebrow">Jezik</div>
        <button class="red-panela" data-jezik="sr">${ik("check")}<span>Srpski<small>latinica</small></span></button>
        <button class="red-panela" data-jezik="en"><span style="width:18px"></span><span>English<small>uskoro</small></span></button>`;
    });
    obavestenja();
    pojave();
  }

  async function obavestenja() {
    const dugme = document.getElementById("obavestenja-dugme");
    let s;
    try { s = await NS.stanice(); } catch (e) { return; }
    const lose = s.serije.filter((r) => r.stanje !== "radi");
    const brojac = dugme.querySelector(".brojac");
    brojac.textContent = String(lose.length + 1);
    brojac.classList.remove("skriveno");
    padajuce(dugme, async () => `<div class="naslov-panela"><b>Obaveštenja</b><span class="eyebrow">${s.stanje_period}</span></div>` +
      lose.map((r) => `<a class="red-panela" href="stanica.html?id=${encodeURIComponent(r.serija)}"><img src="${NS.pin(r.stanje)}" alt="">
        <span>${r.serija} · ${r.naziv}<small>${r.napomena || s.stanja[r.stanje]} · kompletnih dana ${r.kompletnih_30d}/30</small></span></a>`).join("") +
      `<a class="red-panela" href="prognoza.html">${ik("cloud")}<span>Prognoza za sutra<small>model E28 — uskoro na sajtu</small></span></a>`);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", postavi); else postavi();
  return { MENI, ik, IK, info, tema, postaviTemu, tost, kadVidljivo, pojave, brojanje, prsten };
})();
