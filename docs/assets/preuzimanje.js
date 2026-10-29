/* Strana „Preuzimanje podataka“: dobavljanje podataka uživo (dnevnik čitanja brojača, sat po sat, sa nepravilnostima)
   i — uskoro — paketi za preuzimanje. Podaci: data/citanja.json (pravi ga sajt.citanja posle svakog čitanja). */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const DANI_KR = ["ned", "pon", "uto", "sre", "čet", "pet", "sub"];
  const dd = (x) => String(x).padStart(2, "0");
  const satOznaka = (h) => `${dd(h)}–${dd((h + 1) % 24 || 24)} h`;
  const danKratko = (iso) => { const [g, m, d] = iso.split("-").map(Number); return `${DANI_KR[new Date(Date.UTC(g, m - 1, d)).getUTCDay()]} ${d}. ${m}.`; };
  const OKIDAC = { "cron-job.org": "cron-job.org (XX:02)", rezerva: "rezerva (XX:20)", rucno: "ručno", "cron-job.org?": "cron-job.org (procena po minutu)", "rezerva?": "rezerva ili ručno (procena po minutu)" };
  let C, period = 7, samoProblemi = false, izabran = null;

  const kpi = (ik, naslov, vrednost, dole, boja) => `<div class="kpi c-${boja}"><div class="vrh"><span class="kvadrat">${LJ.ik(ik)}</span>
    <span class="naslov">${naslov}</span></div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
  const dani = () => (period ? C.dani.slice(0, period) : C.dani);
  const satiSaPodacima = (d) => d.sati.filter((s) => !s.van);

  function zaglavlje() {
    main.innerHTML = `
      <header class="zaglavlje-strane pojava">
        <div><span class="eyebrow">Projekat · podaci</span><h1>Preuzimanje <em>podataka</em></h1>
          <p class="uvod">Kako i kada stižu podaci sa brojača — svaki sat svakog dana, sa nepravilnostima. Paketi za preuzimanje stižu uskoro.</p></div>
        <div class="akcije">${LJ.uzivoZnak()}</div>
      </header>
      <div class="kpi-mreza pojava" id="ct-kpi"></div>
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Dobavljanje uživo</span><h2>Svaki sat svakog dana${LJ.info("Jedno polje je jedan sat (lokalno vreme). Broj u polju je minut čitanja — očekivano je :02. Klikni na polje za detalje.")}</h2></div>
          <div class="ct-kontrole"><div id="ct-period"></div>
            <label class="prekidac-ui"><input type="checkbox" id="ct-samo"><span class="klizac" aria-hidden="true"></span><span>samo dani sa nepravilnostima</span></label></div>
        </div>
        <div class="ct-legenda" id="ct-legenda"></div>
        <div class="ct-raspored">
          <div class="ct-mreza-omot"><div class="ct-mreza" id="ct-mreza" role="grid" aria-label="Čitanja po danima i satima"></div></div>
          <aside class="ct-detalj" id="ct-detalj" aria-live="polite"></aside>
        </div>
      </section>
      <div class="mreza-2">
        <section class="kartica pojava">
          <div class="kartica-glava"><div><span class="eyebrow">Spisak</span><h2>Nepravilnosti</h2></div></div>
          <div class="tabela-omot ct-tabela-omot"><table class="tabela" id="ct-tabela"></table></div>
        </section>
        <section class="kartica pojava">
          <div class="kartica-glava"><div><span class="eyebrow">Kako radi</span><h2>Od brojača do sajta</h2></div></div>
          <ol class="ct-koraci">
            <li><b>XX:02</b> — cron-job.org pokreće čitanje: preuzima se javni fajl sa 57 smerova (46 serija brojača).</li>
            <li><b>+3 i +6 min</b> — ako čitanje ne uspe, isti posao pokušava ponovo (i preko pregledača).</li>
            <li><b>XX:20</b> — rezervno pokretanje (GitHub ga ume zakasniti 15–40 min) čita <i>samo</i> ako za taj sat još nema čitanja.
              Do 29. 10. 2026. je i kad ne bi čitalo ponovo pravilo fajlove sajta — otud commit-ovi „podaci: čitanje“ u čudnim minutima (npr. 09:37) bez novog čitanja.</li>
            <li><b>Posle čitanja</b> — računaju se „Danas uživo“, mapa i ovaj dnevnik; prvo čitanje dana i ono u 01:xx prave i satni obračun za juče.</li>
          </ol>
          <p class="sitno">Nepravilnost je: ${Object.values(C.nepravilnosti).join("; ")}.</p>
        </section>
      </div>
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Paketi</span><h2>Šta će se moći preuzeti</h2></div><span class="znacka z-uskoro">USKORO</span></div>
        <div class="tabela-omot"><table class="tabela">
          <thead><tr><th>Skup</th><th>Opis</th><th>Format</th><th></th></tr></thead><tbody>
          ${[["Stanice", "spisak 46 serija: naziv, smer, koordinate, stanje", "CSV · JSON"],
    ["Grad po danu", "zbir i broj brojača, vreme, praznici", "CSV · JSON"],
    ["Stanica po danu", "dnevni zbir za svaku stanicu", "CSV · JSON"],
    ["Satni podaci", "svaki sat svakog brojača, po mesecima, sa razlogom za rupu", "CSV · JSON"],
    ["Vreme po satu", "temperatura, padavine, sneg (lokalno vreme)", "CSV · JSON"],
    ["Biciklističke staze", "OpenStreetMap segmenti", "GeoJSON"]].map(([a, o, f]) =>
    `<tr><td><b>${a}</b></td><td class="muted">${o}</td><td><span class="znacka">${f}</span></td>
            <td><span class="dugme malo" aria-disabled="true">${LJ.ik("lock")}Preuzmi</span></td></tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  function kpiRed() {
    const p = C.poslednje, d7 = C.dani.slice(0, 7);
    const sati = d7.flatMap(satiSaPodacima), saCit = sati.filter((s) => s.c.length).length;
    const ocekivano = sati.filter((s) => s.c.length || s.p.includes("nema")).length;
    const nepr = sati.filter((s) => s.p.length).length;
    const izv = d7.flatMap((d) => d.sati.flatMap((s) => s.c.map((c) => c.izvor_min))).filter((x) => x != null && x >= 0);
    document.getElementById("ct-kpi").innerHTML =
      kpi("clock", "Poslednje čitanje", p ? p.t.slice(0, 5) : "—", p ? `${danKratko(p.datum)} · ${p.n} redova · ${OKIDAC[p.okidac] || p.okidac}` : "nema čitanja", "plava") +
      kpi("check", "Sati sa čitanjem", `${saCit}<small>/${ocekivano}</small>`, "poslednjih 7 dana", saCit === ocekivano ? "zelena" : "narandzasta") +
      kpi("alert", "Nepravilnosti", NS.broj(nepr), `sati u poslednjih 7 dana`, nepr ? "narandzasta" : "zelena") +
      kpi("activity", "Starost izvora", izv.length ? `${NS.dec(izv.reduce((a, b) => a + b, 0) / izv.length)}<small> min</small>` : "—", "prosek u trenutku čitanja (7 dana)", "teal");
  }

  function vrstaPolja(s) {
    if (s.van) return "van";
    if (s.p.includes("nema")) return "nema";
    if (s.p.length) return "problem";
    if (!s.c.length) return "ceka";
    return s.napomena ? "napomena" : "ok";
  }
  function mreza() {
    const spisak = dani().filter((d) => !samoProblemi || d.nepravilnosti);
    const el = document.getElementById("ct-mreza");
    if (!spisak.length) { el.innerHTML = `<p class="sitno ct-prazno">Nema dana sa nepravilnostima u izabranom periodu.</p>`; return; }
    el.innerHTML = `<div class="ct-red ct-glava" role="row"><span class="ct-dan"></span>${Array.from({ length: 24 }, (_, h) => `<span class="ct-sat-oznaka">${dd(h)}</span>`).join("")}<span class="ct-zbir">čitanja</span></div>` +
      spisak.map((d) => `<div class="ct-red" role="row"><span class="ct-dan">${danKratko(d.datum)}</span>${d.sati.map((s) => {
        const v = vrstaPolja(s), c = s.c[0];
        const tekst = s.c.length ? `:${dd(c.m)}${s.c.length > 1 ? "²" : ""}` : v === "nema" ? "×" : "";
        const naziv = `${danKratko(d.datum)} ${satOznaka(s.h)}: ${s.c.length ? `čitanje u ${c.t.slice(0, 5)}` : v === "nema" ? "nema čitanja" : v === "van" ? "van perioda" : "čeka se"}${s.p.length ? " · " + s.p.map((x) => C.nepravilnosti[x]).join(", ") : ""}`;
        const iz = izabran && izabran[0] === d.datum && izabran[1] === s.h;
        return `<button type="button" class="ct-polje ct-${v}${iz ? " izabrano" : ""}" data-d="${d.datum}" data-h="${s.h}" title="${naziv}" aria-label="${naziv}"${v === "van" ? " disabled" : ""}>${tekst}</button>`;
      }).join("")}<span class="ct-zbir">${d.citanja}${d.nepravilnosti ? ` <b class="ct-br-nepr">${d.nepravilnosti}</b>` : ""}</span></div>`).join("");
  }
  function legenda() {
    document.getElementById("ct-legenda").innerHTML = [["ok", "čitanje u redu"], ["problem", "nepravilnost"], ["nema", "nema čitanja"], ["napomena", "napomena (npr. promena vremena)"], ["ceka", "tekući sat — čeka se"]]
      .map(([k, t]) => `<span><i class="ct-polje ct-${k}"></i>${t}</span>`).join("") + `<span class="sitno">:02 = minut čitanja · ² = dva čitanja u satu</span>`;
  }
  function detalj() {
    const el = document.getElementById("ct-detalj");
    const d = izabran && C.dani.find((x) => x.datum === izabran[0]);
    const s = d && d.sati[izabran[1]];
    if (!s) {
      el.innerHTML = `<span class="eyebrow">Detalji sata</span><p class="sitno">Klikni na polje u mreži da vidiš kada je čitano, ko je pokrenuo čitanje, koliko je star bio izvor i da li je bilo grešaka.</p>`;
      return;
    }
    const red = (k, v) => `<div class="ct-d-red"><span>${k}</span><b>${v}</b></div>`;
    el.innerHTML = `<span class="eyebrow">${NS.datumDug(d.datum)}</span><h3>${satOznaka(s.h)}</h3>
      ${s.p.length ? `<div class="ct-oznake">${s.p.map((x) => `<span class="znacka z-delimicno" title="${C.nepravilnosti[x]}">${C.nepravilnosti[x]}</span>`).join("")}</div>` : s.c.length ? `<div class="ct-oznake"><span class="znacka z-radi">u redu</span></div>` : ""}
      ${s.napomena ? `<p class="sitno ct-napomena">${s.napomena}</p>` : ""}
      ${s.c.map((c, i) => `<div class="ct-citanje">${s.c.length > 1 ? `<span class="eyebrow">Čitanje ${i + 1}</span>` : ""}
        ${red("Pročitano", c.t)}${red("Pokrenuo", OKIDAC[c.okidac] || c.okidac)}
        ${red("Starost izvora", c.izvor_min == null ? "—" : `${c.izvor_min} min`)}
        ${red("Redova", `${c.n} / ${C.redova}`)}${red("Brojača „normalno“", c.normalno == null ? "—" : `${c.normalno} / ${c.n}`)}
        ${red("Izbrojano od prethodnog", c.bicikala == null ? "—" : NS.broj(c.bicikala))}
        ${red("Fajl", `<span class="mono">${c.f}.csv</span>`)}</div>`).join("") || `<p class="sitno">${s.p.includes("nema") ? "Za ovaj sat nema sačuvanog čitanja." : "Čitanje za ovaj sat još nije stiglo (očekuje se u XX:02)."}</p>`}
      ${s.g.length ? `<div class="ct-greske"><span class="eyebrow">Neuspeli pokušaji</span>${s.g.map((g) => `<div class="ct-greska"><b>${g.t}${g.metod ? ` · ${g.metod}` : ""}</b><span>${String(g.opis || "").replace(/</g, "&lt;")}</span></div>`).join("")}</div>` : ""}`;
  }
  function tabela() {
    const redovi = dani().flatMap((d) => d.sati.filter((s) => s.p.length || s.napomena).map((s) => ({ d, s })));
    document.getElementById("ct-tabela").innerHTML = redovi.length
      ? `<thead><tr><th>Dan</th><th>Sat</th><th>Šta</th></tr></thead><tbody>${redovi.map(({ d, s }) =>
        `<tr data-d="${d.datum}" data-h="${s.h}" tabindex="0"><td class="mono">${danKratko(d.datum)}</td><td class="mono">${satOznaka(s.h)}</td>
          <td>${s.p.map((x) => `<span class="znacka z-delimicno">${C.nepravilnosti[x]}</span>`).join(" ") || `<span class="znacka">${s.napomena.split(":")[0]}</span>`}</td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="sitno">Nema nepravilnosti u izabranom periodu. ✓</td></tr></tbody>`;
  }
  function izaberi(datum, h) {
    izabran = [datum, +h];
    mreza(); detalj();
  }
  function sve() { kpiRed(); mreza(); tabela(); detalj(); }

  try {
    C = await fetch(`data/citanja.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`citanja.json: ${r.status}`); return r.json(); });
    zaglavlje();
    legenda();
    NS.prekidac(document.getElementById("ct-period"), [["7", "7 dana"], ["30", "30 dana"], ["0", "sve"]], "7", (v) => { period = +v; sve(); });
    document.getElementById("ct-samo").addEventListener("change", (e) => { samoProblemi = e.target.checked; mreza(); });
    document.getElementById("ct-mreza").addEventListener("click", (e) => { const b = e.target.closest(".ct-polje[data-d]"); if (b) izaberi(b.dataset.d, b.dataset.h); });
    const izTabele = (e) => { const tr = e.target.closest("tr[data-d]"); if (tr) { izaberi(tr.dataset.d, tr.dataset.h); document.getElementById("ct-mreza").closest(".kartica").scrollIntoView({ behavior: "smooth", block: "start" }); } };
    document.getElementById("ct-tabela").addEventListener("click", izTabele);
    document.getElementById("ct-tabela").addEventListener("keydown", (e) => { if (e.key === "Enter") izTabele(e); });
    // početno: poslednji sat sa čitanjem
    if (C.poslednje) izabran = [C.poslednje.datum, +C.poslednje.f.slice(0, 2)];
    sve();
    LJ.pojave(main);
    LJ.osveziUzivo();
  } catch (e) {
    NS.greska(main, e);
  }
})();
