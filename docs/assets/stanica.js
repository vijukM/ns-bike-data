/* Stanica (stanica?id=23a): zaglavlje i KPI, upozorenja, dnevni grafik celog perioda (isprekidano preko
   rupa), izabrani dan (podrazumevano danas: satno + vreme + prognoza) i prognoza za sutra jedan pored drugog,
   satni profil, toplotna mapa sat × dan, meseci po godinama. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const id = new URLSearchParams(location.search).get("id") || "23a";
  try {
    const s = await NS.stanice();
    const r = s.serije.find((x) => x.serija === id);
    if (!r) throw new Error(`nepoznata stanica „${id}“`);
    const krajPutanje = document.querySelector(".putanja b");
    if (krajPutanje) krajPutanje.textContent = `${r.serija} · ${r.naziv}`;
    const [d, p] = await Promise.all([NS.json(`dnevno/${id}.json`), NS.json(`profili/${id}.json`)]);
    glava(s, r, d);
    const izaberiDan = izabraniDan(s, r, d, p);
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
  document.getElementById("glava-eyebrow").textContent = `Stanica · mesto ${r.mesto}`;
  document.getElementById("glava-naslov").innerHTML = `${r.serija} · <em>${r.naziv}</em>`;
  document.getElementById("glava-uvod").innerHTML = `${r.smerovi.length > 1 ? "Smerovi (zbir)" : "Smer"}: <b>${r.smerovi.join(" · ")}</b>`;
  document.getElementById("na-mapi").href = `mapa?id=${encodeURIComponent(r.serija)}`;
  const godina = NS.razlikaDana(r.od, r.do) / 365.25;
  const el = document.getElementById("kpi");
  const k = (boja, ikona, naslov, delta, idv, dole) => `<div class="kpi ${boja} pojava"><div class="vrh"><span class="kvadrat">${ikona}</span>
    <span class="naslov">${naslov}</span><span class="kpi-delta">${delta}</span></div><div class="vrednost" id="${idv}">—</div><div class="dole">${dole}</div></div>`;
  el.innerHTML = [
    k("c-plava", LJ.ik("bike"), "Prosek dnevno", "12 meseci", "k-prosek", "<b>1. 9. 2025. – 31. 8. 2026.</b>"),
    k("c-zelena", LJ.ik("check"), "Kompletnih dana", "ceo period", "k-udeo", `nepotpunih <b>${NS.broj(d.v.filter((x) => x == null).length)}</b> od ${NS.broj(d.v.length)}`),
    k("c-ljubicasta", `<img src="${NS.pin(r.stanje)}" alt="" style="width:24px;height:24px">`, "Stanje", "30 dana", "k-stanje",
      `kompletnih dana <b>${r.kompletnih_30d}/30</b>`),
    k("c-teal", LJ.ik("calendar"), "Period rada", `od ${r.od.slice(0, 4)}.`, "k-period", `<b>${NS.datum(r.od)} – ${NS.datum(r.do)}</b>`),
  ].join("");
  LJ.pojave(el);
  if (r.prosek_12m != null && r.stanje !== "neispravan") LJ.brojanje(document.getElementById("k-prosek"), r.prosek_12m, (x) => NS.broj(Math.round(x)));
  LJ.brojanje(document.getElementById("k-udeo"), 100 * r.udeo_validnih_dana, (x) => `${NS.dec(x)}<sup>%</sup>`);
  document.getElementById("k-stanje").innerHTML = `<span class="znacka tacka z-${r.stanje}" style="font-size:15px;padding:6px 14px">${s.stanja[r.stanje]}</span>`;
  LJ.brojanje(document.getElementById("k-period"), godina, (x) => `${NS.dec(x)}<sup>god.</sup>`);
  const upoz = [];
  if (r.napomena) upoz.push(`<div class="upozorenje">${LJ.ik("alert")}<span><b>${r.napomena}</b>. Ti sati su sivi i ne ulaze u gradske zbirove.</span></div>`);
  const nepotpuni = d.v.filter((x) => x == null).length;
  if (nepotpuni / d.v.length > 0.05) upoz.push(`<div class="upozorenje">${LJ.ik("alert")}<span>Brojač nije imao kompletne podatke za
    <b>${NS.broj(nepotpuni)}</b> od ${NS.broj(d.v.length)} dana (${NS.dec(100 * nepotpuni / d.v.length)} %). Ti delovi su isprekidani; razlog piše kad se pređe preko njih.</span></div>`);
  document.getElementById("upozorenja").innerHTML = upoz.join("");
}

// ---------------------------------------------------------------- dnevno, ceo period
function dnevniGrafik(s, d, izaberiDan) {
  const razlozi = new Map(d.r);
  let gustina = "dan";
  const b0 = NS.boje();
  let ukljuceno = NS.cipovi(document.getElementById("serije"), [
    ["v", "Dnevni zbir", b0.bicikl, true], ["p7", "Prosek 7 dana", b0.primary, true],
  ], (sk) => { ukljuceno = sk; graf.osvezi(); });

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

  const graf = NS.grafik(document.getElementById("dnevno-grafik"), (b) => {
    const p = podaci();
    const serije = [];
    if (ukljuceno.has("v")) {
      serije.push({ name: "dnevni zbir", type: "line", data: p.v, showSymbol: gustina === "mesec", symbolSize: 5, connectNulls: false,
        lineStyle: { width: gustina === "dan" ? 1 : 2, color: b.bicikl, opacity: gustina === "dan" ? 0.55 : 1 }, itemStyle: { color: b.bicikl } });
      serije.push({ name: "nema podataka", type: "line", data: NS.premosti(p.v), showSymbol: false, silent: true, z: 1,
        lineStyle: { width: 1.5, type: [4, 4], color: b.nema }, itemStyle: { color: b.nema } });
    }
    if (ukljuceno.has("p7") && p.p7) serije.push({ name: "prosek 7 dana", type: "line", data: p.p7, showSymbol: false,
      lineStyle: { width: 2.2, color: b.prosek }, itemStyle: { color: b.prosek } });
    // mesto za kasnije: prognoza (linija) i interval 10–90 % (senka)
    return {
      ...NS.osnova(b),
      grid: { left: 58, right: 16, top: 30, bottom: 64 },
      xAxis: { type: "category", data: p.x, boundaryGap: gustina !== "dan",
        ...NS.osaX(b, { axisLabel: { color: b["ink-3"], hideOverlap: true, fontSize: 11, formatter: (k) => (gustina === "mesec" ? k.replace("-", ". ") : NS.datum(k).slice(0, -1)) } }) },
      yAxis: { type: "value", name: gustina === "dan" ? "biciklista dnevno" : "prosečan dan", ...NS.osaY(b) },
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8, height: 22, borderColor: b.osa, fillerColor: "rgba(127,127,127,0.14)",
        dataBackground: { lineStyle: { color: b.osa }, areaStyle: { color: b.mreza } }, textStyle: { color: b["ink-3"] },
        labelFormatter: (_, k) => (k ? (gustina === "mesec" ? NS.mesecNaziv(k) : NS.datum(k)) : "") }],
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => {
        const i = q[0].dataIndex, k = p.x[i];
        let t = `<b>${NS.oznakaPerioda(k, gustina)}</b><br>`;
        if (gustina === "dan") {
          if (p.v[i] == null) {
            t += d.h[i] ? `<span style="color:${b.warning}">nepotpun dan (${d.h[i]}/${satiDana(s, k)} h)</span>` : `<span style="color:${b.warning}">nema podataka</span>`;
            t += `<br>${NS.razlog(razlozi.get(i))}`;
          } else t += `biciklista: <b>${NS.broj(p.v[i])}</b>`;
          if (p.p7[i] != null) t += `<br>prosek 7 dana: ${NS.broj(p.p7[i])}`;
        } else {
          t += p.v[i] == null ? "premalo kompletnih dana" : `prosečan dan: <b>${NS.broj(p.v[i])}</b>`;
          t += `<br>kompletnih dana: ${p.dana[i][0]} od ${p.dana[i][1]}`;
        }
        return t;
      } },
      series: serije,
    };
  });
  graf.spreman.then(() => graf.ec.getZr().on("click", (e) => {
    const t = [e.offsetX, e.offsetY];
    if (!graf.ec.containPixel({ gridIndex: 0 }, t)) return;
    const i = graf.ec.convertFromPixel({ xAxisIndex: 0 }, t[0]);
    const p = podaci();
    if (i == null || i < 0 || i >= p.x.length) return;
    izaberiDan(gustina === "mesec" ? `${p.x[i]}-01` : p.x[i], true);
  }));
  NS.prekidac(document.getElementById("gustina"), [["dan", "Dan"], ["nedelja", "Nedelja"], ["mesec", "Mesec"]], gustina,
    (v) => { gustina = v; graf.osvezi(); });
}

// ---------------------------------------------------------------- satni profil, toplotna mapa, godine
function profil(p) {
  const sel = document.getElementById("sezona");
  sel.innerHTML = Object.entries(NS.SEZONE).map(([k, t]) => `<option value="${k}">${t}</option>`).join("");
  const graf = NS.grafik(document.getElementById("profil-grafik"), (b) => {
    const pr = p.profil[sel.value];
    const boje = { radni: b["tip-1"], subota: b["tip-2"], nedelja_praznik: b["tip-3"] };
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, textStyle: { color: b["ink-2"] }, itemWidth: 18, itemHeight: 3 },
      grid: { left: 48, right: 12, top: 28, bottom: 52 },
      xAxis: { type: "category", data: [...Array(24).keys()].map(NS.dvaMesta), ...NS.osaX(b) },
      yAxis: { type: "value", name: "biciklista u satu", ...NS.osaY(b) },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${NS.dvaMesta(q[0].dataIndex)}–${NS.dvaMesta(q[0].dataIndex + 1)} h</b><br>` +
        q.map((x) => `${x.marker}${x.seriesName}: <b>${NS.dec(x.value)}</b>`).join("<br>") },
      series: Object.entries(NS.TIPOVI).map(([k, t]) => ({ name: t, type: "line", data: pr[k], showSymbol: false, connectNulls: false, smooth: 0.25,
        // nedelja i praznik: isprekidana linija kao drugi znak (plava i ljubičasta su bliske kod daltonizma)
        lineStyle: { width: 2.2, color: boje[k], type: k === "nedelja_praznik" ? [6, 3] : "solid" }, itemStyle: { color: boje[k] } })),
    };
  });
  sel.addEventListener("change", () => graf.osvezi());
}

function toplota(p) {
  NS.grafik(document.getElementById("toplota-grafik"), (b) => {
    const podaci = [];
    let maks = 0;
    p.toplotna_mapa.forEach((red, dan) => red.forEach((v, h) => { podaci.push([h, dan, v]); if (v != null && v > maks) maks = v; }));
    return {
      ...NS.osnova(b),
      grid: { left: 40, right: 8, top: 8, bottom: 64 },
      xAxis: { type: "category", data: [...Array(24).keys()].map(NS.dvaMesta), ...NS.osaX(b) },
      yAxis: { type: "category", data: NS.DANI_KRATKO, inverse: true, ...NS.osaX(b, { axisLine: { show: false } }) },
      visualMap: { min: 0, max: Math.ceil(maks), calculable: false, orient: "horizontal", left: "center", bottom: 4, itemHeight: 150, itemWidth: 10,
        inRange: { color: [b["top-0"], b["top-1"], b["top-2"], b["top-3"], b["top-4"], b["top-5"]] }, textStyle: { color: b["ink-3"] }, text: ["više", "manje"] },
      tooltip: { trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
        formatter: (q) => `${NS.DANI[(q.value[1] + 1) % 7]}, ${NS.dvaMesta(q.value[0])}–${NS.dvaMesta(q.value[0] + 1)} h<br>prosečno <b>${NS.dec(q.value[2])}</b> biciklista` },
      series: [{ type: "heatmap", data: podaci, itemStyle: { borderColor: b.povrsina, borderWidth: 1.5, borderRadius: 3 } }],
    };
  });
}

function meseciPoGodinama(p) {
  NS.grafik(document.getElementById("godine-grafik"), (b) => {
    const godine = Object.keys(p.meseci_po_godinama).sort();
    const boja = (y) => b[`god-${Math.max(0, Math.min(5, +y - 2021))}`];
    return {
      ...NS.osnova(b),
      legend: { bottom: 0, textStyle: { color: b["ink-2"] }, icon: "roundRect", itemWidth: 12, itemHeight: 4 },
      grid: { left: 58, right: 16, top: 30, bottom: window.innerWidth < 600 ? 84 : 56 },
      xAxis: { type: "category", data: NS.MESECI_KRATKO, ...NS.osaX(b) },
      yAxis: { type: "value", name: "prosečan dan", ...NS.osaY(b) },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => `<b>${NS.MESECI[q[0].dataIndex]}</b><br>` + q.slice().reverse()
        .map((x) => `${x.marker}${x.seriesName}: <b>${x.value == null ? "—" : NS.broj(x.value)}</b>`).join("<br>") },
      series: godine.map((y) => ({ name: y, type: "line", data: p.meseci_po_godinama[y], connectNulls: false, symbolSize: 6,
        lineStyle: { width: 2, color: boja(y) }, itemStyle: { color: boja(y) } })),
    };
  });
}

// ---------------------------------------------------------------- izabrani dan (podrazumevano danas) i prognoza za sutra
/* Izvori za jedan dan stanice:
   - danas: data/danas.json (sati do poslednjeg čitanja brojača, vreme za danas) + prognoza za danas;
   - prošli dani: istorija/sati/<GGGG-MM>.json (satni brojevi; rupa 01.09–08.10.2026 nema podatke) i istorija/meteo_sati;
   - sutra: data/prognoza_biciklista.json — model E31 pravi prognozu za sve serije odjednom, pa ovde nema računanja. */
const danasIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: NS.TZ || "Europe/Belgrade" });
const fSatBg = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", hour: "2-digit", hourCycle: "h23" });
const zbir = (a) => a.reduce((x, v) => x + (v ?? 0), 0);

/** Prognoza (sati „UTC+1“, kao u modelu) → 24 lokalna sata dana; leti se pomera za sat (00 h dolazi iz prethodnog dana). */
function prognozaLokalno(P, serija, iso) {
  const st = P && P.stanice && P.stanice[serija];
  if (!st || !st[iso]) return null;
  const n = 24, pred = Array(n).fill(null), q10 = Array(n).fill(null), q90 = Array(n).fill(null);
  const upisi = (dan) => {
    const x = st[dan];
    if (!x) return;
    const pocetak = Date.parse(`${dan}T00:00:00Z`) - 3600e3;      // 00:00 po UTC+1
    x.pred.forEach((v, k) => {
      const ms = pocetak + k * 3600e3;
      const lok = new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
      if (lok !== iso) return;
      const h = Number(fSatBg.format(ms));
      pred[h] = v; q10[h] = x.q10[k]; q90[h] = x.q90[k];
    });
  };
  upisi(NS.dodajDane(iso, -1));
  upisi(iso);
  return { pred, q10, q90, nepouzdano: st[iso].nepouzdano, razlog: st[iso].razlog_nepouzdano };
}

