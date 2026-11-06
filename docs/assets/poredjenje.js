/* Poređenje stanica (0–4): izbor (čipovi, pretraga, mala mapa), ključni brojevi, karakter (radar), po danu (broj ili
   indeks), prosečan dan po satu, dve strane ulice (a/b), danas i sutra (prognoza), meseci kroz godine, sat × dan.
   Podaci: istorija/dnevno/<serija>.json (+ dnevno_novo.json), istorija/profili/<serija>.json, grad_dnevno.json (kiša),
   data/danas.json, data/prognoza_biciklista.json, data/mapa/voda.geojson (podloga male mape).
   Izbor se pamti u adresi: poredjenje?id=34a,23a */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const MAKS = 4;
  const INFO_KARAKTER = "Svaka osa je jedna osobina, 0–100. Jutro: udeo radnog dana od 6 do 9 h (30 % = 100). Popodne: udeo od 15 do 18 h (30 % = 100). Vikend: subota i nedelja prema radnom danu (120 % = 100). Leto: leto prema zimi (1× = 0, 3× = 100). Kiša: koliko ostaje biciklista radnim danom sa kišom (3 mm i više) prema suvom (100 % = 100). Rast: poslednjih 365 kompletnih dana prema prethodnih 365 (−40 % = 0, +40 % = 100).";
  const INFO_STRANE = "Brojači a i b stoje na dve strane iste ulice; svaki broji oba smera na svojoj strani. Po svakoj strani se uglavnom vozi u smeru saobraćaja, pa razlika između strana tokom dana pokazuje kuda se ide ujutru, a kuda popodne.";
  const INFO_INDEKS = "Indeks: 100 = prosek te stanice u prikazanom periodu. 120 znači 20 % više od njenog proseka, 80 znači 20 % manje. Tako se stanice različite veličine vide na istoj skali i porede se oblik i trend, a ne veličina.";
  const BOJE = ["--g-tip-1", "--g-tip-2", "--g-tip-3", "--g-god-3"];
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  const boja = (i) => css(BOJE[i]);
  const bezK = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");

  let s, N;
  try { [s, N] = await Promise.all([NS.stanice(), NS.json("dnevno_novo.json").catch(() => null)]); } catch (e) { NS.greska(main, e); return; }
  const po = Object.fromEntries(s.serije.map((r) => [r.serija, r]));
  const ime = (k) => `${k} · ${po[k].naziv}`;

  // ---------------------------------------------------------------- izbor (adresa)
  const qId = new URLSearchParams(location.search).get("id");
  const izAdrese = (qId || "").split(",").map((x) => x.trim()).filter((k) => po[k]);
  const najprometnije = () => [...s.serije].filter((r) => r.prosek_12m != null && r.stanje !== "neispravan").sort((a, b) => b.prosek_12m - a.prosek_12m).map((r) => r.serija);
  let izabrane = [...new Set(izAdrese)].slice(0, MAKS);
  if (qId == null && !izabrane.length) izabrane = po["34a"] && po["23a"] ? ["34a", "23a"] : najprometnije().slice(0, 2);
  const upisiAdresu = () => history.replaceState(null, "", `${location.pathname}?id=${izabrane.join(",")}`);

  // ---------------------------------------------------------------- podaci po stanici (keš)
  const kes = {};
  /** dnevno (istorija + dnevno_novo do juče) i profil */
  function podaci(k) {
    return (kes[k] ||= Promise.all([NS.json(`dnevno/${k}.json`), NS.json(`profili/${k}.json`)]).then(([d, p]) => {
      const v = [...d.v];
      const x = N && N.od && N.serije[k];
      if (x) for (let iso = NS.dodajDane(d.od, v.length); iso <= N.do; iso = NS.dodajDane(iso, 1)) {
        const j = NS.razlikaDana(N.od, iso);
        v.push(j >= 0 && j < x.v.length ? x.v[j] : null);
      }
      return { k, od: d.od, v, p };
    }));
  }

  // ---------------------------------------------------------------- kostur strane
  main.innerHTML = `
    <header class="zaglavlje-strane pojava">
      <div><span class="eyebrow">Podaci</span><h1>Poređenje <em>stanica</em></h1></div>
    </header>
    <section class="kartica pojava pr-izbor">
      <div class="pr-izbor-levo">
        <div class="pr-izabrane" id="pr-izabrane"></div>
        <div class="pr-brzo" id="pr-brzo"></div>
      </div>
    </section>
    <section class="kartica pojava pr-prazno" id="pr-prazno" hidden>
      <span class="ikona-velika">${LJ.ik("compare") || ""}</span>
      <div><h2>Nijedna stanica nije izabrana</h2><p class="opis">Za prikaz mora biti izabrana bar jedna stanica — dodaj je iznad („+ Dodaj stanicu“) ili izaberi brzo.</p></div>
    </section>
    <div class="pr-sadrzaj" id="pr-sadrzaj">
    <div class="mreza-2">
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Ukratko</span><h2>Ključni brojevi</h2></div></div>
        <div class="tabela-omot pr-tabela-omot"><table class="tabela pr-tabela" id="pr-tabela"></table></div>
      </section>
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Karakter</span><h2>Kakva je koja stanica${LJ.info(INFO_KARAKTER)}</h2></div></div>
        <div class="grafik pr-radar" id="pr-karakter"></div>
        <div class="pr-karakter-opis" id="pr-karakter-opis"></div>
      </section>
    </div>
    <section class="kartica pojava">
      <div class="kartica-glava">
        <div><span class="eyebrow">Po danu</span><h2>Biciklisti kroz vreme${LJ.info(INFO_INDEKS)}</h2>
          <p class="opis" id="pr-dan-opis"></p></div>
        <div class="pr-kontrole"><div id="pr-gustina"></div><div id="pr-mera"></div>
          <label class="red-izbora pr-zajedno"><input type="checkbox" id="pr-zajedno"><span>samo dani kada sve rade</span></label></div>
      </div>
      <div class="grafik pr-dan-g" id="pr-dan"></div>
    </section>
    <div class="mreza-2">
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Ritam dana</span><h2>Prosečan dan po satu</h2><p class="opis" id="pr-sat-opis"></p></div>
        </div>
        <div class="pr-kontrole pr-jedan-red"><div id="pr-tip"></div><select id="pr-sezona" aria-label="Godišnje doba"></select><div id="pr-sat-mera"></div></div>
        <div class="grafik" id="pr-sat"></div>
      </section>
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Dve strane ulice</span><h2 id="pr-strane-naslov">Strana a i strana b${LJ.info(INFO_STRANE)}</h2><p class="opis" id="pr-strane-opis"></p></div>
          <div class="pr-kontrole"><div id="pr-strane-izbor"></div></div>
        </div>
        <div class="grafik" id="pr-strane"></div>
        <div class="pr-strane-prazno sitno" id="pr-strane-prazno" hidden></div>
      </section>
    </div>
    <div class="mreza-2">
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Danas</span><h2 id="pr-danas-naslov">Danas</h2><p class="opis" id="pr-danas-opis"></p></div></div>
        <div class="grafik pr-mali" id="pr-danas"></div>
      </section>
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Prognoza</span><h2 id="pr-sutra-naslov">Sutra</h2><p class="opis" id="pr-sutra-opis"></p></div></div>
        <div class="grafik pr-mali" id="pr-sutra"></div>
      </section>
    </div>
    <div class="mreza-2">
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Godine</span><h2>Prosečan dan u mesecu${LJ.info(INFO_INDEKS)}</h2></div>
          <div class="pr-kontrole"><div id="pr-mes-mera"></div></div>
        </div>
        <div class="grafik" id="pr-mes"></div>
      </section>
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Nedelja</span><h2>Sat × dan u nedelji${LJ.info("Prosečan broj biciklista u satu, ceo period. Svaka stanica je u svojoj skali: najsvetlije polje je njen najprometniji sat.")}</h2></div></div>
        <div class="pr-toplote" id="pr-toplote" data-n="2">${[0, 1, 2, 3].map((i) => `<div class="pr-toplota" data-i="${i}"><div class="pr-toplota-ime"></div><div class="grafik pr-toplota-g"></div></div>`).join("")}</div>
      </section>
    </div>
    </div>`;

  // ---------------------------------------------------------------- izbor stanica: čipovi, dodavanje, brzi izbori
  const izbEl = document.getElementById("pr-izabrane"), brzoEl = document.getElementById("pr-brzo");
  let mapaOtvorena = false;
  // klik van mape je zatvara; klik na tačku ponovo nacrta izbor (tačka tada više nije u strani), pa se takav klik ne računa
  document.addEventListener("click", (e) => { if (mapaOtvorena && e.target.isConnected && !e.target.closest(".pr-mapa-omot")) { mapaOtvorena = false; const p = document.querySelector(".pr-mapa-panel"); if (p) p.remove(); const b = document.getElementById("pr-na-mapi"); if (b) b.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && mapaOtvorena) { mapaOtvorena = false; crtajIzbor(); } });
  function crtajIzbor() {
    izbEl.innerHTML = izabrane.map((k, i) => `<span class="pr-cip" style="--boja:var(${BOJE[i]})"><i></i>
        <a href="stanica?id=${encodeURIComponent(k)}">${ime(k)}</a>
        <button type="button" data-ukloni="${k}" aria-label="Ukloni ${k}" title="Ukloni">×</button></span>`).join("") +
      (izabrane.length < MAKS ? `<span class="padajuce"><button type="button" class="dugme malo" id="pr-dodaj">+ Dodaj stanicu</button></span>` : "") +
      `<span class="padajuce pr-mapa-omot"><button type="button" class="dugme malo" id="pr-na-mapi" aria-expanded="${mapaOtvorena}" title="Odaberi stanice na mapi">${LJ.ik("map")}Na mapi</button></span>`;
    const parovi = izabrane.map((k) => k.replace(/[ab]$/, (c) => (c === "a" ? "b" : "a"))).filter((k) => po[k] && !izabrane.includes(k));
    brzoEl.innerHTML = `<span class="sitno">Brzo:</span>` +
      (parovi.length && izabrane.length < MAKS ? `<button type="button" class="dugme malo" data-brzo="par">druga strana ulice (${parovi.slice(0, MAKS - izabrane.length).join(", ")})</button>` : "") +
      `<button type="button" class="dugme malo" data-brzo="top">najprometnije dve</button>` +
      `<button type="button" class="dugme malo" data-brzo="ab">obe strane najprometnije ulice</button>`;
    const d = document.getElementById("pr-dodaj");
    if (d) d.addEventListener("click", otvoriDodavanje);
    document.getElementById("pr-na-mapi").addEventListener("click", (e) => { e.stopPropagation(); mapaOtvorena = !mapaOtvorena; if (mapaOtvorena) document.querySelectorAll(".padajuce .panel").forEach((p) => p.remove()); crtajIzbor(); });
    if (mapaOtvorena) {   // panel sa mapom ostaje otvoren dok se biraju stanice (zatvara ga dugme, Esc ili klik van)
      const p = document.createElement("div");
      p.className = "panel pr-mapa-panel";
      p.innerHTML = `<div class="pr-mapa" id="pr-mapa"></div><p class="sitno">Klik na mesto doda stanicu (a, pa b); kad su sve izabrane, klik ih uklanja.</p>`;
      document.querySelector(".pr-mapa-omot").appendChild(p);
      osveziMapu();
    }
  }
  function otvoriDodavanje(e) {
    e.stopPropagation();
    const omot = e.currentTarget.parentElement, stari = omot.querySelector(".panel");
    document.querySelectorAll(".padajuce .panel").forEach((p) => p.remove());
    mapaOtvorena = false; const bm = document.getElementById("pr-na-mapi"); if (bm) bm.setAttribute("aria-expanded", "false");
    if (stari) return;
    const p = document.createElement("div");
    p.className = "panel izbor-stanica";
    p.innerHTML = `<input type="search" placeholder="Pretraži stanice…" aria-label="Pretraga stanica">
      <div class="spisak-izbora">${s.serije.filter((r) => !izabrane.includes(r.serija)).map((r) => `<button type="button" class="red-izbora pr-red" data-dodaj="${r.serija}" data-t="${bezK(`${r.serija} ${r.naziv}`)}">
        <img src="${NS.pin(r.stanje)}" alt=""><span>${r.serija} · ${r.naziv}</span>${r.prosek_12m != null ? `<small>${NS.broj(r.prosek_12m)}/dan</small>` : ""}</button>`).join("")}</div>`;
    omot.appendChild(p);
    const q = p.querySelector("input");
    q.focus();
    q.addEventListener("input", () => { const t = bezK(q.value); p.querySelectorAll("[data-dodaj]").forEach((x) => { x.style.display = !t || x.dataset.t.includes(t) ? "" : "none"; }); });
    p.addEventListener("click", (ev) => { const b = ev.target.closest("[data-dodaj]"); if (b) { ev.stopPropagation(); p.remove(); postavi([...izabrane, b.dataset.dodaj]); } });
  }
  izbEl.addEventListener("click", (e) => { const b = e.target.closest("[data-ukloni]"); if (b) postavi(izabrane.filter((k) => k !== b.dataset.ukloni)); });
  brzoEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-brzo]"); if (!b) return;
    if (b.dataset.brzo === "top") postavi(najprometnije().slice(0, 2));
    else if (b.dataset.brzo === "par") {
      const parovi = izabrane.map((k) => k.replace(/[ab]$/, (c) => (c === "a" ? "b" : "a"))).filter((k) => po[k] && !izabrane.includes(k));
      postavi([...izabrane, ...parovi].slice(0, MAKS));
    } else {
      const k = najprometnije().find((x) => /a$/.test(x) && po[x.replace(/a$/, "b")]);
      if (k) postavi([k, k.replace(/a$/, "b")]);
    }
  });

  // ---------------------------------------------------------------- kontrole grafika
  let gustina = "nedelja", mera = "broj", zajedno = false, tip = "radni", sezona = "ukupno", satMera = "broj", mesMera = "broj";
  NS.prekidac(document.getElementById("pr-gustina"), [["dan", "Dan"], ["nedelja", "Nedelja"], ["mesec", "Mesec"]], gustina, (v) => { gustina = v; gDan.osvezi(); });
  NS.prekidac(document.getElementById("pr-mera"), [["broj", "Broj"], ["indeks", "Indeks"]], mera, (v) => { mera = v; opisDan(); gDan.osvezi(); });
  document.getElementById("pr-zajedno").addEventListener("change", (e) => { zajedno = e.target.checked; gDan.osvezi(); });
  NS.prekidac(document.getElementById("pr-tip"), [["radni", "Radni dan"], ["subota", "Subota"], ["nedelja_praznik", "Nedelja i praznik"]], tip, (v) => { tip = v; gSat.osvezi(); });
  const sez = document.getElementById("pr-sezona");
  sez.innerHTML = [["ukupno", "Cela godina"], ["zima", "Zima"], ["prolece", "Proleće"], ["leto", "Leto"], ["jesen", "Jesen"]].map(([k, t]) => `<option value="${k}">${t}</option>`).join("");
  sez.addEventListener("change", () => { sezona = sez.value; gSat.osvezi(); });
  NS.prekidac(document.getElementById("pr-sat-mera"), [["broj", "Broj"], ["udeo", "% dana"]], satMera, (v) => { satMera = v; opisSat(); gSat.osvezi(); });
  NS.prekidac(document.getElementById("pr-mes-mera"), [["broj", "Broj"], ["indeks", "Indeks"]], mesMera, (v) => { mesMera = v; gMes.osvezi(); });
  const opisDan = () => { document.getElementById("pr-dan-opis").textContent = mera === "indeks"
    ? "Indeks: 100 = prosek te stanice u prikazanom periodu — stanice različite veličine na istoj skali."
    : "Dnevni zbir (nedelja i mesec: prosečan dan). Gde nema kompletnih podataka linija se prekida."; };
  const opisSat = () => { document.getElementById("pr-sat-opis").textContent = satMera === "udeo"
    ? "Koliki deo dana prođe u kom satu." : "Prosečan broj biciklista u satu."; };
  opisDan(); opisSat();

  let D = [];                                      // podaci izabranih, istim redom
  const naziv = (i) => izabrane[i];

  // ---------------------------------------------------------------- ključni brojevi
  function tabela() {
    const red = (t, f, info) => `<tr><th scope="row">${t}${info ? LJ.info(info) : ""}</th>${D.map((d, i) => `<td>${f(d, i)}</td>`).join("")}</tr>`;
    const vrh = (niz, od, doS) => { let m = -1, h = null; for (let x = od; x <= doS; x++) if (niz && niz[x] != null && niz[x] > m) { m = niz[x]; h = x; } return h == null ? "—" : `${NS.dvaMesta(h)}–${NS.dvaMesta(h + 1)} h`; };
    const stat = (d) => {
      let max = null, kad = null, n = 0;
      const zadnjih = [], vik = [], rad = [];
      d.v.forEach((v, i) => { if (v == null) return; n++; if (max == null || v > max) { max = v; kad = NS.dodajDane(d.od, i); } });
      for (let i = d.v.length - 1; i >= 0 && zadnjih.length < 365; i--) if (d.v[i] != null) {
        zadnjih.push(d.v[i]);
        const dn = NS.danUNedelji(NS.dodajDane(d.od, i));
        (dn === 0 || dn === 6 ? vik : rad).push(d.v[i]);
      }
      const sr = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      return { max, kad, n, uk: d.v.length, vikend: sr(vik) && sr(rad) ? sr(vik) / sr(rad) : null };
    };
    const st = D.map(stat);
    const r = (i) => po[izabrane[i]];
    document.getElementById("pr-tabela").innerHTML = `<thead><tr><th></th>${D.map((d, i) => `<th scope="col"><span class="pr-glava" style="--boja:var(${BOJE[i]})"><i></i>${d.k}</span><small>${po[d.k].naziv}</small></th>`).join("")}</tr></thead><tbody>` +
      red("Prosek dnevno", (d, i) => r(i).prosek_12m != null ? `<b>${NS.broj(r(i).prosek_12m)}</b>` : "—", "Prosečan kompletan dan, 1. 9. 2025. – 31. 8. 2026.") +
      red("Rekordan dan", (d, i) => st[i].max != null ? `<b>${NS.broj(st[i].max)}</b><small>${NS.datum(st[i].kad)}</small>` : "—") +
      red("Vikend prema radnom danu", (d, i) => st[i].vikend != null ? `<b>${NS.broj(Math.round(100 * st[i].vikend))} %</b><small>${st[i].vikend >= 0.85 ? "rekreacija" : st[i].vikend <= 0.65 ? "posao, škola" : "mešovito"}</small>` : "—",
        "Prosečna subota i nedelja prema prosečnom radnom danu, poslednjih 365 kompletnih dana. Do 65 % = stanica „za posao, školu“, od 85 % = „za rekreaciju“, između = mešovito.") +
      red("Jutarnji vrh (radni dan)", (d) => vrh(d.p.profil.ukupno.radni, 5, 11)) +
      red("Popodnevni vrh (radni dan)", (d) => vrh(d.p.profil.ukupno.radni, 12, 21)) +
      red("Kompletnih dana", (d, i) => `<b>${NS.broj(Math.round(100 * (r(i).udeo_validnih_dana || 0)))} %</b><small>${NS.broj(st[i].n)} dana sa podacima</small>`) +
      red("Radi od", (d, i) => `${NS.datum(r(i).od)}<small><span class="znacka tacka z-${r(i).stanje}">${s.stanja[r(i).stanje]}</span></small>`) +
      "</tbody>";
    LJ.pojave(document.getElementById("pr-tabela"));
  }

  // ---------------------------------------------------------------- po danu
  function nizovi() {
    const od = D.reduce((a, d) => (d.od < a ? d.od : a), D[0].od);
    const kraj = D.reduce((a, d) => { const k = NS.dodajDane(d.od, d.v.length - 1); return k > a ? k : a; }, od);
    const n = NS.razlikaDana(od, kraj) + 1;
    let v = D.map((d) => { const a = Array(n).fill(null), p = NS.razlikaDana(od, d.od); d.v.forEach((x, i) => { a[p + i] = x; }); return a; });
    if (zajedno) v = v.map((a) => a.map((x, i) => (v.every((b) => b[i] != null) ? x : null)));
    return { od, v };
  }
  const gDan = NS.grafik(document.getElementById("pr-dan"), (b) => {
    if (!D.length) return {};
    const { od, v } = nizovi();
    const g = v.map((a) => NS.grupisi(od, a, gustina, gustina === "mesec" ? 10 : 4));
    const x = g[0].x;
    const vr = g.map((gg) => {
      if (mera !== "indeks") return gg.v;
      const ok = gg.v.filter((y) => y != null), sr = ok.reduce((a, y) => a + y, 0) / (ok.length || 1);
      return gg.v.map((y) => (y == null ? null : Math.round((100 * y) / sr)));
    });
    return {
      ...NS.osnova(b),
      legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: b["ink-2"], fontSize: 12 } },
      grid: { left: 58, right: 16, top: 34, bottom: 64 },
      xAxis: { type: "category", data: x, boundaryGap: gustina !== "dan",
        ...NS.osaX(b, { axisLabel: { color: b["ink-3"], hideOverlap: true, fontSize: 11, formatter: (k) => (gustina === "mesec" ? k.replace("-", ". ") : NS.datum(k).slice(0, -1)) } }) },
      yAxis: { type: "value", name: mera === "indeks" ? "indeks (prosek = 100)" : gustina === "dan" ? "biciklista dnevno" : "prosečan dan", ...NS.osaY(b) },
      dataZoom: [{ type: "inside", start: gustina === "dan" ? 80 : 0 }, { type: "slider", bottom: 8, height: 22, start: gustina === "dan" ? 80 : 0, borderColor: b.osa, fillerColor: "rgba(127,127,127,0.14)",
        dataBackground: { lineStyle: { color: b.osa }, areaStyle: { color: b.mreza } }, textStyle: { color: b["ink-3"] },
        labelFormatter: (_, k) => (k ? (gustina === "mesec" ? NS.mesecNaziv(k) : NS.datum(k)) : "") }],
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${NS.oznakaPerioda(x[q[0].dataIndex], gustina)}</b><br>` + q.map((p) =>
        `${p.marker}${p.seriesName}: <b>${p.value == null ? "—" : mera === "indeks" ? p.value : NS.broj(p.value)}</b>`).join("<br>") },
      series: vr.map((a, i) => ({ name: naziv(i), type: "line", data: a, showSymbol: gustina === "mesec", symbolSize: 5, connectNulls: false,
        lineStyle: { width: gustina === "dan" ? 1.2 : 2, color: boja(i) }, itemStyle: { color: boja(i) } })),
    };
  });

  // ---------------------------------------------------------------- prosečan dan po satu
  const SATI = Array.from({ length: 24 }, (_, h) => NS.dvaMesta(h));
  const gSat = NS.grafik(document.getElementById("pr-sat"), (b) => {
    if (!D.length) return {};
    const nizovi = D.map((d) => {
      const a = ((d.p.profil[sezona] || {})[tip] || []).slice(0, 24);
      if (satMera !== "udeo") return a.map((y) => (y == null ? null : Math.round(y)));
      const z = a.reduce((x, y) => x + (y || 0), 0);
      return a.map((y) => (y == null || !z ? null : +((100 * y) / z).toFixed(1)));
    });
    return {
      ...NS.osnova(b),
      legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: b["ink-2"], fontSize: 12 } },
      grid: { left: 46, right: 12, top: 34, bottom: 28 },
      xAxis: { type: "category", data: SATI, ...NS.osaX(b) },
      yAxis: { type: "value", ...NS.osaY(b, satMera === "udeo" ? { axisLabel: { color: b["ink-3"], formatter: "{value} %" } } : {}) },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${SATI[q[0].dataIndex]}–${NS.dvaMesta(q[0].dataIndex + 1)} h</b><br>` +
        q.map((p) => `${p.marker}${p.seriesName}: <b>${p.value == null ? "—" : satMera === "udeo" ? `${NS.dec(p.value)} %` : NS.broj(p.value)}</b>`).join("<br>") },
      series: nizovi.map((a, i) => ({ name: naziv(i), type: "line", data: a, smooth: 0.3, symbol: "none", lineStyle: { width: 2.4, color: boja(i) }, itemStyle: { color: boja(i) },
        areaStyle: { color: boja(i), opacity: 0.06 } })),
    };
  });

  // ---------------------------------------------------------------- meseci kroz godine
  const gMes = NS.grafik(document.getElementById("pr-mes"), (b) => {
    if (!D.length) return {};
    const god = [...new Set(D.flatMap((d) => Object.keys(d.p.meseci_po_godinama)))].sort();
    const x = god.flatMap((g) => NS.MESECI_KRATKO.map((m, i) => [g, i]));
    const serije = D.map((d) => x.map(([g, i]) => { const a = d.p.meseci_po_godinama[g]; return a ? a[i] ?? null : null; }));
    // prazni meseci na početku i kraju (pre prve / posle poslednje stanice) se ne prikazuju
    let p0 = 0, p1 = x.length - 1;
    while (p0 < p1 && serije.every((a) => a[p0] == null)) p0++;
    while (p1 > p0 && serije.every((a) => a[p1] == null)) p1--;
    const xs = x.slice(p0, p1 + 1), vr = serije.map((a) => {
      const z = a.slice(p0, p1 + 1);
      if (mesMera !== "indeks") return z;
      const ok = z.filter((y) => y != null), sr = ok.reduce((q, y) => q + y, 0) / (ok.length || 1);
      return z.map((y) => (y == null ? null : Math.round((100 * y) / sr)));
    });
    return {
      ...NS.osnova(b),
      legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: b["ink-2"], fontSize: 12 } },
      grid: { left: 50, right: 12, top: 34, bottom: 28 },
      xAxis: { type: "category", data: xs.map(([g, i]) => `${NS.MESECI_KRATKO[i]} ${g}`), ...NS.osaX(b, { axisLabel: { color: b["ink-3"], hideOverlap: true, fontSize: 11 } }) },
      yAxis: { type: "value", ...NS.osaY(b) },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${NS.MESECI[xs[q[0].dataIndex][1]]} ${xs[q[0].dataIndex][0]}.</b><br>` +
        q.map((p) => `${p.marker}${p.seriesName}: <b>${p.value == null ? "—" : NS.broj(p.value)}</b>`).join("<br>") },
      series: vr.map((a, i) => ({ name: naziv(i), type: "line", data: a, connectNulls: false, symbol: "circle", symbolSize: 4, lineStyle: { width: 2, color: boja(i) }, itemStyle: { color: boja(i) } })),
    };
  });

  // ---------------------------------------------------------------- sat × dan u nedelji (mala toplotna mapa po stanici)
  const toplote = [...document.querySelectorAll(".pr-toplota")].map((el, i) => {
    const g = NS.grafik(el.querySelector(".pr-toplota-g"), (b) => {
      const d = D[i];
      if (!d) return {};
      const m = d.p.toplotna_mapa, maks = Math.max(1, ...m.flat().filter((y) => y != null));
      const podaci = [];
      m.forEach((red, dan) => red.forEach((y, h) => podaci.push([h, dan, y == null ? null : Math.round(y)])));
      return {
        ...NS.osnova(b),
        grid: { left: 34, right: 6, top: 4, bottom: 22 },
        xAxis: { type: "category", data: SATI, splitArea: { show: false }, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], fontSize: 10, interval: 5 } }) },
        yAxis: { type: "category", data: NS.DANI_KRATKO, inverse: true, ...NS.osaX(b, { axisLine: { show: false }, axisLabel: { color: b["ink-3"], fontSize: 10 } }) },
        visualMap: { show: false, min: 0, max: maks, inRange: { color: [b["top-0"], boja(i)] } },
        tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => `<b>${NS.DANI_KRATKO[p.value[1]]}, ${SATI[p.value[0]]}–${NS.dvaMesta(p.value[0] + 1)} h</b><br>${d.k}: <b>${p.value[2] == null ? "—" : NS.broj(p.value[2])}</b> u satu` },
        series: [{ type: "heatmap", data: podaci, itemStyle: { borderColor: b.povrsina, borderWidth: 1, borderRadius: 2 } }],
      };
    });
    // grafik je možda nacrtan dok je raspored bio drugačiji (2 → 4 stanice): uvek prati svoju veličinu
    const gEl = el.querySelector(".pr-toplota-g");
    let w = 0, h = 0;
    new ResizeObserver(() => { if (gEl.clientWidth !== w || gEl.clientHeight !== h) { w = gEl.clientWidth; h = gEl.clientHeight; if (g.ec && w) g.ec.resize(); } }).observe(gEl);
    return { el, g };
  });

  // ---------------------------------------------------------------- karakter (radar)
  let gradP = null;
  const ucitajGrad = () => (gradP ||= NS.json("grad_dnevno.json").catch(() => null));
  const zbir = (a, od, doS) => { let z = 0; for (let h = od; h <= doS; h++) z += (a && a[h]) || 0; return z; };
  const sr = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  /** sirove osobine stanice: jutro i popodne (udeo radnog dana), vikend, leto/zima, kiša, rast */
  function osobine(d, G) {
    const rad = d.p.profil.ukupno.radni, uk = zbir(rad, 0, 23) || 1;
    const leto = zbir(d.p.profil.leto.radni, 0, 23), zima = zbir(d.p.profil.zima.radni, 0, 23);
    const praznik = new Set(G ? G.praznik.map((i) => NS.dodajDane(G.od, i)) : []);
    const pad = (iso) => {
      if (G && iso <= G.do) { const j = NS.razlikaDana(G.od, iso); return j >= 0 ? G.pad[j] : null; }
      if (N && N.od && iso >= N.od) { const j = NS.razlikaDana(N.od, iso); return N.vreme.pad[j] ?? null; }
      return null;
    };
    const zadnjih = [], pre = [], vik = [], radD = [], kisni = [], suvi = [];
    for (let i = d.v.length - 1; i >= 0; i--) {
      const v = d.v[i]; if (v == null) continue;
      const iso = NS.dodajDane(d.od, i), dn = NS.danUNedelji(iso);
      if (zadnjih.length < 365) { zadnjih.push(v); (dn === 0 || dn === 6 ? vik : radD).push(v); } else if (pre.length < 365) pre.push(v);
      if (dn !== 0 && dn !== 6 && !praznik.has(iso)) { const p = pad(iso); if (p != null) { if (p >= 3) kisni.push(v); else if (p < 0.2) suvi.push(v); } }
    }
    return {
      jutro: zbir(rad, 6, 8) / uk, popodne: zbir(rad, 15, 17) / uk,
      vikend: sr(vik) && sr(radD) ? sr(vik) / sr(radD) : null,
      leto: zima ? leto / zima : null,
      kisa: kisni.length >= 8 && suvi.length >= 30 ? sr(kisni) / sr(suvi) : null,
      rast: zadnjih.length >= 200 && pre.length >= 200 ? sr(zadnjih) / sr(pre) - 1 : null,
    };
  }
  const OSE = [
    ["Jutro", (o) => o.jutro / 0.3, (o) => `${NS.broj(Math.round(100 * o.jutro))} % dana od 6 do 9 h`],
    ["Popodne", (o) => o.popodne / 0.3, (o) => `${NS.broj(Math.round(100 * o.popodne))} % dana od 15 do 18 h`],
    ["Vikend", (o) => o.vikend / 1.2, (o) => o.vikend == null ? "—" : `vikend ${NS.broj(Math.round(100 * o.vikend))} % radnog dana`],
    ["Leto", (o) => (o.leto - 1) / 2, (o) => o.leto == null ? "—" : `leto ${NS.dec(o.leto)}× zima`],
    ["Kiša", (o) => o.kisa, (o) => o.kisa == null ? "—" : `po kiši ${NS.broj(Math.round(100 * o.kisa))} % suvog dana`],
    ["Rast", (o) => (o.rast + 0.4) / 0.8, (o) => o.rast == null ? "—" : `${o.rast >= 0 ? "+" : "−"}${NS.broj(Math.abs(Math.round(100 * o.rast)))} % prema prošloj godini`],
  ];
  const ogr = (x) => (x == null || !isFinite(x) ? 0 : Math.max(0, Math.min(100, Math.round(100 * x))));
  let OS = [];
  const gKar = NS.grafik(document.getElementById("pr-karakter"), (b) => {
    if (!OS.length) return {};
    return {
      ...NS.osnova(b),
      tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => `<b>${p.name}</b><br>` + OSE.map(([t, , opis]) => `${t}: ${opis(OS[izabrane.indexOf(p.name)])}`).join("<br>") },
      radar: { indicator: OSE.map(([name]) => ({ name, max: 100 })), radius: "68%", center: ["50%", "54%"], splitNumber: 4,
        axisName: { color: b["ink-2"], fontSize: 11.5 }, splitLine: { lineStyle: { color: b.mreza } }, splitArea: { show: false }, axisLine: { lineStyle: { color: b.mreza } } },
      series: [{ type: "radar", symbolSize: 4, data: OS.map((o, i) => ({ name: naziv(i), value: OSE.map(([, f]) => ogr(f(o))),
        lineStyle: { color: boja(i), width: 2 }, itemStyle: { color: boja(i) }, areaStyle: { color: boja(i), opacity: 0.12 } })) }],
    };
  });
  function karakter() {
    const tip = (o) => (o.vikend >= 0.85 ? "rekreacija" : o.vikend != null && o.vikend <= 0.65 ? "posao, škola" : "mešovito");   // isti pragovi kao u tabeli
    document.getElementById("pr-karakter-opis").innerHTML = OS.map((o, i) => `<div><span class="pr-glava" style="--boja:var(${BOJE[i]})"><i></i>${naziv(i)}</span>
      <b>${tip(o)}</b>${o.leto != null ? ` · leto ${NS.dec(o.leto)}× zima` : ""}${o.kisa != null ? ` · po kiši ${NS.broj(Math.round(100 * o.kisa))} %` : ""}${o.rast != null ? ` · ${o.rast >= 0 ? "+" : "−"}${NS.broj(Math.abs(Math.round(100 * o.rast)))} % godišnje` : ""}</div>`).join("");
  }

  // ---------------------------------------------------------------- dve strane ulice (a i b)
  let strMesto = null;
  const mestaParova = () => [...new Set(izabrane.map((k) => k.replace(/[ab]$/, "")))].filter((m) => po[`${m}a`] && po[`${m}b`]);
  const smer = (k) => (po[k].smerovi[0] || "").replace(/\s*\(u oba smera\)\s*/, "").replace(" – ", " → ");
  let STR = null;
  const gStr = NS.grafik(document.getElementById("pr-strane"), (b) => {
    if (!STR) return {};
    const { a, bb, m } = STR, ba = boja(Math.max(0, izabrane.indexOf(`${m}a`))), bbB = izabrane.includes(`${m}b`) ? boja(izabrane.indexOf(`${m}b`)) : b["ink-3"];
    const udeo = a.map((x, h) => { const z = (x || 0) + (bb[h] || 0); return z ? +((100 * (x || 0)) / z).toFixed(1) : null; });
    return {
      ...NS.osnova(b),
      legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: b["ink-2"], fontSize: 12 } },
      grid: { left: 40, right: 12, top: 34, bottom: 28 },
      xAxis: { type: "category", data: SATI, ...NS.osaX(b) },
      yAxis: { type: "value", max: 100, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => { const h = q[0].dataIndex;
        return `<b>${SATI[h]}–${NS.dvaMesta(h + 1)} h</b> · radni dan<br>${q.map((p) => `${p.marker}${p.seriesName}: <b>${NS.dec(p.value)} %</b>`).join("<br>")}<br><span style="color:${b["ink-3"]}">prosečno ${NS.broj(Math.round(a[h] || 0))} + ${NS.broj(Math.round(bb[h] || 0))} u satu</span>`; } },
      series: [
        { name: `${m}a`, type: "bar", stack: "s", data: udeo, barCategoryGap: "18%", itemStyle: { color: ba } },
        { name: `${m}b`, type: "bar", stack: "s", data: udeo.map((x) => (x == null ? null : +(100 - x).toFixed(1))), itemStyle: { color: bbB, borderRadius: [3, 3, 0, 0] } },
      ],
    };
  });
  async function strane() {
    const mesta = mestaParova(), izb = document.getElementById("pr-strane-izbor"), prazno = document.getElementById("pr-strane-prazno"), el = document.getElementById("pr-strane");
    if (!mesta.length) {
      STR = null; el.hidden = true; izb.innerHTML = ""; document.getElementById("pr-strane-opis").textContent = "";
      prazno.hidden = false;
      prazno.innerHTML = `Nijedna izabrana stanica nema brojač i na drugoj strani ulice. Takve su: ${s.serije.filter((r) => /a$/.test(r.serija) && po[r.serija.replace(/a$/, "b")]).map((r) => `<button type="button" class="veza-dugme" data-par="${r.serija.replace(/a$/, "")}">${r.serija.replace(/a$/, "")} · ${r.naziv}</button>`).join(", ")}.`;
      return;
    }
    el.hidden = false; prazno.hidden = true;
    if (!mesta.includes(strMesto)) strMesto = mesta[0];
    izb.innerHTML = "";
    if (mesta.length > 1) NS.prekidac(izb, mesta.map((m) => [m, m]), strMesto, (v) => { strMesto = v; strane(); });
    const m = strMesto, [pa, pb] = await Promise.all([podaci(`${m}a`), podaci(`${m}b`)]);
    if (m !== strMesto) return;
    const a = pa.p.profil.ukupno.radni, bb = pb.p.profil.ukupno.radni;
    STR = { a, bb, m };
    const ud = (od, doS) => { const x = zbir(a, od, doS), y = zbir(bb, od, doS); return x + y ? Math.round((100 * x) / (x + y)) : null; };
    const j = ud(6, 8), p = ud(15, 17), c = ud(0, 23);
    document.getElementById("pr-strane-naslov").firstChild.textContent = `${m} · ${po[`${m}a`].naziv}`;
    document.getElementById("pr-strane-opis").innerHTML = `strana <b>a</b>: ${smer(`${m}a`)} · strana <b>b</b>: ${smer(`${m}b`)}<br>` +
      (j != null && p != null ? `Na strani a radnim danom: ceo dan <b>${c} %</b>, ujutru (6–9 h) <b>${j} %</b>, popodne (15–18 h) <b>${p} %</b>.` : "");
    gStr.osvezi();
    requestAnimationFrame(() => gStr.ec && gStr.ec.resize());
  }
  document.getElementById("pr-strane-prazno").addEventListener("click", (e) => {
    const b = e.target.closest("[data-par]"); if (!b) return;
    postavi([...izabrane, `${b.dataset.par}a`, `${b.dataset.par}b`].filter((k, i, a) => a.indexOf(k) === i).slice(-MAKS));
  });

  // ---------------------------------------------------------------- danas i sutra
  const izvori = Promise.all([NS.json("danas.json", "data/").catch(() => null), NS.json("prognoza_biciklista.json", "data/").catch(() => null)]);
  let DS = null;
  const linijeSata = (b, nizovi, isprekidano) => nizovi.map((a, i) => ({ name: naziv(i), type: "line", data: a, smooth: 0.3, symbol: "none", connectNulls: false,
    lineStyle: { color: boja(i), width: isprekidano ? 1.5 : 2.4, type: isprekidano ? "dashed" : "solid", opacity: isprekidano ? 0.7 : 1 }, itemStyle: { color: boja(i) } }));
  const opcijeSata = (b, series, sufiks) => ({
    ...NS.osnova(b),
    grid: { left: 42, right: 10, top: 14, bottom: 26 },
    xAxis: { type: "category", data: SATI, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], fontSize: 10.5, interval: 2 } }) },
    yAxis: { type: "value", ...NS.osaY(b) },
    tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${SATI[q[0].dataIndex]}–${NS.dvaMesta(q[0].dataIndex + 1)} h</b><br>` +
      q.filter((p) => p.value != null).map((p) => `${p.marker}${p.seriesName}${String(p.seriesId).startsWith("pr-") ? " (prognoza)" : sufiks}: <b>${NS.broj(Math.round(p.value))}</b>`).join("<br>") },
    series,
  });
  const gDanas = NS.grafik(document.getElementById("pr-danas"), (b) => {
    if (!DS || !DS.D) return {};
    const { D: Dn, P } = DS;
    const stv = izabrane.map((k) => { const x = Dn.serije[k]; return SATI.map((_, h) => (x && h < Dn.sati_gotovo ? x.sati[h] ?? null : null)); });
    const pr = izabrane.map((k) => { const x = NS.prognozaLokalno(P, k, Dn.datum); return x ? x.pred : SATI.map(() => null); });
    return opcijeSata(b, [...linijeSata(b, stv, false), ...linijeSata(b, pr, true).map((x) => ({ ...x, id: "pr-" + x.name }))], "");
  });
  const gSutra = NS.grafik(document.getElementById("pr-sutra"), (b) => {
    if (!DS || !DS.P) return {};
    const iso = DS.sutra, pr = izabrane.map((k) => { const x = NS.prognozaLokalno(DS.P, k, iso); return x ? x.pred : SATI.map(() => null); });
    return opcijeSata(b, linijeSata(b, pr, false), " (prognoza)");
  });
  async function danasSutra() {
    const [Dn, P] = await izvori;
    const danas = Dn ? Dn.datum : new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
    DS = { D: Dn, P, sutra: NS.dodajDane(danas, 1) };
    const zb = (a) => (a ? a.reduce((x, y) => x + (y || 0), 0) : 0);
    const oznaka = (i, t) => `<span class="pr-glava" style="--boja:var(${BOJE[i]})"><i></i>${naziv(i)}</span> ${t}`;
    document.getElementById("pr-danas-naslov").textContent = Dn ? `Danas · ${NS.datumDug(Dn.datum)}` : "Danas";
    document.getElementById("pr-danas-opis").innerHTML = Dn
      ? `izbrojano do ${Dn.brojaci_do} (puna linija), isprekidano prognoza za ceo dan<br>` + izabrane.map((k, i) => oznaka(i, `<b>${NS.broj((Dn.serije[k] && Dn.serije[k].danas) || 0)}</b>`)).join(" · ")
      : "nema podataka za danas";
    document.getElementById("pr-sutra-naslov").textContent = `Sutra · ${NS.datumDug(DS.sutra)}`;
    const ps = izabrane.map((k) => NS.prognozaLokalno(P, k, DS.sutra));
    document.getElementById("pr-sutra-opis").innerHTML = ps.some(Boolean)
      ? `očekuje se oko<br>` + izabrane.map((k, i) => oznaka(i, ps[i] ? `<b>${NS.broj(Math.round(zb(ps[i].pred)))}</b>` : "—")).join(" · ")
      : "prognoza za sutra još nije izdata (posle jutarnjeg osvežavanja)";
    gDanas.osvezi(); gSutra.osvezi();
  }

  // ---------------------------------------------------------------- mala mapa (izbor klikom)
  const mesta = (() => {
    const m = new Map();
    for (const r of s.serije) { const k = r.serija.replace(/[ab]$/, ""); if (!m.has(k)) m.set(k, { k, naziv: r.naziv, lat: +r.lat, lon: +r.lon, serije: [] }); m.get(k).serije.push(r.serija); }
    return [...m.values()];
  })();
  const W = 380, lat0 = mesta.reduce((a, m) => a + m.lat, 0) / mesta.length, kx = Math.cos((lat0 * Math.PI) / 180);
  const minX = Math.min(...mesta.map((m) => m.lon * kx)), maxX = Math.max(...mesta.map((m) => m.lon * kx));
  const minY = Math.min(...mesta.map((m) => -m.lat)), maxY = Math.max(...mesta.map((m) => -m.lat));
  const pad = 0.12, sx = (maxX - minX) * (1 + 2 * pad), sy = (maxY - minY) * (1 + 2 * pad);
  const H = Math.round((W * sy) / sx);
  const tacka = (lon, lat) => [((lon * kx - minX + (maxX - minX) * pad) / sx) * W, ((-lat - minY + (maxY - minY) * pad) / sy) * H];
  function crtajMapu([voda, bul]) {
    const linija = (l) => "M" + l.map(([x, y]) => tacka(x, y).map((v) => v.toFixed(1)).join(",")).join("L");
    // bulevari: tanke linije + kratak natpis na sredini najduže deonice (pun naziv na prelazu mišem)
    const bulevari = bul ? bul.features.map((f) => {
      const najduza = f.geometry.coordinates.reduce((a, l) => (l.length > a.length ? l : a), []);
      const ime = f.properties.n.replace("Bulevar ", "Bul. "), pola = ime.length * 1.9 + 3;    // ~ pola širine natpisa
      const [px, py] = tacka(...najduza[Math.floor(najduza.length / 2)]);
      const mx = Math.max(pola, Math.min(W - pola, px)), my = Math.max(10, Math.min(H - 4, py - 3));   // natpis ne izlazi van mape
      return `<g class="pr-mapa-bul"><title>${f.properties.n}</title><path d="${f.geometry.coordinates.map(linija).join("")}"/>
        <text x="${mx.toFixed(1)}" y="${my.toFixed(1)}">${ime}</text></g>`;
    }).join("") : "";
    const reka = voda ? voda.features.map((f) => f.geometry.coordinates.map((pr) => "M" + pr.map(([x, y]) => tacka(x, y).map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("")).join("") : "";
    const mapaEl = document.getElementById("pr-mapa");
    if (!mapaEl) return;
    mapaEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"><path class="pr-mapa-reka" d="${reka}"/>${bulevari}${mesta.map((m) => {
      const [x, y] = tacka(m.lon, m.lat), i = m.serije.map((k) => izabrane.indexOf(k)).find((j) => j >= 0);
      const izab = i != null && i >= 0;
      return `<g class="pr-mapa-t${izab ? " izabrana" : ""}" data-mesto="${m.k}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" ${izab ? `style="--boja:var(${BOJE[i]})"` : ""}>
        <title>${m.k} · ${m.naziv} (${m.serije.join(", ")})</title><circle r="${izab ? 6.5 : 4}"/>${izab ? `<text y="-10">${m.k}</text>` : ""}</g>`;
    }).join("")}</svg>`;
  }
  let podlogaP = null;
  const osveziMapu = () => { (podlogaP ||= Promise.all([NS.json("mapa/voda.geojson", "data/").catch(() => null),
    NS.json("mapa/bulevari.geojson", "data/").catch(() => null)])).then(crtajMapu); };
  izbEl.addEventListener("click", (e) => {
    if (!e.target.closest(".pr-mapa")) return;
    const g = e.target.closest("[data-mesto]"); if (!g) return;
    const m = mesta.find((x) => x.k === g.dataset.mesto), u = m.serije.filter((k) => izabrane.includes(k));
    if (u.length === m.serije.length) return postavi(izabrane.filter((k) => !m.serije.includes(k)));
    if (izabrane.length >= MAKS) { LJ.tost(`Najviše ${MAKS} stanice odjednom.`, "info"); return; }
    postavi([...izabrane, m.serije.find((k) => !izabrane.includes(k))]);
  });

  // ---------------------------------------------------------------- promena izbora
  let red = 0;
  async function postavi(nove) {
    izabrane = [...new Set(nove)].filter((k) => po[k]).slice(0, MAKS);
    upisiAdresu();
    crtajIzbor();
    const moj = ++red;
    let x;
    try { x = await Promise.all(izabrane.map(podaci)); } catch (e) { LJ.tost("Podaci za stanicu nisu učitani.", "alert"); return; }
    if (moj !== red) return;
    D = x;
    const nema = !D.length, sadrzaj = document.getElementById("pr-sadrzaj"), bio = sadrzaj.hidden;
    sadrzaj.hidden = nema;
    document.getElementById("pr-prazno").hidden = !nema;
    if (nema) return;
    if (bio) requestAnimationFrame(() => [gDan, gSat, gMes, gKar, gStr, gDanas, gSutra].forEach((g) => g.ec && g.ec.resize()));   // bili su sakriveni
    tabela();
    for (const g of [gDan, gSat, gMes]) g.osvezi();
    ucitajGrad().then((G) => { if (moj !== red) return; OS = D.map((d) => osobine(d, G)); karakter(); gKar.osvezi(); });
    strane();
    danasSutra();
    toplote.forEach(({ el, g }, i) => {
      el.hidden = !D[i];
      if (D[i]) { el.querySelector(".pr-toplota-ime").innerHTML = `<span class="pr-glava" style="--boja:var(${BOJE[i]})"><i></i>${D[i].k}</span> ${po[D[i].k].naziv}`; g.osvezi(); }
    });
    document.getElementById("pr-toplote").dataset.n = D.length;
    requestAnimationFrame(() => toplote.forEach(({ g }) => { if (g.ec) g.ec.resize(); }));
  }
  document.addEventListener("tema", () => { crtajIzbor(); tabela(); karakter(); });
  await postavi(izabrane);
  LJ.pojave(main);
})();
