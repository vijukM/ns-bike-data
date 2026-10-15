/* Kalendar: svaki dan 2021–2026 kao polje (ECharts calendar), za ceo grad (prosek po brojaču, jer se broj brojača
   menjao) ili jednu stanicu. Boja: broj biciklista ili odstupanje od uobičajenog istog dana (isti tip dana, isti mesec).
   Dan bez kompletnih podataka je šrafiran (nikad 0). Klik na dan → detalji, satni grafik i vreme. URL: ?id=34a&dan=…&mera=… */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  let s, g;
  try { [s, g] = await Promise.all([NS.stanice(), NS.json("grad_dnevno.json")]); } catch (e) { NS.greska(main, e); return; }

  const q = new URLSearchParams(location.search);
  const GODINE = [];
  for (let y = +g.od.slice(0, 4); y <= +g.do.slice(0, 4); y++) GODINE.push(y);
  const ukupnoDana = NS.razlikaDana(g.od, g.do) + 1;
  const indeksGrada = (iso) => NS.razlikaDana(g.od, iso);
  const praznik = new Set(g.praznik.map((i) => NS.dodajDane(g.od, i)));
  const tipDana = (iso) => (praznik.has(iso) ? "praznik" : ["nedelja", "radni", "radni", "radni", "radni", "radni", "subota"][NS.danUNedelji(iso)]);
  const TIP_OPIS = { radni: "radni dan", subota: "subota", nedelja: "nedelja", praznik: "praznik" };
  const poSerijama = Object.fromEntries(s.serije.map((r) => [r.serija, r]));

  const izborEl = document.getElementById("izbor");
  izborEl.innerHTML = `<option value="grad">Ceo grad — prosek po brojaču</option><optgroup label="Stanice">` +
    s.serije.map((r) => `<option value="${r.serija}">${r.serija} · ${r.naziv}</option>`).join("") + "</optgroup>";
  let izbor = poSerijama[q.get("id")] ? q.get("id") : "grad";
  let mera = q.get("mera") === "odstupanje" ? "odstupanje" : "broj";
  izborEl.value = izbor;
  document.getElementById("kal-info").outerHTML = LJ.info("Ceo grad: zbir brojača koji su radili ceo dan podeljen brojem tih brojača (mreža je rasla sa 15 na 46 brojača, pa je zbir nepoređiv kroz godine). Šrafirano: nema kompletnog dana — nije nula.");

  // ---------------------------------------------------------------- podaci izbora
  let dani = [], poDatumu = new Map(), sortirano = [];
  async function ucitajIzbor() {
    dani = [];
    if (izbor === "grad") {
      for (let i = 0; i < ukupnoDana; i++) {
        const iso = NS.dodajDane(g.od, i), n = g.n[i], zbir = g.v[i];
        const v = zbir != null && n ? zbir / n : null;
        dani.push({ iso, v, zbir, n, post: g.postoji[i], nap: v == null ? "nijedan brojač nije radio ceo dan" : "" });
      }
    } else {
      const d = await NS.json(`dnevno/${izbor}.json`);
      const kod = new Map((d.r || []).map(([i, k]) => [i, k]));
      d.v.forEach((v, i) => {
        const iso = NS.dodajDane(d.od, i);
        const nap = v != null ? "" : (d.h[i] ? `nepotpun dan (${d.h[i]} h) — ` : "") + NS.razlog(kod.get(i) ?? 1);
        dani.push({ iso, v, h: d.h[i], nap });
      });
    }
    // uobičajeni dan: medijana istog tipa dana u istom mesecu iste godine
    const grupe = new Map();
    for (const d of dani) {
      if (d.v == null) continue;
      const k = d.iso.slice(0, 7) + tipDana(d.iso);
      if (!grupe.has(k)) grupe.set(k, []);
      grupe.get(k).push(d.v);
    }
    const medijana = new Map([...grupe].map(([k, a]) => { a.sort((x, y) => x - y); const m = a.length >> 1; return [k, a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2]; }));
    for (const d of dani) {
      const m = medijana.get(d.iso.slice(0, 7) + tipDana(d.iso));
      d.osnova = m; d.odst = d.v != null && m ? Math.round((d.v / m - 1) * 100) : null;
    }
    poDatumu = new Map(dani.map((d) => [d.iso, d]));
    sortirano = dani.filter((d) => d.v != null).sort((a, b) => b.v - a.v);
    sortirano.forEach((d, i) => { d.rang = i + 1; });
  }

  // ---------------------------------------------------------------- KPI
  const kpi = (boja, ikona, naslov, vrednost, dole) => `<div class="kpi c-${boja} pojava"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
    <span class="naslov">${naslov}</span></div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
  function crtajKpi() {
    const grad = izbor === "grad";
    const jed = grad ? " po brojaču" : "";
    // za grad je rekord najveći zbir (prosek po brojaču zavisi od toga koji su brojači tada postojali)
    const maks = grad ? sortirano.reduce((a, d) => (!a || d.zbir > a.zbir ? d : a), null) : sortirano[0];
    const radni = sortirano.filter((d) => tipDana(d.iso) === "radni");
    const min = radni[radni.length - 1];
    const sr = sortirano.reduce((a, d) => a + d.v, 0) / Math.max(1, sortirano.length);
    const srTip = (t) => { const a = sortirano.filter((d) => tipDana(d.iso) === t); return a.reduce((x, d) => x + d.v, 0) / Math.max(1, a.length); };
    const ime = grad ? "ceo grad" : `${izbor} · ${poSerijama[izbor].naziv}`;
    document.getElementById("kpi").innerHTML = !maks ? "" :
      kpi("narandzasta", "trophy", "Najprometniji dan", NS.broj(grad ? maks.zbir : maks.v), `<a href="#" data-dan="${maks.iso}">${NS.datumDug(maks.iso)}</a>${grad ? ` · zbir na <b>${maks.n}</b> brojača` : ""}`) +
      kpi("teal", "rain", `Najmirniji radni dan${jed}`, min ? NS.broj(min.v) : "—", min ? `<a href="#" data-dan="${min.iso}">${NS.datumDug(min.iso)}</a>` : "") +
      kpi("plava", "bike", `Prosečan dan${jed}`, NS.broj(sr), `radni <b>${NS.broj(srTip("radni"))}</b> · subota <b>${NS.broj(srTip("subota"))}</b> · nedelja <b>${NS.broj(srTip("nedelja"))}</b>`) +
      kpi("ljubicasta", "calendar", "Dana sa podacima", `${NS.broj(sortirano.length)}<sup>/ ${NS.broj(dani.length)}</sup>`, `${ime} · od ${NS.datum(dani[0].iso)}`);
    document.querySelectorAll("#kpi [data-dan]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); izaberi(a.dataset.dan, true); }));
    LJ.pojave(document.getElementById("kpi"));
  }

  // ---------------------------------------------------------------- kalendar
  const VISINA = 150, VRH = 34, CELIJA = 16;
  let izabran = null;
  function opsegBoje() {
    if (mera === "odstupanje") return [-60, 60];
    const a = sortirano.map((d) => d.v).sort((x, y) => x - y);
    if (!a.length) return [0, 1];
    return [Math.round(a[Math.floor(a.length * 0.02)]), Math.round(a[Math.min(a.length - 1, Math.floor(a.length * 0.98))])];
  }
  function bojeSkale(b) {
    return mera === "odstupanje" ? [b.temp, b.povrsina, b.bicikl] : [b["top-1"], b["top-2"], b["top-3"], b["top-4"], b["top-5"]];
  }
  const serijaIzabranog = (b) => {
    const k = izabran ? GODINE.indexOf(+izabran.slice(0, 4)) : 0;
    return { id: "izabran", type: "heatmap", coordinateSystem: "calendar", calendarIndex: Math.max(0, k), silent: true, z: 5,
      data: izabran ? [[izabran, 0]] : [], itemStyle: { color: "rgba(0,0,0,0)", borderColor: b.warning, borderWidth: 2.5, borderRadius: 3 } };
  };
  const kal = NS.grafik(document.getElementById("kalendar"), (b) => {
    const [min, max] = opsegBoje();
    const vr = (d) => (mera === "odstupanje" ? d.odst : Math.round(d.v));
    const series = [];
    GODINE.forEach((y, k) => {
      const godina = dani.filter((d) => +d.iso.slice(0, 4) === y);
      series.push({ id: `v${y}`, type: "heatmap", coordinateSystem: "calendar", calendarIndex: k,
        data: godina.filter((d) => d.v != null && vr(d) != null).map((d) => [d.iso, vr(d)]),
        itemStyle: { borderRadius: 3 }, emphasis: { itemStyle: { borderColor: b.ink, borderWidth: 1.5 } } });
    });
    GODINE.forEach((y, k) => {
      series.push({ id: `n${y}`, type: "heatmap", coordinateSystem: "calendar", calendarIndex: k,
        data: dani.filter((d) => +d.iso.slice(0, 4) === y && d.v == null).map((d) => [d.iso, 0]),
        itemStyle: { color: b.nema, opacity: 0.5, borderRadius: 3,
          decal: { symbol: "rect", symbolSize: 1, color: b.povrsina, dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: -Math.PI / 4 } },
        emphasis: { itemStyle: { borderColor: b.ink, borderWidth: 1.5 } } });
    });
    GODINE.forEach((y, k) => {
      series.push({ id: `p${y}`, type: "scatter", coordinateSystem: "calendar", calendarIndex: k, silent: true, z: 4, symbolSize: 4,
        data: [...praznik].filter((iso) => +iso.slice(0, 4) === y).map((iso) => [iso, 1]), itemStyle: { color: b.warning } });
    });
    series.push(serijaIzabranog(b));
    return {
      ...NS.osnova(b),
      tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => {
        const d = poDatumu.get(p.value[0]);
        if (!d) return "";
        const tip = TIP_OPIS[tipDana(d.iso)];
        if (d.v == null) return `<b>${NS.datumDug(d.iso)}</b> · ${tip}<br><span style="color:${b.warning}">nema kompletnog dana</span> — ${d.nap}`;
        return `<b>${NS.datumDug(d.iso)}</b> · ${tip}<br>${izbor === "grad" ? "prosek po brojaču" : "biciklista"}: <b>${NS.broj(d.v)}</b>` +
          (izbor === "grad" ? `<br><small>zbir ${NS.broj(d.zbir)} na ${d.n} brojača</small>` : "") +
          (d.odst != null ? `<br>prema uobičajenom: <b>${d.odst > 0 ? "+" : d.odst < 0 ? "−" : "±"}${Math.abs(d.odst)} %</b>` : "") +
          (praznik.has(d.iso) ? `<br><span style="color:${b.warning}">praznik</span>` : "");
      } },
      visualMap: { type: "continuous", show: false, min, max, seriesIndex: GODINE.map((_, k) => k), inRange: { color: bojeSkale(b) } },
      calendar: GODINE.map((y, k) => ({
        top: VRH + k * VISINA, left: 66, right: 12, cellSize: ["auto", CELIJA], range: String(y),
        itemStyle: { color: b["top-0"], borderColor: b.povrsina, borderWidth: 2 },
        splitLine: { show: true, lineStyle: { color: b.osa, width: 1.2 } },
        yearLabel: { show: true, position: "left", margin: 40, color: b.ink, fontFamily: "Inter Tight, Inter, sans-serif", fontSize: 15, fontWeight: 700 },
        dayLabel: { firstDay: 1, nameMap: ["ned", "pon", "uto", "sre", "čet", "pet", "sub"], color: b["ink-3"], fontSize: 9.5, margin: 6 },
        monthLabel: { nameMap: NS.MESECI_KRATKO, color: b["ink-3"], fontSize: 10.5, margin: 6 },
      })),
      series,
    };
  });
  kal.spreman.then((gr) => gr.ec.on("click", (p) => { if (p.value && p.value[0]) izaberi(p.value[0], true); }));

  function crtajLegendu() {
    const b = NS.boje();
    const [min, max] = opsegBoje();
    const f = mera === "odstupanje" ? (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)} %` : NS.broj;
    document.getElementById("kal-legenda").innerHTML =
      `<span class="skala"><small>${f(min)}</small><i style="background:linear-gradient(90deg,${bojeSkale(b).join(",")})"></i><small>${f(max)}${mera === "broj" ? "+" : ""}</small></span>
      <span><i class="srafura"></i>nema kompletnog dana</span><span><i class="tacka-p"></i>praznik</span><span><i class="okvir-izabran"></i>izabrani dan</span>
      <span class="sitno">${mera === "odstupanje" ? "plavo: više nego uobičajeni isti dan u mesecu; narandžasto: manje (kiša, praznik, raspust…)" : "boja: od 2. do 98. percentila"}</span>`;
  }

  NS.prekidac(document.getElementById("mera"), [["broj", "Broj biciklista"], ["odstupanje", "Prema uobičajenom"]], mera, (v) => {
    mera = v; upisiUrl(); crtajLegendu(); kal.osvezi();
  });
  izborEl.addEventListener("change", async () => {
    izbor = izborEl.value;
    await ucitajIzbor();
    crtajKpi(); crtajLegendu(); kal.osvezi();
    if (izabran) izaberi(izabran);
  });
  document.addEventListener("tema", crtajLegendu);

  function upisiUrl() {
    const p = new URLSearchParams();
    if (izbor !== "grad") p.set("id", izbor);
    if (izabran) p.set("dan", izabran);
    if (mera !== "broj") p.set("mera", mera);
    history.replaceState(null, "", `${location.pathname}${p.toString() ? "?" + p : ""}`);
  }

  // ---------------------------------------------------------------- izabrani dan
  const datumEl = document.getElementById("dan-datum");
  datumEl.min = g.od; datumEl.max = g.do;
  let stanje = null, danGraf = null;
  const procenat = (x) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x)} %`;

  async function izaberi(iso, skroluj) {
    if (iso < g.od) iso = g.od;
    if (iso > g.do) iso = g.do;
    izabran = iso;
    datumEl.value = iso;
    upisiUrl();
    if (kal.ec) kal.ec.setOption({ series: [serijaIzabranog(NS.boje())] });
    const d = poDatumu.get(iso);
    const i = indeksGrada(iso);
    const tip = tipDana(iso);
    const ym = iso.slice(0, 7);
    const [mes, met] = await Promise.all([NS.json(`sati/${ym}.json`), NS.json(`meteo_sati/${ym}.json`)]);
    const [, i0, n] = mes.dani.find((x) => x[0] === iso);
    const oznake = NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n);
    let sati;
    if (izbor === "grad") {
      const pune = Object.keys(mes.v).filter((ser) => { for (let k = 0; k < n; k++) if (mes.v[ser][i0 + k] == null) return false; return true; });
      sati = oznake.map((o, k) => ({ ...o, v: pune.length ? pune.reduce((a, ser) => a + mes.v[ser][i0 + k], 0) : null, kod: 1 }));
    } else {
      const niz = mes.v[izbor];
      sati = oznake.map((o, k) => {
        const v = niz ? niz[i0 + k] ?? null : null;
        return { ...o, v, kod: v == null ? (niz ? NS.razlogSata(mes.r[izbor], i0 + k) : 9) : 0 };
      });
    }
    sati.forEach((o, k) => { o.temp = met.temp[i0 + k]; o.pad = met.pad[i0 + k]; });
    stanje = { iso, sati };

    document.getElementById("dan-naslov").innerHTML = `${NS.datumDug(iso)}${praznik.has(iso) ? ' <span class="znacka z-delimicno">praznik</span>' : ""}`;
    document.getElementById("dan-opis").textContent = izbor === "grad" ? "ceo grad · satni zbir brojača koji su radili ceo dan" : `${izbor} · ${poSerijama[izbor].naziv}`;
    const red = (dt, dd) => `<dt>${dt}</dt><dd>${dd}</dd>`;
    const vreme = i >= 0 && i < ukupnoDana ? g : null;
    let html = "";
    if (!d || d.v == null) {
      html += red("Biciklista", `<span style="color:var(--warning)">nema kompletnog dana</span><small>${d ? d.nap : "brojač još nije postavljen"}</small>`);
    } else {
      html += red(izbor === "grad" ? "Prosek po brojaču" : "Biciklista", `<b>${NS.broj(d.v)}</b>` +
        (izbor === "grad" ? `<small>zbir ${NS.broj(d.zbir)} na ${d.n} od ${d.post} brojača</small>` : ""));
      if (d.odst != null) html += red("Prema uobičajenom", `<b style="color:${d.odst >= 0 ? "var(--primary)" : "var(--orange)"}">${procenat(d.odst)}</b><small>uobičajeni ${TIP_OPIS[tip]} u mesecu: ${NS.broj(d.osnova)}</small>`);
      html += red("Rang", `<b>${NS.broj(d.rang)}.</b><small>od ${NS.broj(sortirano.length)} dana sa podacima</small>`);
    }
    html += red("Dan", TIP_OPIS[tip]);
    if (vreme) {
      html += red("Temperatura", `${NS.dec(g.tmin[i])} … ${NS.dec(g.tmax[i])} °C<small>prosek ${NS.dec(g.tsr[i])} °C</small>`);
      html += red("Padavine", `${NS.dec(g.pad[i])} mm${g.sneg[i] > 0 ? `<small>od toga sneg ${NS.dec(g.sneg[i])} cm</small>` : ""}`);
    }
    document.getElementById("dan-cinjenice").innerHTML = html;
    document.getElementById("dan-linkovi").innerHTML =
      `<a class="dugme malo" href="mapa.html?rezim=dan&dan=${iso}${izbor !== "grad" ? `&id=${encodeURIComponent(izbor)}` : ""}">${LJ.ik("map")}Dan na mapi</a>` +
      (izbor !== "grad" ? `<a class="dugme malo" href="stanica.html?id=${encodeURIComponent(izbor)}&dan=${iso}">${LJ.ik("pin")}Otvori stanicu</a>` : "");
    if (danGraf) danGraf.osvezi(); else crtajDan();
    if (skroluj) document.getElementById("izabrani-dan").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function crtajDan() {
    danGraf = NS.grafik(document.getElementById("dan-grafik"), (b) => {
      if (!stanje) return {};
      const sati = stanje.sati;
      const maks = Math.max(10, ...sati.map((o) => o.v ?? 0));
      return {
        ...NS.osnova(b),
        legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: b["ink-2"], fontSize: 12 }, data: ["biciklisti", "temperatura"] },
        grid: { left: 50, right: 44, top: 34, bottom: 26 },
        xAxis: { type: "category", data: sati.map((o) => NS.dvaMesta(o.sat)), ...NS.osaX(b) },
        yAxis: [{ type: "value", ...NS.osaY(b) },
          { type: "value", scale: true, ...NS.osaY(b, { splitLine: { show: false }, axisLabel: { color: b["ink-3"], fontSize: 11, formatter: "{value}°" } }) }],
        tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } }, formatter: (p) => {
          const o = sati[p[0].dataIndex];
          return `<b>${o.oznaka}</b><br>` + (o.v == null ? `<span style="color:${b.warning}">nema podataka</span> — ${NS.razlog(o.kod)}` : `biciklista: <b>${NS.broj(o.v)}</b>`) +
            (o.temp != null ? `<br>temperatura: ${NS.dec(o.temp)} °C` : "") + (o.pad ? `<br>padavine: ${NS.dec(o.pad)} mm` : "");
        } },
        series: [
          { name: "nema podataka", type: "bar", silent: true, barCategoryGap: "18%", data: sati.map((o) => (o.v == null ? maks : null)), itemStyle: { color: b.nema, opacity: 0.3 } },
          { name: "biciklisti", type: "bar", barGap: "-100%", barCategoryGap: "18%", animationDelay: (k) => k * 22, data: sati.map((o) => o.v),
            itemStyle: { color: (p) => (sati[p.dataIndex].pad >= 0.5 ? b.kisa : b.bicikl), borderRadius: [4, 4, 0, 0] } },
          { name: "temperatura", type: "line", yAxisIndex: 1, smooth: 0.3, showSymbol: false, data: sati.map((o) => o.temp), lineStyle: { width: 2, color: b.temp }, itemStyle: { color: b.temp } },
        ],
      };
    });
  }

  datumEl.addEventListener("change", () => { if (datumEl.value) izaberi(datumEl.value); });
  document.getElementById("dan-pre").addEventListener("click", () => izaberi(NS.dodajDane(datumEl.value, -1)));
  document.getElementById("dan-posle").addEventListener("click", () => izaberi(NS.dodajDane(datumEl.value, 1)));

  await ucitajIzbor();
  crtajKpi();
  crtajLegendu();
  kal.osvezi();
  const pocetni = q.get("dan");
  izaberi(pocetni && /^\d{4}-\d\d-\d\d$/.test(pocetni) ? pocetni : g.cinjenice.najprometniji_dan.datum);
})();
