/* Strana „Grafici“: grad po danu (čipovi za serije, isprekidano preko rupa), poređenje godina na zajedničkim
   brojačima, temperatura × biciklisti, dani u nedelji, toplotna mapa mesec × godina. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  try {
    const g = await NS.json("grad_dnevno.json");
    const a = NS.analizaGrada(g);
    const grad = gradGrafik(g);
    noga(g, a);
    godine(g);
    temperatura(g, a);
    daniUNedelji(a, g);
    mesecGodina(g, a);
    document.getElementById("izvoz").addEventListener("click", async () => {
      await grad.spreman;
      const url = grad.ec.getDataURL({ pixelRatio: 2, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg-card").trim() });
      const link = Object.assign(document.createElement("a"), { href: url, download: "biciklisti-novi-sad-grad.png" });
      link.click();
    });
    if (location.hash === "#godine") setTimeout(() => document.getElementById("godine").scrollIntoView(), 300);
  } catch (e) {
    NS.greska(main, e);
  }
})();

function gradGrafik(g) {
  const praznici = new Set(g.praznik);
  let gustina = "dan";
  const b0 = NS.boje();
  let ukljuceno = NS.cipovi(document.getElementById("serije"), [
    ["v", "Biciklisti (zbir dana)", b0.bicikl, true], ["p7", "Prosek 7 dana", b0.primary, true],
    ["n", "Broj brojača", b0["ink-3"], false], ["t", "Temperatura", b0.temp, true], ["p", "Padavine", b0.kisa, false],
  ], (sk) => { ukljuceno = sk; prilagodiVisinu(); graf.osvezi(); });
  const el = document.getElementById("grad-grafik");

  function podaci() {
    if (gustina === "dan") {
      const x = g.v.map((_, i) => NS.dodajDane(g.od, i));
      const p7 = g.v.map((_, i) => {
        let z = 0, n = 0;
        for (let j = Math.max(0, i - 6); j <= i; j++) if (g.v[j] != null) { z += g.v[j]; n++; }
        return n >= 4 ? Math.round(z / n) : null;
      });
      return { x, v: g.v, p7, n: g.n, tsr: g.tsr, tmin: g.tmin, tmax: g.tmax, pad: g.pad, dana: null };
    }
    const grp = NS.grupisi(g.od, g.v, gustina, gustina === "mesec" ? 10 : 4);
    const sr = (niz, dec = false) => NS.grupisi(g.od, niz.map((x) => (x == null ? null : dec ? x * 10 : x)), gustina, 1).v
      .map((x) => (x == null ? null : dec ? x / 10 : x));
    const zbir = new Map();
    g.pad.forEach((p, i) => { const k = NS.kljucPerioda(NS.dodajDane(g.od, i), gustina); zbir.set(k, (zbir.get(k) || 0) + (p || 0)); });
    return { x: grp.x, v: grp.v, p7: null, n: sr(g.n), tsr: sr(g.tsr, true), tmin: sr(g.tmin, true), tmax: sr(g.tmax, true),
      pad: grp.x.map((k) => Math.round(zbir.get(k) * 10) / 10), dana: grp.dana };
  }
  function paneli() {
    return ["n", "t", "p"].filter((k) => ukljuceno.has(k));
  }
  function prilagodiVisinu() {
    const h = 330 + 100 * paneli().length;
    if (el.clientHeight !== h) { el.style.height = h + "px"; graf.ec && graf.ec.resize(); }
  }

  const graf = NS.grafik(el, (b) => {
    const d = podaci();
    const dodatni = paneli();
    const sve = [0, ...dodatni.map((_, i) => i + 1)];
    const grids = [{ left: 58, right: 16, top: 28, height: 230 }];
    dodatni.forEach((_, i) => grids.push({ left: 58, right: 16, top: 286 + i * 100, height: 64 }));
    const poslednji = sve.length - 1;
    const xOsa = (i) => ({
      type: "category", gridIndex: i, data: d.x, boundaryGap: gustina !== "dan",
      ...NS.osaX(b, { axisLabel: { show: i === poslednji, color: b["ink-3"], hideOverlap: true, fontSize: 11,
        formatter: (k) => (gustina === "mesec" ? k.replace("-", ". ") : NS.datum(k).slice(0, -1)) } }),
    });
    const yOse = [{ type: "value", gridIndex: 0, name: gustina === "dan" ? "biciklista dnevno" : "prosečan dan", ...NS.osaY(b) }];
    const serije = [];
    if (ukljuceno.has("v")) {
      serije.push({ name: "biciklisti", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.v, showSymbol: gustina === "mesec", symbolSize: 5,
        connectNulls: false, lineStyle: { width: gustina === "dan" ? 1 : 2, color: b.bicikl, opacity: gustina === "dan" ? 0.55 : 1 }, itemStyle: { color: b.bicikl } });
      serije.push({ name: "nema podataka", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: NS.premosti(d.v), showSymbol: false, silent: true,
        lineStyle: { width: 1.5, type: [4, 4], color: b.nema }, itemStyle: { color: b.nema }, z: 1 });
    }
    if (ukljuceno.has("p7") && d.p7) {
      serije.push({ name: "prosek 7 dana", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.p7, showSymbol: false,
        lineStyle: { width: 2.2, color: b.primary }, itemStyle: { color: b.primary } });
    }
    // mesto za kasnije: prognoza i interval 10–90 % idu ovde kao nove serije na xAxisIndex 0
    dodatni.forEach((k, j) => {
      const i = j + 1;
      if (k === "n") {
        yOse.push({ type: "value", gridIndex: i, name: "brojača", minInterval: 1, splitNumber: 2, ...NS.osaY(b) });
        serije.push({ name: "brojača", type: "line", step: "middle", xAxisIndex: i, yAxisIndex: i, data: d.n, showSymbol: false,
          lineStyle: { width: 1.5, color: b["ink-3"] }, itemStyle: { color: b["ink-3"] }, areaStyle: { color: b["ink-3"], opacity: 0.08 } });
      }
      if (k === "t") {
        yOse.push({ type: "value", gridIndex: i, name: "°C", splitNumber: 2, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11 } }) });
        serije.push({ name: "tmin", type: "line", xAxisIndex: i, yAxisIndex: i, data: d.tmin, stack: "t", showSymbol: false, silent: true, lineStyle: { opacity: 0 } });
        serije.push({ name: "raspon", type: "line", xAxisIndex: i, yAxisIndex: i, stack: "t", showSymbol: false, silent: true,
          data: d.tmax.map((x, q) => (x == null || d.tmin[q] == null ? null : Math.round((x - d.tmin[q]) * 10) / 10)),
          lineStyle: { opacity: 0 }, areaStyle: { color: b.temp, opacity: 0.18 } });
        serije.push({ name: "temperatura", type: "line", xAxisIndex: i, yAxisIndex: i, data: d.tsr, showSymbol: false,
          lineStyle: { width: 1.5, color: b.temp }, itemStyle: { color: b.temp } });
      }
      if (k === "p") {
        yOse.push({ type: "value", gridIndex: i, name: "mm", splitNumber: 2, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11 } }) });
        serije.push({ name: "padavine", type: "bar", xAxisIndex: i, yAxisIndex: i, data: d.pad, barMaxWidth: 8, itemStyle: { color: b.kisa, borderRadius: [2, 2, 0, 0] } });
      }
    });
    const visina = 330 + 100 * dodatni.length;
    return {
      ...NS.osnova(b),
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: grids, xAxis: sve.map(xOsa), yAxis: yOse,
      dataZoom: [
        { type: "inside", xAxisIndex: sve },
        { type: "slider", xAxisIndex: sve, top: visina - 34, height: 22, borderColor: b.osa, fillerColor: "rgba(127,127,127,0.14)",
          dataBackground: { lineStyle: { color: b.osa }, areaStyle: { color: b.mreza } }, textStyle: { color: b["ink-3"] },
          labelFormatter: (_, k) => (k ? (gustina === "mesec" ? NS.mesecNaziv(k) : NS.datum(k)) : "") },
      ],
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => {
        const i = q[0].dataIndex, k = d.x[i];
        let t = `<b>${NS.oznakaPerioda(k, gustina)}</b>${gustina === "dan" && praznici.has(i) ? " · praznik" : ""}<br>`;
        t += d.v[i] == null ? `<span style="color:${b.nema}">nema kompletnih podataka</span><br>` : `biciklista: <b>${NS.broj(d.v[i])}</b>${gustina === "dan" ? "" : " prosečno dnevno"}<br>`;
        if (d.p7 && d.p7[i] != null) t += `prosek 7 dana: ${NS.broj(d.p7[i])}<br>`;
        t += `brojača: ${NS.broj(d.n[i])}${gustina === "dan" ? ` od ${g.postoji[i]}` : " (prosek)"}<br>`;
        if (d.dana) t += `dana sa podatkom: ${d.dana[i][0]} od ${d.dana[i][1]}<br>`;
        if (d.tsr[i] != null) t += `temperatura: ${NS.dec(d.tsr[i])} °C (${NS.dec(d.tmin[i])} – ${NS.dec(d.tmax[i])})<br>`;
        if (d.pad[i] != null) t += `padavine: ${NS.dec(d.pad[i])} mm`;
        return t;
      } },
      series: serije,
    };
  });
  prilagodiVisinu();
  NS.prekidac(document.getElementById("gustina"), [["dan", "Dan"], ["nedelja", "Nedelja"], ["mesec", "Mesec"]], gustina,
    (v) => { gustina = v; graf.osvezi(); });
  return graf;
}

function godisnjiZbir(g, A, B) {
  const { meseci, serije, prosek } = g.mesecno;
  const idx = Object.fromEntries(meseci.map((m, i) => [m, i]));
  const red = [];
  for (let m = 1; m <= 12; m++) {
    const mm = NS.dvaMesta(m);
    const ia = idx[`${A}-${mm}`], ib = idx[`${B}-${mm}`];
    let sa = 0, sb = 0, n = 0;
    if (ia != null && ib != null) serije.forEach((_, j) => {
      const x = prosek[ia][j], y = prosek[ib][j];
      if (x != null && y != null) { sa += x; sb += y; n++; }
    });
    red.push({ m, a: n ? sa : null, b: n ? sb : null, n });
  }
  return red;
}

function noga(g, a) {
  const c = g.cinjenice;
  const mes = new Map();
  a.po.forEach((x, i) => { if (x == null) return; const k = NS.dodajDane(g.od, i).slice(0, 7); const v = mes.get(k) || [0, 0]; v[0] += x; v[1]++; mes.set(k, v); });
  let najbolji = null, vr = -1;
  for (const [k, [s, n]] of mes) if (n >= 20 && s / n > vr) { vr = s / n; najbolji = k; }
  const red = godisnjiZbir(g, "2025", "2024");
  const sa = red.reduce((x, r) => x + (r.a || 0), 0), sb = red.reduce((x, r) => x + (r.b || 0), 0);
  document.getElementById("noga").innerHTML = [
    ["Ukupno · 2021–2026", `${NS.dec(c.ukupno_izbrojano / 1e6)} mil.`],
    ["2025 prema 2024", `<span style="color:${sa >= sb ? "var(--success)" : "var(--danger)"}">${NS.procenat(100 * (sa / sb - 1))}</span>`],
    ["Najbolji mesec", NS.mesecNaziv(najbolji)],
    ["Rekordan dan", NS.datum(c.najprometniji_dan.datum)],
  ].map(([t, v]) => `<div><span class="eyebrow">${t}</span><b>${v}</b></div>`).join("");
}

function godine(g) {
  const godineSve = [...new Set(g.mesecno.meseci.map((m) => m.slice(0, 4)))];
  const selA = document.getElementById("god-a"), selB = document.getElementById("god-b");
  for (const sel of [selA, selB]) sel.innerHTML = godineSve.map((y) => `<option>${y}</option>`).join("");
  selA.value = "2025"; selB.value = "2024";
  const boje = (b, A, B) => { const stariji = +A < +B ? A : B; return (y) => (y === stariji ? b["god-1"] : b["god-4"]); };

  // levo: horizontalni stubići (kao „headcount by age“), zaobljeni, rastu sleva uz kašnjenje po mesecu
  const graf = NS.grafik(document.getElementById("godine-grafik"), (b) => {
    const A = selA.value, B = selB.value;
    const red = godisnjiZbir(g, A, B);
    const boja = boje(b, A, B);
    const kat = red.map((r) => `${NS.MESECI_KRATKO[r.m - 1]} (${r.n})`);
    return {
      ...NS.osnova(b),
      legend: { top: 0, right: 0, textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 12, itemHeight: 12 },
      grid: { left: 70, right: 92, top: 34, bottom: 20 },
      yAxis: { type: "category", data: kat, inverse: true, ...NS.osaX(b, { axisLine: { show: false }, axisLabel: { color: b["ink-2"], fontSize: 12 } }) },
      xAxis: { type: "value", ...NS.osaY(b), splitLine: { lineStyle: { color: b.mreza, type: [3, 4] } } },
      tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } },
        formatter: (q) => { const r = red[q[0].dataIndex]; if (!r.n) return `${NS.MESECI[r.m - 1]}: nema zajedničkih brojača`;
          return `<b>${NS.MESECI[r.m - 1]}</b> · ${r.n} zajedničkih brojača<br>${A}: <b>${NS.broj(r.a)}</b><br>${B}: <b>${NS.broj(r.b)}</b><br>razlika: ${NS.procenat(100 * (r.a / r.b - 1))}`; } },
      series: [A, B].map((y, j) => ({
        name: y, type: "bar", barGap: "18%", barCategoryGap: "26%",
        data: red.map((r) => (y === A ? r.a : r.b)),
        itemStyle: { borderRadius: [0, 8, 8, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0,
          [{ offset: 0, color: boja(y) + "66" }, { offset: 1, color: boja(y) }]) },
        label: y === A ? { show: true, position: "right", color: b["ink-2"], fontSize: 11, fontFamily: "JetBrains Mono, monospace",
          formatter: (q) => { const r = red[q.dataIndex]; return r.n ? NS.procenat(100 * (r.a / r.b - 1)) : ""; } } : { show: false },
        emphasis: { focus: "series" },
        animationDuration: 1200, animationEasing: "cubicOut", animationDelay: (i) => i * 70 + j * 120,
      })),
    };
  });

  // desno: radar sa 12 meseci (kao „skills assessment“)
  const radar = NS.grafik(document.getElementById("radar-grafik"), (b) => {
    const A = selA.value, B = selB.value;
    const red = godisnjiZbir(g, A, B);
    const boja = boje(b, A, B);
    const maks = Math.max(...red.flatMap((r) => [r.a || 0, r.b || 0])) * 1.08 || 1;
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 12, itemHeight: 12 },
      tooltip: { trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
        formatter: (q) => `<b>${q.name}</b><br>` + red.map((r, i) => `${NS.MESECI_KRATKO[i]}: ${NS.broj(q.value[i])}`).join("<br>") },
      radar: {
        center: ["50%", "48%"], radius: "68%", splitNumber: 4, shape: "polygon",
        indicator: NS.MESECI_KRATKO.map((m) => ({ name: m, max: maks })),
        axisName: { color: b["ink-2"], fontSize: 12 },
        splitLine: { lineStyle: { color: b.mreza } }, splitArea: { areaStyle: { color: ["transparent", b.mreza + "55"] } },
        axisLine: { lineStyle: { color: b.mreza } },
      },
      series: [{ type: "radar", symbolSize: 5, animationDuration: 1600, animationEasing: "elasticOut",
        data: [A, B].map((y) => ({ name: y, value: red.map((r) => Math.round((y === A ? r.a : r.b) || 0)),
          lineStyle: { width: 2.5, color: boja(y) }, itemStyle: { color: boja(y) }, areaStyle: { color: boja(y), opacity: y === A ? 0.28 : 0.18 } })) }],
    };
  });
  for (const sel of [selA, selB]) sel.addEventListener("change", () => { graf.osvezi(); radar.osvezi(); });
}

/** Polinom stepena k sa najmanjom srednjom kvadratnom greškom (najmanji kvadrati, x se standardizuje). */
function polinom(xs, ys, k = 3) {
  const n = xs.length;
  if (n <= k + 1) return null;
  const sr = xs.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - sr) ** 2, 0) / n) || 1;
  const u = xs.map((x) => (x - sr) / sd);
  const m = k + 1;
  const A = Array.from({ length: m }, () => Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const st = Array.from({ length: m }, (_, p) => u[i] ** p);
    for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += st[r] * st[c]; A[r][m] += st[r] * ys[i]; }
  }
  for (let c = 0; c < m; c++) {                      // Gausova eliminacija sa izborom pivota
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q <= m; q++) A[r][q] -= f * A[c][q]; }
  }
  const koef = A.map((red, r) => red[m] / red[r]);
  const f = (x) => { const z = (x - sr) / sd; return koef.reduce((a, c, p) => a + c * z ** p, 0); };
  const mse = xs.reduce((a, x, i) => a + (f(x) - ys[i]) ** 2, 0) / n;
  return { f, mse };
}

