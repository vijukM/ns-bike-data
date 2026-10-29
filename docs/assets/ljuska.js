/* Ljuska sajta (po uzoru na Adminator): levi meni, gornja traka (putanja, pretraga Ctrl+K, jezik, obaveštenja,
   tema), tost poruke, pojava sadržaja pri skrolovanju, brojanje KPI vrednosti, prstenovi.
   Strana zadaje <body data-strana="…" data-putanja="Grupa|Strana"> i <main class="sadrzaj">…</main>. */
"use strict";

const LJ = (() => {
  // verzija aplikacije 1.X.YY: +1 na kraju pri svakom commit-u koji menja aplikaciju (ne i podatke), posle .99 ide 1.(X+1).00 — CLAUDE.md
  const VERZIJA = "1.1.30";
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
    palette: '<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2Z"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  };
  const ik = (ime, klasa = "") => `<svg class="ik ${klasa}" viewBox="0 0 24 24" aria-hidden="true">${IK[ime] || ""}</svg>`;
  /** Mala „i“ ikonica: objašnjenje se vidi na prelaz mišem ili fokus. */
  const info = (tekst) => `<span class="info" tabindex="0" role="note" aria-label="${tekst}" data-info="${tekst}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>`;

  // uskoro: strana je u izradi — u meniju dobija oznaku USKORO, a strana prikazuje skicu kako će izgledati
  // zakljucano: u meniju je katanac i klik ne otvara stranu (adresa i dalje radi, ko je zna)
  const MENI = [
    { grupa: "Pregled", stavke: [
      { id: "kontrolna", t: "Kontrolna tabla", href: "index.html", ik: "home" },
      { id: "danas", t: "Danas uživo", href: "danas.html", ik: "activity", uzivo: true }] },
    { grupa: "Mapa", stavke: [
      { id: "mapa", t: "Mapa brojača", href: "mapa.html", ik: "map" },
      { id: "toplotna", t: "Toplotna mapa grada", href: "toplotna.html", ik: "flame", zakljucano: true },
      { id: "staze", t: "Biciklističke staze", href: "staze.html", ik: "route", oznaka: "NOVO" }] },
    { grupa: "Podaci", stavke: [
      { id: "grafici", t: "Grafici", href: "grafici.html", ik: "chart" },
      { id: "stanice", t: "Stanice", href: "stanice.html", ik: "table", oznaka: "46", klasa: "plava" },
      { id: "poredjenje", t: "Poređenje stanica", href: "poredjenje.html", ik: "compare", uskoro: true },
      { id: "godine", t: "Poređenje godina", href: "grafici.html#godine", ik: "bars" },
      { id: "kalendar", t: "Kalendar", href: "kalendar.html", ik: "calendar", oznaka: "NOVO" },
      { id: "rekordi", t: "Rekordi i zanimljivosti", href: "rekordi.html", ik: "trophy", oznaka: "NOVO" }] },
    { grupa: "Analize", stavke: [
      { id: "praznici", t: "Praznici i događaji", href: "praznici.html", ik: "star", zakljucano: true },
      { id: "ritam", t: "Ritam grada", href: "ritam.html", ik: "pulse", oznaka: "NOVO" },
      { id: "kvalitet", t: "Kvalitet podataka", href: "kvalitet.html", ik: "shield", zakljucano: true }] },
    { grupa: "Prognoza", stavke: [
      { id: "prognoza", t: "Prognoza za sutra", href: "prognoza.html", ik: "cloud", zakljucano: true },
      { id: "tacnost", t: "Tačnost prognoze", href: "tacnost.html", ik: "target", zakljucano: true },
      { id: "model", t: "Model — kako radi", href: "model.html", ik: "cpu", zakljucano: true }] },
    { grupa: "Projekat", stavke: [
      { id: "o-projektu", t: "O projektu", href: "o-projektu.html", ik: "info" },
      { id: "preuzimanje", t: "Preuzimanje podataka", href: "preuzimanje.html", ik: "download", zakljucano: true },
      { id: "recnik", t: "Rečnik pojmova", href: "recnik.html", ik: "book", zakljucano: true }] },
  ];
  for (const g of MENI) for (const x of g.stavke) if (x.uskoro) Object.assign(x, { oznaka: "USKORO", klasa: "siva" });
  const oznakaStavke = (x) => (x.uzivo ? uzivoZnak() : x.zakljucano ? `<span class="oznaka-meni katanac" title="još nije dostupno">${ik("lock")}</span>`
    : x.oznaka ? `<span class="oznaka-meni ${x.klasa || ""}">${x.oznaka}</span>` : "");
  const zakljucana = (x) => (x.zakljucano ? ' data-zakljucano aria-disabled="true"' : "");
  // klik na zaključanu stavku menija ne vodi nikud
  document.addEventListener("click", (e) => { if (e.target.closest("a[data-zakljucano]")) e.preventDefault(); }, true);

  // ---------------------------------------------------------------- izgled (tema, boja, gustina, raspored, širina, smer)
  // Sve se primenjuje kao data-* atributi na <html> (rani skript u <head> to radi i pre crtanja strane) i pamti
  // u ovom pregledaču: ns-tema (dark | light | sistem) i ns-izgled (JSON ostalih podešavanja).
  const PODRAZUMEVANO = { tema: "dark", boja: "plava", gustina: "obicna", raspored: "bocni", sirina: "puna", smer: "ltr" };
  const IZBORI = {
    tema: [["light", "Svetla"], ["dark", "Tamna"], ["sistem", "Sistemska"]],
    boja: [["plava", "Plava", "#3B82F6"], ["ljubicasta", "Ljubičasta", "#8B5CF6"], ["zelena", "Zelena", "#10B981"],
      ["narandzasta", "Narandžasta", "#F97316"], ["roze", "Roze", "#EC4899"], ["grafit", "Grafit", "#64748B"]],
    gustina: [["zbijeno", "Zbijeno"], ["obicna", "Uobičajeno"], ["prozracno", "Prozračno"]],
    raspored: [["bocni", "Bočni"], ["uzak", "Uzak"], ["plutajuci", "Plutajući"], ["gornji", "Gornji"]],
    sirina: [["puna", "Puna širina"], ["uokvirena", "Uokvirena"]],
    smer: [["ltr", "Sleva nadesno"], ["rtl", "Zdesna nalevo"]],
  };
  const sistemTamna = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  function citajIzgled() {
    let z = {}, t = null, uzak = null;
    try { z = JSON.parse(localStorage.getItem("ns-izgled") || "{}") || {}; t = localStorage.getItem("ns-tema"); uzak = localStorage.getItem("ns-meni-uzak"); } catch (e) { /* bez memorije */ }
    const iz = { ...PODRAZUMEVANO };
    for (const k of Object.keys(IZBORI)) if (k !== "tema" && IZBORI[k].some(([v]) => v === z[k])) iz[k] = z[k];
    if (IZBORI.tema.some(([v]) => v === t)) iz.tema = t;
    if (!z.raspored && uzak === "1") iz.raspored = "uzak";          // ranije zapamćen uzak meni
    return iz;
  }
  let izgled = citajIzgled();
  const tema = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  function primeniIzgled(novo, { sacuvaj = true } = {}) {
    const d = document.documentElement;
    const pre = { ...izgled, temaStvarna: tema() };
    izgled = { ...izgled, ...novo };
    const stvarna = izgled.tema === "sistem" ? (sistemTamna() ? "dark" : "light") : izgled.tema;
    d.dataset.theme = stvarna;
    d.dataset.boja = izgled.boja;
    d.dataset.gustina = izgled.gustina;
    d.dataset.raspored = izgled.raspored;
    d.dataset.sirina = izgled.sirina;
    d.dir = izgled.smer;
    const lj = document.querySelector(".ljuska");
    if (lj) lj.classList.toggle("uzak", izgled.raspored === "uzak");
    if (sacuvaj) {
      try {
        localStorage.setItem("ns-tema", izgled.tema);
        const { tema: _, ...ostalo } = izgled;
        localStorage.setItem("ns-izgled", JSON.stringify(ostalo));
        localStorage.setItem("ns-meni-uzak", izgled.raspored === "uzak" ? "1" : "0");
      } catch (e) { /* bez memorije */ }
    }
    const td = document.getElementById("tema-dugme");
    if (td) td.innerHTML = ik(stvarna === "dark" ? "sun" : "moon");
    if (stvarna !== pre.temaStvarna || izgled.boja !== pre.boja) document.dispatchEvent(new Event("tema"));
    if (["gustina", "raspored", "sirina", "smer"].some((k) => izgled[k] !== pre[k])) {
      [60, 320].forEach((ms) => setTimeout(() => window.dispatchEvent(new Event("resize")), ms));   // grafici i mape
    }
    osveziPrilagodi();
  }
  /** Prečica u gornjoj traci: jedan klik menja svetlu ↔ tamnu temu. */
  function postaviTemu(t) { primeniIzgled({ tema: t }); }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (izgled.tema === "sistem") primeniIzgled({}, { sacuvaj: false }); });

  // ---------------------------------------------------------------- panel „Prilagodi“
  const SEKCIJE = [
    ["tema", "Tema", "Svetla, tamna ili kao u sistemu (prati podešavanje uređaja)."],
    ["boja", "Boja naglaska", "Dugmad, linkovi i istaknuti delovi. Boje podataka na graficima ostaju iste."],
    ["gustina", "Gustina", "Koliko je prostora između kartica i unutar njih."],
    ["raspored", "Raspored menija", "Bočni, uzak (samo ikonice), plutajući ili gornji meni."],
    ["sirina", "Širina sadržaja", "Preko celog ekrana ili u užem okviru na sredini."],
    ["smer", "Smer teksta", "Za jezike koji se pišu zdesna nalevo (prikaz rasporeda)."],
  ];
  const kvacica = '<span class="kvacica-o" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>';
  /** Male skice za svaku opciju (crtaju se CSS-om, naglasak prati izabranu boju). */
  function skica(k, v) {
    if (k === "tema") return `<span class="slicica sl-tema sl-${v}"><i class="m"></i><i class="t"></i><i class="k k1"></i><i class="k k2"></i><i class="k k3"></i></span>`;
    if (k === "gustina") return `<span class="slicica sl-gustina sl-${v}">${"<i></i>".repeat(v === "zbijeno" ? 5 : v === "obicna" ? 4 : 3)}</span>`;
    if (k === "raspored") return `<span class="slicica sl-raspored sl-${v}"><i class="m"></i><i class="t"></i><i class="k k1"></i><i class="k k2"></i></span>`;
    if (k === "sirina") return `<span class="slicica sl-sirina sl-${v}"><i class="m"></i><i class="t"></i><i class="k"></i></span>`;
    if (k === "smer") return `<span class="slicica sl-smer sl-${v}"><i class="m"></i><i class="r r1"></i><i class="r r2"></i><i class="r r3"></i><b>${v === "ltr" ? "→" : "←"}</b></span>`;
    return "";
  }
  let fioka = null, pozadinaFioke = null, okidac = null;
  function napraviPrilagodi() {
    pozadinaFioke = document.createElement("div");
    pozadinaFioke.className = "prilagodi-pozadina";
    fioka = document.createElement("aside");
    fioka.className = "prilagodi";
    fioka.setAttribute("role", "dialog");
    fioka.setAttribute("aria-modal", "true");
    fioka.setAttribute("aria-labelledby", "prilagodi-naslov");
    fioka.innerHTML = `
      <header class="prilagodi-glava"><span class="kvadrat">${ik("palette")}</span>
        <div><h2 id="prilagodi-naslov">Prilagodi</h2><p>Podesi izgled sajta po svom ukusu — promene se vide odmah.</p></div>
        <button class="ikonica-dugme" type="button" data-zatvori aria-label="Zatvori">${ik("x")}</button></header>
      <div class="prilagodi-telo">${SEKCIJE.map(([k, t, o]) => `<section class="prilagodi-sekcija" data-sekcija="${k}">
        <div class="sekcija-glava"><span class="eyebrow">${t}</span><span class="vrednost" data-vrednost="${k}"></span></div>
        <p class="sitno">${o}</p>
        ${k === "boja" ? `<div class="uzorci" role="radiogroup" aria-label="${t}">${IZBORI.boja.map(([v, n, c]) =>
    `<button type="button" class="uzorak" data-k="boja" data-v="${v}" style="--uz:${c}" title="${n}" aria-label="${n}"><i></i></button>`).join("")}</div>`
    : `<div class="opcije n${IZBORI[k].length}" role="radiogroup" aria-label="${t}">${IZBORI[k].map(([v, n]) =>
      `<button type="button" class="opcija" data-k="${k}" data-v="${v}">${skica(k, v)}<span class="ime">${n}</span>${kvacica}</button>`).join("")}</div>`}
      </section>`).join("")}</div>
      <footer class="prilagodi-dno">
        <button class="dugme" type="button" data-vrati>${ik("reset")}Vrati podrazumevano</button>
        <button class="dugme primarno" type="button" data-zatvori>Gotovo</button>
        <p class="sitno">Podešavanja se pamte u ovom pregledaču. Za brzu promenu svetle i tamne teme ostaje dugme pored ove palete.</p>
      </footer>`;
    document.body.append(pozadinaFioke, fioka);
    fioka.addEventListener("click", (e) => {
      const o = e.target.closest("[data-k]");
      if (o) { primeniIzgled({ [o.dataset.k]: o.dataset.v }); return; }
      if (e.target.closest("[data-vrati]")) { primeniIzgled({ ...PODRAZUMEVANO }); tost("Vraćen je podrazumevani izgled.", "reset"); return; }
      if (e.target.closest("[data-zatvori]")) zatvoriPrilagodi();
    });
    pozadinaFioke.addEventListener("click", zatvoriPrilagodi);
    fioka.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); zatvoriPrilagodi(); return; }
      if (e.key === "Tab") {                              // fokus ostaje u panelu
        const f = [...fioka.querySelectorAll("button")];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && e.target.matches("[data-k]")) {   // strelice unutar grupe
        const grupa = [...e.target.parentElement.querySelectorAll("[data-k]")];
        const i = grupa.indexOf(e.target) + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) * (izgled.smer === "rtl" && e.key.startsWith("Arrow") && /Left|Right/.test(e.key) ? -1 : 1);
        const n = grupa[(i + grupa.length) % grupa.length];
        e.preventDefault(); n.focus(); n.click();
      }
    });
    osveziPrilagodi();
  }
  function osveziPrilagodi() {
    if (!fioka) return;
    fioka.querySelectorAll("[data-k]").forEach((o) => {
      const da = izgled[o.dataset.k] === o.dataset.v;
      o.setAttribute("aria-pressed", String(da));
      o.setAttribute("role", "radio");
      o.setAttribute("aria-checked", String(da));
      o.tabIndex = da ? 0 : -1;
    });
    for (const k of Object.keys(IZBORI)) {
      const el = fioka.querySelector(`[data-vrednost="${k}"]`);
      const izbor = IZBORI[k].find(([v]) => v === izgled[k]);
      if (el && izbor) el.textContent = izbor[1] + (k === "tema" && izgled.tema === "sistem" ? ` · sada ${tema() === "dark" ? "tamna" : "svetla"}` : "");
    }
  }
  function otvoriPrilagodi() {
    if (!fioka) napraviPrilagodi();
    okidac = document.activeElement;
    pozadinaFioke.classList.add("otvoren");
    fioka.classList.add("otvoren");
    document.documentElement.classList.add("bez-skrola");
    const tacka = document.querySelector("#prilagodi-dugme .tacka-novo");
    if (tacka) { tacka.remove(); try { localStorage.setItem("ns-prilagodi-videno", "1"); } catch (e) { /* */ } }
    setTimeout(() => (fioka.querySelector('[data-k][aria-pressed="true"]') || fioka.querySelector("button")).focus(), 60);
  }
  function zatvoriPrilagodi() {
    if (!fioka) return;
    pozadinaFioke.classList.remove("otvoren");
    fioka.classList.remove("otvoren");
    document.documentElement.classList.remove("bez-skrola");
    if (okidac && okidac.focus) okidac.focus();
  }

  // ---------------------------------------------------------------- PRIJAVA (nalog + izbor bicikliste)
  // Prozor je u assets/prijava.js i učitava se tek na prvi klik (sa istim ?v= kao ljuska), da ne opterećuje svaku stranu.
  const VER = ((document.querySelector('script[src*="assets/ljuska.js"]') || {}).src || "").split("?v=")[1] || "";
  const skripte = {};
  /** Učitava skript samo jednom; vraća Promise. */
  function ucitajSkript(put) {
    return (skripte[put] ||= new Promise((ok, ne) => {
      const s = document.createElement("script");
      s.src = `${put}${VER ? `?v=${VER}` : ""}`;
      s.onload = ok;
      s.onerror = () => { delete skripte[put]; ne(new Error(`nije učitano: ${put}`)); };
      document.head.append(s);
    }));
  }
  async function otvoriPrijavu() {
    try { await ucitajSkript("assets/prijava.js"); PRIJAVA.otvori(); } catch (e) { tost("Prijava trenutno nije dostupna.", "alert"); }
  }
  // profil (biciklista/avatar) je poseban prozor: assets/profil.js, otvara se klikom na profil u dnu menija
  async function otvoriProfil(opcije) {
    try { await ucitajSkript("assets/profil.js"); PROFIL.otvori(opcije); } catch (e) { tost("Profil trenutno nije dostupan.", "alert"); }
  }
  /** Avatar u dnu menija: sličica sačuvanog bicikliste (localStorage „ns-profil“), inače inicijali. */
  function osveziAvatar() {
    const el = document.querySelector(".meni .dno .avatar");
    if (!el || el.dataset.privremen) return;
    let id = null;
    try { id = (JSON.parse(localStorage.getItem("ns-profil") || "null") || {}).lik_id; } catch (e) { /* */ }
    if (id && /^[a-z0-9-]+$/.test(id)) {
      el.classList.add("sa-likom");
      el.innerHTML = `<img src="likovi/mini/${id}.webp" alt="" width="240" height="180" decoding="async">`;
      el.querySelector("img").onerror = () => { el.classList.remove("sa-likom"); el.textContent = "NS"; };
    } else { el.classList.remove("sa-likom"); el.textContent = "NS"; }
  }

  // ---------------------------------------------------------------- PRIVREMENI PRISTUP (link koji važi nekoliko minuta)
  let pristupDlg = null;
  function otvoriPristup() {
    if (!pristupDlg) {
      pristupDlg = document.createElement("dialog");
      pristupDlg.className = "prijava pristup";
      pristupDlg.setAttribute("aria-labelledby", "pristup-naslov");
      pristupDlg.innerHTML = `<div class="prijava-glava"><div><span class="eyebrow">Kapija</span><h2 id="pristup-naslov">Privremeni pristup</h2></div>
          <button type="button" class="ikonica-dugme" data-zatvori aria-label="Zatvori">${ik("x")}</button></div>
        <p class="sitno">Napravi link koji otvara sajt bez lozinke. Pošalji ga nekome — posle isteka više ne radi, a sajt se toj osobi zaključava.</p>
        <form class="prijava-forma" autocomplete="off">
          <label>Lozinka sajta<input type="password" name="lozinka" required></label>
          <label>Važi<select name="minuta">${[[5, "5 minuta"], [10, "10 minuta"], [30, "30 minuta"], [60, "1 sat"], [240, "4 sata"], [1440, "1 dan"]]
            .map(([m, t]) => `<option value="${m}"${m === 10 ? " selected" : ""}>${t}</option>`).join("")}</select></label>
          <div class="prijava-dugmad"><button class="dugme primarno" type="submit">Napravi link</button></div>
          <div class="pristup-greska sitno" role="alert"></div>
        </form>
        <div class="pristup-rezultat" hidden>
          <label class="sitno">Link<input type="text" readonly></label>
          <div class="prijava-dugmad"><button class="dugme" type="button" data-kopiraj>${ik("copy")}Kopiraj</button><span class="sitno pristup-istek"></span></div>
        </div>`;
      const forma = pristupDlg.querySelector("form"), greska = pristupDlg.querySelector(".pristup-greska"), rez = pristupDlg.querySelector(".pristup-rezultat");
      forma.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dugme = forma.querySelector("button");
        dugme.disabled = true; greska.textContent = ""; rez.hidden = true;
        try {
          const { link, istice } = await KAPIJA.napraviLink(forma.lozinka.value, +forma.minuta.value);
          rez.querySelector("input").value = link;
          rez.querySelector(".pristup-istek").textContent = `važi do ${new Date(istice).toLocaleString("sr-Latn-RS", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`;
          rez.hidden = false;
          forma.lozinka.value = "";
        } catch (x) { greska.textContent = x.message === "Pogrešna lozinka." ? x.message : "Link nije napravljen (potreban je https)."; }
        dugme.disabled = false;
      });
      pristupDlg.querySelector("[data-kopiraj]").addEventListener("click", async () => {
        const polje = rez.querySelector("input");
        try { await navigator.clipboard.writeText(polje.value); tost("Link je kopiran.", "check"); } catch (x) { polje.select(); }
      });
      pristupDlg.addEventListener("click", (e) => { if (e.target === pristupDlg || e.target.closest("[data-zatvori]")) pristupDlg.close(); });
      document.body.append(pristupDlg);
    }
    pristupDlg.showModal();
  }

  // ---------------------------------------------------------------- UŽIVO (odašiljač koji pulsira)
  // Crveno i treperi samo kad je poslednje čitanje brojača sveže (≤ 150 min); inače sivo, uz vreme poslednjeg čitanja.
  const ODASILJAC = `<svg class="odasiljac" viewBox="0 0 24 16" aria-hidden="true">
    <path class="talas t2" d="M4.2 2.2a8.5 8.5 0 0 0 0 11.6M19.8 2.2a8.5 8.5 0 0 1 0 11.6"/>
    <path class="talas t1" d="M7.4 4.6a5 5 0 0 0 0 6.8M16.6 4.6a5 5 0 0 1 0 6.8"/>
    <circle class="krug-puls" cx="12" cy="8" r="2.4"/><circle class="srce" cx="12" cy="8" r="2.4"/></svg>`;
  /** Oznaka „UŽIVO“ (mala = samo odašiljač, za tekst u karticama). */
  const uzivoZnak = (mala = false) => `<span class="uzivo-znak${mala ? " mala" : ""}" data-uzivo role="status" title="Podaci uživo">${ODASILJAC}${mala ? "" : "<b>UŽIVO</b>"}</span>`;
  const SVEZE_MIN = 150;
  let uzivoStanje = null;
  function osveziUzivo() {
    if (!uzivoStanje) return;
    const min = Math.round((Date.now() - Date.parse(uzivoStanje.citanje_utc)) / 60000);
    const sveze = min <= SVEZE_MIN;
    const sat = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" }).format(new Date(uzivoStanje.citanje_utc));
    const kad = min < 60 ? `pre ${Math.max(1, min)} min` : `pre ${Math.floor(min / 60)} h ${min % 60} min`;
    const naslov = sveze ? `Uživo — podaci sa brojača, poslednje čitanje u ${sat} (${kad}); osvežava se svakog sata`
      : `Nema svežeg čitanja — poslednje u ${sat} (${kad})`;
    document.querySelectorAll("[data-uzivo]").forEach((el) => {
      el.classList.toggle("sveze", sveze);
      el.classList.toggle("staro", !sveze);
      el.title = naslov;
      el.setAttribute("aria-label", naslov);
    });
    document.querySelectorAll("[data-uzivo-stavka]").forEach((el) => el.classList.toggle("uzivo-sveze", sveze));
  }
  async function proveriUzivo(svezePreuzmi = false) {
    try {
      const r = await fetch(`data/uzivo.json?t=${svezePreuzmi ? Date.now() : Math.floor(Date.now() / 600000)}`, { cache: "no-cache" });
      if (r.ok) uzivoStanje = await r.json();
    } catch (e) { /* bez mreže: ostaje poslednje stanje */ }
    osveziUzivo();
  }

  // ---------------------------------------------------------------- gornji meni (raspored „Gornji“)
  function gornjiMeni(strana) {
    const nav = document.createElement("nav");
    nav.className = "gornji-meni";
    nav.setAttribute("aria-label", "Glavni meni");
    nav.innerHTML = MENI.map((g, i) => {
      const aktivna = g.stavke.some((x) => x.id === strana);
      return `<div class="gm-grupa"><button type="button" class="gm-dugme${aktivna ? " aktivna" : ""}" aria-expanded="false" data-i="${i}">
        ${ik(g.stavke[0].ik)}<span>${g.grupa}</span>${ik("chevron", "strelica")}</button>
        <div class="gm-panel" role="menu">${g.stavke.map((x) => `<a role="menuitem" class="${x.id === strana ? "aktivna" : ""}" href="${x.href}"${zakljucana(x)}>${ik(x.ik)}<span>${x.t}</span>
          ${oznakaStavke(x)}</a>`).join("")}</div></div>`;
    }).join("");
    const zatvori = () => nav.querySelectorAll(".gm-grupa.otvorena").forEach((g) => { g.classList.remove("otvorena"); g.querySelector(".gm-dugme").setAttribute("aria-expanded", "false"); });
    const otvori = (g) => { zatvori(); g.classList.add("otvorena"); g.querySelector(".gm-dugme").setAttribute("aria-expanded", "true"); };
    let tajmer;
    nav.querySelectorAll(".gm-grupa").forEach((g) => {
      g.querySelector(".gm-dugme").addEventListener("click", (e) => { e.stopPropagation(); if (g.classList.contains("otvorena")) zatvori(); else otvori(g); });
      g.addEventListener("mouseenter", () => { clearTimeout(tajmer); if (window.matchMedia("(hover: hover)").matches) otvori(g); });
      g.addEventListener("mouseleave", () => { tajmer = setTimeout(zatvori, 180); });
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".gornji-meni")) zatvori(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") zatvori(); });
    return nav;
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
      ...MENI.flatMap((g) => g.stavke.filter((x) => !x.zakljucano).map((x) => ({ grupa: "Strane", t: x.t, opis: g.grupa + (x.uskoro ? " · uskoro" : ""), href: x.href, ik: x.ik }))),
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
  // grupe menija: ikonica i boja grupe (boja se vidi u nekim stilovima menija), zatvorene grupe, stil povezivanja grupe i stavki
  const IKONE_GRUPA = { Pregled: "home", Mapa: "map", Podaci: "table", Analize: "chart", Prognoza: "cloud", Projekat: "info" };
  for (const g of MENI) g.ik = IKONE_GRUPA[g.grupa] || g.stavke[0].ik;
  const BOJE_GRUPA = ["--primary", "--success", "--purple", "--orange", "--teal", "--t-muted"];
  const zatvoreneGrupe = new Set((() => { try { return JSON.parse(localStorage.getItem("ns-meni-zatvoreno") || "[]"); } catch (e) { return []; } })());
  const STILOVI_MENIJA = ["linija", "kartica", "boja", "stepenik"];
  function stilMenija() {
    // probni prikaz predloga: ?meni=linija|kartica|boja|stepenik (pamti se dok se ne izabere konačan)
    let st = new URLSearchParams(location.search).get("meni");
    try { if (STILOVI_MENIJA.includes(st)) localStorage.setItem("ns-meni-stil", st); else st = localStorage.getItem("ns-meni-stil"); } catch (e) { /* */ }
    return STILOVI_MENIJA.includes(st) ? st : "linija";
  }
  // znak (bicikl sa ramom NS) + natpis „NaSicu“; natpis ima verziju za tamnu i za svetlu temu (assets/slike/brend)
  const BREND = `<img class="brend-znak" src="assets/slike/brend/NaSicu_ikonica_bicikl.svg" alt="">
    <span class="brend-tekst"><img class="natpis natpis-tamna" src="assets/slike/brend/natpis-tamna.svg" alt="NaSicu">
    <img class="natpis natpis-svetla" src="assets/slike/brend/natpis-svetla.svg" alt="NaSicu"></span>`;
  const videno = () => { try { return localStorage.getItem("ns-prilagodi-videno") === "1"; } catch (e) { return true; } };
  function postavi() {
    const body = document.body;
    const strana = body.dataset.strana || "";
    const putanja = (body.dataset.putanja || "Pregled|Kontrolna tabla").split("|");
    const main = document.querySelector("main.sadrzaj");
    const ljuska = document.createElement("div");
    ljuska.className = "ljuska";
    if (izgled.raspored === "uzak") ljuska.classList.add("uzak");

    const meni = document.createElement("aside");
    meni.className = "meni";
    meni.dataset.stil = stilMenija();
    meni.setAttribute("aria-label", "Glavni meni");
    meni.innerHTML = `<a class="brend" href="index.html" aria-label="NaSicu — početna">${BREND}
        <img class="brend-ns" src="assets/slike/brend/NaSicu_ikonica_NS.svg" alt=""></a>` +
      MENI.map((g, gi) => {
        // grupa se otvara i zatvara strelicom; zatvorene grupe se pamte, a grupa sa trenutnom stranom je uvek otvorena pri učitavanju
        const sadrziStranu = g.stavke.some((x) => x.id === strana);
        const otvorena = sadrziStranu || !zatvoreneGrupe.has(g.grupa);
        return `<nav class="grupa${otvorena ? " otvorena" : ""}" data-grupa="${g.grupa}" style="--grupa-boja:var(${BOJE_GRUPA[gi % BOJE_GRUPA.length]})">
        <button type="button" class="grupa-glava" aria-expanded="${otvorena}" aria-controls="meni-grupa-${gi}">
          <span class="grupa-ikona">${ik(g.ik)}</span><span class="eyebrow">${g.grupa}</span><span class="grupa-broj">${g.stavke.length}</span>${ik("chevron", "grupa-strelica")}</button>
        <div class="grupa-telo" id="meni-grupa-${gi}"><div class="grupa-unutra">${g.stavke.map((x) =>
        `<a class="stavka ${x.id === strana ? "aktivna" : ""}" href="${x.href}" ${x.spolja ? 'target="_blank" rel="noopener"' : ""} ${otvorena ? "" : 'tabindex="-1"'}
          ${x.id === strana ? 'aria-current="page"' : ""} title="${x.t}" ${x.uzivo ? "data-uzivo-stavka" : ""}${zakljucana(x)}>${ik(x.ik)}<span class="tekst">${x.t}</span>
          ${oznakaStavke(x)}</a>`).join("")}</div></div></nav>`;
      }).join("") +
      // dno menija (kasnije profil): privremeni ulaz preko linka pokazuje koliko je još ostalo
      (typeof KAPIJA !== "undefined" && KAPIJA.privremen()
        ? `<div class="dno privremeni"><button type="button" class="profil-dugme" id="profil-dugme" title="Profil i biciklista"><span class="avatar" data-privremen="1">${ik("clock")}</span><div><b>Privremeni nalog</b><span class="sitno">još <b class="preostalo" id="preostalo">—</b> · <span class="verzija" title="verzija aplikacije">v ${VERZIJA}</span></span></div></button>`
        : `<div class="dno"><button type="button" class="profil-dugme" id="profil-dugme" title="Profil i biciklista"><span class="avatar">NS</span><div><b>Master rad</b><span class="sitno">FTN Novi Sad · <span class="verzija" title="verzija aplikacije">v ${VERZIJA}</span></span></div></button>`) +
      `
        <button type="button" class="ikonica-dugme zakljucaj-dugme" id="pristup-dugme" title="Privremeni pristup (link na nekoliko minuta)" aria-label="Privremeni pristup" aria-haspopup="dialog">${ik("clock")}</button>
        <button type="button" class="ikonica-dugme zakljucaj-dugme" id="zakljucaj-dugme" title="Zaključaj sajt (ponovo traži lozinku)" aria-label="Zaključaj sajt">${ik("lock")}</button></div>`;

    const glavno = document.createElement("div");
    glavno.className = "glavno";
    const gornja = document.createElement("header");
    gornja.className = "gornja";
    gornja.innerHTML = `
      <button class="ikonica-dugme" id="meni-dugme" aria-label="Meni">${ik("menu")}</button>
      <a class="brend-gornji" href="index.html" aria-label="NaSicu — početna">${BREND}</a>
      <nav class="putanja" aria-label="Putanja">${putanja.map((p, i) => i === putanja.length - 1 ? `<b>${p}</b>`
        : `<span class="${i ? "srednje" : ""}">${p}</span>${ik("chevron", i ? "srednje" : "")}`).join("")}</nav>
      <span class="razmak"></span>
      <button class="pretraga-dugme" id="pretraga-dugme" aria-label="Pretraga">${ik("search")}<span>Pretraži stanice…</span><kbd>Ctrl K</kbd></button>
      <div class="padajuce"><button class="ikonica-dugme jezik" id="jezik-dugme" aria-label="Jezik">SR</button></div>
      <div class="padajuce"><button class="ikonica-dugme" id="obavestenja-dugme" aria-label="Obaveštenja">${ik("bell")}<span class="brojac skriveno"></span></button></div>
      <button class="ikonica-dugme" id="prilagodi-dugme" aria-label="Prilagodi izgled" title="Prilagodi izgled" aria-haspopup="dialog">${ik("palette")}${videno() ? "" : '<span class="tacka-novo"></span>'}</button>
      <button class="ikonica-dugme" id="tema-dugme" aria-label="Svetla ili tamna tema" title="Svetla / tamna tema">${ik(tema() === "dark" ? "sun" : "moon")}</button>
      <button class="dugme malo prijava-dugme" id="prijava-dugme" aria-haspopup="dialog">${ik("user")}<span>Prijava</span></button>`;

    main.parentNode.insertBefore(ljuska, main);
    glavno.append(gornja, gornjiMeni(strana), main);
    ljuska.append(meni, glavno);

    // događaji
    meni.addEventListener("click", (e) => {
      const d = e.target.closest(".grupa-glava");
      if (!d) return;
      const g = d.closest(".grupa"), otvori = !g.classList.contains("otvorena");
      g.classList.toggle("otvorena", otvori);
      d.setAttribute("aria-expanded", String(otvori));
      g.querySelectorAll("a.stavka").forEach((a) => (otvori ? a.removeAttribute("tabindex") : a.setAttribute("tabindex", "-1")));
      if (otvori) zatvoreneGrupe.delete(g.dataset.grupa); else zatvoreneGrupe.add(g.dataset.grupa);
      try { localStorage.setItem("ns-meni-zatvoreno", JSON.stringify([...zatvoreneGrupe])); } catch (x) { /* */ }
    });
    document.getElementById("meni-dugme").addEventListener("click", () => {
      if (window.matchMedia("(max-width: 960px)").matches) ljuska.classList.toggle("otvoren");
      else if (izgled.raspored === "bocni" || izgled.raspored === "uzak") primeniIzgled({ raspored: izgled.raspored === "uzak" ? "bocni" : "uzak" });
      else { ljuska.classList.toggle("uzak"); [60, 320].forEach((ms) => setTimeout(() => window.dispatchEvent(new Event("resize")), ms)); }
    });
    ljuska.addEventListener("click", (e) => { if (ljuska.classList.contains("otvoren") && !e.target.closest(".meni") && !e.target.closest("#meni-dugme")) ljuska.classList.remove("otvoren"); });
    document.getElementById("tema-dugme").addEventListener("click", () => postaviTemu(tema() === "dark" ? "light" : "dark"));
    document.getElementById("prilagodi-dugme").addEventListener("click", otvoriPrilagodi);
    document.getElementById("prijava-dugme").addEventListener("click", otvoriPrijavu);
    document.getElementById("profil-dugme").addEventListener("click", () => otvoriProfil());
    osveziAvatar();
    document.getElementById("zakljucaj-dugme").addEventListener("click", () => { if (typeof KAPIJA !== "undefined") KAPIJA.zakljucaj(); });
    const preostalo = document.getElementById("preostalo");
    if (preostalo) {
      const otkucaj = () => {
        const s = Math.max(0, Math.round((KAPIJA.istice() - Date.now()) / 1000));
        const dd = (x) => String(x).padStart(2, "0");
        preostalo.textContent = s >= 3600 ? `${Math.floor(s / 3600)} h ${dd(Math.floor((s % 3600) / 60))} min` : `${dd(Math.floor(s / 60))}:${dd(s % 60)}`;
        preostalo.classList.toggle("malo", s < 60);
      };
      otkucaj();
      setInterval(otkucaj, 1000);
    }
    const pristup = document.getElementById("pristup-dugme");
    if (typeof KAPIJA === "undefined" || KAPIJA.privremen()) pristup.remove(); else pristup.addEventListener("click", otvoriPristup);
    primeniIzgled({}, { sacuvaj: false });
    proveriUzivo();
    setInterval(osveziUzivo, 60000);                 // „pre X min“ i prelazak u sivo
    setInterval(() => proveriUzivo(true), 10 * 60000); // novo čitanje stiže svakog sata
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
      `<div class="red-panela">${ik("cloud")}<span>Prognoza za sutra<small>model E31 — uskoro na sajtu</small></span></div>`);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", postavi); else postavi();
  return { VERZIJA, ucitajSkript, otvoriPrijavu, otvoriProfil, osveziAvatar, MENI, ik, IK, info, uzivoZnak, ODASILJAC, osveziUzivo, tema, postaviTemu, primeniIzgled, otvoriPrilagodi, tost, kadVidljivo, pojave, brojanje, prsten };
})();
