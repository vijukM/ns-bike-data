/* Ritam grada (data/istorija/ritam.json): prosečan brojač po satu — sat × dan u nedelji, brojčanik od 24 sata,
   godišnja doba, „kad grad ustaje“ po mesecima i radni dan kroz godine. Sati su lokalni (Europe/Belgrade). */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  let t;
  try { t = await NS.json("ritam.json"); } catch (e) { NS.greska(main, e); return; }
  const SATI = Array.from({ length: 24 }, (_, h) => NS.dvaMesta(h));
  const satTekst = (h) => `${NS.dvaMesta(h)}–${NS.dvaMesta((h + 1) % 24)}\u00a0h`;
  const sat = (x) => { const h = Math.floor(x), m = Math.round((x - h) * 60); return `${NS.dvaMesta(h + (m === 60 ? 1 : 0))}:${NS.dvaMesta(m % 60)}`; };
  const argmax = (a, od, do_) => { let k = od; for (let h = od; h <= do_; h++) if (a[h] > a[k]) k = h; return k; };
  const SEZ = ["zima", "prolece", "leto", "jesen"];
  const bojeSezona = () => (NS.tamna() ? { zima: "#3987e5", prolece: "#199e70", leto: "#d95926", jesen: "#c98500" }
    : { zima: "#2a78d6", prolece: "#1baf7a", leto: "#eb6834", jesen: "#eda100" });
  const legenda = (b) => ({ top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: b["ink-2"], fontSize: 12 } });

  // ---------------------------------------------------------------- KPI
  const radni = t.profili.ukupno.radni, subota = t.profili.ukupno.subota;
  const jutro = argmax(radni, 5, 9), popodne = argmax(radni, 13, 19), vikendVrh = argmax(subota, 6, 21);
  const jul = t.po_mesecu[6], jan = t.po_mesecu[0];
  const ustaju = t.po_mesecu.filter((m) => m.ustaje != null);
  const prosekUst = ustaju.reduce((a, m) => a + m.ustaje, 0) / ustaju.length;
  const najranije = ustaju.reduce((a, m) => (m.ustaje < a.ustaje ? m : a)), najkasnije = ustaju.reduce((a, m) => (m.ustaje > a.ustaje ? m : a));
  const noc = [22, 23, 0, 1, 2, 3, 4].reduce((a, h) => a + t.udeo_po_satu[h], 0);
  const kpi = (boja, ikona, naslov, vrednost, dole) => `<div class="kpi c-${boja} pojava"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
    <span class="naslov">${naslov}</span></div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
  document.getElementById("kpi").innerHTML =
    kpi("plava", "sun", "Jutarnja špica", satTekst(jutro).replace("\u00a0h", "<sup>h</sup>"), `radnim danom · subotom vrh u <b>${satTekst(vikendVrh)}</b>`) +
    kpi("narandzasta", "activity", "Popodnevna špica", satTekst(popodne).replace("\u00a0h", "<sup>h</sup>"), `leti <b>${satTekst(jul.popodnevni_vrh)}</b> · zimi <b>${satTekst(jan.popodnevni_vrh)}</b>`) +
    kpi("zelena", "clock", "Grad „ustaje“", sat(prosekUst), `najranije <b>${sat(najranije.ustaje)}</b> (${NS.MESECI[najranije.mesec - 1]}) · najkasnije <b>${sat(najkasnije.ustaje)}</b> (${NS.MESECI[najkasnije.mesec - 1]})`) +
    kpi("ljubicasta", "moon", "Noćna vožnja", `${NS.dec(noc)}<sup>%</sup>`, "svih biciklista vozi između 22 i 05 h");
  LJ.pojave(document.getElementById("kpi"));

  // ---------------------------------------------------------------- sat × dan
  document.getElementById("tm-info").outerHTML = LJ.info("Prosečan broj biciklista po brojaču u satu, za svaki dan u nedelji (praznici nisu uključeni). Svetlije = više.");
  NS.grafik(document.getElementById("tm-grafik"), (b) => {
    const d = [];
    let maks = 0;
    t.toplotna_mapa.forEach((red, w) => red.forEach((v, h) => { d.push([h, w, v]); maks = Math.max(maks, v || 0); }));
    return {
      ...NS.osnova(b),
      tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => `<b>${NS.DANI[(p.value[1] + 1) % 7]}</b>, ${satTekst(p.value[0])}<br>prosečno <b>${NS.broj(p.value[2])}</b> biciklista po brojaču` },
      grid: { left: 44, right: 10, top: 6, bottom: 52 },
      xAxis: { type: "category", data: SATI, ...NS.osaX(b), splitArea: { show: false } },
      yAxis: { type: "category", data: NS.DANI_KRATKO, inverse: true, ...NS.osaX(b) },
      visualMap: { min: 0, max: Math.ceil(maks), calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 180, itemWidth: 10,
        textStyle: { color: b["ink-3"], fontSize: 11 }, inRange: { color: [b["top-0"], b["top-1"], b["top-2"], b["top-3"], b["top-4"], b["top-5"]] } },
      series: [{ type: "heatmap", data: d, itemStyle: { borderColor: b.povrsina, borderWidth: 2, borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: b.ink, borderWidth: 1.5 } }, animationDuration: 900 }],
    };
  });

  // ---------------------------------------------------------------- brojčanik
  let sezBc = "ukupno";
  const bc = NS.grafik(document.getElementById("bc-grafik"), (b) => {
    const p = t.profili[sezBc];
    const krug = (a) => [...a.map((v, h) => [v, h + 0.5]), [a[0], 24.5]];
    const serija = (ime, a, boja) => ({ name: ime, type: "line", coordinateSystem: "polar", data: krug(a), smooth: 0.35, symbol: "none",
      lineStyle: { width: 2.5, color: boja }, itemStyle: { color: boja }, areaStyle: { color: boja, opacity: 0.12 } });
    return {
      ...NS.osnova(b),
      legend: { ...legenda(b), top: "bottom", left: "center" },
      tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (q) => `<b>${q.seriesName}</b>, ${satTekst(Math.floor(q.value[1]) % 24)}<br>${NS.broj(q.value[0])} po brojaču` },
      polar: { radius: ["8%", "76%"], center: ["50%", "47%"] },
      angleAxis: { type: "value", min: 0, max: 24, interval: 3, startAngle: 90, clockwise: true,
        axisLine: { lineStyle: { color: b.osa } }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: b.mreza } },
        axisLabel: { color: b["ink-3"], fontSize: 11, formatter: (v) => (v === 24 ? "" : `${NS.dvaMesta(v)} h`) } },
      radiusAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: b.mreza, type: "dashed" } } },
      series: [serija("radni dan", p.radni, b["tip-1"]), serija("subota", p.subota, b["tip-2"]), serija("nedelja i praznik", p.nedelja_praznik, b["tip-3"])],
    };
  });
  NS.prekidac(document.getElementById("bc-sezona"), [["ukupno", "Godina"], ["zima", "Zima"], ["prolece", "Proleće"], ["leto", "Leto"], ["jesen", "Jesen"]],
    sezBc, (v) => { sezBc = v; bc.osvezi(); });

  // ---------------------------------------------------------------- godišnja doba
  let tip = "radni";
  document.getElementById("gd-info").outerHTML = LJ.info("Prosečan brojač po satu za izabrani tip dana. Zima: dec–feb, proleće: mar–maj, leto: jun–avg, jesen: sep–nov.");
  const gd = NS.grafik(document.getElementById("gd-grafik"), (b) => {
    const bs = bojeSezona();
    return {
      ...NS.osnova(b),
      legend: legenda(b),
      grid: { left: 48, right: 14, top: 36, bottom: 28 },
      tooltip: { ...NS.osnova(b).tooltip, valueFormatter: (v) => `${NS.broj(v)} po brojaču` },
      xAxis: { type: "category", data: SATI, boundaryGap: false, ...NS.osaX(b) },
      yAxis: { type: "value", ...NS.osaY(b) },
      series: SEZ.map((k) => ({ name: NS.SEZONE[k], type: "line", smooth: 0.3, symbol: "none", data: t.profili[k][tip],
        lineStyle: { width: 2.5, color: bs[k] }, itemStyle: { color: bs[k] }, areaStyle: { color: bs[k], opacity: 0.06 }, animationDuration: 1400 })),
    };
  });
  NS.prekidac(document.getElementById("gd-tip"), [["radni", "Radni dan"], ["subota", "Subota"], ["nedelja_praznik", "Nedelja i praznik"]], tip, (v) => { tip = v; gd.osvezi(); });

  // ---------------------------------------------------------------- kad grad ustaje
  document.getElementById("us-info").outerHTML = LJ.info("Radnim danom, po mesecu (sve godine zajedno). „Ustaje“: trenutak kad promet pređe pola jutarnjeg vrha. Vrh: sat sa najviše biciklista ujutru (05–10 h) i popodne (13–20 h).");
  NS.grafik(document.getElementById("us-grafik"), (b) => {
    const m = t.po_mesecu;
    const ser = (ime, f, boja, sim) => ({ name: ime, type: "line", data: m.map(f), symbol: sim, symbolSize: 8, smooth: 0.25,
      lineStyle: { width: 2.5, color: boja }, itemStyle: { color: boja } });
    return {
      ...NS.osnova(b),
      legend: legenda(b),
      grid: { left: 52, right: 14, top: 36, bottom: 28 },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (p) => `<b>${NS.MESECI[p[0].dataIndex]}</b>` + p.map((q) => `<br>${q.marker}${q.seriesName}: <b>${q.seriesName === "grad ustaje" ? sat(q.value) : satTekst(Math.floor(q.value))}</b>`).join("") },
      xAxis: { type: "category", data: NS.MESECI_KRATKO, ...NS.osaX(b) },
      yAxis: { type: "value", min: 5, max: 21, interval: 2, inverse: true, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11, formatter: (v) => `${NS.dvaMesta(v)}:00` } }) },
      series: [
        ser("grad ustaje", (x) => x.ustaje, b.kisa, "circle"),
        ser("jutarnji vrh", (x) => (x.jutarnji_vrh == null ? null : x.jutarnji_vrh + 0.5), b["tip-1"], "roundRect"),
        ser("popodnevni vrh", (x) => (x.popodnevni_vrh == null ? null : x.popodnevni_vrh + 0.5), b.temp, "roundRect"),
      ],
    };
  });

  // ---------------------------------------------------------------- kroz godine
  document.getElementById("gg-info").outerHTML = LJ.info("Udeo dnevnog prometa po satu (radni dani), svaka godina posebno — da se vidi da li se špice pomeraju. 2026. je do 31. 8.");
  NS.grafik(document.getElementById("gg-grafik"), (b) => {
    const god = Object.keys(t.radni_po_godini);
    return {
      ...NS.osnova(b),
      legend: legenda(b),
      grid: { left: 44, right: 14, top: 36, bottom: 28 },
      tooltip: { ...NS.osnova(b).tooltip, valueFormatter: (v) => `${NS.dec(v)} % dana` },
      xAxis: { type: "category", data: SATI, boundaryGap: false, ...NS.osaX(b) },
      yAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11, formatter: (v) => `${v} %` } }) },
      series: god.map((g, i) => ({ name: g, type: "line", smooth: 0.3, symbol: "none", data: t.radni_po_godini[g],
        lineStyle: { width: i === god.length - 1 ? 3 : 1.8, color: b[`god-${i}`] }, itemStyle: { color: b[`god-${i}`] } })),
    };
  });
  document.addEventListener("tema", () => { gd.osvezi(); });
})();