// ---------------------------------------------------------------- izbor stanica (padajući meni sa štiklama)
// info ikonica (isti izgled kao na mapi)
const MAPA_INFO = (tekst) => `<span class="info" tabindex="0" role="note" aria-label="${tekst}" data-info="${tekst}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>`;
const BOJE_STANICA = { light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#2fa52f"] };
const bojeStanica = () => BOJE_STANICA[NS.tamna() ? "dark" : "light"];

/** Dugme „Svi brojači (prosek) ▾“ + panel sa pretragom i štiklama; promena(izabrane[]) */
const REKREATIVNE = ["25a", "26"];                 // Kej žrtava racije, Štrand
function izborStanica(omot, s, promena, maks = 6) {
  let izabrane = [];
  const jesuRekreativne = () => izabrane.length === REKREATIVNE.length && REKREATIVNE.every((k) => izabrane.includes(k));
  omot.innerHTML = `<button type="button" class="dugme malo izbor-dugme" aria-haspopup="true"></button>`;
  const dugme = omot.querySelector("button");
  const natpis = () => { dugme.textContent = `${izabrane.length ? `${izabrane.length === 1 ? "Stanica" : "Stanice"}: ${izabrane.join(", ")}${jesuRekreativne() ? " — rekreativne" : ""}` : "Svi brojači (prosek)"} ▾`; };
  natpis();
  const bez = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
  dugme.addEventListener("click", (e) => {
    e.stopPropagation();
    const stari = omot.querySelector(".panel");
    if (stari) { stari.remove(); return; }
    const p = document.createElement("div");
    p.className = "panel izbor-stanica";
    p.innerHTML = `<input type="search" placeholder="Pretraži stanice…" aria-label="Pretraga stanica">
      <label class="red-izbora"><input type="checkbox" data-s="" ${izabrane.length ? "" : "checked"}><b>Svi brojači (prosek po brojaču)</b></label>
      <label class="red-izbora"><input type="checkbox" data-rek="1" ${jesuRekreativne() ? "checked" : ""}><b>Rekreativne staze</b>
        ${MAPA_INFO(`rekreativne staze: ${REKREATIVNE.map((k) => { const r = s.serije.find((x) => x.serija === k); return `${k} · ${r ? r.naziv : ""}`; }).join(", ")}`)}</label>
      <div class="spisak-izbora">${s.serije.map((r) => `<label class="red-izbora" data-t="${bez(`${r.serija} ${r.naziv}`)}">
        <input type="checkbox" data-s="${r.serija}" ${izabrane.includes(r.serija) ? "checked" : ""}><img src="${NS.pin(r.stanje)}" alt=""><span>${r.serija} · ${r.naziv}</span></label>`).join("")}</div>
      <p class="sitno" style="margin:6px 4px 2px">najviše ${maks} stanica odjednom</p>`;
    omot.appendChild(p);
    p.querySelector("input[type=search]").addEventListener("input", (ev) => {
      const q = bez(ev.target.value);
      p.querySelectorAll(".spisak-izbora .red-izbora").forEach((l) => { l.style.display = !q || l.dataset.t.includes(q) ? "" : "none"; });
    });
    p.addEventListener("change", (ev) => {
      const k = ev.target.dataset.s;
      if (ev.target.dataset.rek) izabrane = ev.target.checked ? REKREATIVNE.slice() : [];
      else if (k === undefined) return;
      else if (k === "") izabrane = [];
      else if (ev.target.checked) { if (izabrane.length >= maks) { ev.target.checked = false; LJ.tost(`Najviše ${maks} stanica odjednom.`, "info"); return; } izabrane.push(k); }
      else izabrane = izabrane.filter((x) => x !== k);
      p.querySelector('input[data-s=""]').checked = !izabrane.length;
      p.querySelector("input[data-rek]").checked = jesuRekreativne();
      p.querySelectorAll(".spisak-izbora input").forEach((x) => { x.checked = izabrane.includes(x.dataset.s); });
      natpis(); promena(izabrane.slice());
    });
  });
}
const dnevnoKes = {};
const dnevnoStanice = (serija) => (dnevnoKes[serija] = dnevnoKes[serija] || NS.json(`dnevno/${serija}.json`));

// ---------------------------------------------------------------- uticaj temperature (po danu)
async function temperatura(g, a) {
  const s = await NS.stanice();
  let dani = "radni", vreme = "svi", krivaUkljucena = true, vikend = new Set([6, 0]), izabrane = [];
  const NAZIV_DANA = { radni: "radnim danom", vikend: "vikendom", svi: "svakog dana" };
  const NAZIV_VREMENA = { svi: "", suvo: " (suvi dani)", kisa: " (kišni dani, ≥ 1 mm)" };
  const praznik = new Set(g.praznik);
  const idx = (d) => NS.razlikaDana(g.od, d);
  // dan prolazi filter: radni = pon–pet bez praznika; vikend = izabrani dani (sub/ned) bez praznika; svi = svi dani
  const prolazi = (d, i, pad) => {
    const w = NS.danUNedelji(d);
    const okDan = dani === "svi" || (!praznik.has(i) && (dani === "radni" ? w >= 1 && w <= 5 : vikend.has(w)));
    return okDan && (vreme === "svi" || (vreme === "kisa") === (pad >= 1));
  };
  async function tackeSerije() {
    if (!izabrane.length) {
      const t = [];
      a.po.forEach((x, i) => { if (x == null || g.tsr[i] == null) return; const d = NS.dodajDane(g.od, i);
        if (prolazi(d, i, g.pad[i] ?? 0)) t.push([g.tsr[i], Math.round(x), d, g.pad[i] ?? 0]); });
      return [{ ime: "svi brojači (prosek po brojaču)", t }];
    }
    return Promise.all(izabrane.map(async (k) => {
      const dd = await dnevnoStanice(k);
      const t = [];
      dd.v.forEach((v, j) => { if (v == null) return; const d = NS.dodajDane(dd.od, j); const i = idx(d);
        if (i < 0 || i >= g.tsr.length || g.tsr[i] == null) return;
        if (prolazi(d, i, g.pad[i] ?? 0)) t.push([g.tsr[i], v, d, g.pad[i] ?? 0]); });
      return { ime: k, t };
    }));
  }
  let skupovi = [];
  const graf = NS.grafik(document.getElementById("temp-grafik"), (b) => {
    const boje = bojeStanica();
    const jedan = !izabrane.length;
    const serije = [];
    skupovi.forEach((sk, j) => {
      if (jedan) {
        serije.push({ name: "suv dan", type: "scatter", data: sk.t.filter((p) => p[3] < 1), symbolSize: 5, itemStyle: { color: b.bicikl, opacity: 0.5 }, animationDuration: 500 });
        serije.push({ name: "kišni dan (≥ 1 mm)", type: "scatter", data: sk.t.filter((p) => p[3] >= 1), symbolSize: 6, itemStyle: { color: b.kisa, opacity: 0.85 }, animationDuration: 500 });
      } else {
        serije.push({ name: sk.ime, type: "scatter", data: sk.t, symbolSize: 4, itemStyle: { color: boje[j], opacity: 0.45 }, animationDuration: 500 });
      }
      if (krivaUkljucena) {
        const fit = polinom(sk.t.map((p) => p[0]), sk.t.map((p) => p[1]), 3);
        if (fit) {
          const xs = sk.t.map((p) => p[0]); const lo = Math.min(...xs), hi = Math.max(...xs);
          serije.push({ name: jedan ? "kriva (3. stepen, najmanji MSE)" : `${sk.ime} · kriva`, type: "line", showSymbol: false, z: 5,
            data: Array.from({ length: 81 }, (_, i) => { const x = lo + (hi - lo) * i / 80; return [Math.round(x * 10) / 10, Math.max(0, Math.round(fit.f(x)))]; }),
            lineStyle: { width: 3, color: jedan ? b.temp : boje[j] }, itemStyle: { color: jedan ? b.temp : boje[j] },
            animationDuration: 1750, animationEasing: "linear", animationDelay: 300 });
        }
      }
    });
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, textStyle: { color: b["ink-2"] }, itemWidth: 14, itemHeight: 10, itemStyle: { opacity: 1 },
        data: serije.filter((x) => jedan || x.type === "scatter").map((x) => x.name) },
      grid: { left: 58, right: 16, top: 30, bottom: 60 },
      xAxis: { type: "value", name: "°C (prosek dana)", nameLocation: "middle", nameGap: 26, ...NS.osaY(b, { splitLine: { show: false }, axisLabel: { color: b["ink-3"] } }) },
      yAxis: { type: "value", name: jedan ? "biciklista po brojaču, dnevno" : "biciklista dnevno (stanica)", min: 0, ...NS.osaY(b) },
      tooltip: { trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
        formatter: (q) => (q.seriesType === "line" ? `${q.seriesName}: ${NS.dec(q.value[0])} °C → <b>${NS.broj(q.value[1])}</b>`
          : `<b>${NS.datumDug(q.value[2])}</b>${jedan ? "" : ` · ${q.seriesName}`}<br>${NS.dec(q.value[0])} °C · ${NS.dec(q.value[3])} mm<br>${NS.broj(q.value[1])} ${jedan ? "po brojaču" : "biciklista"}`) },
      series: serije,
    };
  });
  async function osvezi() {
    skupovi = await tackeSerije();
    const vik = dani === "vikend" && vikend.size === 1 ? (vikend.has(6) ? " (subotom)" : " (nedeljom)") : "";
    document.getElementById("temp-naslov").textContent = `Uticaj temperature ${NAZIV_DANA[dani]}${vik} na broj biciklista${NAZIV_VREMENA[vreme]}`;
    graf.osvezi();
  }
  NS.prekidac(document.getElementById("temp-dani"), [["radni", "Radni dan"], ["vikend", "Vikend"], ["svi", "Svaki dan"]], dani, (v) => {
    dani = v;
    document.getElementById("temp-vikend").classList.toggle("skriveno", v !== "vikend");
    poravnajVikend();
    osvezi();
  });
  // Sub / Ned (spojeni, oba uključena; bar jedan ostaje)
  const vikEl = document.getElementById("temp-vikend");
  vikEl.className = "segment pod-vikend skriveno";
  function poravnajVikend() {                       // tačno ispod dugmeta „Vikend“, iste širine
    const v = document.querySelector('#temp-dani button[data-v="vikend"]');
    if (!v) return;
    vikEl.style.marginLeft = `${v.offsetLeft - 4}px`;
    vikEl.style.width = `${v.offsetWidth + 8}px`;
  }
  window.addEventListener("resize", poravnajVikend);
  vikEl.innerHTML = [[6, "Sub"], [0, "Ned"]].map(([w, t]) => `<button type="button" data-w="${w}" aria-pressed="true">${t}</button>`).join("");
  vikEl.addEventListener("click", (e) => {
    const d = e.target.closest("button"); if (!d) return;
    const w = +d.dataset.w;
    if (vikend.has(w) && vikend.size === 1) return;
    if (vikend.has(w)) vikend.delete(w); else vikend.add(w);
    d.setAttribute("aria-pressed", String(vikend.has(w)));
    osvezi();
  });
  NS.prekidac(document.getElementById("temp-vreme"), [["svi", "Svi"], ["suvo", "Suvo"], ["kisa", "Kiša"]], vreme, (v) => { vreme = v; osvezi(); });
  const kEl = document.getElementById("temp-kriva");
  kEl.innerHTML = `<label class="prekidac-ui"><input type="checkbox" checked><span class="klizac" aria-hidden="true"></span><span>prikaži</span></label>`;
  kEl.querySelector("input").addEventListener("change", (e) => { krivaUkljucena = e.target.checked; graf.osvezi(); });
  izborStanica(document.getElementById("temp-izbor"), s, (iz) => { izabrane = iz; osvezi(); });
  osvezi();
}

