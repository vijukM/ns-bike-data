/* Stanica (stanica.html?id=23a): zaglavlje, dnevni grafik celog perioda, satni profil, toplotna mapa sat × dan,
   meseci po godinama, izabrani dan (satno + vreme). Grafici primaju i dodatne serije (prognoza, interval) kasnije. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const id = new URLSearchParams(location.search).get("id") || "23a";
  try {
    const s = await NS.stanice();
    NS.spisakStanica(document.getElementById("izbor-stanice"), s, id);
    const r = s.serije.find((x) => x.serija === id);
    if (!r) throw new Error(`nepoznata stanica „${id}“`);
    document.title = `${r.serija} · ${r.naziv} · Biciklisti Novog Sada`;
    const [d, p] = await Promise.all([NS.json(`dnevno/${id}.json`), NS.json(`profili/${id}.json`)]);
    glava(s, r, d);
    const izaberiDan = izabraniDan(s, r, d);
    dnevniGrafik(s, d, izaberiDan);
    profil(p);
    toplota(p);
    meseciPoGodinama(p);
  } catch (e) {
    NS.greska(main, e);
  }
})();

const satiDana = (s, iso) => s.dani_bez_24h[iso] || 24;

function glava(s, r, d) {
  const nepotpuni = d.v.filter((x) => x == null).length;
  const upozorenja = [];
  if (r.napomena) upozorenja.push(`<div class="upozorenje"><span><b>${r.napomena}</b>. Ti sati su na graficima sivi i ne ulaze u gradske zbirove.</span></div>`);
  if (nepotpuni) {
    upozorenja.push(`<div class="upozorenje"><span>Brojač nije imao kompletne podatke za <b>${NS.broj(nepotpuni)}</b> od ${NS.broj(d.v.length)} dana
      (${NS.dec(100 * nepotpuni / d.v.length)} %). Ti dani su sivi; razlog piše kad se pređe preko njih.</span></div>`);
  }
  document.getElementById("glava").innerHTML = `
    <h1>${r.serija} · ${r.naziv}</h1>
    <div class="meta">
      <span>mesto <b>${r.mesto}</b></span>
      <span>${r.smerovi.length > 1 ? "smerovi (zbir)" : "smer"}: <b>${r.smerovi.join(" · ")}</b></span>
    </div>
    <div class="meta">
      <span>radi: <b>${NS.datum(r.od)} – ${NS.datum(r.do)}</b></span>
      <span>prosek dnevno (9/2025–8/2026): <b>${NS.broj(r.prosek_12m)}</b></span>
      <span>kompletnih dana: <b>${NS.dec(100 * r.udeo_validnih_dana)} %</b></span>
    </div>
    ${upozorenja.join("")}`;
}

// ---------------------------------------------------------------- dnevno, ceo period
function dnevniGrafik(s, d, izaberiDan) {
  const razlozi = new Map(d.r);
  let gustina = "dan";
  const el = document.getElementById("dnevno-grafik");

  function podaci() {
    if (gustina === "dan") {
      const x = d.v.map((_, i) => NS.dodajDane(d.od, i));
      const p7 = d.v.map((_, i) => {
        let z = 0, n = 0;
        for (let j = Math.max(0, i - 6); j <= i; j++) if (d.v[j] != null) { z += d.v[j]; n++; }
        return n >= 4 ? Math.round(z / n) : null;
      });
      return { x, v: d.v, p7 };
    }
    const g = NS.grupisi(d.od, d.v, gustina, gustina === "mesec" ? 10 : 4);
    return { x: g.x, v: g.v, p7: null, dana: g.dana };
  }

  const graf = NS.grafik(el, (b) => {
    const p = podaci();
    const rupe = NS.rupe(p.x, p.v).map(([a, z]) => [{ xAxis: a }, { xAxis: z }]);
    return {
      ...NS.osnova(b),
      grid: { left: 56, right: 16, top: 30, bottom: 64 },
      xAxis: {
        type: "category", data: p.x, boundaryGap: gustina !== "dan",
        ...NS.osaX(b, { axisLabel: { color: b["ink-3"], hideOverlap: true,
          formatter: (k) => (gustina === "mesec" ? k.replace("-", ". ") : NS.datum(k).slice(0, -1)) } }),
      },
      yAxis: { type: "value", name: gustina === "dan" ? "biciklista dnevno" : "prosečan dan", ...NS.osaY(b) },
      dataZoom: [
        { type: "inside" },
        { type: "slider", bottom: 8, height: 22, borderColor: b.osa, fillerColor: "rgba(127,127,127,0.12)",
          dataBackground: { lineStyle: { color: b.osa }, areaStyle: { color: b.mreza } }, textStyle: { color: b["ink-3"] },
          labelFormatter: (_, k) => (k ? (gustina === "mesec" ? NS.mesecNaziv(k) : NS.datum(k)) : "") },
      ],
      tooltip: {
        ...NS.osnova(b).tooltip,
        formatter: (q) => {
          const i = q[0].dataIndex;
          const k = p.x[i];
          let t = `<b>${NS.oznakaPerioda(k, gustina)}</b><br>`;
          if (gustina === "dan") {
            if (p.v[i] == null) {
              const n = satiDana(s, k);
              t += d.h[i] ? `<span style="color:${b["nema-tekst"]}">nepotpun dan (${d.h[i]}/${n} h)</span>`
                : `<span style="color:${b["nema-tekst"]}">nema podataka</span>`;
              t += `<br>${NS.razlog(razlozi.get(i))}`;
            } else {
              t += `biciklista: <b>${NS.broj(p.v[i])}</b>`;
            }
            if (p.p7[i] != null) t += `<br>prosek 7 dana: ${NS.broj(p.p7[i])}`;
          } else {
            t += p.v[i] == null ? "premalo kompletnih dana" : `prosečan dan: <b>${NS.broj(p.v[i])}</b>`;
            t += `<br>kompletnih dana: ${p.dana[i][0]} od ${p.dana[i][1]}`;
          }
          return t;
        },
      },
      series: [
        gustina === "dan" ? {
          name: "dnevni zbir", type: "line", data: p.v, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1, color: b.bicikl, opacity: 0.4 }, itemStyle: { color: b.bicikl },
          markArea: { silent: true, itemStyle: { color: b.nema, opacity: 0.6 }, data: rupe },
        } : {
          name: "prosečan dan", type: "line", data: p.v, showSymbol: gustina === "mesec", symbolSize: 6, connectNulls: false,
          lineStyle: { width: 2, color: b.bicikl }, itemStyle: { color: b.bicikl },
          markArea: { silent: true, itemStyle: { color: b.nema, opacity: 0.6 }, data: rupe },
        },
        ...(p.p7 ? [{ name: "prosek 7 dana", type: "line", data: p.p7, showSymbol: false,
          lineStyle: { width: 2, color: b.bicikl }, itemStyle: { color: b.bicikl } }] : []),
        // mesto za kasnije: prognoza (linija) i interval 10–90 % (senka) kao nove serije na istoj osi
      ],
    };
  });
  graf.ec.getZr().on("click", (e) => {
    const t = [e.offsetX, e.offsetY];
    if (!graf.ec.containPixel({ gridIndex: 0 }, t)) return;
    const i = graf.ec.convertFromPixel({ xAxisIndex: 0 }, t[0]);
    const p = podaci();
    if (i == null || i < 0 || i >= p.x.length) return;
    const k = p.x[i];
    izaberiDan(gustina === "mesec" ? `${k}-01` : k, true);
  });
  NS.prekidac(document.getElementById("dnevno-gustina"), [["dan", "Dan"], ["nedelja", "Nedelja"], ["mesec", "Mesec"]], gustina,
    (v) => { gustina = v; graf.osvezi(); });
}

// ---------------------------------------------------------------- satni profil
function profil(p) {
  const sel = document.getElementById("sezona");
  sel.innerHTML = Object.entries(NS.SEZONE).map(([k, t]) => `<option value="${k}">${t}</option>`).join("");
  const graf = NS.grafik(document.getElementById("profil-grafik"), (b) => {
    const pr = p.profil[sel.value];
    const boje = { radni: b["tip-1"], subota: b["tip-2"], nedelja_praznik: b["tip-3"] };
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, left: "center", textStyle: { color: b["ink-2"] }, itemWidth: 18, itemHeight: 3 },
      grid: { left: 48, right: 12, top: 26, bottom: 52 },
      xAxis: { type: "category", data: [...Array(24).keys()].map(NS.dvaMesta), ...NS.osaX(b) },
      yAxis: { type: "value", name: "biciklista u satu", ...NS.osaY(b) },
      tooltip: {
        ...NS.osnova(b).tooltip,
        formatter: (q) => `<b>${NS.dvaMesta(q[0].dataIndex)}–${NS.dvaMesta(q[0].dataIndex + 1)} h</b><br>` +
          q.map((x) => `${x.marker}${x.seriesName}: <b>${NS.dec(x.value)}</b>`).join("<br>"),
      },
      series: Object.entries(NS.TIPOVI).map(([k, t]) => ({
        name: t, type: "line", data: pr[k], showSymbol: false, connectNulls: false,
        // nedelja i praznik: isprekidana linija kao drugi znak (plava i ljubičasta su bliske kod daltonizma)
        lineStyle: { width: 2, color: boje[k], type: k === "nedelja_praznik" ? [6, 3] : "solid" }, itemStyle: { color: boje[k] },
      })),
    };
  });
  sel.addEventListener("change", () => graf.osvezi());
}

// ---------------------------------------------------------------- toplotna mapa sat × dan u nedelji
function toplota(p) {
  NS.grafik(document.getElementById("toplota-grafik"), (b) => {
    const podaci = [];
    let maks = 0;
    p.toplotna_mapa.forEach((red, dan) => red.forEach((v, h) => {
      podaci.push([h, dan, v]);
      if (v != null && v > maks) maks = v;
    }));
    return {
      ...NS.osnova(b),
      grid: { left: 40, right: 8, top: 8, bottom: 64 },
      xAxis: { type: "category", data: [...Array(24).keys()].map(NS.dvaMesta), ...NS.osaX(b), splitArea: { show: false } },
      yAxis: { type: "category", data: NS.DANI_KRATKO, inverse: true, ...NS.osaX(b, { axisLine: { show: false } }) },
      visualMap: {
        min: 0, max: Math.ceil(maks), calculable: false, orient: "horizontal", left: "center", bottom: 4, itemHeight: 140,
        itemWidth: 10, inRange: { color: [b["toplota-0"], b["toplota-1"], b["toplota-2"], b["toplota-3"], b["toplota-4"], b["toplota-5"]] },
        textStyle: { color: b["ink-3"] }, formatter: (v) => NS.broj(v), text: ["više", "manje"],
      },
      tooltip: {
        trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
        formatter: (q) => `${NS.DANI[(q.value[1] + 1) % 7]}, ${NS.dvaMesta(q.value[0])}–${NS.dvaMesta(q.value[0] + 1)} h<br>` +
          `prosečno <b>${NS.dec(q.value[2])}</b> biciklista`,
      },
      series: [{ type: "heatmap", data: podaci, itemStyle: { borderColor: b.povrsina, borderWidth: 1 } }],
    };
  });
}

// ---------------------------------------------------------------- meseci po godinama
function meseciPoGodinama(p) {
  NS.grafik(document.getElementById("godine-grafik"), (b) => {
    const godine = Object.keys(p.meseci_po_godinama).sort();
    const boja = (y) => b[`god-${Math.max(0, Math.min(5, +y - 2021))}`];
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, left: "center", textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 12, itemHeight: 4 },
      grid: { left: 56, right: 16, top: 30, bottom: window.innerWidth < 600 ? 84 : 56 },
      xAxis: { type: "category", data: NS.MESECI_KRATKO, ...NS.osaX(b) },
      yAxis: { type: "value", name: "prosečan dan", ...NS.osaY(b) },
      tooltip: {
        ...NS.osnova(b).tooltip,
        formatter: (q) => `<b>${NS.MESECI[q[0].dataIndex]}</b><br>` + q.slice().reverse()
          .map((x) => `${x.marker}${x.seriesName}: <b>${x.value == null ? "—" : NS.broj(x.value)}</b>`).join("<br>"),
      },
      series: godine.map((y) => ({
        name: y, type: "line", data: p.meseci_po_godinama[y], connectNulls: false, symbolSize: 6,
        lineStyle: { width: 2, color: boja(y) }, itemStyle: { color: boja(y) },
      })),
    };
  });
}

// ---------------------------------------------------------------- izabrani dan
function izabraniDan(s, r, d) {
  const datumEl = document.getElementById("dan-datum");
  const opisEl = document.getElementById("dan-opis");
  const prvi = d.od, poslednji = NS.dodajDane(d.od, d.v.length - 1);
  datumEl.min = prvi; datumEl.max = poslednji;
  let poslednjiKompletan = poslednji;
  for (let i = d.v.length - 1; i >= 0; i--) if (d.v[i] != null) { poslednjiKompletan = NS.dodajDane(d.od, i); break; }
  let stanje = null;
  let graf = null;

  async function izaberi(iso, skroluj) {
    if (iso < prvi) iso = prvi;
    if (iso > poslednji) iso = poslednji;
    datumEl.value = iso;
    const ym = iso.slice(0, 7);
    const [mes, met] = await Promise.all([NS.json(`sati/${ym}.json`), NS.json(`meteo_sati/${ym}.json`)]);
    const [, i0, n] = mes.dani.find((x) => x[0] === iso);
    const niz = mes.v[r.serija] || [];
    const sati = NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n).map((o, k) => {
      const v = niz[i0 + k] ?? null;
      return { ...o, v, kod: v == null ? (mes.v[r.serija] ? NS.razlogSata(mes.r[r.serija], i0 + k) : 9) : 0,
        temp: met.temp[i0 + k], pad: met.pad[i0 + k] };
    });
    stanje = { iso, sati };
    const ok = sati.filter((x) => x.v != null);
    const zbir = ok.reduce((a, x) => a + x.v, 0);
    opisEl.innerHTML = `${NS.datumDug(iso)} · ` + (ok.length === n ? `ukupno <b>${NS.broj(zbir)}</b> biciklista`
      : ok.length ? `<b>nepotpun dan (${ok.length}/${n} h)</b> — ${NS.razlog(sati.find((x) => x.v == null).kod)}; zbir validnih sati ${NS.broj(zbir)}`
        : `<b>nema podataka</b> — ${NS.razlog(sati[0].kod)}`);
    if (graf) graf.osvezi(); else crtaj();
    if (skroluj) document.getElementById("dan-grafik").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function crtaj() {
    graf = NS.grafik(document.getElementById("dan-grafik"), (b) => {
      if (!stanje) return {};
      const sati = stanje.sati;
      const x = sati.map((o) => o.oznaka.replace(" h", ""));
      const maks = Math.max(10, ...sati.map((o) => o.v ?? 0));
      const ose = [0, 1, 2];
      return {
        ...NS.osnova(b),
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: [{ left: 52, right: 12, top: 28, height: 200 }, { left: 52, right: 12, top: 284, height: 48 },
          { left: 52, right: 12, top: 360, height: 30 }],
        xAxis: ose.map((i) => ({ type: "category", gridIndex: i, data: x,
          ...NS.osaX(b, { axisLabel: { show: i === 0 || i === 2, color: b["ink-3"], formatter: (t) => t.slice(0, 2) } }) })),
        yAxis: [
          { type: "value", gridIndex: 0, name: "biciklista u satu", ...NS.osaY(b) },
          { type: "value", gridIndex: 1, name: "°C", scale: true, splitNumber: 1, nameGap: 8, ...NS.osaY(b, { axisLabel: { color: b["ink-3"] } }) },
          { type: "value", gridIndex: 2, name: "mm", splitNumber: 1, minInterval: 0.5, nameGap: 8, ...NS.osaY(b, { axisLabel: { color: b["ink-3"] } }) },
        ],
        tooltip: {
          ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.4 } },
          formatter: (q) => {
            const o = sati[q[0].dataIndex];
            return `<b>${o.oznaka}</b><br>` + (o.v == null ? `<span style="color:${b["nema-tekst"]}">nema podataka</span> — ${NS.razlog(o.kod)}`
              : `biciklista: <b>${NS.broj(o.v)}</b>`) + (o.temp != null ? `<br>temperatura: ${NS.dec(o.temp)} °C` : "") +
              (o.pad != null ? `<br>padavine: ${NS.dec(o.pad)} mm` : "");
          },
        },
        series: [
          { name: "nema podataka", type: "bar", xAxisIndex: 0, yAxisIndex: 0, silent: true, barCategoryGap: "18%",
            data: sati.map((o) => (o.v == null ? maks : null)), itemStyle: { color: b.nema, opacity: 0.6 } },
          { name: "biciklisti", type: "bar", xAxisIndex: 0, yAxisIndex: 0, barGap: "-100%", barCategoryGap: "18%",
            data: sati.map((o) => o.v), itemStyle: { color: b.bicikl, borderRadius: [3, 3, 0, 0] } },
          // mesto za kasnije: satna prognoza i interval 10–90 % za isti dan
          { name: "temperatura", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: sati.map((o) => o.temp), showSymbol: false,
            lineStyle: { width: 2, color: b.temp }, itemStyle: { color: b.temp } },
          { name: "padavine", type: "bar", xAxisIndex: 2, yAxisIndex: 2, data: sati.map((o) => o.pad), barCategoryGap: "18%",
            itemStyle: { color: b.kisa, borderRadius: [2, 2, 0, 0] } },
        ],
      };
    });
  }

  datumEl.addEventListener("change", () => { if (datumEl.value) izaberi(datumEl.value); });
  document.getElementById("dan-pre").addEventListener("click", () => izaberi(NS.dodajDane(datumEl.value, -1)));
  document.getElementById("dan-posle").addEventListener("click", () => izaberi(NS.dodajDane(datumEl.value, 1)));
  const iz = new URLSearchParams(location.search).get("dan");
  izaberi(iz && /^\d{4}-\d\d-\d\d$/.test(iz) ? iz : poslednjiKompletan);
  return izaberi;
}
