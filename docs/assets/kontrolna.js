/* Kontrolna tabla: KPI kartice, mapa sa stazama, najprometnija mesta, prstenovi, priča (scrollytelling),
   najprometnije stanice, brojači koji traže pažnju. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  try {
    const [s, g] = await Promise.all([NS.stanice(), NS.json("grad_dnevno.json")]);
    const a = NS.analizaGrada(g);
    kpi(s, g);
    mapaKartica(s, a);
    prica(s, g, a);
    topStanice(s);
    loseStanice(s);
  } catch (e) {
    NS.greska(main, e);
  }
})();

const ik = (ime) => LJ.ik(ime);

function kpi(s, g) {
  const c = g.cinjenice;
  const radi = s.serije.filter((r) => r.stanje === "radi").length;
  const k = c.kisa;
  const el = document.getElementById("kpi");
  const kartica = (boja, ikona, naslov, delta, id, dole) => `<div class="kpi ${boja} pojava">
    <div class="vrh"><span class="kvadrat">${ik(ikona)}</span><span class="naslov">${naslov}</span><span class="kpi-delta">${delta}</span></div>
    <div class="vrednost" id="${id}">0</div><div class="dole">${dole}</div></div>`;
  el.innerHTML = [
    kartica("c-plava", "bike", "Ukupno izbrojano", "2021–2026", "kpi-ukupno", `prolazaka · <b>${s.serije.length}</b> serija, samo validni sati`),
    kartica("c-zelena", "trophy", "Rekordan dan", `${c.najprometniji_dan.serija} brojača`, "kpi-rekord",
      `<b>${NS.datum(c.najprometniji_dan.datum)}</b> · ${NS.DANI[NS.danUNedelji(c.najprometniji_dan.datum)]}`),
    kartica("c-ljubicasta", "activity", "Brojači koji rade", "30 dana", "kpi-radi", `<b>${s.stanje_period}</b>`),
    kartica("c-teal", "rain", "Kišni radni dan", "apr–okt", "kpi-kisa",
      `suvi <b>${NS.broj(k.suvi_po_brojacu)}</b> · kišni <b>${NS.broj(k.kisni_po_brojacu)}</b> po brojaču`),
  ].join("");
  LJ.brojanje(document.getElementById("kpi-ukupno"), c.ukupno_izbrojano / 1e6, (x) => `${NS.dec(x)}<sup>M</sup>`);
  LJ.brojanje(document.getElementById("kpi-rekord"), c.najprometniji_dan.zbir, (x) => NS.broj(Math.round(x)));
  LJ.brojanje(document.getElementById("kpi-radi"), radi, (x) => `${Math.round(x)}<sup>/${s.serije.length}</sup>`);
  LJ.brojanje(document.getElementById("kpi-kisa"), k.razlika_pct, (x) => `${x < 0 ? "−" : ""}${NS.dec(Math.abs(x))}<sup>%</sup>`);
  LJ.pojave(el);
}

function mapaKartica(s, a) {
  const kontroler = MAPA.napravi(document.getElementById("mapa"), s, {
    podlogaEl: document.getElementById("podloga"), stazeEl: document.getElementById("staze-cip"),
  });
  MAPA.legenda(document.getElementById("legenda-mape"), s);
  MAPA.stanjeGrafik(document.getElementById("krofna"), s, (k) => { location.href = "stanice.html#" + k; });
  // najprometnija mesta (kao „Site visits“): prosek 12 m, traka u odnosu na najveći
  const top = s.serije.filter((r) => r.prosek_12m != null && r.stanje !== "neispravan")
    .sort((x, y) => y.prosek_12m - x.prosek_12m).slice(0, 4);
  const maks = top[0].prosek_12m;
  const boje = ["var(--primary)", "var(--purple)", "var(--teal)", "var(--orange)"];
  document.getElementById("mesta").innerHTML = top.map((r, i) => `<a class="mesto-stat" href="stanica.html?id=${r.serija}" style="--boja:${boje[i]};color:inherit;text-decoration:none">
      <div class="ime"><i></i>${r.serija} · ${r.naziv}</div>
      <div class="broj">${NS.broj(r.prosek_12m)}<small>/ DAN</small></div>
      <div class="traka-napretka"><i data-w="${Math.round(100 * r.prosek_12m / maks)}"></i></div></a>`).join("");
  document.querySelectorAll("#mesta .traka-napretka i").forEach((i) => LJ.kadVidljivo(i, () => { i.style.width = i.dataset.w + "%"; }));
  // prstenovi
  const radi = s.serije.filter((r) => r.stanje === "radi").length;
  const kompletni = s.serije.reduce((x, r) => x + r.udeo_validnih_dana, 0) / s.serije.length;
  const prs = document.getElementById("prstenovi");
  prs.innerHTML = [
    ["p1", "Brojači rade", `${radi} od ${s.serije.length}, poslednjih 30 dana`],
    ["p2", "Kompletni dani", "prosek svih serija, ceo period"],
    ["p3", "Vikend prema radnom danu", "prosek po brojaču, bez praznika"],
  ].map(([id, t, o]) => `<div class="prsten"><div id="${id}"></div><div><b>${t}</b><span class="sitno">${o}</span></div></div>`).join("");
  LJ.prsten(document.getElementById("p1"), radi / s.serije.length, "var(--success)");
  LJ.prsten(document.getElementById("p2"), kompletni, "var(--primary)");
  LJ.prsten(document.getElementById("p3"), a.vikendOdnos, "var(--purple)");
  return kontroler;
}

// ---------------------------------------------------------------- priča (scrollytelling)
function prica(s, g, a) {
  const c = g.cinjenice;
  const x = g.v.map((_, i) => NS.dodajDane(g.od, i));
  const p7 = a.po.map((_, i) => {
    let z = 0, n = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) if (a.po[j] != null) { z += a.po[j]; n++; }
    return n >= 4 ? Math.round(z / n) : null;
  });
  const maxMes = Math.max(...a.sezona), minMes = Math.min(...a.sezona);
  const ned = a.dani[6], rad = a.radni;
  const iRekord = NS.razlikaDana(g.od, c.najprometniji_dan.datum);
  const koraci = [
    { e: "01 · Pet i po godina", h: "Dan po dan, od januara 2021.", v: `${NS.broj(g.v.length)} dana`,
      t: "Svaka tačka je jedan dan: prosečan broj biciklista po brojaču koji je radio ceo dan. Talasi su godišnja doba.", g: "dani" },
    { e: "02 · Sezona", h: "Leto je više nego duplo jače od zime", v: `×${NS.dec(maxMes / minMes)}`,
      t: `Najprometniji mesec u proseku je ${NS.MESECI[a.sezona.indexOf(maxMes)]}, a najslabiji ${NS.MESECI[a.sezona.indexOf(minMes)]}.`, g: "sezona" },
    { e: "03 · Nedelja", h: "Radni dan protiv vikenda", v: NS.procenat(100 * (ned / rad - 1)),
      t: "Nedeljom se vozi znatno manje nego radnim danom: bicikl je u Novom Sadu pre svega prevoz do posla i škole.", g: "dani-u-nedelji" },
    { e: "04 · Vreme", h: "Kiša obara broj biciklista", v: NS.procenat(c.kisa.razlika_pct),
      t: `Radni dan sa ≥ 1 mm kiše (april–oktobar) ima ${NS.broj(c.kisa.kisni_po_brojacu)} biciklista po brojaču, suv ${NS.broj(c.kisa.suvi_po_brojacu)}.`, g: "kisa" },
    { e: "05 · Rekord", h: `${NS.datumDug(c.najprometniji_dan.datum)}`, v: NS.broj(c.najprometniji_dan.zbir),
      t: `Najveći gradski zbir u istoriji, izbrojan na ${c.najprometniji_dan.serija} brojača.`, g: "rekord" },
    { e: "06 · Mreža", h: "Brojača je sve više", v: `${a.n0} → ${a.nMaks}`,
      t: "Od 2021. postavljane su nove stanice, pa gradski zbir raste i zbog toga — zato se ovde porede proseci po brojaču.", g: "mreza" },
  ];
  document.getElementById("koraci").innerHTML = koraci.map((k, i) => `<article class="korak" data-i="${i}">
    <span class="eyebrow">${k.e}</span><h3>${k.h}</h3><div class="velik">${k.v}</div><p class="muted">${k.t}</p></article>`).join("");

  let aktivan = 0;
  const graf = NS.grafik(document.getElementById("prica-grafik"), (b) => {
    const k = koraci[aktivan].g;
    const baza = { ...NS.osnova(b), grid: { left: 52, right: 16, top: 30, bottom: 36 }, animationDuration: 900 };
    const linija = (podaci, extra = {}) => ({ type: "line", data: podaci, showSymbol: false, connectNulls: false, ...extra });
    const legenda = document.getElementById("prica-legenda");
    if (k === "dani" || k === "rekord" || k === "mreza") {
      const zum = k === "rekord" ? { startValue: NS.dodajDane(c.najprometniji_dan.datum, -75), endValue: NS.dodajDane(c.najprometniji_dan.datum, 45) } : {};
      legenda.innerHTML = k === "mreza" ? `<span><i class="crta" style="--boja:${b["ink-3"]}"></i>broj brojača koji su radili ceo dan</span>`
        : `<span><i class="crta" style="--boja:${b.bicikl}"></i>prosek 7 dana, po brojaču</span><span><i class="crta" style="--boja:${b["bicikl-blago"]}"></i>dan</span>`;
      return {
        ...baza,
        dataZoom: [{ type: "inside", ...zum, zoomLock: false }],
        xAxis: { type: "category", data: x, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], hideOverlap: true, formatter: (d) => NS.datum(d).slice(0, -1) } }) },
        yAxis: { type: "value", name: k === "mreza" ? "brojača" : "biciklista po brojaču", ...NS.osaY(b) },
        tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${NS.datumDug(x[q[0].dataIndex])}</b><br>` + (k === "mreza"
          ? `brojača: ${g.n[q[0].dataIndex]}` : `po brojaču: ${NS.broj(Math.round(a.po[q[0].dataIndex] ?? NaN))}<br>grad: ${NS.broj(g.v[q[0].dataIndex])}`) },
        series: k === "mreza" ? [linija(g.n, { step: "middle", lineStyle: { width: 2, color: b["ink-3"] }, itemStyle: { color: b["ink-3"] },
          areaStyle: { color: b["ink-3"], opacity: 0.12 } })]
          : [linija(a.po.map((v) => (v == null ? null : Math.round(v))), { lineStyle: { width: 1, color: b["bicikl-blago"], opacity: 0.7 }, itemStyle: { color: b["bicikl-blago"] } }),
            linija(p7, { lineStyle: { width: 2, color: b.bicikl }, itemStyle: { color: b.bicikl },
              markPoint: k === "rekord" ? { symbol: "pin", symbolSize: 54, itemStyle: { color: b.primary },
                label: { color: "#fff", fontSize: 10, formatter: "rekord" }, data: [{ coord: [x[iRekord], p7[iRekord]] }] } : undefined })],
      };
    }
    const stubici = (kat, vred, boje, ime) => {
      legenda.innerHTML = `<span><i style="--boja:${b.bicikl}"></i>${ime}</span>`;
      return {
        ...baza,
        xAxis: { type: "category", data: kat, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], interval: 0 } }) },
        yAxis: { type: "value", name: "biciklista po brojaču", ...NS.osaY(b) },
        tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } },
          formatter: (q) => `<b>${q[0].name}</b><br>${NS.broj(Math.round(q[0].value))} biciklista po brojaču` },
        series: [{ type: "bar", barCategoryGap: "28%", data: vred.map((v, i) => ({ value: Math.round(v), itemStyle: { color: boje(i), borderRadius: [4, 4, 0, 0] } })),
          label: { show: true, position: "top", color: b["ink-2"], fontSize: 11, formatter: (q) => NS.broj(q.value) } }],
        animationDelay: (i) => i * 60,
      };
    };
    if (k === "sezona") {
      const naj = a.sezona.indexOf(maxMes);
      return stubici(NS.MESECI_KRATKO, a.sezona, (i) => (i === naj ? b.bicikl : b["bicikl-blago"]), "prosečan dan u mesecu (sve godine)");
    }
    if (k === "dani-u-nedelji") return stubici(NS.DANI_KRATKO, a.dani, (i) => (i < 5 ? b.bicikl : b["bicikl-blago"]), "prosečan dan u nedelji (bez praznika)");
    return stubici(["suv radni dan", "kišni radni dan"], [c.kisa.suvi_po_brojacu, c.kisa.kisni_po_brojacu],
      (i) => (i === 0 ? b.bicikl : b["bicikl-blago"]), "april–oktobar, kišni ≥ 1 mm");
  });
  const clanci = [...document.querySelectorAll("#koraci .korak")];
  const aktiviraj = (i) => {
    if (i === aktivan && clanci[i].classList.contains("aktivan")) return;
    aktivan = i;
    clanci.forEach((el, j) => el.classList.toggle("aktivan", j === i));
    graf.spreman.then(() => graf.osvezi());
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((unosi) => {
      for (const u of unosi) if (u.isIntersecting) aktiviraj(+u.target.dataset.i);
    }, { rootMargin: "-45% 0px -45% 0px" });
    clanci.forEach((el) => io.observe(el));
  }
  aktiviraj(0);
}

function topStanice(s) {
  const top = s.serije.filter((r) => r.prosek_12m != null && r.stanje !== "neispravan")
    .sort((x, y) => y.prosek_12m - x.prosek_12m).slice(0, 8);
  const maks = top[0].prosek_12m;
  const el = document.getElementById("top-stanice");
  el.innerHTML = `<thead><tr><th>#</th><th>Stanica</th><th class="broj">Prosek / dan</th><th>Udeo</th><th>Stanje</th></tr></thead><tbody>` +
    top.map((r, i) => `<tr><td class="mono">${String(i + 1).padStart(2, "0")}</td>
      <td><a class="stanica-celija" href="stanica.html?id=${r.serija}" style="color:inherit;text-decoration:none"><img src="${NS.pin(r.stanje)}" alt="">
        <span><b>${r.serija} · ${r.naziv}</b><small>${r.smerovi[0]}</small></span></a></td>
      <td class="broj"><b>${NS.broj(r.prosek_12m)}</b></td>
      <td><div class="mini-traka"><div class="traka-napretka"><i data-w="${Math.round(100 * r.prosek_12m / maks)}"></i></div></div></td>
      <td><span class="znacka tacka z-${r.stanje}">${s.stanja[r.stanje]}</span></td></tr>`).join("") + "</tbody>";
  el.querySelectorAll(".traka-napretka i").forEach((i) => LJ.kadVidljivo(i, () => { i.style.width = i.dataset.w + "%"; }));
}

function loseStanice(s) {
  document.getElementById("stanje-period").textContent = `Stanje · ${s.stanje_period}`;
  const lose = s.serije.filter((r) => r.stanje !== "radi");
  document.getElementById("lose-stanice").innerHTML = lose.map((r) => `<button type="button" onclick="location.href='stanica.html?id=${r.serija}'">
    <img src="${NS.pin(r.stanje)}" alt=""><span>${r.serija} · ${r.naziv}<small>${r.napomena || s.stanja[r.stanje]}</small></span>
    <span class="vrednost-reda">${r.kompletnih_30d}/30</span></button>`).join("") || '<p class="sitno">Svi brojači rade.</p>';
}