/** Pomak centra j-tog stubića od sredine kategorije (ECharts: barGap 30 %, širina kategorije 1). */
function pomakStubica(n, j, razmakKat) {
  const ukupno = 1 - razmakKat, bw = ukupno / (n + 0.3 * (n - 1));
  return -ukupno / 2 + bw * (j + 0.5) + 0.3 * bw * j;
}

/** Dani u nedelji: svi brojači (prosek po brojaču) ili izabrane stanice (do 6). */
async function daniUNedelji(a, g) {
  const s = await NS.stanice();
  const praznik = new Set(g.praznik.map((i) => NS.dodajDane(g.od, i)));
  let izabrane = [], vreme = "svi";
  const kes = {};
  const prolazi = (dan) => { if (vreme === "svi") return true; const i = NS.razlikaDana(g.od, dan); const p = g.pad[i] ?? 0; return (vreme === "kisa") === (p >= 1); };
  function proseci(od, vrednosti) {
    const z = Array.from({ length: 7 }, () => [0, 0]);
    vrednosti.forEach((v, i) => {
      if (v == null) return;
      const dan = NS.dodajDane(od, i);
      if (praznik.has(dan) || !prolazi(dan)) return;
      const w = (NS.danUNedelji(dan) + 6) % 7;
      z[w][0] += v; z[w][1]++;
    });
    return z.map(([x, n]) => (n ? x / n : null));
  }
  async function poDanima(serija) {
    const k = `${serija}|${vreme}`;
    if (kes[k]) return kes[k];
    const d = await dnevnoStanice(serija);
    return (kes[k] = proseci(d.od, d.v));
  }
  let podaci = null, linija = true;
  const lEl = document.getElementById("dani-linija");
  lEl.innerHTML = `<label class="prekidac-ui"><input type="checkbox" checked><span class="klizac" aria-hidden="true"></span><span>prikaži</span></label>`;
  lEl.querySelector("input").addEventListener("change", (e) => { linija = e.target.checked; graf.osvezi(); });
  const graf = NS.grafik(document.getElementById("dani-grafik"), (b) => {
    if (!podaci) return {};
    const jedna = podaci.length === 1;
    const boje = bojeStanica();
    return {
      ...NS.osnova(b),
      legend: jedna ? undefined : { bottom: 0, textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 10, itemHeight: 10 },
      grid: { left: 58, right: 12, top: 30, bottom: jedna ? 30 : 56 },
      xAxis: [{ type: "category", data: NS.DANI_KRATKO, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], interval: 0 } }) },
        { type: "value", min: -0.5, max: 6.5, show: false }],
      yAxis: { type: "value", name: izabrane.length ? "biciklista dnevno" : "biciklista po brojaču", ...NS.osaY(b) },
      tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } },
        formatter: (q) => `<b>${NS.DANI[(q[0].dataIndex + 1) % 7]}</b><br>` + q.filter((x) => x.seriesType === "bar").map((x) => {
          const ser = podaci[x.seriesIndex];
          const radni = ser.v.slice(0, 5).reduce((u, y) => u + (y || 0), 0) / 5;
          return `${x.marker}${ser.ime}: <b>${NS.broj(Math.round(x.value))}</b> <span style="color:${b["ink-3"]}">(${NS.procenat(100 * (x.value / radni - 1))} prema radnom danu)</span>`;
        }).join("<br>") },
      series: podaci.map((ser, j) => ({
        name: ser.ime, type: "bar", barCategoryGap: jedna ? "30%" : "18%", animationDelay: (i) => i * 60,
        itemStyle: { color: jedna ? b.bicikl : boje[j] },
        data: ser.v.map((v, i) => ({ value: v == null ? null : Math.round(v),
          itemStyle: { color: jedna ? (i < 5 ? b.bicikl : b["bicikl-blago"]) : boje[j], borderRadius: [4, 4, 0, 0] } })),
        label: { show: jedna, position: "top", color: b["ink-2"], fontSize: 11, formatter: (q) => NS.broj(q.value) },
      })).concat(linija ? podaci.map((ser, j) => ({
        // tačke tačno na vrhu stubića te serije (pomak unutar kategorije kao kod stubića)
        name: ser.ime, type: "line", xAxisIndex: 1, z: 5, smooth: 0.25,
        data: ser.v.map((v, i) => [i + pomakStubica(podaci.length, j, jedna ? 0.3 : 0.18), v == null ? null : Math.round(v)]),
        symbol: "circle", symbolSize: 7, lineStyle: { width: 2.5, color: jedna ? b.temp : boje[j] },
        itemStyle: { color: jedna ? b.temp : boje[j], borderColor: b.povrsina, borderWidth: 2 },
        tooltip: { show: false }, animationDuration: 1400, animationDelay: 500,
      })) : []),
    };
  });
  async function crtaj() {
    podaci = izabrane.length ? await Promise.all(izabrane.map(async (k) => ({ ime: k, v: await poDanima(k) })))
      : [{ ime: "svi brojači", v: proseci(g.od, a.po) }];
    const kad = { svi: "", suvo: ", samo suvi dani", kisa: ", samo kišni dani (≥ 1 mm)" }[vreme];
    document.getElementById("dani-info").innerHTML = MAPA_INFO(izabrane.length
      ? `Prosečan dan na izabranim stanicama (kompletni dani), bez praznika${kad}.` : `Prosečan dan po brojaču (svi brojači), bez praznika${kad}.`);
    graf.osvezi();
  }
  izborStanica(document.getElementById("dani-izbor"), s, (iz) => { izabrane = iz; crtaj(); });
  NS.prekidac(document.getElementById("dani-vreme"), [["svi", "Svi"], ["suvo", "Suvo"], ["kisa", "Kiša"]], vreme, (v) => { vreme = v; crtaj(); });
  crtaj();
}

