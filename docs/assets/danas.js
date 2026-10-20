/* Strana „Danas uživo“: data/danas.json (pravi ga sajt/danas.py posle svakog satnog čitanja i posle svake prognoze).
   Sve je po lokalnom vremenu; sati idu redom od pocetak_utc (23, 24 ili 25 na dan promene vremena).
   „Prema prognozi“ poredi samo sate koji su prošli i za koje postoje i izbrojano i prognoza (zvanična, iz ponoći).
   Strana sama proverava novo čitanje na 5 min i crta ga bez ponovnog učitavanja. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const IZVOR = "data/danas.json";
  const PROVERA_MS = 5 * 60e3, TON = 15;                  // ± % razlike od prognoze za zelenu / crvenu oznaku
  const STANJE = {
    radi: ["javlja", "var(--success)", "radi"], kasni: ["kasni", "var(--warning)", "delimicno"],
    nula: ["0 danas", "var(--danger)", "ne_radi"], nema_podataka: ["nema podataka", "var(--danger)", "ne_radi"],
    neispravan: ["neispravan", "var(--t-light)", "neispravan"],
  };
  let D = null, s = null, ctl = null;
  let izabrana = null, zbirno = false, redosled = "danas", sve = false;
  const g = {};

  async function ucitaj() {
    const r = await fetch(`${IZVOR}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`danas.json: HTTP ${r.status}`);
    return r.json();
  }

  // ---------------------------------------------------------------- izvedeno
  const zbir = (a) => a.reduce((x, y) => x + (y || 0), 0);
  const pct = (a, b) => (b > 0 ? (100 * (a - b)) / b : null);
  const znak = (p) => (p == null ? "—" : `${p > 0.5 ? "+" : p < -0.5 ? "−" : "±"}${NS.broj(Math.abs(Math.round(p)))} %`);
  const ton = (p) => (p == null ? null : p > TON ? "vise" : p < -TON ? "manje" : null);
  const sat = (iso) => new Date(iso.replace(/Z?$/, "Z")).toLocaleTimeString("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" });
  const prognoza = () => D.prognoza.zvanicna || D.prognoza.najnovija;
  const najnovija = () => D.prognoza.najnovija || D.prognoza.zvanicna;
  const oznake = () => NS.satneOznake(Date.parse(D.pocetak_utc), 0, D.sati.length);

  /** Izbrojano prema prognozi na istim satima (prošli sati sa obe vrednosti). */
  function poredjenje(stv, pr) {
    let a = 0, b = 0, n = 0;
    for (let i = 0; i < D.sati_gotovo; i++) if (stv[i] != null && pr && pr[i] != null) { a += stv[i]; b += pr[i]; n++; }
    return { stv: a, prog: b, n, pct: n ? pct(a, b) : null };
  }
  function redSerije(k) {
    const x = D.serije[k], P = prognoza();
    const p = poredjenje(x.sati, P && P.serije[k]);
    return { k, ...x, prog: p.n ? p.prog : null, odst: x.stanje === "radi" && p.n ? p.pct : null };
  }

  // ---------------------------------------------------------------- zaglavlje
  function zaglavlje() {
    document.getElementById("danas-datum").textContent = `Pregled · ${NS.datumDug(D.datum)}`;
    const starost = (Date.now() - Date.parse(D.citanje_utc)) / 60e3;
    const sledece = Math.max(0, 60 - starost);
    const staro = starost > 75;
    document.getElementById("danas-uzivo").innerHTML = `${LJ.uzivoZnak()}
      <span class="danas-osvezeno">čitanje u <b>${D.citanje_lokalno}</b> · brojači do <b>${D.brojaci_do}</b>
        · ${staro ? `<span class="upozorenje">pre ${Math.round(starost)} min</span>` : `sledeće oko <b>${sat(new Date(Date.parse(D.citanje_utc) + 3600e3).toISOString())}</b>`}</span>
      <span class="danas-traka" title="do sledećeg čitanja"><span style="width:${staro ? 100 : Math.round(100 * (1 - sledece / 60))}%"></span></span>`;
    LJ.osveziUzivo();
    const ob = document.getElementById("danas-obavestenje");
    const danasLok = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
    ob.classList.toggle("skriveno", D.datum === danasLok);
    if (D.datum !== danasLok) ob.textContent = `Prikazan je ${NS.datum(D.datum)} — prvo čitanje za danas stiže u 00:02 posle ponoći.`;
    document.title = `${NS.broj(D.danas)} · Danas uživo · Biciklisti Novog Sada`;
  }

  // ---------------------------------------------------------------- KPI
  function kpi() {
    const P = prognoza(), N = najnovija();
    const ser = Object.values(D.serije);
    const javlja = ser.filter((x) => x.stanje === "radi").length;
    const p = poredjenje(D.grad, P && P.grad.pred);
    const doSata = D.sati_gotovo < D.sati.length ? `${D.sati[D.sati_gotovo]} h` : "ponoći";
    let ostatak, intervalTxt, izvorOstatka;
    if (N) {
      const od = D.sati_gotovo;
      ostatak = zbir(N.grad.pred.slice(od));
      intervalTxt = `${NS.broj(D.danas + zbir(N.grad.q10.slice(od)))} – ${NS.broj(D.danas + zbir(N.grad.q90.slice(od)))}`;
      izvorOstatka = `izbrojano + prognoza (izdata u ${sat(N.izdato_utc)})`;
    } else if (D.prosek_isti_dan) {
      ostatak = zbir(D.prosek_isti_dan.slice(D.sati_gotovo));
      izvorOstatka = "izbrojano + prosečan isti dan";
    }
    const problemi = {};
    for (const [k, x] of Object.entries(D.serije)) if (x.stanje !== "radi") (problemi[x.stanje] = problemi[x.stanje] || []).push(k);
    const k = (boja, ikona, naslov, delta, vrednost, dole) => `<div class="kpi ${boja}"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
      <span class="naslov">${naslov}</span>${delta ? `<span class="kpi-delta">${delta}</span>` : ""}</div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
    document.getElementById("kpi").innerHTML = [
      k("c-plava", "activity", `Danas do ${doSata}`, "uživo", NS.broj(D.danas),
        `na <b>${javlja}/${ser.length}</b> brojača · juče ceo dan <b>${NS.broj(D.juce)}</b>`),
      k(p.pct == null ? "c-plava" : p.pct > 5 ? "c-zelena" : p.pct < -5 ? "c-narandzasta" : "c-plava", "chart", "Prema prognozi",
        P ? (D.prognoza.zvanicna ? "iz ponoći" : "osvežena") : "",
        p.pct == null ? "—" : `${znak(p.pct).replace(" %", "")}<sup>%</sup>`,
        p.pct == null ? (P ? "još nema završenog sata sa prognozom" : "prognoza za danas još nije izdata")
          : `prognoza za iste sate: <b>${NS.broj(Math.round(p.prog))}</b>${MAPA.info("Poređenje samo za sate koji su prošli i za koje postoje i izbrojano i prognoza. Zvanična prognoza je izdata u ponoć, samo iz podataka do 24:00 juče.")}`),
      k("c-ljubicasta", "target", "Očekuje se do ponoći", "", ostatak == null ? "—" : `~${NS.broj(Math.round((D.danas + ostatak) / 10) * 10)}`,
        ostatak == null ? "nema prognoze ni proseka" : `${izvorOstatka}${intervalTxt ? ` · <b>${intervalTxt}</b>${MAPA.info("Raspon je zbir intervala 10–90 % po brojačima, pa je širi od stvarne nesigurnosti za ceo grad.")}` : ""}`),
      k(javlja === ser.length ? "c-zelena" : "c-narandzasta", "pin", "Brojači", "", `${javlja}<sup>/${ser.length}</sup>`,
        Object.keys(problemi).length ? Object.entries(problemi).map(([st, l]) => `${STANJE[st][0]}: <b>${l.join(", ")}</b>`).join(" · ") : "svi javljaju"),
    ].join("");
  }

  // ---------------------------------------------------------------- glavni grafik
  function nizovi() {
    const P = prognoza();
    const stv = izabrana ? D.serije[izabrana].sati : D.grad;
    const pr = P ? (izabrana ? P.serije[izabrana] : P.grad.pred) : null;
    const q = P && !izabrana ? [P.grad.q10, P.grad.q90] : null;
    const pros = izabrana ? null : D.prosek_isti_dan;
    const proslo = stv.map((v, i) => (i < D.sati_gotovo ? v : null));
    if (!zbirno) return { stv: proslo, pr, q, pros };
    const kum = (a, do_ = a.length) => { let t = 0; return a.map((v, i) => (i < do_ ? (t += v || 0) : null)); };
    return { stv: kum(stv, D.sati_gotovo), pr: pr && kum(pr), q: null, pros: pros && kum(pros) };
  }
  function crtajGlavni(b) {
    const n = nizovi(), P = prognoza(), x = oznake();
    const boja = { stv: b.bicikl, pr: b.warning, pros: b["ink-3"] };
    document.getElementById("g-oznaka").textContent = izabrana ? `Brojač ${izabrana} · ${(s.serije.find((r) => r.serija === izabrana) || {}).naziv || ""}` : `Ceo grad · ${zbirno ? "zbirno od ponoći" : "sat po sat"}`;
    document.getElementById("g-naslov").textContent = izabrana ? "Danas prema prognozi za ovaj brojač" : "Danas prema prognozi i prosečnom istom danu";
    document.getElementById("nazad-grad").classList.toggle("skriveno", !izabrana);
    document.getElementById("g-legenda").innerHTML = [
      `<span><i style="background:${boja.stv}"></i>izbrojano</span>`,
      n.pr ? `<span><i style="background:${boja.pr}"></i>prognoza${P ? ` (${D.prognoza.zvanicna ? "iz ponoći" : `izdata u ${sat(P.izdato_utc)}`})` : ""}</span>` : "",
      n.q ? `<span><i style="background:${boja.pr};opacity:.3"></i>interval 10–90 %</span>` : "",
      n.pros ? `<span><i class="isprekidano" style="border-color:${boja.pros}"></i>prosečan ${NS.datumDug(D.datum).split(",")[0].toLowerCase()} u ovom mesecu</span>` : "",
      !n.pr ? `<span class="sitno">prognoza za danas još nije izdata</span>` : "",
    ].join("");
    const serije = [
      { name: "izbrojano", type: zbirno ? "line" : "bar", data: n.stv, barMaxWidth: 22, itemStyle: { color: boja.stv, borderRadius: [4, 4, 0, 0] },
        lineStyle: { color: boja.stv, width: 3 }, symbol: "none", areaStyle: zbirno ? { color: boja.stv, opacity: 0.14 } : undefined, z: 3,
        markLine: D.sati_gotovo < D.sati.length ? { symbol: "none", silent: true, animation: false, data: [{ xAxis: D.sati_gotovo }],
          lineStyle: { color: b["ink-3"], type: "solid", width: 1 }, label: { formatter: "sada", color: b["ink-2"], fontFamily: "JetBrains Mono", fontSize: 11, position: "insideEndTop" } } : undefined },
    ];
    if (n.pr) serije.push({ name: "prognoza", type: "line", data: n.pr, symbol: "none", smooth: 0.3, lineStyle: { color: boja.pr, width: 2.5 }, itemStyle: { color: boja.pr }, z: 4 });
    if (n.q) serije.push(
      { name: "q10", type: "line", data: n.q[0], stack: "int", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      { name: "int", type: "line", data: n.q[1].map((v, i) => (v == null || n.q[0][i] == null ? null : v - n.q[0][i])), stack: "int", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: boja.pr, opacity: 0.16 }, silent: true, tooltip: { show: false } });
    if (n.pros) serije.push({ name: "prosečan isti dan", type: "line", data: n.pros, symbol: "none", smooth: 0.3, lineStyle: { color: boja.pros, width: 1.6, type: "dashed" }, itemStyle: { color: boja.pros } });
    const o = NS.osnova(b);
    return { ...o,
      grid: { left: 52, right: 12, top: 18, bottom: 28 },
      tooltip: { ...o.tooltip, formatter: (ps) => {
        const i = ps[0].dataIndex;
        return `<b>${x[i].oznaka}</b><br>` + ps.filter((p) => !["q10", "int"].includes(p.seriesName)).map((p) => `${p.marker}${p.seriesName}: <b>${
          p.value == null ? (p.seriesName === "izbrojano" ? (i >= D.sati_gotovo ? "sat još traje" : "nema podataka") : "—") : NS.broj(Math.round(p.value))}</b>`).join("<br>")
          + (n.q && !zbirno && P.grad.q10[i] != null ? `<br><span style="opacity:.7">interval ${NS.broj(Math.round(P.grad.q10[i]))} – ${NS.broj(Math.round(P.grad.q90[i]))}</span>` : "");
      } },
      xAxis: { type: "category", data: x.map((o2) => String(o2.sat).padStart(2, "0")), ...NS.osaX(b, { axisLabel: { color: b["ink-3"], fontSize: 11, interval: 1, fontFamily: "JetBrains Mono" } }) },
      yAxis: { type: "value", ...NS.osaY(b) },
      series: serije,
    };
  }

  // ---------------------------------------------------------------- vreme
  function crtajVreme(b) {
    const V = D.vreme, x = oznake();
    if (!V) return { title: { text: "nema vremenske prognoze", left: "center", top: "middle", textStyle: { color: b["ink-3"], fontSize: 13 } } };
    const o = NS.osnova(b);
    return { ...o,
      grid: { left: 36, right: 40, top: 14, bottom: 26 },
      tooltip: { ...o.tooltip, formatter: (ps) => `<b>${x[ps[0].dataIndex].oznaka}</b><br>` + ps.map((p) => `${p.marker}${p.seriesName}: <b>${
        p.value == null ? "—" : p.seriesName === "temperatura" ? `${NS.dec(p.value)} °C` : p.seriesName === "kiša" ? `${NS.dec(p.value)} mm` : `${Math.round(p.value)} %`}</b>`).join("<br>") },
      xAxis: { type: "category", data: x.map((o2) => String(o2.sat).padStart(2, "0")), ...NS.osaX(b, { axisLabel: { color: b["ink-3"], fontSize: 10.5, interval: 2, fontFamily: "JetBrains Mono" } }) },
      yAxis: [{ type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 10.5, formatter: "{value}°" } }) },
        { type: "value", min: 0, max: 100, ...NS.osaY(b, { splitLine: { show: false }, axisLabel: { color: b["ink-3"], fontSize: 10.5, formatter: "{value} %" } }) }],
      series: [
        { name: "oblačnost", type: "bar", yAxisIndex: 1, data: V.oblacnost, barWidth: "70%", itemStyle: { color: b["ink-3"], opacity: 0.25, borderRadius: [3, 3, 0, 0] } },
        { name: "kiša", type: "bar", yAxisIndex: 1, data: V.padavine.map((v) => (v ? Math.min(100, v * 20) : null)), barWidth: "40%", itemStyle: { color: b.kisa },
          tooltip: { show: false } },
        { name: "temperatura", type: "line", data: V.temperatura, symbol: "none", smooth: 0.3, lineStyle: { color: b.temp, width: 2.5 }, itemStyle: { color: b.temp },
          markLine: D.sati_gotovo < D.sati.length ? { symbol: "none", silent: true, animation: false, data: [{ xAxis: D.sati_gotovo }], lineStyle: { color: b["ink-3"], width: 1 }, label: { show: false } } : undefined },
      ] };
  }
  function opisVremena() {
    const V = D.vreme, el = document.getElementById("vreme-opis");
    if (!V) { el.textContent = ""; return; }
    const t = V.temperatura.filter((v) => v != null);
    const kisni = V.padavine.map((v, i) => (v >= 0.1 ? i : -1)).filter((i) => i >= 0);
    const x = oznake();
    const kisa = kisni.length ? `kiša ${x[kisni[0]].oznaka.split("–")[0]}–${x[kisni[kisni.length - 1]].oznaka.split("–")[1]} (${NS.dec(zbir(V.padavine))} mm)` : "bez kiše";
    el.textContent = `${NS.dec(Math.min(...t))} do ${NS.dec(Math.max(...t))} °C · ${kisa} · Open-Meteo, preuzeto u ${sat(V.preuzeto_utc)}`;
  }

  // ---------------------------------------------------------------- tabela
  function spark(niz) {
    const w = 96, h = 24, bw = w / niz.length, max = Math.max(1, ...niz.map((v) => v || 0));
    return `<svg class="danas-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">` +
      niz.map((v, i) => {
        if (i >= D.sati_gotovo) return `<rect x="${(i * bw).toFixed(1)}" y="${h - 2}" width="${(bw - 1).toFixed(1)}" height="2" rx="1" class="buduce"/>`;
        if (v == null) return `<rect x="${(i * bw).toFixed(1)}" y="${h - 2}" width="${(bw - 1).toFixed(1)}" height="2" rx="1" class="nema"/>`;
        const vh = Math.max(1, (v / max) * (h - 2));
        return `<rect x="${(i * bw).toFixed(1)}" y="${(h - vh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${vh.toFixed(1)}" rx="1"/>`;
      }).join("") + "</svg>";
  }
  function tabela() {
    const r = Object.keys(D.serije).map(redSerije);
    r.sort(redosled === "danas" ? (a, b) => (b.danas ?? -1) - (a.danas ?? -1)
      : (a, b) => Math.abs(b.odst ?? -1) - Math.abs(a.odst ?? -1) || (b.danas ?? -1) - (a.danas ?? -1));
    const prikaz = sve ? r : r.slice(0, 12);
    const naziv = Object.fromEntries(s.serije.map((x) => [x.serija, x.naziv]));
    document.getElementById("tabela").innerHTML = `<thead><tr><th>Brojač</th><th class="broj">Danas</th><th class="broj">Prognoza${MAPA.info("prognoza za iste sate za koje postoji izbrojano")}</th>
      <th class="broj">Razlika</th><th>Sat po sat</th><th>Stanje</th></tr></thead><tbody>` + prikaz.map((x) => {
      const [txt, boja] = STANJE[x.stanje] || ["", "var(--t-light)"];
      const t = ton(x.odst);
      return `<tr data-s="${x.k}" tabindex="0" class="${x.k === izabrana ? "izabran" : ""}"><td><div class="stanica-celija"><div><b>${x.k}</b><small>${naziv[x.k] || ""}</small></div></div></td>
        <td class="broj">${NS.broj(x.danas)}</td><td class="broj">${x.prog == null ? "—" : NS.broj(Math.round(x.prog))}</td>
        <td class="broj"><span class="danas-razlika ${t ? `ton-${t}` : ""}">${znak(x.odst)}</span></td>
        <td>${spark(x.sati)}</td><td><span class="danas-stanje"><i style="background:${boja}"></i>${txt}${x.napomena ? MAPA.info(x.napomena) : ""}</span></td></tr>`;
    }).join("") + "</tbody>";
    const dug = document.getElementById("tabela-sve");
    dug.textContent = sve ? "Prikaži manje" : `Prikaži sve (${r.length})`;
    document.getElementById("t-oznaka").textContent = `Brojači · danas do ${D.brojaci_do}`;
  }

  // ---------------------------------------------------------------- mapa
  function mapaVrednosti() {
    const v = {};
    for (const k of Object.keys(D.serije)) {
      const x = redSerije(k), [txt, , pin] = STANJE[x.stanje] || ["", "", "radi"];
      v[k] = { stanje: pin, broj: x.danas == null ? null : NS.broj(x.danas), ton: x.stanje === "radi" ? ton(x.odst) : null,
        tekst: `<div class="tt-red"><b>${NS.broj(x.danas)}</b> biciklista danas (do ${x.brojac})</div>`
          + (x.prog != null ? `<div class="tt-red">prognoza za iste sate ${NS.broj(Math.round(x.prog))} · <b>${znak(x.odst)}</b></div>` : "")
          + (x.stanje !== "radi" ? `<div class="tt-red sitno">${txt}${x.napomena ? ` — ${x.napomena}` : ""}</div>` : "") };
    }
    ctl.prikaziVrednosti(v);
    document.getElementById("mapa-legenda").innerHTML = `<span><span class="danas-razlika ton-vise">+%</span> više od prognoze (&gt; ${TON} %)</span>
      <span><span class="danas-razlika">±%</span> u okviru</span><span><span class="danas-razlika ton-manje">−%</span> manje (&lt; −${TON} %)</span>
      <span><img src="${NS.pin("ne_radi")}" alt="">0 ili bez podataka</span>`;
  }

  // ---------------------------------------------------------------- mini kartice
  async function mini() {
    const max = D.grad.slice(0, D.sati_gotovo).reduce((m, v, i) => (v != null && (m < 0 || v > D.grad[m]) ? i : m), -1);
    const x = oznake();
    const el = document.getElementById("mini");
    el.innerHTML = `
      <div class="kartica danas-mini-k"><span class="eyebrow">Od 1. januara</span><div class="vrednost">${NS.broj(D.ove_godine)}</div><span class="sitno">zbir „ove godine“ sa svih brojača, raste svakog sata</span></div>
      <div class="kartica danas-mini-k"><span class="eyebrow">Najprometniji sat do sada</span><div class="vrednost">${max < 0 ? "—" : x[max].oznaka}</div>
        <span class="sitno">${max < 0 ? "još nema završenog sata" : `${NS.broj(D.grad[max])} biciklista na svim brojačima`}</span></div>
      <div class="kartica danas-mini-k"><span class="eyebrow">NS bike sada ${LJ.uzivoZnak(true).replace("uzivo-znak", "uzivo-znak sveze")}</span><div class="vrednost" id="nsb-broj">…</div><span class="sitno" id="nsb-opis">javni bicikli na stanicama</span></div>`;
    try {
      const r = await fetch("https://app.nsbike.rs/stanje", { cache: "no-store" });
      const st = r.ok ? await r.json() : null;
      if (!Array.isArray(st) || !st.length) throw new Error("prazno");
      document.getElementById("nsb-broj").textContent = NS.broj(zbir(st.map((x) => x.zauzeto)));
      document.getElementById("nsb-opis").textContent = `bicikala na ${st.length} stanica · ${NS.broj(zbir(st.map((x) => x.slobodno)))} slobodnih mesta`;
    } catch (e) {
      document.getElementById("nsb-broj").textContent = "—";
      document.getElementById("nsb-opis").textContent = "stanje trenutno nije dostupno";
    }
  }

  // ---------------------------------------------------------------- interakcija
  function izaberi(k, { saMape = false } = {}) {
    izabrana = k && izabrana !== k ? k : null;
    if (!saMape && izabrana && ctl) ctl.fokus(izabrana, { leti: true });
    g.glavni.osvezi();
    tabela();
  }
  document.getElementById("tabela").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-s]"); if (tr) izaberi(tr.dataset.s); });
  document.getElementById("tabela").addEventListener("keydown", (e) => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-s]"); if (tr) izaberi(tr.dataset.s); } });
  document.getElementById("tabela-sve").addEventListener("click", () => { sve = !sve; tabela(); });
  document.getElementById("nazad-grad").addEventListener("click", () => izaberi(null));

  function nacrtajSve() {
    zaglavlje(); kpi(); tabela(); opisVremena(); mini();
    if (ctl) mapaVrednosti();
    for (const x of Object.values(g)) x.osvezi();
  }

  try {
    [s, D] = await Promise.all([NS.stanice(), ucitaj()]);
    NS.prekidac(document.getElementById("g-prikaz"), [["sat", "Po satu"], ["zbirno", "Zbirno od ponoći"]], "sat", (v) => { zbirno = v === "zbirno"; g.glavni.osvezi(); });
    NS.prekidac(document.getElementById("t-redosled"), [["danas", "Najviše"], ["odst", "Odstupanje"]], "danas", (v) => { redosled = v; tabela(); });
    g.glavni = NS.grafik(document.getElementById("g-glavni"), crtajGlavni, { odmah: true });
    g.vreme = NS.grafik(document.getElementById("g-vreme"), crtajVreme);
    ctl = MAPA.napravi(document.getElementById("mapa"), s, { naFokus: (k) => { if (k && k !== izabrana) izaberi(k, { saMape: true }); } });
    nacrtajSve();
    LJ.pojave(main);
    setInterval(zaglavlje, 60e3);
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const novo = await ucitaj();
        if (novo.citanje_utc !== D.citanje_utc || novo.napravljeno_utc !== D.napravljeno_utc) { D = novo; nacrtajSve(); }
      } catch (e) { /* bez mreže: ostaje poslednje stanje */ }
    }, PROVERA_MS);
  } catch (e) {
    NS.greska(main, e);
  }
})();
