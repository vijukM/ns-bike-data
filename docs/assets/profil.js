/* Prozor „Profil“ (klik na profil u dnu menija): prikaz bicikliste (avatara) i čarobnjak u 4 koraka —
   biciklista, mesto vožnje, vreme, doba dana. Učitava ga ljuska tek na klik (LJ.ucitajSkript); generator likova i scena
   „Reka“ (assets/nasicu/, gotov materijal, ne menjati) učitavaju se tek kad se prozor prvi put otvori.
   - Korak 1: samo biciklista, bez pozadine (vektorski, renderFrame). Od koraka 2: scena „Reka“ sa tim biciklistom.
   - Izbor koraka se ne vidi pre nego što se do njega dođe (oznake mesta, vremena i doba dana stižu korak po korak).
   - U jednom trenutku se animira samo jedan lik; likovi za izbor su statične sličice (5 po strani, uz filtere).
   - Brzina i veličina bicikliste se podešavaju klizačima i čuvaju uz izbor.
   Dok nema naloga, izbor se pamti u pregledaču (localStorage „ns-profil“: samo id-jevi i dva broja, nikad slika). */
"use strict";

const PROFIL = (() => {
  const KLJUC = "ns-profil";
  const PO_STRANI = 5;
  // scena „Reka“: koliko se panorame vidi (od 4800) i gde stoji biciklista; usko = prozor uži od 640 px
  const SCENA = { sirinaPrikaza: 750, sirinaPrikazaUsko: 420, polozaj: 0.32, panorama: "reka/reka-panorama.svg" };
  // klizači: [najmanje, najviše, korak, podrazumevano]
  const BRZINA = [0.5, 2, 0.05, 1];
  const VELICINA = [0.4, 0.85, 0.01, 0.62];
  const CIKLUS_MS = 1600;

  const S = (d) => `<svg class="ik" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IKO = {
    reka: S('<path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>'),
    centar: S('<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01"/>'),
    periferija: S('<path d="M12 3 5 13h4l-3 5h12l-3-5h4zM12 18v3"/>'),
    bulevari: S('<path d="M4 21 8 3M20 21 16 3M12 5v2M12 11v2M12 17v2"/>'),
    sunce: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    oblacno: S('<path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20.5 12 3.5 3.5 0 0 1 17.5 19Z"/>'),
    kisa: S('<path d="M16 13H8a4 4 0 1 1 .8-7.9A5 5 0 0 1 18.5 8 2.5 2.5 0 0 1 16 13ZM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
    sneg: S('<path d="M12 2v20M4 6l16 12M20 6 4 18M9 3l3 2 3-2M9 21l3-2 3 2"/>'),
    vetar: S('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>'),
    jutro: S('<path d="M12 2v6M5.2 9.2l1.4 1.4M2 17h2M20 17h2M17.4 10.6l1.4-1.4M22 21H2M16 17a4 4 0 0 0-8 0"/>'),
    dan: S('<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2"/>'),
    predvece: S('<path d="M12 10V4M8 7l4-3 4 3M22 21H2M2 17h2M20 17h2M16 17a4 4 0 0 0-8 0"/>'),
    noc: S('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
  };
  // [id, naziv, kratak opis, gotovo] — gotovo: false → „u izradi“; prva gotova opcija je podrazumevana
  const MESTA = [["reka", "Reka", "kej uz Dunav", true], ["centar", "Centar", "Zmaj Jovina, Dunavska"], ["periferija", "Periferija", "naselja i salaši"], ["bulevari", "Bulevari", "široke staze uz saobraćaj"]];
  const VREMENA = [["sunce", "Sunce", "vedro", true], ["oblacno", "Oblačno", "sivo nebo"], ["kisa", "Kiša", "mokra staza"], ["sneg", "Sneg", "zima na biciklu"], ["vetar", "Vetar i lišće", "jesen, košava"]];
  const DOBA = [["jutro", "Jutro", "rani polazak"], ["dan", "Dan", "puno svetla", true], ["predvece", "Predveče", "zalazak sunca"], ["noc", "Noć", "svetla i farovi"]];
  const OPCIJE = { mesto: MESTA, vreme: VREMENA, doba: DOBA };
  const KORACI = [["lik", "Biciklista"], ["mesto", "Mesto vožnje"], ["vreme", "Vreme"], ["doba", "Doba dana"]];
  // filteri: polje „kategorije“ u likovi.json (jedan lik može biti u više grupa)
  const KATEGORIJE = [["svi", "Svi"], ["svakodnevni", "Svakodnevni"], ["posao", "Dostavljači i posao"], ["deca", "Deca i porodica"],
    ["sportisti", "Sportisti"], ["rekreativci", "Rekreativci"], ["specijalni", "Specijalni"]];
  const podrazumevano = (spisak) => spisak.find((o) => o[3])[0];
  const uOpsegu = (x, [od, doo, , pod]) => (typeof x === "number" && x >= od && x <= doo ? x : pod);

  /** Ispravan izbor ili null: lik_id mora biti jedan od dozvoljenih; ostalo samo gotove opcije i brojevi u opsegu (inače podrazumevano). */
  function valjan(z, ids) {
    if (!z || typeof z !== "object" || typeof z.lik_id !== "string" || !ids.includes(z.lik_id)) return null;
    const gotova = (k) => (OPCIJE[k].some((o) => o[0] === z[k] && o[3]) ? z[k] : podrazumevano(OPCIJE[k]));
    return { lik_id: z.lik_id, mesto: gotova("mesto"), vreme: gotova("vreme"), doba: gotova("doba"),
      brzina: uOpsegu(z.brzina, BRZINA), velicina: uOpsegu(z.velicina, VELICINA) };
  }
  if (typeof document === "undefined") return { valjan, KLJUC, KATEGORIJE };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const bezPokreta = matchMedia("(prefers-reduced-motion: reduce)");
  const usko = matchMedia("(max-width: 640px)");
  const broj = (x, d = 2) => x.toLocaleString("sr-Latn-RS", { minimumFractionDigits: d, maximumFractionDigits: d });

  let dlg = null, likovi = [], sacuvan = null, izbor = null, prikaz = "pregled", korak = 0, strana = 0, filter = "svi";
  let scena = null, samo = null, vidljiva = true;
  const ids = () => likovi.map((l) => l.id);
  const lik = () => likovi.find((l) => l.id === izbor.lik_id);
  const novIzbor = () => ({ lik_id: likovi[0].id, mesto: podrazumevano(MESTA), vreme: podrazumevano(VREMENA), doba: podrazumevano(DOBA), brzina: BRZINA[3], velicina: VELICINA[3] });
  const filtrirani = () => (filter === "svi" ? likovi : likovi.filter((l) => (l.kategorije || []).includes(filter)));

  function procitaj() {
    try { return valjan(JSON.parse(localStorage.getItem(KLJUC) || "null"), ids()); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- animacija: samo biciklista (korak 1) ili scena „Reka“ (ostalo)
  // Pokreće se samo ono što se vidi; pauza van ekrana, u sakrivenom tabu, kad je prozor zatvoren i uz „manje pokreta“.
  const smeDaVozi = () => dlg && dlg.open && vidljiva && !document.hidden && !bezPokreta.matches;
  const uSceni = () => prikaz === "pregled" || korak > 0;
  function osveziPokret() {
    const vozi = smeDaVozi();
    if (scena) { if (vozi && uSceni()) scena.kreni(); else scena.stani(); }
    if (samo) { if (vozi && !uSceni()) samo.kreni(); else samo.stani(); }
  }
  /** Biciklista bez pozadine: isti crtež kao u sceni (renderFrame), jedan krug pedala ≈ 1,6 s / brzina. */
  function napraviSamo(el) {
    const NSV = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NSV, "svg");
    svg.setAttribute("viewBox", "0 0 400 300");
    svg.setAttribute("role", "img");
    el.append(svg);
    let t = 0, posl = null, raf = 0;
    const crtaj = () => {
      const s = izbor.velicina / VELICINA[3];
      svg.setAttribute("aria-label", lik().ime);
      svg.innerHTML = `<g transform="translate(200,272) scale(${s.toFixed(3)}) translate(-200,-272)">${NaSicuLikovi.renderFrame(likSvi(izbor.lik_id), t, { inner: true })}</g>`;
    };
    const kadar = (now) => {
      if (posl != null) t = (t + (Math.min(100, now - posl) * izbor.brzina) / CIKLUS_MS) % 1;
      posl = now;
      crtaj();
      raf = requestAnimationFrame(kadar);
    };
    return {
      crtaj,
      kreni() { if (!raf) { posl = null; raf = requestAnimationFrame(kadar); } },
      stani() { cancelAnimationFrame(raf); raf = 0; },
    };
  }
  let sviLikovi = null;
  const likSvi = (id) => (sviLikovi ||= Object.values(NaSicuProbniLikovi).flat()).find((l) => l.id === id);
  const sirina = () => (usko.matches ? SCENA.sirinaPrikazaUsko : SCENA.sirinaPrikaza);

  async function ucitajMaterijal() {
    const json = fetch(`likovi/likovi.json${LJ.VER ? `?v=${LJ.VER}` : ""}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    await LJ.ucitajSkript("assets/nasicu/nasicu-likovi.js");
    await Promise.all([LJ.ucitajSkript("assets/nasicu/likovi-probni.js"), LJ.ucitajSkript("assets/nasicu/reka-scena.js")]);
    likovi = await json;
  }
  function napraviPregled() {
    const el = dlg.querySelector("#pf-scena");
    el.querySelector(".pf-ucitava")?.remove();
    samo = napraviSamo(el.querySelector(".pf-samo"));
    scena = NaSicuRekaScena.napravi(el.querySelector(".pf-platno"), { ...SCENA, sirinaPrikaza: sirina(), lik: izbor.lik_id, brzina: izbor.brzina, velicinaLika: izbor.velicina });
    new IntersectionObserver(([e]) => { vidljiva = e.isIntersecting; osveziPokret(); }).observe(el);
    document.addEventListener("visibilitychange", osveziPokret);
    bezPokreta.addEventListener("change", osveziPokret);
    usko.addEventListener("change", () => scena.podesi({ sirinaPrikaza: sirina() }));
  }
  function osveziPregled() {
    if (!scena) return;
    const el = dlg.querySelector("#pf-scena");
    el.classList.toggle("samo-lik", !uSceni());
    scena.podesi({ lik: izbor.lik_id, brzina: izbor.brzina, velicinaLika: izbor.velicina });
    samo.crtaj();
    // oznake stižu korak po korak: mesto od koraka 2, vreme od 3, doba dana od 4 (u pregledu sve)
    const do_ = prikaz === "pregled" ? 3 : korak;
    const ime = (k) => OPCIJE[k].find((o) => o[0] === izbor[k])[1];
    dlg.querySelector("#pf-oznake").innerHTML = ["mesto", "vreme", "doba"].filter((_, i) => i < do_)
      .map((k) => `<span>${IKO[izbor[k]]}${ime(k)}</span>`).join("");
    dlg.querySelector("#pf-lik-ime").textContent = lik().ime;
    osveziPokret();
  }

  // ---------------------------------------------------------------- prikazi: pregled profila i čarobnjak
  function crtajPregled() {
    prikaz = "pregled";
    const imaLik = !!sacuvan;
    dlg.querySelector("#pf-naslov").textContent = "Tvoj profil";
    dlg.querySelector("#pf-telo").innerHTML = imaLik
      ? `<div class="pf-akcije"><button type="button" class="dugme primarno" data-akcija="izmeni">${LJ.ik("palette")}Izmeni biciklistu</button>
           <button type="button" class="dugme" data-akcija="prijava">${LJ.ik("user")}Prijavi se</button></div>
         <p class="sitno pf-napomena">Biciklista se za sada pamti u ovom pregledaču. Kad se prijaviš, ide uz tvoj nalog.</p>`
      : `<div class="pf-prazno">
           <img src="assets/slike/brend/NaSicu_ikonica_bicikl.svg" alt="" width="120" height="75">
           <h3>Još nemaš svog biciklistu</h3>
           <p class="sitno">Izaberi lik koji liči na tebe, gde voziš, po kakvom vremenu i u koje doba dana.</p>
           <div class="pf-akcije"><button type="button" class="dugme primarno" data-akcija="napravi">${LJ.ik("bike")}Napravi biciklistu</button>
             <button type="button" class="dugme" data-akcija="prijava">${LJ.ik("user")}Prijavi se</button></div></div>`;
    dlg.querySelector("#pf-carobnjak").hidden = dlg.querySelector("#pf-koraci").hidden = true;
    dlg.querySelector("#pf-scena").hidden = !imaLik;
    if (imaLik) { izbor = { ...sacuvan }; osveziPregled(); } else osveziPokret();
  }
  function pocniCarobnjak() {
    prikaz = "carobnjak";
    korak = 0;
    izbor = sacuvan ? { ...sacuvan } : novIzbor();
    filter = "svi";
    strana = Math.max(0, Math.floor(likovi.findIndex((l) => l.id === izbor.lik_id) / PO_STRANI));
    dlg.querySelector("#pf-naslov").textContent = sacuvan ? "Izmeni biciklistu" : "Napravi biciklistu";
    dlg.querySelector("#pf-carobnjak").hidden = dlg.querySelector("#pf-koraci").hidden = false;
    dlg.querySelector("#pf-scena").hidden = false;
    dlg.querySelector("#pf-telo").innerHTML = "";
    postaviKlizace();
    crtajKorak();
  }
  function postaviKlizace() {
    for (const [k, [od, doo, kor]] of [["brzina", BRZINA], ["velicina", VELICINA]]) {
      const i = dlg.querySelector(`#pf-${k}`);
      Object.assign(i, { min: od, max: doo, step: kor, value: izbor[k] });
      oznakaKlizaca(k);
    }
  }
  function oznakaKlizaca(k) {
    dlg.querySelector(`#pf-${k}-v`).textContent = k === "brzina" ? `${broj(izbor.brzina)}×` : `${Math.round((izbor.velicina / VELICINA[3]) * 100)} %`;
  }

  function korakLik() {
    const spisak = filtrirani(), n = Math.max(1, Math.ceil(spisak.length / PO_STRANI));
    strana = Math.min(strana, n - 1);
    const deo = spisak.slice(strana * PO_STRANI, strana * PO_STRANI + PO_STRANI);
    const koliko = (k) => (k === "svi" ? likovi.length : likovi.filter((l) => (l.kategorije || []).includes(k)).length);
    return `<div class="pf-filteri" role="group" aria-label="Filter biciklista">${KATEGORIJE.map(([k, t]) =>
        `<button type="button" class="cip" data-filter="${k}" aria-pressed="${k === filter}">${t}<small>${koliko(k)}</small></button>`).join("")}</div>
      <div class="pf-lik-red">
        <button type="button" class="ikonica-dugme pf-strelica" data-strana="-1" aria-label="Prethodnih ${PO_STRANI}"${strana ? "" : " disabled"}>${LJ.ik("chevron", "levo")}</button>
        <div class="pf-likovi" role="group" aria-label="Biciklisti, strana ${strana + 1} od ${n}">${deo.map((l) => `
          <button type="button" class="pf-lik" data-id="${l.id}" aria-pressed="${l.id === izbor.lik_id}">
            <img src="${l.mini}" alt="${esc(l.ime)}" width="240" height="180" loading="lazy" decoding="async"><span>${esc(l.ime)}</span></button>`).join("")}
        </div>
        <button type="button" class="ikonica-dugme pf-strelica" data-strana="1" aria-label="Sledećih ${PO_STRANI}"${strana < n - 1 ? "" : " disabled"}>${LJ.ik("chevron")}</button>
      </div>
      <div class="pf-strana sitno">Strana <b>${strana + 1}</b> / ${n}</div>`;
  }
  function korakOpcije(k) {
    return `<div class="pf-opcije" role="group">${OPCIJE[k].map(([id, t, opis, gotovo]) => `
      <button type="button" class="pf-opcija${gotovo ? "" : " u-izradi"}" data-k="${k}" data-v="${id}" aria-pressed="${izbor[k] === id}">
        ${IKO[id]}<b>${t}</b><span>${opis}</span>${gotovo ? "" : '<i class="oznaka-meni siva">U IZRADI</i>'}</button>`).join("")}</div>`;
  }
  function crtajKorak(fokus) {
    dlg.querySelectorAll(".pf-korak").forEach((b, i) => {
      b.classList.toggle("aktivan", i === korak);
      b.classList.toggle("gotov", i < korak);
      b.setAttribute("aria-current", i === korak ? "step" : "false");
    });
    const telo = dlg.querySelector("#pf-korak-telo");
    telo.innerHTML = korak === 0 ? korakLik() : korakOpcije(KORACI[korak][0]);
    dlg.querySelector("#pf-nazad").innerHTML = korak === 0 ? "Otkaži" : `${LJ.ik("chevron", "levo")}Nazad`;
    dlg.querySelector("#pf-dalje").innerHTML = korak === KORACI.length - 1 ? `${LJ.ik("check")}Sačuvaj` : `Dalje${LJ.ik("chevron")}`;
    stanje("");
    osveziPregled();
    if (fokus) (telo.querySelector(fokus === "prvi" ? ".pf-lik" : ".pf-lik:last-child"))?.focus();
  }
  function izaberiLik(id) {
    izbor.lik_id = id;
    dlg.querySelectorAll(".pf-lik").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
    osveziPregled();
  }
  function idiNaStranu(d, fokus) {
    const n = Math.ceil(filtrirani().length / PO_STRANI);
    strana = Math.max(0, Math.min(n - 1, strana + d));
    crtajKorak(fokus);
  }
  function stanje(t, vrsta = "") {
    const el = dlg.querySelector("#pf-stanje");
    el.textContent = t;
    el.className = `pf-stanje sitno ${vrsta}`;
  }
  function sacuvaj() {
    const dugme = dlg.querySelector("#pf-dalje");
    dugme.disabled = true;
    stanje("Čuvanje…");
    try {
      const z = valjan(izbor, ids());
      if (!z) throw new Error("nepoznat biciklista");
      localStorage.setItem(KLJUC, JSON.stringify(z));
      sacuvan = z;
      LJ.osveziAvatar();
      LJ.tost("Tvoj biciklista je sačuvan.", "check");
      stanje("");
      crtajPregled();
    } catch (e) {
      stanje("Čuvanje nije uspelo — pregledač ne dozvoljava pamćenje (privatni prozor?).", "greska");
    }
    dugme.disabled = false;
  }

  // ---------------------------------------------------------------- prozor
  function napravi() {
    dlg = document.createElement("dialog");
    dlg.className = "prijava profil";
    dlg.setAttribute("aria-labelledby", "pf-naslov");
    dlg.innerHTML = `<div class="prijava-glava"><div><span class="eyebrow">Profil</span><h2 id="pf-naslov">Tvoj profil</h2></div>
        <button type="button" class="ikonica-dugme" data-zatvori aria-label="Zatvori">${LJ.ik("x")}</button></div>
      <ol class="pf-koraci" id="pf-koraci" hidden>${KORACI.map(([, t], i) => `<li><button type="button" class="pf-korak" data-korak="${i}"><i>${i + 1}</i><span>${t}</span></button></li>`).join("")}</ol>
      <div class="pf-pregled" id="pf-scena" hidden>
        <div class="pf-platno"></div><div class="pf-samo"></div><div class="pf-ucitava sitno">Učitavanje…</div>
        <div class="pf-oznake" id="pf-oznake"></div><div class="pf-lik-ime" id="pf-lik-ime"></div></div>
      <div id="pf-telo"></div>
      <div class="pf-carobnjak" id="pf-carobnjak" hidden>
        <div class="pf-klizaci">
          <label>Brzina <output id="pf-brzina-v"></output><input type="range" id="pf-brzina" data-k="brzina"></label>
          <label>Veličina <output id="pf-velicina-v"></output><input type="range" id="pf-velicina" data-k="velicina"></label>
        </div>
        <div id="pf-korak-telo"></div>
        <div class="pf-dno"><span class="pf-stanje sitno" id="pf-stanje" role="status"></span>
          <button type="button" class="dugme" id="pf-nazad"></button><button type="button" class="dugme primarno" id="pf-dalje"></button></div>
      </div>`;
    document.body.append(dlg);

    dlg.addEventListener("click", (e) => {
      if (e.target.closest("[data-zatvori]")) { dlg.close(); return; }
      const a = e.target.closest("[data-akcija]");
      if (a) {
        if (a.dataset.akcija === "prijava") { dlg.close(); LJ.otvoriPrijavu(); } else pocniCarobnjak();
        return;
      }
      const k = e.target.closest(".pf-korak");
      if (k) { korak = +k.dataset.korak; crtajKorak(); return; }
      const f = e.target.closest("[data-filter]");
      if (f) { filter = f.dataset.filter; strana = 0; crtajKorak(); return; }
      const s = e.target.closest(".pf-strelica");
      if (s) { idiNaStranu(+s.dataset.strana); return; }
      const l = e.target.closest(".pf-lik");
      if (l) { izaberiLik(l.dataset.id); return; }
      const o = e.target.closest(".pf-opcija");
      if (o) {
        const [, t, , gotovo] = OPCIJE[o.dataset.k].find((x) => x[0] === o.dataset.v);
        if (!gotovo) { LJ.tost(`„${t}“ je u izradi — uskoro.`, "info"); return; }
        izbor[o.dataset.k] = o.dataset.v;
        crtajKorak();
      }
    });
    LJ.zatvaranjeVan(dlg);
    dlg.querySelector(".pf-klizaci").addEventListener("input", (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      izbor[k] = +e.target.value;
      oznakaKlizaca(k);
      scena.podesi(k === "brzina" ? { brzina: izbor.brzina } : { velicinaLika: izbor.velicina });
      samo.crtaj();
    });
    // strelice levo/desno kroz likove; na ivici strane prelaze na susednu stranu
    dlg.querySelector("#pf-korak-telo").addEventListener("keydown", (e) => {
      const b = e.target.closest(".pf-lik");
      if (!b || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const sve = [...dlg.querySelectorAll(".pf-lik")], i = sve.indexOf(b), d = e.key === "ArrowRight" ? 1 : -1;
      if (sve[i + d]) sve[i + d].focus();
      else if (d > 0 && !dlg.querySelector('.pf-strelica[data-strana="1"]').disabled) idiNaStranu(1, "prvi");
      else if (d < 0 && strana > 0) idiNaStranu(-1, "poslednji");
    });
    dlg.querySelector("#pf-nazad").addEventListener("click", () => { if (korak > 0) { korak--; crtajKorak(); } else crtajPregled(); });
    dlg.querySelector("#pf-dalje").addEventListener("click", () => { if (korak < KORACI.length - 1) { korak++; crtajKorak(); } else sacuvaj(); });
    dlg.addEventListener("close", osveziPokret);
  }

  /** Otvara profil; `{ napravi: true }` odmah pokreće čarobnjak. */
  async function otvori({ napravi: odmah = false } = {}) {
    const prvi = !dlg;
    if (prvi) napravi();
    dlg.showModal();
    if (prvi) {
      dlg.querySelector("#pf-telo").innerHTML = '<p class="sitno pf-napomena">Učitavanje…</p>';
      try {
        await ucitajMaterijal();
        sacuvan = procitaj();
        izbor = sacuvan ? { ...sacuvan } : novIzbor();
        napraviPregled();
      } catch (e) {
        dlg.querySelector("#pf-telo").innerHTML = '<p class="sitno pf-napomena">Biciklisti trenutno nisu dostupni.</p>';
        return;
      }
    }
    if (odmah) pocniCarobnjak(); else crtajPregled();
  }

  return { otvori, valjan, KLJUC, KATEGORIJE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PROFIL;
