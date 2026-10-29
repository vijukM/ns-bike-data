/* Prozor „Prijava“: nalog (email + lozinka) i izbor bicikliste u 4 koraka — biciklista, mesto vožnje, vreme, doba dana.
   Učitava ga ljuska tek na klik (LJ.ucitajSkript); generator likova i scena „Reka“ (assets/nasicu/, gotov materijal,
   ne menjati) učitavaju se tek kad se prozor prvi put otvori. Na vrhu koraka je scena „Reka“ sa izabranim likom:
   u jednom trenutku se vektorski animira samo taj jedan lik, a likovi za izbor su statične sličice (5 po strani).
   Dok nema naloga, izbor se pamti u pregledaču (localStorage „ns-profil“: samo id-jevi, nikad slika). */
"use strict";

const PRIJAVA = (() => {
  const KLJUC = "ns-profil";
  const PO_STRANI = 5;
  // scena „Reka“: konfiguracija u kodu (korisnici je ne podešavaju); usko = prozor uži od 640 px
  const SCENA = { sirinaPrikaza: 1000, sirinaPrikazaUsko: 560, velicinaLika: 0.62, polozaj: 0.3, brzina: 1, panorama: "reka/reka-panorama.svg" };

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
  // gotovo: false → „u izradi“; prva gotova opcija je podrazumevana
  const MESTA = [["reka", "Reka", "kej uz Dunav", true], ["centar", "Centar", "Zmaj Jovina, Dunavska"], ["periferija", "Periferija", "naselja i salaši"], ["bulevari", "Bulevari", "široke staze uz saobraćaj"]];
  const VREMENA = [["sunce", "Sunce", "vedro", true], ["oblacno", "Oblačno", "sivo nebo"], ["kisa", "Kiša", "mokra staza"], ["sneg", "Sneg", "zima na biciklu"], ["vetar", "Vetar i lišće", "jesen, košava"]];
  const DOBA = [["jutro", "Jutro", "rani polazak"], ["dan", "Dan", "puno svetla", true], ["predvece", "Predveče", "zalazak sunca"], ["noc", "Noć", "svetla i farovi"]];
  const OPCIJE = { mesto: MESTA, vreme: VREMENA, doba: DOBA };
  const KORACI = [["lik", "Biciklista"], ["mesto", "Mesto vožnje"], ["vreme", "Vreme"], ["doba", "Doba dana"]];
  const podrazumevano = (spisak) => spisak.find((o) => o[3])[0];

  /** Ispravan izbor ili null: lik_id mora biti jedan od dozvoljenih, a ostalo jedna od gotovih opcija (inače podrazumevano). */
  function valjan(z, ids) {
    if (!z || typeof z !== "object" || typeof z.lik_id !== "string" || !ids.includes(z.lik_id)) return null;
    const gotova = (k) => (OPCIJE[k].some((o) => o[0] === z[k] && o[3]) ? z[k] : podrazumevano(OPCIJE[k]));
    return { lik_id: z.lik_id, mesto: gotova("mesto"), vreme: gotova("vreme"), doba: gotova("doba") };
  }
  if (typeof document === "undefined") return { valjan, KLJUC };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ucitaj = (put) => LJ.ucitajSkript(put);
  const bezPokreta = matchMedia("(prefers-reduced-motion: reduce)");
  const usko = matchMedia("(max-width: 640px)");

  let dlg = null, likovi = [], izbor = null, korak = 0, strana = 0, scena = null, vidljiva = true;

  function procitaj() {
    try { return valjan(JSON.parse(localStorage.getItem(KLJUC) || "null"), likovi.map((l) => l.id)); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- scena „Reka“ (pauza van ekrana, u sakrivenom tabu i kad je prozor zatvoren)
  const smeDaVozi = () => scena && dlg.open && vidljiva && !document.hidden && !bezPokreta.matches;
  const osveziPokret = () => { if (!scena) return; if (smeDaVozi()) scena.kreni(); else scena.stani(); };
  async function napraviScenu() {
    const el = dlg.querySelector("#pr-scena");
    await ucitaj("assets/nasicu/nasicu-likovi.js");
    await ucitaj("assets/nasicu/likovi-probni.js");
    await ucitaj("assets/nasicu/reka-scena.js");
    el.querySelector(".pr-ucitava")?.remove();
    scena = NaSicuRekaScena.napravi(el.querySelector(".pr-platno"), { ...SCENA, sirinaPrikaza: usko.matches ? SCENA.sirinaPrikazaUsko : SCENA.sirinaPrikaza, lik: izbor.lik_id });
    new IntersectionObserver(([e]) => { vidljiva = e.isIntersecting; osveziPokret(); }).observe(el);
    document.addEventListener("visibilitychange", osveziPokret);
    bezPokreta.addEventListener("change", osveziPokret);
    usko.addEventListener("change", () => scena.podesi({ sirinaPrikaza: usko.matches ? SCENA.sirinaPrikazaUsko : SCENA.sirinaPrikaza }));
    osveziPokret();
  }

  // ---------------------------------------------------------------- koraci
  function natpisPregleda() {
    const l = likovi.find((x) => x.id === izbor.lik_id);
    const ime = (k) => OPCIJE[k].find((o) => o[0] === izbor[k])[1];
    dlg.querySelector("#pr-lik-ime").innerHTML = `<b>${esc(l.ime)}</b><span>${esc(l.opis)}</span>`;
    dlg.querySelector("#pr-oznake").innerHTML = ["mesto", "vreme", "doba"].map((k) => `<span>${IKO[izbor[k]]}${ime(k)}</span>`).join("");
  }
  function korakLik() {
    const n = Math.ceil(likovi.length / PO_STRANI);
    const deo = likovi.slice(strana * PO_STRANI, strana * PO_STRANI + PO_STRANI);
    return `<div class="pr-lik-red">
        <button type="button" class="ikonica-dugme pr-strelica" data-strana="-1" aria-label="Prethodnih ${PO_STRANI}"${strana ? "" : " disabled"}>${LJ.ik("chevron", "levo")}</button>
        <div class="pr-likovi" role="group" aria-label="Biciklisti, strana ${strana + 1} od ${n}">${deo.map((l) => `
          <button type="button" class="pr-lik" data-id="${l.id}" aria-pressed="${l.id === izbor.lik_id}" title="${esc(l.opis)}">
            <img src="${l.mini}" alt="${esc(l.ime)}" width="240" height="180" loading="lazy" decoding="async"><span>${esc(l.ime)}</span></button>`).join("")}
        </div>
        <button type="button" class="ikonica-dugme pr-strelica" data-strana="1" aria-label="Sledećih ${PO_STRANI}"${strana < n - 1 ? "" : " disabled"}>${LJ.ik("chevron")}</button>
      </div>
      <div class="pr-strana sitno">Strana <b>${strana + 1}</b> od ${n} · ${likovi.length} biciklista · strelice ← → na tastaturi</div>`;
  }
  function korakOpcije(k) {
    return `<div class="pr-opcije" role="group">${OPCIJE[k].map(([id, t, opis, gotovo]) => `
      <button type="button" class="pr-opcija${gotovo ? "" : " u-izradi"}" data-k="${k}" data-v="${id}" aria-pressed="${izbor[k] === id}">
        ${IKO[id]}<b>${t}</b><span>${opis}</span>${gotovo ? "" : '<i class="oznaka-meni siva">U IZRADI</i>'}</button>`).join("")}</div>`;
  }
  function crtajKorak(fokus) {
    dlg.querySelectorAll(".pr-korak").forEach((b, i) => {
      b.classList.toggle("aktivan", i === korak);
      b.classList.toggle("gotov", i < korak);
      b.setAttribute("aria-current", i === korak ? "step" : "false");
    });
    const telo = dlg.querySelector("#pr-telo");
    telo.innerHTML = korak === 0 ? korakLik() : korakOpcije(KORACI[korak][0]);
    dlg.querySelector("#pr-nazad").disabled = korak === 0;
    const dalje = dlg.querySelector("#pr-dalje");
    dalje.innerHTML = korak === KORACI.length - 1 ? `${LJ.ik("check")}Sačuvaj` : `Dalje${LJ.ik("chevron")}`;
    if (fokus) (telo.querySelector(`[data-id="${fokus}"]`) || telo.querySelector(fokus === "prvi" ? ".pr-lik" : fokus === "poslednji" ? ".pr-lik:last-child" : "[aria-pressed=true]"))?.focus();
  }
  function izaberiLik(id) {
    izbor.lik_id = id;
    dlg.querySelectorAll(".pr-lik").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
    if (scena) scena.podesi({ lik: id });
    natpisPregleda();
    stanje("");
  }
  function idiNaStranu(d, fokus) {
    const n = Math.ceil(likovi.length / PO_STRANI);
    strana = Math.max(0, Math.min(n - 1, strana + d));
    crtajKorak(fokus);
  }
  function stanje(t, vrsta = "") {
    const el = dlg.querySelector("#pr-stanje");
    el.textContent = t;
    el.className = `pr-stanje sitno ${vrsta}`;
  }
  function sacuvaj() {
    const dugme = dlg.querySelector("#pr-dalje");
    dugme.disabled = true;
    stanje("Čuvanje…");
    try {
      const z = valjan(izbor, likovi.map((l) => l.id));
      if (!z) throw new Error("nepoznat biciklista");
      localStorage.setItem(KLJUC, JSON.stringify(z));
      stanje("Sačuvano u ovom pregledaču.", "uspeh");
      LJ.tost("Tvoj biciklista je sačuvan.", "check");
    } catch (e) {
      stanje("Čuvanje nije uspelo — pregledač ne dozvoljava pamćenje (privatni prozor?).", "greska");
    }
    dugme.disabled = false;
  }

  // ---------------------------------------------------------------- prozor
  function napravi() {
    dlg = document.createElement("dialog");
    dlg.className = "prijava prijava-siroka";
    dlg.setAttribute("aria-labelledby", "prijava-naslov");
    dlg.innerHTML = `<div class="prijava-glava"><div><span class="eyebrow">Nalog</span><h2 id="prijava-naslov">Prijava</h2></div>
        <button type="button" class="ikonica-dugme" data-zatvori aria-label="Zatvori">${LJ.ik("x")}</button></div>
      <div class="pr-nalog">
        <div id="pr-vrsta"></div>
        <form class="pr-forma" autocomplete="on">
          <label>Email<input type="email" name="email" autocomplete="email" placeholder="ime@primer.rs" required></label>
          <label>Lozinka<input type="password" name="lozinka" autocomplete="current-password" placeholder="••••••••" required></label>
          <button class="dugme primarno" type="submit" id="pr-posalji">Prijavi se</button>
        </form>
      </div>
      <section class="pr-avatar" aria-labelledby="pr-avatar-naslov">
        <div class="pr-avatar-glava"><h3 id="pr-avatar-naslov">Tvoj biciklista</h3>
          <ol class="pr-koraci">${KORACI.map(([, t], i) => `<li><button type="button" class="pr-korak" data-korak="${i}"><i>${i + 1}</i><span>${t}</span></button></li>`).join("")}</ol></div>
        <div class="pr-pregled" id="pr-scena"><div class="pr-platno"></div><div class="pr-ucitava sitno">Učitavanje scene…</div>
          <div class="pr-oznake" id="pr-oznake"></div><div class="pr-lik-ime" id="pr-lik-ime"></div></div>
        <div class="pr-telo" id="pr-telo"></div>
        <div class="pr-dno"><span class="pr-stanje sitno" id="pr-stanje" role="status"></span>
          <button type="button" class="dugme" id="pr-nazad">${LJ.ik("chevron", "levo")}Nazad</button><button type="button" class="dugme primarno" id="pr-dalje"></button></div>
      </section>`;
    document.body.append(dlg);

    NS.prekidac(dlg.querySelector("#pr-vrsta"), [["prijava", "Imam nalog"], ["novi", "Novi nalog"]], "prijava", (v) => {
      dlg.querySelector("#pr-posalji").textContent = v === "novi" ? "Napravi nalog" : "Prijavi se";
      dlg.querySelector("[name=lozinka]").autocomplete = v === "novi" ? "new-password" : "current-password";
    });
    dlg.querySelector(".pr-forma").addEventListener("submit", (e) => { e.preventDefault(); LJ.tost("Nalozi stižu uskoro. Biciklista se za sada pamti u ovom pregledaču.", "info"); });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-zatvori]")) { dlg.close(); return; }
      const k = e.target.closest(".pr-korak");
      if (k) { korak = +k.dataset.korak; crtajKorak(); return; }
      const s = e.target.closest(".pr-strelica");
      if (s) { idiNaStranu(+s.dataset.strana); return; }
      const l = e.target.closest(".pr-lik");
      if (l) { izaberiLik(l.dataset.id); return; }
      const o = e.target.closest(".pr-opcija");
      if (o) {
        const [, t, , gotovo] = OPCIJE[o.dataset.k].find((x) => x[0] === o.dataset.v);
        if (!gotovo) { LJ.tost(`„${t}“ je u izradi — uskoro.`, "info"); return; }
        izbor[o.dataset.k] = o.dataset.v;
        crtajKorak();
        natpisPregleda();
      }
    });
    // strelice levo/desno kroz likove; na ivici strane prelaze na susednu stranu
    dlg.querySelector("#pr-telo").addEventListener("keydown", (e) => {
      const b = e.target.closest(".pr-lik");
      if (!b || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const sve = [...dlg.querySelectorAll(".pr-lik")], i = sve.indexOf(b), d = e.key === "ArrowRight" ? 1 : -1;
      if (sve[i + d]) sve[i + d].focus();
      else if (d > 0 && !dlg.querySelector('.pr-strelica[data-strana="1"]').disabled) idiNaStranu(1, "prvi");
      else if (d < 0 && strana > 0) idiNaStranu(-1, "poslednji");
    });
    dlg.querySelector("#pr-nazad").addEventListener("click", () => { if (korak > 0) { korak--; crtajKorak(); } });
    dlg.querySelector("#pr-dalje").addEventListener("click", () => { if (korak < KORACI.length - 1) { korak++; crtajKorak(); } else sacuvaj(); });
    dlg.addEventListener("close", osveziPokret);
  }

  async function otvori() {
    if (!dlg) {
      napravi();
      dlg.showModal();
      try {
        likovi = await fetch("likovi/likovi.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
        izbor = procitaj() || { lik_id: likovi[0].id, mesto: podrazumevano(MESTA), vreme: podrazumevano(VREMENA), doba: podrazumevano(DOBA) };
        strana = Math.floor(likovi.findIndex((l) => l.id === izbor.lik_id) / PO_STRANI);
        crtajKorak();
        natpisPregleda();
        await napraviScenu();
      } catch (e) {
        dlg.querySelector(".pr-ucitava").textContent = "Biciklisti trenutno nisu dostupni.";
      }
      return;
    }
    dlg.showModal();
    osveziPokret();
  }

  return { otvori, valjan, KLJUC };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PRIJAVA;
