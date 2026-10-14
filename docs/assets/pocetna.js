/* Početna: činjenice, mapa (prosek / dan na mapi), gradski dnevni grafik sa vremenom, poređenje godina, tabela stanica. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  try {
    const [s, g] = await Promise.all([NS.stanice(), NS.json("grad_dnevno.json")]);
    NS.spisakStanica(document.getElementById("izbor-stanice"), s, null);
    plocice(s, g);
    mapa(s, g);
    gradGrafik(g);
    godine(g);
    tabela(s);
  } catch (e) {
    NS.greska(main, e);
  }
})();

// ---------------------------------------------------------------- činjenice
function plocice(s, g) {
  const c = g.cinjenice;
  const st = Object.fromEntries(s.serije.map((r) => [r.serija, r]));
  const ns = c.najprometnija_serija;
  const k = c.kisa;
  const plocica = (naslov, vrednost, dodatak, href) => `<div class="plocica"><div class="naslov">${naslov}</div>
    <div class="vrednost${href ? " manja" : ""}">${href ? `<a href="${href}">${vrednost}</a>` : vrednost}</div><div class="dodatak">${dodatak}</div></div>`;
  document.getElementById("plocice").innerHTML = [
    plocica("Ukupno izbrojano", NS.broj(c.ukupno_izbrojano),
      `prolazaka biciklista na ${s.serije.length} brojača (samo validni sati)`),
    plocica("Najprometniji dan", NS.datum(c.najprometniji_dan.datum),
      `${NS.broj(c.najprometniji_dan.zbir)} biciklista na ${c.najprometniji_dan.serija} brojača`),
    ns ? plocica("Najprometnija stanica", `${ns.serija} · ${st[ns.serija].naziv}`,
      `prosečno ${NS.broj(ns.prosek)} biciklista dnevno (${ns.period})`, `stanica.html?id=${ns.serija}`) : "",
    plocica("Kiša", `${k.razlika_pct < 0 ? "−" : "+"}${NS.dec(Math.abs(k.razlika_pct))} %`,
      `kišni radni dan ${NS.broj(k.kisni_po_brojacu)}, suvi ${NS.broj(k.suvi_po_brojacu)} po brojaču (april–oktobar, ≥ 1 mm)`),
  ].join("");
}

// ---------------------------------------------------------------- mapa
function mapa(s, g) {
  const b0 = NS.boje();
  const m = L.map("mapa", { scrollWheelZoom: false, zoomSnap: 0.5 });
  const sloj = () => L.tileLayer(`https://{s}.basemaps.cartocdn.com/${NS.tamna() ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
    maxZoom: 19, subdomains: "abcd",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/">CARTO</a>',
  });
  let podloga = sloj().addTo(m);
  m.fitBounds(L.latLngBounds(s.serije.map((r) => [r.lat_mapa, r.lon_mapa])).pad(0.08));

  const maks = Math.max(...s.serije.map((r) => r.prosek_12m || 0));
  // a/b na istom mestu: razmak u pikselima (ne u metrima), da se krugovi ne preklope ni na manjem zumu
  const parovi = {};
  for (const r of s.serije) (parovi[r.mesto] = parovi[r.mesto] || []).push(r);
  function polozaj(r) {
    const par = parovi[r.mesto];
    if (par.length !== 2) return [r.lat, r.lon];
    const [a, c] = par;
    const lat0 = (a.lat + c.lat) / 2, lon0 = (a.lon + c.lon) / 2;
    let dy = c.lat_mapa - a.lat_mapa, dx = (c.lon_mapa - a.lon_mapa) * Math.cos(lat0 * Math.PI / 180);
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const mPoPx = 40075016.686 * Math.cos(lat0 * Math.PI / 180) / 2 ** (m.getZoom() + 8);
    const pomak = (r === a ? -1 : 1) * 11 * mPoPx / 111320;
    return [lat0 + dy * pomak, lon0 + dx * pomak / Math.cos(lat0 * Math.PI / 180)];
  }
  const krugovi = {};
  for (const r of s.serije) {
    const k = L.circleMarker(polozaj(r), { weight: 1.5, fillOpacity: 0.8 }).addTo(m);
    k.on("click", () => { location.href = `stanica.html?id=${encodeURIComponent(r.serija)}`; });
    krugovi[r.serija] = k;
  }
  const opisStanice = (r) => `<b>${r.serija}</b> · ${r.naziv}<br><span class="sitno">${r.smerovi.join("<br>")}</span>`;

  m.on("zoomend", () => { for (const r of s.serije) krugovi[r.serija].setLatLng(polozaj(r)); });
  let rezim = "prosek";
  function prikaziProsek() {
    const b = NS.boje();
    for (const r of s.serije) {
      const sivo = !!r.napomena || r.prosek_12m == null;
      krugovi[r.serija].setStyle({
        radius: 5 + 17 * Math.sqrt((r.prosek_12m || 0) / maks), color: b.povrsina,
        fillColor: sivo ? b.nema : b.bicikl, opacity: 1, fillOpacity: sivo ? 0.9 : 0.75,
      }).bindTooltip(`${opisStanice(r)}<br>${sivo ? `<b>${r.napomena || "nema podataka"}</b>`
        : `prosek: <b>${NS.broj(r.prosek_12m)}</b> biciklista dnevno`}`, { direction: "top" });
    }
  }

  // „dan na mapi“
  const datumEl = document.getElementById("dan-datum");
  const satEl = document.getElementById("dan-sat");
  const pustiEl = document.getElementById("dan-pusti");
  const stanjeEl = document.getElementById("dan-stanje");
  let dan = null;                            // {mesec, i0, n, oznake, zbir[], ok[], bez[]}
  let mini = null;
  let tajmer = null;

  async function ucitajDan(iso) {
    const mes = await NS.json(`sati/${iso.slice(0, 7)}.json`);
    const d = mes.dani.find((x) => x[0] === iso);
    if (!d) return;
    const [, i0, n] = d;
    const oznake = NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n);
    const zbir = [], ok = [], bez = [];
    for (let k = 0; k < n; k++) {
      let z = 0, o = 0, x = 0;
      for (const ser of Object.keys(mes.v)) {
        const v = mes.v[ser][i0 + k];
        if (v == null) { if (NS.razlogSata(mes.r[ser], i0 + k) !== 9) x++; } else { z += v; o++; }
      }
      zbir.push(o ? z : null); ok.push(o); bez.push(x);
    }
    dan = { iso, mes, i0, n, oznake, zbir, ok, bez };
    satEl.max = n - 1;
    if (+satEl.value > n - 1) satEl.value = n - 1;
    crtajMini();
    prikaziSat(+satEl.value);
  }

  function prikaziSat(k) {
    if (!dan) return;
    const b = NS.boje();
    const { mes, i0 } = dan;
    for (const r of s.serije) {
      const kr = krugovi[r.serija];
      const niz = mes.v[r.serija];
      const kod = niz ? NS.razlogSata(mes.r[r.serija], i0 + k) : 9;
      if (kod === 9) { kr.setStyle({ opacity: 0, fillOpacity: 0 }).unbindTooltip(); continue; }
      const v = niz[i0 + k];
      if (v == null) {
        kr.setStyle({ radius: 5, color: b.povrsina, fillColor: b.nema, opacity: 1, fillOpacity: 0.95 })
          .bindTooltip(`${opisStanice(r)}<br><b>nema podataka</b>: ${NS.razlog(kod)}`, { direction: "top" });
      } else {
        kr.setStyle({ radius: 3 + 20 * Math.sqrt(v / 400), color: b.povrsina, fillColor: b.bicikl, opacity: 1, fillOpacity: 0.75 })
          .bindTooltip(`${opisStanice(r)}<br><b>${NS.broj(v)}</b> biciklista, ${dan.oznake[k].oznaka}`, { direction: "top" });
      }
    }
    const bez = dan.bez[k] ? ` · ${dan.bez[k]} bez podataka` : "";
    stanjeEl.innerHTML = `<b>${NS.datumDug(dan.iso)}</b> · ${dan.oznake[k].oznaka}<br>` +
      (dan.zbir[k] == null ? "nijedan brojač nema podatak za ovaj sat"
        : `<b>${NS.broj(dan.zbir[k])}</b> biciklista na ${dan.ok[k]} brojača${bez}`);
    if (mini) mini.osvezi();
  }

  function crtajMini() {
    if (mini) { mini.osvezi(); return; }
    mini = NS.grafik(document.getElementById("dan-grafik"), (b) => {
      if (!dan) return {};
      const k = +satEl.value;
      return {
        ...NS.osnova(b),
        grid: { left: 44, right: 8, top: 34, bottom: 24 },
        xAxis: { type: "category", data: dan.oznake.map((o) => NS.dvaMesta(o.sat)), ...NS.osaX(b) },
        yAxis: { type: "value", name: "grad, po satu", ...NS.osaY(b) },
        tooltip: {
          ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.4 } },
          formatter: (p) => {
            const i = p[0].dataIndex;
            return `${dan.oznake[i].oznaka}<br>` + (dan.zbir[i] == null ? "nema podataka"
              : `<b>${NS.broj(dan.zbir[i])}</b> biciklista · ${dan.ok[i]} brojača`);
          },
        },
        series: [{
          // sat bez podataka: siva pozadina preko cele visine (ne stubić 0)
          type: "bar", barCategoryGap: "20%", silent: true,
          data: dan.zbir.map((v) => (v == null ? Math.max(...dan.zbir.filter((x) => x != null), 1) : null)),
          itemStyle: { color: b.nema, opacity: 0.6 },
        }, {
          type: "bar", barCategoryGap: "20%", barGap: "-100%",
          data: dan.zbir.map((v, i) => ({
            value: v,
            itemStyle: { color: i === k ? b.bicikl : b["bicikl-blago"], borderRadius: [3, 3, 0, 0] },
          })),
        }],
      };
    });
    mini.ec.on("click", (p) => { satEl.value = p.dataIndex; prikaziSat(p.dataIndex); });
  }

  function zaustavi() { clearInterval(tajmer); tajmer = null; pustiEl.textContent = "▶ Pusti dan"; }
  pustiEl.addEventListener("click", () => {
    if (tajmer) { zaustavi(); return; }
    if (+satEl.value >= dan.n - 1) satEl.value = 0;
    pustiEl.textContent = "⏸ Zaustavi";
    prikaziSat(+satEl.value);
    tajmer = setInterval(() => {
      const k = +satEl.value + 1;
      if (k > dan.n - 1) { zaustavi(); return; }
      satEl.value = k;
      prikaziSat(k);
    }, 700);
  });
  satEl.addEventListener("input", () => prikaziSat(+satEl.value));
  datumEl.addEventListener("change", () => { if (datumEl.value) { zaustavi(); ucitajDan(datumEl.value); } });

  NS.prekidac(document.getElementById("mapa-rezim"), [["prosek", "Prosek"], ["dan", "Dan na mapi"]], "prosek", async (v) => {
    rezim = v;
    document.getElementById("dan-kontrole").classList.toggle("skriveno", v !== "dan");
    document.getElementById("prosek-panel").classList.toggle("skriveno", v === "dan");
    document.getElementById("mapa-opis").textContent = v === "dan"
      ? "Veličina kruga = broj biciklista u izabranom satu; sivo = nema podataka. ▶ prolazi kroz ceo dan."
      : "Veličina kruga = prosečan broj biciklista dnevno (poslednjih 12 meseci). Klik otvara stanicu.";
    if (v === "dan") {
      if (!datumEl.value) datumEl.value = g.cinjenice.najprometniji_dan.datum;
      await ucitajDan(datumEl.value);
      if (mini) mini.ec.resize();
    } else {
      zaustavi();
      prikaziProsek();
    }
  });
  satEl.value = 7;
  prikaziProsek();
  document.addEventListener("tema", () => {
    m.removeLayer(podloga);
    podloga = sloj().addTo(m);
    if (rezim === "dan") prikaziSat(+satEl.value); else prikaziProsek();
  });
  void b0;
}

// ---------------------------------------------------------------- grad: dnevni grafik sa vremenom
function gradGrafik(g) {
  const praznici = new Set(g.praznik);
  let gustina = "dan";

  function podaci() {
    if (gustina === "dan") {
      const x = g.v.map((_, i) => NS.dodajDane(g.od, i));
      const nedeljni = g.v.map((_, i) => {
        let s = 0, n = 0;
        for (let j = Math.max(0, i - 6); j <= i; j++) if (g.v[j] != null) { s += g.v[j]; n++; }
        return n >= 4 ? Math.round(s / n) : null;
      });
      return { x, v: g.v, prosek7: nedeljni, n: g.n, tsr: g.tsr, tmin: g.tmin, tmax: g.tmax, pad: g.pad };
    }
    const min = gustina === "mesec" ? 10 : 4;
    const v = NS.grupisi(g.od, g.v, gustina, min);
    const sr = (niz) => NS.grupisi(g.od, niz, gustina, 1).v;
    const dec = (niz) => {                                // prosek sa jednom decimalom (grupisi zaokružuje)
      const p = NS.grupisi(g.od, niz.map((x) => (x == null ? null : x * 10)), gustina, 1).v;
      return p.map((x) => (x == null ? null : x / 10));
    };
    const zbirPad = [];
    const grupe = new Map();
    g.pad.forEach((p, i) => {
      const d = NS.dodajDane(g.od, i);
      const k = gustina === "mesec" ? d.slice(0, 7) : NS.dodajDane(d, -((NS.danUNedelji(d) + 6) % 7));
      grupe.set(k, (grupe.get(k) || 0) + (p || 0));
    });
    for (const k of v.x) zbirPad.push(Math.round(grupe.get(k) * 10) / 10);
    return { x: v.x, v: v.v, prosek7: null, n: sr(g.n), tsr: dec(g.tsr), tmin: dec(g.tmin), tmax: dec(g.tmax), pad: zbirPad, dana: v.dana };
  }

  const graf = NS.grafik(document.getElementById("grad-grafik"), (b) => {
    const d = podaci();
    const visina = document.getElementById("grad-grafik").clientHeight || 560;
    const r = (p) => Math.round(visina * p);
    const grids = [
      { left: 56, right: 16, top: 26, height: r(0.42) },
      { left: 56, right: 16, top: r(0.42) + 50, height: r(0.08) },
      { left: 56, right: 16, top: r(0.50) + 74, height: r(0.14) },
      { left: 56, right: 16, top: r(0.64) + 98, height: r(0.09) },
    ];
    const ose = [0, 1, 2, 3];
    const xOsa = (i) => ({
      type: "category", gridIndex: i, data: d.x, boundaryGap: gustina !== "dan",
      ...NS.osaX(b, { axisLabel: { show: i === 3, color: b["ink-3"], hideOverlap: true,
        formatter: (k) => (gustina === "mesec" ? k.replace("-", ". ") : NS.datum(k).slice(0, -1)) } }),
    });
    const praznik = (i) => gustina === "dan" && praznici.has(i);
    return {
      ...NS.osnova(b),
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: grids,
      xAxis: ose.map(xOsa),
      yAxis: [
        { type: "value", gridIndex: 0, name: gustina === "dan" ? "biciklista dnevno" : "prosečan dan", ...NS.osaY(b) },
        { type: "value", gridIndex: 1, name: "brojača", minInterval: 1, splitNumber: 2, ...NS.osaY(b) },
        { type: "value", gridIndex: 2, name: "°C", splitNumber: 3, ...NS.osaY(b, { axisLabel: { color: b["ink-3"] } }) },
        { type: "value", gridIndex: 3, name: "mm", splitNumber: 2, ...NS.osaY(b, { axisLabel: { color: b["ink-3"] } }) },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: ose },
        { type: "slider", xAxisIndex: ose, bottom: 6, height: 22, borderColor: b.osa, fillerColor: "rgba(127,127,127,0.12)",
          dataBackground: { lineStyle: { color: b.osa }, areaStyle: { color: b.mreza } }, textStyle: { color: b["ink-3"] },
          labelFormatter: (_, k) => (k ? (gustina === "mesec" ? NS.mesecNaziv(k) : NS.datum(k)) : "") },
      ],
      tooltip: {
        ...NS.osnova(b).tooltip,
        formatter: (p) => {
          const i = p[0].dataIndex;
          const k = d.x[i];
          let t = `<b>${NS.oznakaPerioda(k, gustina)}</b>${praznik(i) ? " · praznik" : ""}<br>`;
          if (d.v[i] == null) t += `<span style="color:${b["nema-tekst"]}">nema kompletnih podataka</span><br>`;
          else t += `biciklista: <b>${NS.broj(d.v[i])}</b>${gustina === "dan" ? "" : " prosečno dnevno"}<br>`;
          if (d.prosek7 && d.prosek7[i] != null) t += `prosek 7 dana: ${NS.broj(d.prosek7[i])}<br>`;
          t += `uključeno brojača: ${NS.broj(d.n[i])}${gustina === "dan" ? ` od ${g.postoji[i]}` : " (prosek)"}<br>`;
          if (d.dana) t += `dana sa podatkom: ${d.dana[i][0]} od ${d.dana[i][1]}<br>`;
          if (d.tsr[i] != null) t += `temperatura: ${NS.dec(d.tsr[i])} °C (${NS.dec(d.tmin[i])} – ${NS.dec(d.tmax[i])})<br>`;
          if (d.pad[i] != null) t += `padavine: ${NS.dec(d.pad[i])} mm`;
          return t;
        },
      },
      series: [
        ...(gustina === "dan" ? [{
          name: "dnevno", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.v, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1, color: b.bicikl, opacity: 0.35 }, itemStyle: { color: b.bicikl },
          markArea: { silent: true, itemStyle: { color: b.nema, opacity: 0.6 }, data: NS.rupe(d.x, d.v).map(([a, z]) => [{ xAxis: a }, { xAxis: z }]) },
        }, {
          name: "prosek 7 dana", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.prosek7, showSymbol: false,
          lineStyle: { width: 2, color: b.bicikl }, itemStyle: { color: b.bicikl },
        }] : [{
          name: "prosečan dan", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: d.v, showSymbol: gustina === "mesec",
          symbolSize: 6, connectNulls: false, lineStyle: { width: 2, color: b.bicikl }, itemStyle: { color: b.bicikl },
          markArea: { silent: true, itemStyle: { color: b.nema, opacity: 0.6 }, data: NS.rupe(d.x, d.v).map(([a, z]) => [{ xAxis: a }, { xAxis: z }]) },
        }]),
        // mesto za kasnije: prognoza i interval 10–90 % dodaju se ovde kao nove serije na xAxisIndex 0
        { name: "brojača", type: "line", step: "middle", xAxisIndex: 1, yAxisIndex: 1, data: d.n, showSymbol: false,
          lineStyle: { width: 1.5, color: b["ink-3"] }, itemStyle: { color: b["ink-3"] } },
        { name: "tmin", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: d.tmin, stack: "t", showSymbol: false,
          lineStyle: { opacity: 0 }, silent: true },
        { name: "raspon", type: "line", xAxisIndex: 2, yAxisIndex: 2, stack: "t", showSymbol: false, silent: true,
          data: d.tmax.map((x, i) => (x == null || d.tmin[i] == null ? null : Math.round((x - d.tmin[i]) * 10) / 10)),
          lineStyle: { opacity: 0 }, areaStyle: { color: b.temp, opacity: 0.18 } },
        { name: "temperatura", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: d.tsr, showSymbol: false,
          lineStyle: { width: 1.5, color: b.temp }, itemStyle: { color: b.temp } },
        { name: "padavine", type: "bar", xAxisIndex: 3, yAxisIndex: 3, data: d.pad, barMaxWidth: 8,
          itemStyle: { color: b.kisa, borderRadius: [2, 2, 0, 0] } },
      ],
    };
  });
  NS.prekidac(document.getElementById("grad-gustina"), [["dan", "Dan"], ["nedelja", "Nedelja"], ["mesec", "Mesec"]], gustina,
    (v) => { gustina = v; graf.osvezi(); });
}

// ---------------------------------------------------------------- poređenje godina (zajednički brojači)
function godine(g) {
  const { meseci, serije, prosek } = g.mesecno;
  const indeks = Object.fromEntries(meseci.map((m, i) => [m, i]));
  const godineSve = [...new Set(meseci.map((m) => m.slice(0, 4)))];
  const selA = document.getElementById("god-a");
  const selB = document.getElementById("god-b");
  for (const sel of [selA, selB]) sel.innerHTML = godineSve.map((y) => `<option>${y}</option>`).join("");
  selA.value = "2025";
  selB.value = "2024";

  function racunaj() {
    const A = selA.value, B = selB.value;
    const red = [];
    for (let m = 1; m <= 12; m++) {
      const mm = NS.dvaMesta(m);
      const ia = indeks[`${A}-${mm}`], ib = indeks[`${B}-${mm}`];
      let sa = 0, sb = 0, n = 0;
      if (ia != null && ib != null) {
        serije.forEach((_, j) => {
          const a = prosek[ia][j], c = prosek[ib][j];
          if (a != null && c != null) { sa += a; sb += c; n++; }
        });
      }
      red.push({ m, a: n ? sa : null, b: n ? sb : null, n });
    }
    return { A, B, red };
  }

  const graf = NS.grafik(document.getElementById("godine-grafik"), (b) => {
    const { A, B, red } = racunaj();
    const stariji = +A < +B ? A : B;
    const boja = (y) => (y === stariji ? b["god-1"] : b["god-4"]);
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, left: "center", textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 10, itemHeight: 10 },
      grid: { left: 56, right: 12, top: 30, bottom: 66 },
      xAxis: { type: "category", data: red.map((r) => `${NS.MESECI_KRATKO[r.m - 1]}\n(${r.n})`), ...NS.osaX(b, { axisLabel: { color: b["ink-3"], interval: 0 } }) },
      yAxis: { type: "value", name: "prosečan dan, zbir", ...NS.osaY(b) },
      tooltip: {
        ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.4 } },
        formatter: (p) => {
          const r = red[p[0].dataIndex];
          if (!r.n) return `${NS.MESECI[r.m - 1]}: nema zajedničkih brojača`;
          const pct = 100 * (r.a / r.b - 1);
          return `<b>${NS.MESECI[r.m - 1]}</b> · ${r.n} zajedničkih brojača<br>${A}: <b>${NS.broj(r.a)}</b><br>${B}: <b>${NS.broj(r.b)}</b><br>` +
            `razlika: ${pct >= 0 ? "+" : "−"}${NS.dec(Math.abs(pct))} %`;
        },
      },
      series: [B, A].map((y) => ({
        name: y, type: "bar", barGap: "10%", barCategoryGap: "30%",
        data: red.map((r) => (y === A ? r.a : r.b)),
        itemStyle: { color: boja(y), borderRadius: [3, 3, 0, 0] },
      })),
    };
  });
  for (const sel of [selA, selB]) sel.addEventListener("change", () => graf.osvezi());
}

// ---------------------------------------------------------------- tabela stanica
function tabela(s) {
  const el = document.getElementById("tabela-stanica");
  const kolone = [
    ["serija", "Serija", (r) => r.serija, (r) => [r.mesto, r.serija]],
    ["naziv", "Naziv", (r) => r.naziv, (r) => r.naziv],
    ["smer", "Smer", (r) => r.smerovi.join(" · "), (r) => r.smerovi.join(), "prelom"],
    ["prosek", "Prosek dnevno (12 m)", (r) => NS.broj(r.prosek_12m), (r) => r.prosek_12m ?? -1, "broj"],
    ["udeo", "Validnih dana", (r) => `${NS.dec(100 * r.udeo_validnih_dana)} %`, (r) => r.udeo_validnih_dana, "broj"],
    ["period", "Period rada", (r) => `${NS.datum(r.od)} – ${NS.datum(r.do)}`, (r) => r.od],
    ["napomena", "Napomena", (r) => r.napomena || "", (r) => r.napomena || ""],
  ];
  let sort = "serija", smer = 1;
  function crtaj() {
    const k = kolone.find((x) => x[0] === sort);
    const redovi = s.serije.slice().sort((a, b) => {
      const x = k[3](a), y = k[3](b);
      return (Array.isArray(x) ? (x[0] - y[0]) || String(x[1]).localeCompare(y[1]) : typeof x === "number" ? x - y
        : String(x).localeCompare(String(y), "sr")) * smer;
    });
    el.innerHTML = `<thead><tr>${kolone.map(([id, t, , , c]) =>
      `<th data-k="${id}" class="${c || ""}" aria-sort="${id === sort ? (smer > 0 ? "ascending" : "descending") : "none"}">${t}${id === sort ? (smer > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
      <tbody>${redovi.map((r) => `<tr class="${r.napomena ? "sivo" : ""}">${kolone.map(([id, , f, , c]) =>
      `<td class="${c || ""}">${id === "serija" ? `<a href="stanica.html?id=${encodeURIComponent(r.serija)}">${f(r)}</a>` : f(r)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    el.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
      if (sort === th.dataset.k) smer = -smer; else { sort = th.dataset.k; smer = th.dataset.k === "prosek" ? -1 : 1; }
      crtaj();
    }));
  }
  crtaj();
}