/** prosečan isti dan u nedelji (toplotna mapa sat × dan iz profila; redovi pon–ned) */
const prosekDana = (p, iso) => (p && p.toplotna_mapa ? p.toplotna_mapa[(NS.danUNedelji(iso) + 6) % 7] : null);

function izabraniDan(s, r, d, p) {
  const datumEl = document.getElementById("dan-datum");
  datumEl.dataset.serija = d.serija;                     // izbor datuma: promet ove stanice ispod svakog dana
  const prvi = d.od;
  let poslednji = danasIso();
  datumEl.min = prvi; datumEl.max = poslednji;
  let stanje = null, graf = null;
  const izvori = Promise.all([
    NS.json("danas.json", "data/").catch(() => null),
    NS.json("prognoza_biciklista.json", "data/").catch(() => null),
  ]);
  izvori.then(([D, P]) => sutra(r, p, D, P));

  async function danIzIstorije(iso) {
    const ym = iso.slice(0, 7);
    const [mes, met, dost] = await Promise.all([NS.json(`sati/${ym}.json`).catch(() => null),
      iso <= s.period.do ? NS.json(`meteo_sati/${ym}.json`).catch(() => null) : null,   // satno vreme postoji do kraja istorije
      NS.json("sati_dostupno.json").catch(() => null)]);
    const dan = mes && mes.dani.find((x) => x[0] === iso);
    if (!dan || (dost && dost.prazni_dani.includes(iso))) {   // rupa u podacima (01.09–08.10.2026) ili dan van istorije
      const pocetak = Date.parse(`${iso}T00:00:00Z`) - (Number(fSatBg.format(Date.parse(`${iso}T12:00:00Z`))) - 12) * 3600e3;
      return NS.satneOznake(pocetak, 0, 24).map((o) => ({ ...o, v: null, kod: "rupa", temp: null, pad: null }));
    }
    const [, i0, n] = dan;
    const niz = mes.v[r.serija] || [];
    return NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n).map((o, k) => {
      const v = niz[i0 + k] ?? null;
      return { ...o, v, kod: v == null ? (mes.v[r.serija] ? NS.razlogSata(mes.r[r.serija], i0 + k) : 9) : 0,
        temp: met ? met.temp[i0 + k] : null, pad: met ? met.pad[i0 + k] : null };
    });
  }

  const opisRazloga = (kod) => (kod === "rupa" ? "brojači tada nisu čitani (rupa 1. 9. – 8. 10. 2026.)" : NS.razlog(kod));
  async function izaberi(iso, skroluj) {
    const [D, P] = await izvori;
    if (D && D.datum > poslednji) { poslednji = D.datum; datumEl.max = poslednji; }
    if (iso < prvi) iso = prvi;
    if (iso > poslednji) iso = poslednji;
    datumEl.value = iso;
    const jeDanas = !!D && iso === D.datum;
    let sati, gotovo = 24;
    if (jeDanas) {
      const x = (D.serije && D.serije[r.serija]) || { sati: [] };
      gotovo = D.sati_gotovo;
      sati = NS.satneOznake(Date.parse(D.pocetak_utc), 0, D.sati.length).map((o, k) => ({ ...o,
        v: k < gotovo ? (x.sati[k] ?? null) : null, kod: k < gotovo ? (x.sati[k] == null ? 9 : 0) : "buduce",
        temp: D.vreme ? D.vreme.temperatura[k] : null, pad: D.vreme ? D.vreme.padavine[k] : null }));
    } else sati = await danIzIstorije(iso);
    const pr = prognozaLokalno(P, r.serija, iso);
    stanje = { iso, sati, jeDanas, pr: pr && sati.length === 24 ? pr : null, pros: sati.length === 24 ? prosekDana(p, iso) : null };
    const n = sati.length, ok = sati.filter((x) => x.v != null), z = zbir(ok.map((x) => x.v));
    document.getElementById("dan-oznaka").textContent = jeDanas ? "Danas" : "Izabrani dan";
    document.getElementById("dan-danas").hidden = jeDanas;
    document.getElementById("dan-naslov").textContent = NS.datumDug(iso);
    document.getElementById("dan-opis").innerHTML = jeDanas
      ? `do ${D.brojaci_do || NS.dvaMesta(gotovo) + ":00"} izbrojano <b>${NS.broj(z)}</b> biciklista` +
        (stanje.pr ? ` · prognoza za ceo dan oko <b>${NS.broj(Math.round(zbir(stanje.pr.pred)))}</b>` : "")
      : ok.length === n ? `ukupno <b>${NS.broj(z)}</b> biciklista`
        : ok.length ? `<span style="color:var(--warning)">nepotpun dan (${ok.length}/${n} h)</span> — ${opisRazloga(sati.find((x) => x.v == null).kod)}; zbir validnih sati ${NS.broj(z)}`
          : `<span style="color:var(--warning)">nema podataka</span> — ${opisRazloga(sati[0].kod)}`;
    document.getElementById("dan-leg-pr").hidden = !stanje.pr;
    if (graf) graf.osvezi(); else crtaj();
    if (skroluj) document.getElementById("izabrani-dan").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function crtaj() {
    graf = NS.grafik(document.getElementById("dan-grafik"), (b) => {
      if (!stanje) return {};
      const { sati, pr, pros } = stanje;
      const x = sati.map((o) => NS.dvaMesta(o.sat));
      const maks = Math.max(10, ...sati.map((o) => o.v ?? 0), ...(pr ? pr.q90.map((v) => v ?? 0) : []));
      const ose = [0, 1, 2];
      const imaVreme = sati.some((o) => o.temp != null || o.pad != null);
      return {
        ...NS.osnova(b),
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: [{ left: 52, right: 12, top: 28, height: 200 }, { left: 52, right: 12, top: 284, height: 48 }, { left: 52, right: 12, top: 360, height: 30 }],
        xAxis: ose.map((i) => ({ type: "category", gridIndex: i, data: x, ...NS.osaX(b, { axisLabel: { show: i === 0 || i === 2, color: b["ink-3"], fontSize: 11 } }) })),
        yAxis: [
          { type: "value", gridIndex: 0, name: "biciklista u satu", ...NS.osaY(b) },
          { type: "value", gridIndex: 1, name: "°C", scale: true, splitNumber: 1, nameGap: 8, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11 } }) },
          { type: "value", gridIndex: 2, name: "mm", splitNumber: 1, minInterval: 0.5, nameGap: 8, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 11 } }) },
        ],
        graphic: imaVreme ? [] : [{ type: "text", left: 60, top: 300, style: { text: "vreme za ovaj dan još nije u istoriji", fill: b["ink-3"], fontSize: 11.5 } }],
        tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } }, formatter: (q) => {
          const i = q[0].dataIndex, o = sati[i];
          return `<b>${o.oznaka}</b><br>` + (o.kod === "buduce" ? `<span style="color:${b["ink-3"]}">još nije izbrojano</span>`
            : o.v == null ? `<span style="color:${b.warning}">nema podataka</span> — ${opisRazloga(o.kod)}` : `biciklista: <b>${NS.broj(o.v)}</b>`) +
            (pr && pr.pred[i] != null ? `<br>prognoza: <b>${NS.broj(Math.round(pr.pred[i]))}</b> <span style="color:${b["ink-3"]}">(${NS.broj(Math.round(pr.q10[i]))}–${NS.broj(Math.round(pr.q90[i]))})</span>` : "") +
            (pros && pros[i] != null ? `<br><span style="color:${b["ink-3"]}">prosečan ${NS.DANI[NS.danUNedelji(stanje.iso)]}: ${NS.broj(Math.round(pros[i]))}</span>` : "") +
            (o.temp != null ? `<br>temperatura: ${NS.dec(o.temp)} °C` : "") + (o.pad != null ? `<br>padavine: ${NS.dec(o.pad)} mm` : "");
        } },
        series: [
          { name: "nema podataka", type: "bar", xAxisIndex: 0, yAxisIndex: 0, silent: true, barCategoryGap: "18%",
            data: sati.map((o) => (o.v == null && o.kod !== "buduce" ? maks : null)), itemStyle: { color: b.nema, opacity: 0.35 } },
          { name: "biciklisti", type: "bar", xAxisIndex: 0, yAxisIndex: 0, barGap: "-100%", barCategoryGap: "18%", animationDelay: (i) => i * 25,
            data: sati.map((o) => o.v), itemStyle: { color: b.bicikl, borderRadius: [4, 4, 0, 0] } },
          ...serijePrognoze(b, pr, pros),
          { name: "temperatura", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: sati.map((o) => o.temp), showSymbol: false, smooth: 0.3,
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
  document.getElementById("dan-danas").addEventListener("click", () => izaberi(poslednji));
  const iz = new URLSearchParams(location.search).get("dan");
  izaberi(iz && /^\d{4}-\d\d-\d\d$/.test(iz) ? iz : poslednji);
  return izaberi;
}

/** prognoza (linija) + interval 10–90 % (pojas) + prosečan isti dan (isprekidano), na prvoj osi */
function serijePrognoze(b, pr, pros) {
  const out = [];
  if (pr) out.push(
    { name: "q10", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: pr.q10, stack: "int", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
    { name: "interval", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: pr.q90.map((v, i) => (v == null || pr.q10[i] == null ? null : v - pr.q10[i])), stack: "int",
      symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: b.warning, opacity: 0.16 }, silent: true, tooltip: { show: false } },
    { name: "prognoza", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: pr.pred, symbol: "none", smooth: 0.3, z: 4,
      lineStyle: { color: b.warning, width: 2.5 }, itemStyle: { color: b.warning }, animationDuration: 1400 });
  if (pros) out.push({ name: "prosečan dan", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: pros, symbol: "none", smooth: 0.3,
    lineStyle: { color: b["ink-3"], width: 1.5, type: "dashed" }, itemStyle: { color: b["ink-3"] }, silent: true });
  return out;
}

// ---------------------------------------------------------------- sutra: prognoza za ovu stanicu
function sutra(r, p, D, P) {
  const iso = NS.dodajDane(D ? D.datum : danasIso(), 1);
  const el = document.getElementById("sutra-grafik"), opis = document.getElementById("sutra-opis");
  document.getElementById("sutra-naslov").textContent = NS.datumDug(iso);
  const pr = prognozaLokalno(P, r.serija, iso);
  const iskljucena = P && P.iskljucene && P.iskljucene[r.serija];
  if (!pr) {
    el.outerHTML = `<div class="prazno-stanje sitno" style="padding:28px 4px">${iskljucena ? `Za ovaj brojač nema prognoze: ${iskljucena.opis}.`
      : P && !P.dani.includes(iso) ? "Prognoza za sutra još nije izdata — pojavi se posle jutarnjeg osvežavanja (posle 6 h)."
        : "Za ovaj brojač trenutno nema prognoze."}</div>`;
    opis.textContent = "";
    document.getElementById("sutra-legenda").hidden = true;
    return;
  }
  const izdato = new Date(P.izdato_utc).toLocaleString("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  opis.innerHTML = `očekuje se oko <b>${NS.broj(Math.round(zbir(pr.pred)))}</b> biciklista <span class="sitno">(zbir satnih intervala ${NS.broj(Math.round(zbir(pr.q10)))}–${NS.broj(Math.round(zbir(pr.q90)))})</span>` +
    `<br><span class="sitno">model ${P.verzija_modela.split(" ")[0]} · izdato ${izdato}</span>` +
    (pr.nepouzdano ? `<br><span style="color:var(--warning)">manje pouzdano: ${pr.razlog}</span>` : "");
  const pros = prosekDana(p, iso);
  NS.grafik(el, (b) => {
    const x = pr.pred.map((_, h) => NS.dvaMesta(h));
    return {
      ...NS.osnova(b),
      grid: { left: 52, right: 12, top: 28, bottom: 40 },
      xAxis: { type: "category", data: x, boundaryGap: true, ...NS.osaX(b, { axisLabel: { color: b["ink-3"], fontSize: 11 } }) },
      yAxis: { type: "value", name: "biciklista u satu", ...NS.osaY(b) },
      tooltip: { ...NS.osnova(b).tooltip, formatter: (q) => {
        const i = q[0].dataIndex;
        return `<b>${NS.dvaMesta(i)}–${NS.dvaMesta(i + 1)} h</b><br>prognoza: <b>${NS.broj(Math.round(pr.pred[i]))}</b>` +
          `<br><span style="color:${b["ink-3"]}">interval 10–90 %: ${NS.broj(Math.round(pr.q10[i]))}–${NS.broj(Math.round(pr.q90[i]))}</span>` +
          (pros ? `<br><span style="color:${b["ink-3"]}">prosečan ${NS.DANI[NS.danUNedelji(iso)]}: ${NS.broj(Math.round(pros[i]))}</span>` : "");
      } },
      series: [
        ...serijePrognoze(b, pr, pros),
      ],
    };
  });
}
