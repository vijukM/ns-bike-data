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
    daniUNedelji(a);
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
  const graf = NS.grafik(document.getElementById("godine-grafik"), (b) => {
    const A = selA.value, B = selB.value;
    const red = godisnjiZbir(g, A, B);
    const stariji = +A < +B ? A : B;
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 10, itemHeight: 10 },
      grid: { left: 58, right: 12, top: 30, bottom: 70 },
      xAxis: { type: "category", data: red.map((r) => `${NS.MESECI_KRATKO[r.m - 1]}\n(${r.n})`), ...NS.osaX(b, { axisLabel: { color: b["ink-3"], interval: 0, fontSize: 11 } }) },
      yAxis: { type: "value", name: "prosečan dan, zbir", ...NS.osaY(b) },
      tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } },
        formatter: (q) => { const r = red[q[0].dataIndex]; if (!r.n) return `${NS.MESECI[r.m - 1]}: nema zajedničkih brojača`;
          return `<b>${NS.MESECI[r.m - 1]}</b> · ${r.n} zajedničkih brojača<br>${A}: <b>${NS.broj(r.a)}</b><br>${B}: <b>${NS.broj(r.b)}</b><br>razlika: ${NS.procenat(100 * (r.a / r.b - 1))}`; } },
      series: [B, A].map((y) => ({ name: y, type: "bar", barGap: "12%", barCategoryGap: "30%", data: red.map((r) => (y === A ? r.a : r.b)),
        itemStyle: { color: y === stariji ? b["god-1"] : b["god-4"], borderRadius: [4, 4, 0, 0] }, animationDelay: (i) => i * 40 })),
    };
  });
  for (const sel of [selA, selB]) sel.addEventListener("change", () => graf.osvezi());
}

function temperatura(g, a) {
  NS.grafik(document.getElementById("temp-grafik"), (b) => {
    const suvi = [], kisni = [];
    a.po.forEach((x, i) => {
      const d = NS.dodajDane(g.od, i);
      if (x == null || g.tsr[i] == null || a.praznik.has(i) || NS.danUNedelji(d) % 6 === 0) return;
      (g.pad[i] >= 1 ? kisni : suvi).push([g.tsr[i], Math.round(x), d, g.pad[i]]);
    });
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, textStyle: { color: b["ink-2"] }, itemWidth: 10, itemHeight: 10 },
      grid: { left: 58, right: 16, top: 30, bottom: 56 },
      xAxis: { type: "value", name: "°C (prosek dana)", nameLocation: "middle", nameGap: 26, ...NS.osaY(b, { splitLine: { show: false }, axisLabel: { color: b["ink-3"] } }) },
      yAxis: { type: "value", name: "biciklista po brojaču", ...NS.osaY(b) },
      tooltip: { trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
        formatter: (q) => `<b>${NS.datumDug(q.value[2])}</b><br>${NS.dec(q.value[0])} °C · ${NS.dec(q.value[3])} mm<br>${NS.broj(q.value[1])} po brojaču` },
      series: [
        { name: "suv dan", type: "scatter", data: suvi, symbolSize: 5, itemStyle: { color: b.bicikl, opacity: 0.45 } },
        { name: "kišni dan (≥ 1 mm)", type: "scatter", data: kisni, symbolSize: 6, itemStyle: { color: b.kisa, opacity: 0.85 } },
      ],
    };
  });
}

function daniUNedelji(a) {
  NS.grafik(document.getElementById("dani-grafik"), (b) => ({
    ...NS.osnova(b),
    grid: { left: 58, right: 12, top: 30, bottom: 30 },
    xAxis: { type: "category", data: NS.DANI_KRATKO, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], interval: 0 } }) },
    yAxis: { type: "value", name: "biciklista po brojaču", ...NS.osaY(b) },
    tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } },
      formatter: (q) => `<b>${NS.DANI[(q[0].dataIndex + 1) % 7]}</b><br>${NS.broj(Math.round(q[0].value))} po brojaču<br>${NS.procenat(100 * (q[0].value / a.radni - 1))} prema proseku radnog dana` },
    series: [{ type: "bar", barCategoryGap: "30%", animationDelay: (i) => i * 70,
      data: a.dani.map((v, i) => ({ value: Math.round(v), itemStyle: { color: i < 5 ? b.bicikl : b["bicikl-blago"], borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: "top", color: b["ink-2"], fontSize: 11, formatter: (q) => NS.broj(q.value) } }],
  }));
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