function mesecGodina(g, a) {
  NS.grafik(document.getElementById("toplota-grafik"), (b) => {
    const mes = new Map();
    a.po.forEach((x, i) => { if (x == null) return; const k = NS.dodajDane(g.od, i).slice(0, 7); const v = mes.get(k) || [0, 0]; v[0] += x; v[1]++; mes.set(k, v); });
    const godine = [...new Set(g.mesecno.meseci.map((m) => m.slice(0, 4)))];
    const podaci = [];
    let maks = 0;
    godine.forEach((y, r) => { for (let m = 1; m <= 12; m++) {
      const v = mes.get(`${y}-${NS.dvaMesta(m)}`);
      const x = v && v[1] >= 10 ? Math.round(v[0] / v[1]) : null;
      podaci.push([m - 1, r, x]);
      if (x > maks) maks = x;
    } });
    return {
      ...NS.osnova(b),
      grid: { left: 52, right: 12, top: 8, bottom: 56 },
      xAxis: { type: "category", data: NS.MESECI_KRATKO, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], interval: 0 } }) },
      yAxis: { type: "category", data: godine, inverse: true, ...NS.osaX(b, { axisLine: { show: false } }) },
      visualMap: { min: 0, max: maks, orient: "horizontal", left: "center", bottom: 0, itemHeight: 160, itemWidth: 10, calculable: false,
        text: ["više", "manje"], textStyle: { color: b["ink-3"] },
        inRange: { color: [b["top-0"], b["top-1"], b["top-2"], b["top-3"], b["top-4"], b["top-5"]] } },
      tooltip: { trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
        formatter: (q) => `${NS.MESECI[q.value[0]]} ${godine[q.value[1]]}.<br>${q.value[2] == null ? "premalo podataka" : `<b>${NS.broj(q.value[2])}</b> po brojaču dnevno`}` },
      series: [{ type: "heatmap", data: podaci, itemStyle: { borderColor: b.povrsina, borderWidth: 2, borderRadius: 4 },
        label: { show: window.innerWidth > 700, fontSize: 10, rich: { s: { color: NS.tamna() ? "#0B1120" : "#fff", fontSize: 10 }, t: { color: b.ink, fontSize: 10 } },
          formatter: (q) => (q.value[2] == null ? "" : `{${q.value[2] > maks * 0.5 ? "s" : "t"}|${NS.broj(q.value[2])}}`) } }],
    };
  });
}
