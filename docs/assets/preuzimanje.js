/* Strana „Preuzimanje podataka“: dobavljanje podataka uživo (dnevnik čitanja brojača, sat po sat, sa nepravilnostima)
   i — uskoro — paketi za preuzimanje. Podaci: data/citanja.json (pravi ga sajt.citanja posle svakog čitanja). */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const DANI_KR = ["ned", "pon", "uto", "sre", "čet", "pet", "sub"];
  const dd = (x) => String(x).padStart(2, "0");
  // kolona = sat čitanja: čitanje u 23:02 je u koloni 23 i broji bicikliste od prethodnog čitanja (22:02–23:02)
  const satOznaka = (h) => `čitanje ${dd(h)}:02`;
  const obuhvata = (h) => `${dd((h + 23) % 24)}:02–${dd(h)}:02`;
  const danKratko = (iso) => { const [g, m, d] = iso.split("-").map(Number); return `${DANI_KR[new Date(Date.UTC(g, m - 1, d)).getUTCDay()]} ${d}. ${m}.`; };
  // okidač; „?“ = procena po minutu čitanja (pre dnevnika pokretanja) — prikazuje se isto
  const OKIDAC = { "cron-job.org": "cron-job.org (XX:02)", "cron-job.org?": "cron-job.org (XX:02)", rezerva: "rezerva (XX:20)", "rezerva?": "rezerva (XX:20)", rucno: "ručno" };
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
        <div class="akcije">${LJ.uzivoZnak()}<button type="button" class="dugme malo" id="ct-admin-odjava" title="Sledeći ulaz na ovu stranu ponovo traži admin lozinku">${LJ.ik("lock")}Zaključaj admin</button></div>
      </header>
      <div class="kpi-mreza pojava" id="ct-kpi"></div>
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Dobavljanje uživo</span><h2>Svaki sat svakog dana${LJ.info("Jedno polje je jedno čitanje (kolona = sat čitanja, lokalno vreme). Broj u polju je minut čitanja — očekivano :02. Čitanje u 23:02 broji bicikliste od 22:02 do 23:02. Klikni na polje za detalje.")}</h2></div>
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
          <div class="kartica-glava"><div><span class="eyebrow">Drumski saobraćaj · na 5 minuta</span><h2>Automobili — prikupljanje${LJ.info("Poseban repozitorijum ns-trafic-data: svakih 5 minuta stanje svih traka (vozila/h, brzina, zauzetost). Polje = jedan sat; 12 čitanja na sat = ceo sat.")}</h2></div></div>
          <div id="dr-telo"><p class="sitno">Učitavanje…</p></div>
        </section>
        <section class="kartica pojava">
          <div class="kartica-glava"><div><span class="eyebrow">Podsetnik</span><h2>Tokeni za cron-job.org${LJ.info("Kad token istekne, cron-job.org dobija 401 i čitanja staju. Novi token: GitHub → Settings → Developer settings → Fine-grained tokens; datum se upisuje u data/admin.json.")}</h2></div></div>
          <div id="tk-telo"><p class="sitno">Učitavanje…</p></div>
        </section>
      </div>
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
        const naziv = `${danKratko(d.datum)}, ${satOznaka(s.h)}: ${s.c.length ? `pročitano u ${c.t.slice(0, 5)}` : v === "nema" ? "nema čitanja" : v === "van" ? "van perioda" : "čeka se"}${s.p.length ? " · " + s.p.map((x) => C.nepravilnosti[x]).join(", ") : ""}`;
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
    el.innerHTML = `<span class="eyebrow">${NS.datumDug(d.datum)}</span><h3>Čitanje u ${dd(s.h)}:02</h3>
      <p class="sitno">broji bicikliste od prethodnog čitanja: ${obuhvata(s.h)}</p>
      ${s.p.length ? `<div class="ct-oznake">${s.p.map((x) => `<span class="znacka z-delimicno" title="${C.nepravilnosti[x]}">${C.nepravilnosti[x]}</span>`).join("")}</div>` : s.c.length ? `<div class="ct-oznake"><span class="znacka z-radi">u redu</span></div>` : ""}
      ${s.napomena ? `<p class="sitno ct-napomena">${s.napomena}</p>` : ""}
      ${s.c.map((c, i) => `<div class="ct-citanje">${s.c.length > 1 ? `<span class="eyebrow">Čitanje ${i + 1}</span>` : ""}
        ${red("Pročitano", c.t)}${red("Pokrenuo", OKIDAC[c.okidac] || c.okidac)}
        ${red("Starost izvora", c.izvor_min == null ? "—" : `${c.izvor_min} min`)}
        ${red("Redova", `${c.n} / ${C.redova}`)}${red("Brojača „normalno“", c.normalno == null ? "—" : `${c.normalno} / ${c.n}`)}
        ${red("Izbrojano od prethodnog", c.bicikala == null ? "—" : NS.broj(c.bicikala))}
        ${red("Fajl", `<span class="mono ct-fajl">podaci/biciklisti/${d.datum.replace(/-/g, "/")}/${c.f}.csv</span>`)}</div>`).join("") || `<p class="sitno">${s.p.includes("nema") ? "Za ovaj sat nema sačuvanog čitanja." : "Čitanje za ovaj sat još nije stiglo (očekuje se u XX:02)."}</p>`}
      ${s.g.length ? `<div class="ct-greske"><span class="eyebrow">Neuspeli pokušaji</span>${s.g.map((g) => `<div class="ct-greska"><b>${g.t}${g.metod ? ` · ${g.metod}` : ""}</b><span>${String(g.opis || "").replace(/</g, "&lt;")}</span></div>`).join("")}</div>` : ""}`;
  }
  function tabela() {
    const redovi = dani().flatMap((d) => d.sati.filter((s) => s.p.length || s.napomena).map((s) => ({ d, s })));
    document.getElementById("ct-tabela").innerHTML = redovi.length
      ? `<thead><tr><th>Dan</th><th>Čitanje</th><th>Šta</th></tr></thead><tbody>${redovi.map(({ d, s }) =>
        `<tr data-d="${d.datum}" data-h="${s.h}" tabindex="0"><td class="mono">${danKratko(d.datum)}</td><td class="mono">${dd(s.h)}:02</td>
          <td>${s.p.map((x) => `<span class="znacka z-delimicno">${C.nepravilnosti[x]}</span>`).join(" ") || `<span class="znacka">${s.napomena.split(":")[0]}</span>`}</td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="sitno">Nema nepravilnosti u izabranom periodu. ✓</td></tr></tbody>`;
  }
  function izaberi(datum, h) {
    izabran = [datum, +h];
    mreza(); detalj();
  }
  function sve() { kpiRed(); mreza(); tabela(); detalj(); }

  // ---------------------------------------------------------------- drumski saobraćaj (ns-trafic-data) i tokeni (data/admin.json)
  const vremeLok = (iso) => new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const preMin = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `pre ${Math.max(0, m)} min` : `pre ${Math.floor(m / 60)} h ${m % 60} min`; };
  async function drumski(A) {
    const el = document.getElementById("dr-telo");
    try {
      const S = await fetch(`${A.drumski_stanje}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      const p = S.poslednje, sveze = p && Date.now() - Date.parse(p.vreme_utc) < 20 * 60000;
      // poslednja 24 lokalna sata (tekući sat je „u toku“)
      const satKljuc = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(d).replace(" ", "T");
      const sada = new Date(), mapa = Object.fromEntries((S.sati || []).map((x) => [x.sat, x]));
      const sati = Array.from({ length: 24 }, (_, i) => { const k = satKljuc(new Date(sada - (23 - i) * 3600000)); return { k, ...(mapa[k] || { citanja: 0, greske: 0 }), tekuci: i === 23 }; });
      const ukupno = sati.slice(0, 23).reduce((a, x) => a + x.citanja, 0), greske = sati.reduce((a, x) => a + x.greske, 0);
      el.innerHTML = `
        <div class="dr-red"><span>Poslednje čitanje</span><b>${p ? `${vremeLok(p.vreme_utc)} · ${preMin(p.vreme_utc)}` : "—"} ${LJ.stalnoUzivo(!!sveze, sveze ? "UŽIVO" : "KASNI")}</b></div>
        <div class="dr-red"><span>Traka u poslednjem čitanju</span><b>${p ? `${p.traka} · ${p.novih_intervala} novih intervala` : "—"}</b></div>
        <div class="dr-red"><span>Čitanja u poslednja 23 puna sata</span><b>${ukupno} od ${23 * 12}</b></div>
        <div class="dr-red"><span>Neuspela čitanja (24 h)</span><b>${greske}${S.poslednja_greska ? ` · poslednje ${vremeLok(S.poslednja_greska)}` : ""}</b></div>
        <div class="dr-sati">${sati.map((x) => `<span class="dr-sat ${x.tekuci ? "buduce" : x.citanja >= 11 ? "pun" : x.citanja ? "deo" : "prazan"}"
          title="${x.k.slice(8, 10)}. ${x.k.slice(5, 7)}. ${x.k.slice(11)} h: ${x.citanja} čitanja${x.greske ? `, ${x.greske} neuspelih` : ""}${x.tekuci ? " (u toku)" : ""}"></span>`).join("")}</div>
        <div class="dr-ose"><span>${sati[0].k.slice(11)} h</span><span>sada</span></div>`;
    } catch (e) {
      el.innerHTML = `<p class="sitno">Stanje prikupljanja trenutno nije dostupno (${String(e.message || e).slice(0, 60)}).</p>`;
    }
  }
  function tokeni(A) {
    const d = new Date(), danas = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    document.getElementById("tk-telo").innerHTML = (A.tokeni || []).map((t) => {
      const dana = Math.round((Date.parse(`${t.istice}T00:00:00Z`) - danas) / 864e5);
      const klasa = dana < 0 ? "isteklo" : dana <= 30 ? "uskoro" : "";
      return `<div class="tk-red ${klasa}"><b>${t.naziv}</b><span class="tk-dana">${dana < 0 ? "ISTEKAO" : `${NS.broj(dana)} d`}</span>
        <span class="sitno">${t.namena} · ističe ${NS.datum(t.istice)}</span></div>`;
    }).join("") || `<p class="sitno">Nema upisanih tokena.</p>`;
  }

  try {
    // i kad je sajt otključan, ova strana traži admin lozinku (assets/kapija.js)
    if (typeof KAPIJA !== "undefined") await KAPIJA.trazAdmina(main);
    C = await fetch(`data/citanja.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`citanja.json: ${r.status}`); return r.json(); });
    zaglavlje();
    legenda();
    NS.prekidac(document.getElementById("ct-period"), [["7", "7 dana"], ["30", "30 dana"], ["0", "sve"]], "7", (v) => { period = +v; sve(); });
    document.getElementById("ct-admin-odjava").addEventListener("click", () => { KAPIJA.odjaviAdmina(); location.reload(); });
    document.getElementById("ct-samo").addEventListener("change", (e) => { samoProblemi = e.target.checked; mreza(); });
    document.getElementById("ct-mreza").addEventListener("click", (e) => { const b = e.target.closest(".ct-polje[data-d]"); if (b) izaberi(b.dataset.d, b.dataset.h); });
    const izTabele = (e) => { const tr = e.target.closest("tr[data-d]"); if (tr) { izaberi(tr.dataset.d, tr.dataset.h); document.getElementById("ct-mreza").closest(".kartica").scrollIntoView({ behavior: "smooth", block: "start" }); } };
    document.getElementById("ct-tabela").addEventListener("click", izTabele);
    document.getElementById("ct-tabela").addEventListener("keydown", (e) => { if (e.key === "Enter") izTabele(e); });
    // početno: poslednji sat sa čitanjem
    if (C.poslednje) izabran = [C.poslednje.datum, +C.poslednje.f.slice(0, 2)];
    sve();
    fetch(`data/admin.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).then((A) => { tokeni(A); drumski(A); setInterval(() => drumski(A), 5 * 60000); })
      .catch(() => { document.getElementById("tk-telo").innerHTML = document.getElementById("dr-telo").innerHTML = '<p class="sitno">data/admin.json nije dostupan.</p>'; });
    LJ.pojave(main);
    LJ.osveziUzivo();
  } catch (e) {
    NS.greska(main, e);
  }
})();
