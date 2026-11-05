/* Poređenje stanica (2–4): ključni brojevi, po danu (broj ili indeks), prosečan dan po satu, meseci kroz godine i
   ritam nedelje (sat × dan). Sve iz istih fajlova kao strana stanice: istorija/dnevno/<serija>.json (+ dnevno_novo.json
   za dane posle istorije) i istorija/profili/<serija>.json. Izbor se pamti u adresi: poredjenje?id=34a,23a */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const MAKS = 4;
  const BOJE = ["--g-tip-1", "--g-tip-2", "--g-tip-3", "--g-god-3"];
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  const boja = (i) => css(BOJE[i]);
  const bezK = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");

  let s, N;
  try { [s, N] = await Promise.all([NS.stanice(), NS.json("dnevno_novo.json").catch(() => null)]); } catch (e) { NS.greska(main, e); return; }
  const po = Object.fromEntries(s.serije.map((r) => [r.serija, r]));
  const ime = (k) => `${k} · ${po[k].naziv}`;

  // ---------------------------------------------------------------- izbor (adresa)
  const izAdrese = (new URLSearchParams(location.search).get("id") || "").split(",").map((x) => x.trim()).filter((k) => po[k]);
  const najprometnije = () => [...s.serije].filter((r) => r.prosek_12m != null && r.stanje !== "neispravan").sort((a, b) => b.prosek_12m - a.prosek_12m).map((r) => r.serija);
  let izabrane = [...new Set(izAdrese)].slice(0, MAKS);
  if (izabrane.length < 2) izabrane = po["34a"] && po["23a"] ? ["34a", "23a"] : najprometnije().slice(0, 2);
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
      <div><span class="eyebrow">Podaci</span><h1>Poređenje <em>stanica</em></h1>
        <p class="uvod">Izaberi dve do četiri stanice i uporedi ih na istim graficima. Link ove strane pamti izbor, pa se poređenje može poslati.</p></div>
    </header>
    <section class="kartica pojava pr-izbor">
      <div class="pr-izabrane" id="pr-izabrane"></div>
      <div class="pr-brzo" id="pr-brzo"></div>
    </section>
    <section class="kartica pojava">
      <div class="kartica-glava"><div><span class="eyebrow">Ukratko</span><h2>Ključni brojevi</h2></div></div>
      <div class="tabela-omot"><table class="tabela pr-tabela" id="pr-tabela"></table></div>
    </section>
    <section class="kartica pojava">
      <div class="kartica-glava">
        <div><span class="eyebrow">Po danu</span><h2>Biciklisti kroz vreme</h2>
          <p class="opis" id="pr-dan-opis"></p></div>
        <div class="pr-kontrole"><div id="pr-gustina"></div><div id="pr-mera"></div>
          <label class="red-izbora pr-zajedno"><input type="checkbox" id="pr-zajedno"><span>samo dani kada sve rade</span></label></div>
      </div>
      <div class="grafik visok" id="pr-dan"></div>
    </section>
    <div class="mreza-2">
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Ritam dana</span><h2>Prosečan dan po satu</h2><p class="opis" id="pr-sat-opis"></p></div>
          <div class="pr-kontrole"><div id="pr-tip"></div><select id="pr-sezona" aria-label="Godišnje doba"></select><div id="pr-sat-mera"></div></div>
        </div>
        <div class="grafik" id="pr-sat"></div>
      </section>
      <section class="kartica pojava">
        <div class="kartica-glava">
          <div><span class="eyebrow">Godine</span><h2>Prosečan dan u mesecu</h2><p class="opis">Samo kompletni dani; mesec se prikazuje uz bar 10 takvih dana.</p></div>
          <div class="pr-kontrole"><div id="pr-mes-mera"></div></div>
        </div>
        <div class="grafik" id="pr-mes"></div>
      </section>
    </div>
    <section class="kartica pojava">
      <div class="kartica-glava"><div><span class="eyebrow">Nedelja</span><h2>Sat × dan u nedelji</h2>
        <p class="opis">Prosečan broj biciklista u satu, ceo period; svaka stanica u svojoj skali (najsvetlije = njen najprometniji sat).</p></div></div>
      <div class="pr-toplote" id="pr-toplote">${[0, 1, 2, 3].map((i) => `<div class="pr-toplota" data-i="${i}"><div class="pr-toplota-ime"></div><div class="grafik pr-toplota-g"></div></div>`).join("")}</div>
    </section>`;

  // ---------------------------------------------------------------- izbor stanica: čipovi, dodavanje, brzi izbori
  const izbEl = document.getElementById("pr-izabrane"), brzoEl = document.getElementById("pr-brzo");
  function crtajIzbor() {
    izbEl.innerHTML = izabrane.map((k, i) => `<span class="pr-cip" style="--boja:var(${BOJE[i]})"><i></i>
        <a href="stanica?id=${encodeURIComponent(k)}">${ime(k)}</a>
        ${izabrane.length > 2 ? `<button type="button" data-ukloni="${k}" aria-label="Ukloni ${k}" title="Ukloni">×</button>` : ""}</span>`).join("") +
      (izabrane.length < MAKS ? `<span class="padajuce"><button type="button" class="dugme malo" id="pr-dodaj">+ Dodaj stanicu</button></span>` : "");
    const parovi = izabrane.map((k) => k.replace(/[ab]$/, (c) => (c === "a" ? "b" : "a"))).filter((k) => po[k] && !izabrane.includes(k));
    brzoEl.innerHTML = `<span class="sitno">Brzo:</span>` +
      (parovi.length && izabrane.length < MAKS ? `<button type="button" class="dugme malo" data-brzo="par">druga strana ulice (${parovi.slice(0, MAKS - izabrane.length).join(", ")})</button>` : "") +
      `<button type="button" class="dugme malo" data-brzo="top">najprometnije dve</button>` +
      `<button type="button" class="dugme malo" data-brzo="ab">obe strane najprometnije ulice</button>`;
    const d = document.getElementById("pr-dodaj");
    if (d) d.addEventListener("click", otvoriDodavanje);
  }
  function otvoriDodavanje(e) {
    e.stopPropagation();
    const omot = e.currentTarget.parentElement, stari = omot.querySelector(".panel");
    document.querySelectorAll(".padajuce .panel").forEach((p) => p.remove());
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
  NS.prekidac(document.getElementById("pr-tip"), [["radni", "Radni"], ["subota", "Subota"], ["nedelja_praznik", "Nedelja"]], tip, (v) => { tip = v; gSat.osvezi(); });
  const sez = document.getElementById("pr-sezona");
  sez.innerHTML = [["ukupno", "Cela godina"], ["zima", "Zima"], ["prolece", "Proleće"], ["leto", "Leto"], ["jesen", "Jesen"]].map(([k, t]) => `<option value="${k}">${t}</option>`).join("");
  sez.addEventListener("change", () => { sezona = sez.value; gSat.osvezi(); });
  NS.prekidac(document.getElementById("pr-sat-mera"), [["broj", "Broj"], ["udeo", "% dana"]], satMera, (v) => { satMera = v; opisSat(); gSat.osvezi(); });
  NS.prekidac(document.getElementById("pr-mes-mera"), [["broj", "Broj"], ["indeks", "Indeks"]], mesMera, (v) => { mesMera = v; gMes.osvezi(); });
  const opisDan = () => { document.getElementById("pr-dan-opis").textContent = mera === "indeks"
    ? "Indeks: 100 = prosek te stanice u prikazanom periodu — stanice različite veličine na istoj skali."
    : "Dnevni zbir (nedelja i mesec: prosečan dan). Gde nema kompletnih podataka linija se prekida."; };
  const opisSat = () => { document.getElementById("pr-sat-opis").textContent = satMera === "udeo"
    ? "Koliki deo dana prođe u kom satu — oblik ritma bez obzira na veličinu stanice." : "Prosečan broj biciklista u satu (lokalno vreme)."; };
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
      red("Vikend prema radnom danu", (d, i) => st[i].vikend != null ? `<b>${NS.broj(Math.round(100 * st[i].vikend))} %</b><small>${st[i].vikend >= 0.85 ? "rekreacija" : st[i].vikend <= 0.55 ? "posao, škola" : "mešovito"}</small>` : "—",
        "Prosečna subota i nedelja prema prosečnom radnom danu, poslednjih 365 kompletnih dana. Ispod 55 % = stanica „za posao“, preko 85 % = „za rekreaciju“.") +
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
    return { el, g };
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
    tabela();
    for (const g of [gDan, gSat, gMes]) g.osvezi();
    toplote.forEach(({ el, g }, i) => {
      el.hidden = !D[i];
      if (D[i]) { el.querySelector(".pr-toplota-ime").innerHTML = `<span class="pr-glava" style="--boja:var(${BOJE[i]})"><i></i>${D[i].k}</span> ${po[D[i].k].naziv}`; g.osvezi(); }
    });
    document.getElementById("pr-toplote").dataset.n = D.length;
  }
  document.addEventListener("tema", () => { crtajIzbor(); tabela(); });
  await postavi(izabrane);
  LJ.pojave(main);
})();
