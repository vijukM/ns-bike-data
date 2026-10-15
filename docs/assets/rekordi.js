/* Rekordi i zanimljivosti (data/istorija/rekordi.json, računa pripremi_istoriju.py): top dani, godine, vremenski
   rekordi, činjenice i rekordi po stanici. Dani vode u kalendar (kalendar.html?dan=…). */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  let s, r;
  try { [s, r] = await Promise.all([NS.stanice(), NS.json("rekordi.json")]); } catch (e) { NS.greska(main, e); return; }
  const poSerijama = Object.fromEntries(s.serije.map((x) => [x.serija, x]));
  const kalLink = (iso, serija) => `kalendar.html?${serija ? `id=${encodeURIComponent(serija)}&` : ""}dan=${iso}`;
  const procenat = (x) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x)} %`;
  const TIP = { radni: "radni dan", subota: "subota", nedelja_praznik: "nedelja / praznik" };
  const kratak = (iso) => { const [g, m, d] = iso.split("-").map(Number); return `${d}. ${m}. ${g}.`; };

  // ---------------------------------------------------------------- KPI
  const z = Object.fromEntries(r.zanimljivosti.map((x) => [x.ik, x]));
  const top = r.top_dani[0];
  const kpi = (boja, ikona, naslov, id, dole) => `<div class="kpi c-${boja} pojava"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
    <span class="naslov">${naslov}</span></div><div class="vrednost" id="${id}">0</div><div class="dole">${dole}</div></div>`;
  document.getElementById("kpi").innerHTML =
    kpi("narandzasta", "trophy", "Najprometniji dan", "k-dan", `<a href="${kalLink(top.datum)}">${NS.datumDug(top.datum)}</a> · ${top.n} brojača`) +
    kpi("plava", "clock", "Najprometniji sat", "k-sat", z.clock ? z.clock.opis : "") +
    kpi("ljubicasta", "calendar", "Najprometnija nedelja", "k-ned", z.calendar ? z.calendar.opis.replace(" (zbir svih brojača)", "") : "") +
    kpi("zelena", "bike", "Ukupno izbrojano", "k-uk", "od 1. 1. 2021. do 31. 8. 2026.");
  LJ.brojanje(document.getElementById("k-dan"), top.zbir, (x) => NS.broj(Math.round(x)));
  if (z.clock) LJ.brojanje(document.getElementById("k-sat"), z.clock.vrednost, (x) => NS.broj(Math.round(x)));
  if (z.calendar) LJ.brojanje(document.getElementById("k-ned"), z.calendar.vrednost, (x) => NS.broj(Math.round(x)));
  LJ.brojanje(document.getElementById("k-uk"), z.bike.vrednost / 1e6, (x) => `${NS.dec(x)}<sup>mil.</sup>`);
  LJ.pojave(document.getElementById("kpi"));

  // ---------------------------------------------------------------- top 10 dana
  let mera = "zbir";
  document.getElementById("top-info").outerHTML = LJ.info("Zbir grada: svi brojači koji su radili ceo dan. Po brojaču: zbir podeljen brojem tih brojača — pošteno poređenje kroz godine, jer je mreža rasla sa 15 na 46 brojača.");
  const topGraf = NS.grafik(document.getElementById("top-grafik"), (b) => {
    const dani = mera === "zbir" ? r.top_dani : r.top_po_brojacu;
    return {
      ...NS.osnova(b),
      grid: { left: 96, right: 64, top: 6, bottom: 24 },
      tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } }, formatter: (p) => {
        const d = dani[p[0].dataIndex];
        return `<b>${NS.datumDug(d.datum)}</b> · ${TIP[d.tip]}<br>zbir: <b>${NS.broj(d.zbir)}</b> na ${d.n} brojača<br>po brojaču: <b>${NS.broj(d.po)}</b>` +
          `<br>${NS.dec(d.tmin)} … ${NS.dec(d.tmax)} °C · ${NS.dec(d.pad)} mm<br><small>klik otvara dan u kalendaru</small>`;
      } },
      xAxis: { type: "value", ...NS.osaY(b) },
      yAxis: { type: "category", inverse: true, data: dani.map((d) => kratak(d.datum)), ...NS.osaX(b, { axisLabel: { color: b["ink-2"], fontSize: 11.5 } }) },
      series: [{ type: "bar", barWidth: 16, data: dani.map((d, i) => ({ value: mera === "zbir" ? d.zbir : d.po,
        itemStyle: { color: i === 0 ? b.warning : b.bicikl, borderRadius: 8 } })),
      label: { show: true, position: "right", color: b["ink-2"], fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", formatter: (p) => NS.broj(p.value) },
      animationDelay: (i) => i * 60, cursor: "pointer" }],
    };
  });
  topGraf.spreman.then((g) => g.ec.on("click", (p) => {
    const d = (mera === "zbir" ? r.top_dani : r.top_po_brojacu)[p.dataIndex];
    if (d) location.href = kalLink(d.datum);
  }));
  NS.prekidac(document.getElementById("top-mera"), [["zbir", "Zbir grada"], ["po", "Po brojaču"]], mera, (v) => { mera = v; topGraf.osvezi(); });

  // ---------------------------------------------------------------- godine
  document.getElementById("god-info").outerHTML = LJ.info("Zbir svih validnih sati svih brojača u godini. Mreža je rasla (crta = broj brojača), a 2026. je do 31. 8. — pa rast nije samo rast broja biciklista.");
  NS.grafik(document.getElementById("god-grafik"), (b) => ({
    ...NS.osnova(b),
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: b["ink-2"], fontSize: 12 } },
    grid: { left: 56, right: 40, top: 36, bottom: 26 },
    tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } }, formatter: (p) => {
      const g = r.godine[p[0].dataIndex];
      return `<b>${g.godina}.${g.godina === 2026 ? " (do 31. 8.)" : ""}</b><br>izbrojano: <b>${NS.broj(g.ukupno)}</b><br>brojača: ${g.brojaca}`;
    } },
    xAxis: { type: "category", data: r.godine.map((g) => String(g.godina)), ...NS.osaX(b) },
    yAxis: [{ type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11, formatter: (v) => `${NS.dec(v / 1e6)} M` } }) },
      { type: "value", min: 0, max: 50, ...NS.osaY(b, { splitLine: { show: false } }) }],
    series: [
      { name: "izbrojano", type: "bar", barWidth: "52%", data: r.godine.map((g) => ({ value: g.ukupno,
        itemStyle: { color: g.godina === 2026 ? b["bicikl-blago"] : b.bicikl, borderRadius: [6, 6, 0, 0] } })), itemStyle: { color: b.bicikl },
        label: { show: true, position: "top", color: b["ink-2"], fontSize: 11, formatter: (p) => `${NS.dec(p.value / 1e6)} M${r.godine[p.dataIndex].godina === 2026 ? "*" : ""}` } },
      { name: "brojača", type: "line", yAxisIndex: 1, data: r.godine.map((g) => g.brojaca), symbol: "circle", symbolSize: 7,
        lineStyle: { color: b["tip-3"], width: 2 }, itemStyle: { color: b["tip-3"] } },
    ],
  }));

  // ---------------------------------------------------------------- vreme
  const VREME = [
    ["najtopliji", "thermo", "Najtopliji dan", (d) => `${NS.dec(d.tmax)}<sup>°C</sup>`, "c-narandzasta"],
    ["najhladniji", "thermo", "Najhladniji dan", (d) => `${NS.dec(d.tmin)}<sup>°C</sup>`, "c-plava"],
    ["najkisniji", "rain", "Najkišniji dan", (d) => `${NS.dec(d.pad)}<sup>mm</sup>`, "c-teal"],
    ["najsnezniji", "cloud", "Najviše snega", (d) => `${NS.dec(d.sneg)}<sup>cm</sup>`, "c-ljubicasta"],
  ];
  document.getElementById("vreme").innerHTML = VREME.map(([k, ik, t, f, boja]) => {
    const d = r.vreme[k];
    return `<a class="rekord ${boja}" href="${kalLink(d.datum)}"><span class="kvadrat">${LJ.ik(ik)}</span>
      <span class="eyebrow">${t}</span><b class="vel">${f(d)}</b><span class="datum">${NS.datumDug(d.datum)}</span>
      <span class="biciklisti"><b>${NS.broj(d.po)}</b> po brojaču <span class="znacka ${d.odst < 0 ? "z-ne_radi" : "z-radi"}">${procenat(d.odst)}</span></span>
      <small class="sitno">prema uobičajenom istom danu u mesecu</small></a>`;
  }).join("") + `<div class="mirni"><span class="eyebrow">Najmirniji radni dani</span>${r.najmirniji_radni.map((d) =>
    `<a href="${kalLink(d.datum)}"><span>${NS.datumDug(d.datum)}<small>${NS.dec(d.tmin)} … ${NS.dec(d.tmax)} °C · ${NS.dec(d.pad)} mm${d.sneg > 0 ? ` · sneg ${NS.dec(d.sneg)} cm` : ""}</small></span>
      <b>${NS.broj(d.po)}</b></a>`).join("")}<small class="sitno">po brojaču; zbir podeljen brojem brojača koji su radili ceo dan</small></div>`;

  // ---------------------------------------------------------------- zanimljivosti
  const zEl = document.getElementById("zanimljivosti");
  zEl.innerHTML = r.zanimljivosti.map((x, i) => {
    const link = x.serija && x.datum ? kalLink(x.datum, x.serija) : x.serija ? `stanica.html?id=${encodeURIComponent(x.serija)}` : x.datum ? kalLink(x.datum) : null;
    const tag = link ? "a" : "div";
    return `<${tag} class="cinjenica pojava" ${link ? `href="${link}"` : ""}><span class="kvadrat">${LJ.ik(x.ik)}</span>
      <span class="eyebrow">${x.naslov}</span><b class="vel" id="z-${i}">${typeof x.vrednost === "number" ? "0" : x.vrednost}</b><span class="muted">${x.opis}</span></${tag}>`;
  }).join("");
  r.zanimljivosti.forEach((x, i) => {
    if (typeof x.vrednost !== "number") return;
    const el = document.getElementById(`z-${i}`);
    const dec = !Number.isInteger(x.vrednost);
    LJ.brojanje(el, x.vrednost, (v) => `${x.znak && v < 0 ? "−" : ""}${dec ? NS.dec(Math.abs(v)) : NS.broj(Math.round(Math.abs(v)))}${x.jed ? `<sup>${x.jed}</sup>` : ""}`);
  });
  LJ.pojave(zEl);

  // ---------------------------------------------------------------- tabela po stanici
  const kolone = [
    ["serija", "Stanica", (x) => [parseInt(x.serija, 10), x.serija]],
    ["dan", "Najbolji dan", (x) => (x.dan ? x.dan.v : -1), "broj"],
    ["sat", "Najbolji sat", (x) => x.sat.v, "broj"],
    ["ukupno", "Ukupno izbrojano", (x) => x.ukupno, "broj"],
    ["kompletnih", "Kompletnih dana", (x) => x.kompletnih, "broj"],
    ["niz", "Najduži niz", (x) => x.niz.dana, "broj"],
  ];
  let sort = "ukupno", smer = -1, sve = false;
  const tabela = document.getElementById("tabela");
  const maksUk = Math.max(...r.po_stanici.map((x) => x.ukupno));
  function crtajTabelu() {
    const k = kolone.find((x) => x[0] === sort);
    const redovi = r.po_stanici.slice().sort((a, b) => {
      const x = k[2](a), y = k[2](b);
      return (Array.isArray(x) ? (x[0] - y[0]) || x[1].localeCompare(y[1]) : x - y) * smer;
    });
    const ukupnoRedova = redovi.length;
    if (!sve) redovi.splice(15);
    tabela.innerHTML = `<thead><tr>${kolone.map(([id, t, , c]) => `<th data-k="${id}" class="${c || ""}" aria-sort="${id === sort ? (smer > 0 ? "ascending" : "descending") : "none"}">${t}${id === sort ? (smer > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
      <tbody>${redovi.map((x) => {
    const st = poSerijama[x.serija] || { naziv: "", stanje: "radi" };
    return `<tr><td><a class="stanica-celija" href="stanica.html?id=${encodeURIComponent(x.serija)}" style="color:inherit;text-decoration:none">
          <img src="${NS.pin(st.stanje)}" alt=""><span><b>${x.serija} · ${st.naziv}</b><small>${(st.smerovi || []).join(" · ")}</small></span></a></td>
        <td class="broj">${x.dan ? `<b>${NS.broj(x.dan.v)}</b><a class="sitno" style="display:block;white-space:nowrap" href="${kalLink(x.dan.datum, x.serija)}">${NS.datum(x.dan.datum)}</a>` : "—"}</td>
        <td class="broj"><b>${NS.broj(x.sat.v)}</b><a class="sitno" style="display:block;white-space:nowrap" href="${kalLink(x.sat.datum, x.serija)}">${NS.datum(x.sat.datum)} · ${NS.dvaMesta(x.sat.sat)}–${NS.dvaMesta((x.sat.sat + 1) % 24)} h</a></td>
        <td class="broj"><b>${NS.broj(x.ukupno)}</b><div class="traka-napretka" style="margin-top:6px"><i style="width:${(100 * x.ukupno / maksUk).toFixed(1)}%"></i></div></td>
        <td class="broj mono">${NS.broj(x.kompletnih)}</td>
        <td class="broj"><b>${NS.broj(x.niz.dana)}</b>${x.niz.od ? `<small class="sitno" style="display:block">${NS.datum(x.niz.od)} – ${NS.datum(x.niz.do)}</small>` : ""}</td></tr>`;
  }).join("")}</tbody>`;
    let vise = document.getElementById("vise-redova");
    if (!vise) {
      vise = document.createElement("div");
      vise.id = "vise-redova"; vise.className = "vise-redova";
      tabela.closest(".tabela-omot").after(vise);
      vise.addEventListener("click", () => { sve = !sve; crtajTabelu(); });
    }
    vise.innerHTML = `<button class="dugme malo" type="button">${sve ? "Prikaži prvih 15" : `Prikaži sve (${ukupnoRedova})`}</button>`;
  }
  tabela.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-k]");
    if (!th) return;
    if (sort === th.dataset.k) smer = -smer; else { sort = th.dataset.k; smer = th.dataset.k === "serija" ? 1 : -1; }
    crtajTabelu();
  });
  crtajTabelu();
})();
