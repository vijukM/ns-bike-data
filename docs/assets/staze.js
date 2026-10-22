/* Biciklističke staze (data/staze.geojson + data/staze_analiza.json iz sajt/staze_analiza.py): mapa sa četiri prikaza —
   Mreža (vrsta staze), Promet (prosek najbližeg brojača na istoj ulici), Do staze (koliko je daleko najbliža staza od svake
   ulice) i Prekidi (kraj staze bez nastavka) — uz tabelu ulica sa stazom i poređenje delova grada.
   URL: ?prikaz=mreza|promet|udaljenost|prekidi&ulica=<naziv> */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  let A, G, s;
  try { [A, G, s] = await Promise.all([NS.json("staze_analiza.json", "data/"), NS.json("staze.geojson", "data/"), NS.stanice()]); }
  catch (e) { NS.greska(main, e); return; }

  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  const km = (x, d = 1) => (x >= 10 || d === 0 ? NS.broj(Math.round(x)) : new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  const pct = (x) => `${NS.broj(Math.round(x * 100))} %`;
  const metri = (m) => (m >= 1000 ? `${km(m / 1000)} km` : `${NS.broj(m)} m`);
  const bezK = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
  const VRSTE = [["s", "Izdvojena staza", "odvojena od kolovoza: ivičnjakom, zelenilom ili kao poseban deo trotoara", "--staza"],
    ["t", "Traka na kolovozu", "obeležena traka na kolovozu, uz automobile", "--traka"],
    ["z", "Zajednička sa pešacima", "pešačko-biciklistička površina (pešaci i bicikli zajedno)", "--zajednicka"]];
  const VRSTA = Object.fromEntries(VRSTE.map(([k, t]) => [k, t.toLowerCase()]));
  const KLASE = [["do 100 m", "staza je praktično tu"], ["100–300 m", "par minuta hoda"], ["300–600 m", "deo puta bez staze"], ["preko 600 m", "staza je daleko"]];
  // promet: topla skala (dobro se vidi i na plavoj vektorskoj i na svetloj mapi); granice u biciklistima dnevno
  const PROMET_GRANICE = [300, 800, 1300, 2000, 3500];
  const bojePrometa = () => (NS.tamna() ? ["#fef08a", "#fcd34d", "#fb923c", "#f43f5e", "#e11d48"] : ["#facc15", "#f59e0b", "#ea580c", "#dc2626", "#9f1239"]);
  const bojeKlasa = () => (NS.tamna() ? ["#22c55e", "#a3e635", "#f59e0b", "#ef4444"] : ["#16a34a", "#84cc16", "#d97706", "#dc2626"]);
  const U = A.ukupno, gr = U.grad;

  // ---------------------------------------------------------------- ulice i brojači
  const ulice = A.ulice.map((u, i) => ({ ...u, i }));
  const brojac = Object.fromEntries(A.brojaci.map((b) => [b.mesto, b]));
  const serijeMesta = {};
  for (const r of s.serije) (serijeMesta[r.mesto] = serijeMesta[r.mesto] || []).push(r);
  /** naziv za prikaz: staze van ulica nose naziv mesta („kod: Mišeluk“) ili oba kraja („pravac: Sajlovo – Rumenka“) */
  const ime = (n) => (n === "uz Dunav" ? { t: "Uz Dunav", sitno: "kej i nasip" }
    : n.startsWith("kod: ") ? { t: n.slice(5), sitno: "staza van ulica, u blizini" }
      : n.startsWith("pravac: ") ? { t: n.slice(8), sitno: "staza van ulica" } : { t: n, sitno: "" });
  const imeTekst = (n) => { const x = ime(n); return x.sitno ? `${x.t} (${x.sitno})` : x.t; };
  const strane = (u) => (u.obe_strane >= 1.6 ? ["obe", "staza sa obe strane ulice"] : u.obe_strane >= 1.2 ? ["delom", "na delu ulice sa obe strane"] : ["jedna", "staza sa jedne strane (ili jedna dvosmerna)"]);

  // deonice: OSM id (ili „id:deo“ kad je OSM deonica podeljena po ulicama) → ulica, brojač, udeo pravca, prelaz
  const deonica = A.deonice;
  const delovi_ = [];
  for (const f of G.features) {
    const pd = A.podela[f.properties.id];
    if (!pd) { delovi_.push([String(f.properties.id), f]); continue; }
    pd.forEach(([a, b], k) => delovi_.push([`${f.properties.id}:${k}`, { type: "Feature", properties: { ...f.properties }, geometry: { type: "LineString", coordinates: f.geometry.coordinates.slice(a, b + 1) } }]));
  }
  G = { ...G, features: delovi_.map(([k, f]) => {
    const d = deonica[k];
    if (d) {
      f.properties.u = d[0];
      if (d[1] != null) { f.properties.b = d[1]; f.properties.p = brojac[d[1]] ? brojac[d[1]].prosek : 0; }
      f.properties.r = d[2];
      if (d[3] != null) f.properties.pr = d[3];
    }
    return f;
  }) };
  const duzinaF = (f) => MAPA.duzinaKm(f.geometry.coordinates);
  let kmSaBrojacem = 0;
  for (const f of G.features) if (f.properties.b != null) kmSaBrojacem += duzinaF(f) * (f.properties.r || 1);

  // ---------------------------------------------------------------- mreža u brojevima: krug po vrsti i krofna udaljenosti
  const datum = (iso) => NS.datum(iso.slice(0, 10));
  document.getElementById("st-nadnaslov").textContent = `Mapa · OpenStreetMap · stanje ${datum(A.staze_preuzeto_utc)}`;
  const udeo = (k) => U.km[k] / U.km_linija;
  const pvLegenda = document.getElementById("pv-legenda");
  function crtajSastav() {
    pvLegenda.innerHTML = VRSTE.map(([k, t, opis, boja]) => `<button type="button" class="st-krug-red" data-t="${k}" aria-pressed="${vrsteNaMapi.has(k)}" title="${opis} — klik: samo ova vrsta na mapi">
        <i class="st-linija${k === "z" ? " isprekidana" : ""}" style="--boja:var(${boja})"></i><span>${t}<small>${opis}</small></span>
        <b>${km(U.km[k])}<small> km</small></b><em>${pct(udeo(k))}</em></button>`).join("") +
      `<div class="st-krug-zbir"><span>Ukupno</span><b>${km(U.km_linija)}<small> km</small></b><em>100 %</em></div>
      <p class="st-napomena">Kad se staze sa obe strane iste ulice računaju jednom, mreža ima <b>${km(U.km_pravaca, 0)} km</b> pravaca${LJ.info(`Na bulevaru sa stazom sa obe strane ucrtane su dve linije: ${km(U.km_linija, 0)} km je zbir svih linija, a ${km(U.km_pravaca, 0)} km dužina pravaca kojima se može voziti (deo staze sa paralelnom stazom na 2,5–50 m broji se jednom).`)}.</p>`;
    if (typeof pv !== "undefined") pv.osvezi();
  }
  let pv;

  const q = new URLSearchParams(location.search);
  const PRIKAZI = [["mreza", "Mreža"], ["promet", "Promet"], ["udaljenost", "Do staze"], ["prekidi", "Prekidi"]];
  let prikaz = PRIKAZI.some(([k]) => k === q.get("prikaz")) ? q.get("prikaz") : "mreza";
  let vrsteNaMapi = new Set(["s", "t", "z"]);
  let izabranaUlica = null, izabraniDeo = null, saRaskrsnicama = false;
  crtajSastav();
  const tekstKm = (v) => `${km(v)} km`;
  pv = NS.grafik(document.getElementById("pv-grafik"), (b) => ({
    ...NS.osnova(b),
    tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => `<b>${p.name}</b><br>${tekstKm(p.value)} · ${NS.broj(Math.round(p.percent))} %` },
    series: [{ type: "pie", radius: ["0%", "66%"], center: ["54%", "52%"], startAngle: 120, selectedMode: false,
      itemStyle: { borderColor: b.povrsina, borderWidth: 2 },
      label: { position: "inside", color: "#0b1120", fontWeight: 700, fontSize: 12, lineHeight: 15, formatter: (p) => `${NS.broj(Math.round(p.percent))} %\n${km(p.value, p.percent < 8 ? 1 : 0)} km` },
      labelLine: { length: 8, length2: 8, lineStyle: { color: b["ink-3"] } }, emphasis: { scaleSize: 5 }, animationType: "scale", animationDuration: 1100,
      // male kriške (trake, ~4 %) dobijaju natpis spolja
      data: VRSTE.map(([k, t, , boja]) => ({ name: t, value: U.km[k], k, itemStyle: { color: css(boja), opacity: vrsteNaMapi.has(k) ? 1 : 0.3 },
        ...(udeo(k) < 0.08 ? { label: { position: "outside", color: b["ink-2"], fontWeight: 600, fontSize: 11.5, overflow: "none" } } : {}) })) }],
  }));
  pv.spreman.then(({ ec }) => ec.on("click", (p) => { if (p.data && p.data.k) izaberiVrstu(p.data.k); }));

  const KLASE_KRATKO = ["do 100 m", "100–300 m", "300–600 m", "preko 600 m"];
  const zbirUd = gr.udaljenost_km.reduce((a, x) => a + x, 0);
  document.getElementById("ud-legenda").innerHTML = KLASE.map(([t, opis], i) => `<div class="st-krug-red"><i class="st-kvadrat" data-k="${i}"></i>
      <span>${t}<small>${opis}</small></span><b>${km(gr.udaljenost_km[i], 0)}<small> km</small></b><em>${pct(gr.udaljenost_km[i] / zbirUd)}</em></div>`).join("") +
    `<div class="st-krug-zbir"><span>Ulice u ${A.delovi.length} delova grada</span><b>${km(zbirUd, 0)}<small> km</small></b><em>100 %</em></div>
    <p class="st-napomena">Staza ide uz <b>${pct(gr.pokr_glavnih)}</b> glavnih ulica i uz ${pct(gr.pokr_ulica)} svih ulica (na 30 m ili bliže).${LJ.info("Glavne ulice: primarne i sekundarne po OpenStreetMap-u (bulevari i glavne gradske saobraćajnice). Udaljenost se meri vazdušnom linijom od svakog dela ulice do najbliže staze; servisne i pešačke ulice se ne računaju.")}</p>`;
  const bojiKvadrate = () => document.querySelectorAll("#ud-legenda .st-kvadrat").forEach((x) => { x.style.background = bojeKlasa()[+x.dataset.k]; });
  bojiKvadrate();
  const ud = NS.grafik(document.getElementById("ud-grafik"), (b) => {
    const k = bojeKlasa(), blizu = (gr.udaljenost_km[0] + gr.udaljenost_km[1]) / zbirUd;
    return {
      ...NS.osnova(b),
      tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => `<b>Najbliža staza ${KLASE_KRATKO[p.dataIndex]}</b><br>${km(p.value, 0)} km ulica · ${NS.broj(Math.round(p.percent))} %` },
      title: { text: pct(blizu), subtext: "ulica do 300 m\nod staze", left: "center", top: "35%", itemGap: 6,
        textStyle: { color: b.ink, fontSize: 24, fontWeight: 700, fontFamily: "Inter Tight, Inter, sans-serif" }, subtextStyle: { color: b["ink-3"], fontSize: 11, lineHeight: 14, align: "center" } },
      series: [{ type: "pie", radius: ["66%", "88%"], center: ["50%", "50%"], startAngle: 90, padAngle: 1.5, itemStyle: { borderRadius: 5, borderColor: b.povrsina, borderWidth: 1 },
        label: { show: false }, emphasis: { scaleSize: 4 },
        animationType: "expansion", animationDuration: 1300,
        data: gr.udaljenost_km.map((v, i) => ({ name: KLASE_KRATKO[i], value: v, itemStyle: { color: k[i] } })) }],
    };
  });
  ud.spreman.then(({ ec }) => ec.on("click", () => { postaviPrikaz("udaljenost"); document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "center" }); }));
  document.addEventListener("tema", bojiKvadrate);

  const el = document.getElementById("mapa");
  const ctl = MAPA.napravi(el, s, { podlogaEl: document.getElementById("podloga") });
  const m = ctl.mapa;
  ctl.filtriraj(new Set());                                     // pinovi brojača samo u prikazu „Promet“
  const imaSloj = (id) => !!m.getLayer(id);
  const vidljiv = (id, da) => { if (imaSloj(id)) m.setLayoutProperty(id, "visibility", da ? "visible" : "none"); };
  const OSNOVNE = ["staze-obod", "staze", "staze-z"];
  const okvir = (b) => [[b[0], b[1]], [b[2], b[3]]];
  const leti = (b, max = 16) => m.fitBounds(okvir(b), { padding: { top: 50, bottom: 50, left: 50, right: 50 }, maxZoom: max, duration: 800 });
  const kartica = new maplibregl.Popup({ closeButton: true, maxWidth: "290px", offset: 8, className: "kartica-staze" });

  const linija = (a, b, svojstva) => ({ type: "Feature", properties: svojstva, geometry: { type: "LineString", coordinates: [a, b] } });
  const prekidiGeo = () => ({ type: "FeatureCollection", features: [
    ...A.prekidi.map((p, i) => linija(p.a, p.b, { i, vr: "prekid", ras: p.raskrsnica })),
    ...A.krajevi.map((p, i) => ({ type: "Feature", properties: { i, vr: "kraj" }, geometry: { type: "LineString", coordinates: p.put } })),
  ] });
  const tackePrekida = () => ({ type: "FeatureCollection", features: [
    ...A.prekidi.map((p, i) => ({ type: "Feature", properties: { i, vr: "prekid", ras: p.raskrsnica }, geometry: { type: "Point", coordinates: [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2] } })),
    ...A.krajevi.map((p, i) => ({ type: "Feature", properties: { i, vr: "kraj" }, geometry: { type: "Point", coordinates: p.a } })),
  ] });

  let putevi = null;                                            // učitava se tek za prikaz „Do staze“ (2,8 MB, isti fajl kao vektorska mapa)
  function ucitajPuteve() {
    if (putevi) return putevi;
    putevi = NS.json("mapa/putevi.geojson", "data/").then((p) => {
      const c = A.udaljenost_puteva;
      if (c.length !== p.features.length) throw new Error("ulice i analiza staza nisu iz istog preuzimanja");
      const out = { type: "FeatureCollection", features: [] };
      p.features.forEach((f, i) => { if (c[i] !== "-") out.features.push({ type: "Feature", properties: { c: +c[i], k: f.properties.k, n: f.properties.n || "" }, geometry: f.geometry }); });
      m.addSource("st-putevi", { type: "geojson", data: out, tolerance: 0.4 });
      m.addLayer({ id: "st-putevi", type: "line", source: "st-putevi", layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
        paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, ["match", ["get", "k"], "g", 1.6, 0.8], 14, ["match", ["get", "k"], "g", 4, 2.2], 17, ["match", ["get", "k"], "g", 9, 5]],
          "line-opacity": 0.9 } }, "st-tanko");
      bojeSlojeva();
      return true;
    }).catch((e) => { console.warn(e); putevi = null; LJ.tost("Ulice za prikaz udaljenosti nisu učitane.", "map"); return false; });
    return putevi;
  }

  let delovi = null;
  const ucitajDelove = () => (delovi = delovi || NS.json("mapa/delovi.geojson", "data/").catch(() => null));

  const spremna = ctl.stazeSpremne.then(() => {
    m.addSource("st-staze", { type: "geojson", data: G });
    // isticanje (izabrana ulica ili brojač): široki sjaj ispod staza
    m.addLayer({ id: "st-sjaj", type: "line", source: "st-staze", filter: ["==", ["get", "u"], -2], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 14, 17, 22], "line-opacity": 0.45, "line-blur": 2 } }, "staze-obod");
    m.addLayer({ id: "st-istaknuto", type: "line", source: "st-staze", filter: ["==", ["get", "u"], -2], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 14, 4, 17, 7] } });
    m.addLayer({ id: "st-tanko", type: "line", source: "st-staze", layout: { "line-cap": "round", visibility: "none" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 15, 2.2], "line-opacity": 0.85 } });
    // promet: deonice bez brojača tanke i sive, sa brojačem obojene i šire po proseku
    m.addLayer({ id: "st-bez-brojaca", type: "line", source: "st-staze", filter: ["!", ["has", "p"]], layout: { "line-cap": "round", visibility: "none" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 15, 2.6], "line-opacity": 0.55 } });
    m.addLayer({ id: "st-promet", type: "line", source: "st-staze", filter: ["has", "p"], layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, ["interpolate", ["linear"], ["get", "p"], 300, 2, 4000, 5.5], 15, ["interpolate", ["linear"], ["get", "p"], 300, 4, 4000, 12]] } });
    m.addSource("st-prekidi", { type: "geojson", data: prekidiGeo() });
    m.addSource("st-prekidi-t", { type: "geojson", data: tackePrekida() });
    m.addLayer({ id: "st-krajevi", type: "line", source: "st-prekidi", filter: ["==", ["get", "vr"], "kraj"], layout: { "line-cap": "round", visibility: "none" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 7], "line-dasharray": [1.4, 1.2], "line-opacity": 0.95 } });
    m.addLayer({ id: "st-prekidi", type: "line", source: "st-prekidi", filter: ["==", ["get", "vr"], "prekid"], layout: { "line-cap": "round", visibility: "none" },
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 7], "line-dasharray": [1, 0.8] } });
    m.addLayer({ id: "st-prekidi-t", type: "circle", source: "st-prekidi-t", layout: { visibility: "none" },
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4.5, 16, 8], "circle-stroke-width": 2 } });
    m.addSource("st-deo", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "st-deo-povrs", type: "fill", source: "st-deo", paint: { "fill-opacity": 0.08 } }, "st-sjaj");
    m.addLayer({ id: "st-deo-obod", type: "line", source: "st-deo", paint: { "line-width": 2.2, "line-dasharray": [3, 1.5] } }, "st-sjaj");
    // pogodak: široka nevidljiva linija za hover i klik (na vrhu)
    m.addLayer({ id: "st-pogodak", type: "line", source: "st-staze", paint: { "line-width": 16, "line-opacity": 0 } });
    m.addLayer({ id: "st-pogodak-p", type: "circle", source: "st-prekidi-t", layout: { visibility: "none" }, paint: { "circle-radius": 14, "circle-opacity": 0 } });
    bojeSlojeva();
    dogadjaji();
    return true;
  });

  function bojeSlojeva() {
    if (!imaSloj("st-sjaj")) return;
    const tamna = NS.tamna();
    const istaknuto = tamna ? "#38bdf8" : "#1d4ed8";
    m.setPaintProperty("st-sjaj", "line-color", istaknuto);
    m.setPaintProperty("st-istaknuto", "line-color", istaknuto);
    m.setPaintProperty("st-tanko", "line-color", tamna ? "#e2e8f0" : "#1f2937");
    m.setPaintProperty("st-bez-brojaca", "line-color", tamna ? "#94a3b8" : "#64748b");
    const bp = bojePrometa();
    m.setPaintProperty("st-promet", "line-color", ["interpolate", ["linear"], ["get", "p"], ...PROMET_GRANICE.flatMap((g, i) => [g, bp[i]])]);
    m.setPaintProperty("st-krajevi", "line-color", "#fb923c");
    m.setPaintProperty("st-prekidi", "line-color", ["case", ["get", "ras"], "#f472b6", "#ef4444"]);
    m.setPaintProperty("st-prekidi-t", "circle-color", ["case", ["==", ["get", "vr"], "kraj"], "#fb923c", ["get", "ras"], "#f472b6", "#ef4444"]);
    m.setPaintProperty("st-prekidi-t", "circle-stroke-color", tamna ? "#0f172a" : "#ffffff");
    m.setPaintProperty("st-deo-povrs", "fill-color", istaknuto);
    m.setPaintProperty("st-deo-obod", "line-color", istaknuto);
    if (imaSloj("st-putevi")) {
      const k = bojeKlasa();
      m.setPaintProperty("st-putevi", "line-color", ["match", ["get", "c"], 0, k[0], 1, k[1], 2, k[2], k[3]]);
    }
  }
  document.addEventListener("tema", () => spremna.then(() => { bojeSlojeva(); crtajStranu(); }));

  async function primeniPrikaz() {
    await spremna;
    const p = prikaz;
    const filterVrsta = ["in", ["get", "t"], ["literal", [...vrsteNaMapi]]];
    for (const id of OSNOVNE) vidljiv(id, p === "mreza" || p === "prekidi");
    if (p === "mreza") {
      m.setFilter("staze-obod", filterVrsta);
      m.setFilter("staze", ["all", ["!=", ["get", "t"], "z"], filterVrsta]);
      m.setFilter("staze-z", ["all", ["==", ["get", "t"], "z"], filterVrsta]);
      m.setFilter("st-pogodak", filterVrsta);
    } else {
      m.setFilter("staze-obod", null); m.setFilter("staze", ["!=", ["get", "t"], "z"]); m.setFilter("staze-z", ["==", ["get", "t"], "z"]);
      m.setFilter("st-pogodak", null);
    }
    vidljiv("st-bez-brojaca", p === "promet");
    vidljiv("st-promet", p === "promet");
    vidljiv("st-tanko", p === "udaljenost");
    for (const id of ["st-krajevi", "st-prekidi", "st-prekidi-t", "st-pogodak-p"]) vidljiv(id, p === "prekidi");
    const ras = saRaskrsnicama ? null : ["any", ["==", ["get", "vr"], "kraj"], ["!", ["get", "ras"]]];
    m.setFilter("st-prekidi", ["all", ["==", ["get", "vr"], "prekid"], ...(ras ? [["!", ["get", "ras"]]] : [])]);
    m.setFilter("st-prekidi-t", ras); m.setFilter("st-pogodak-p", ras);
    if (p === "udaljenost") { if (await ucitajPuteve()) vidljiv("st-putevi", prikaz === "udaljenost"); }
    else vidljiv("st-putevi", false);
    if (p === "promet") {
      ctl.filtriraj(null);
      const v = {};
      for (const r of s.serije) {
        v[r.serija] = r.prosek_12m == null || r.stanje === "neispravan" ? { stanje: r.stanje, broj: null, tekst: null }
          : { stanje: r.stanje, broj: null, tekst: `<div class="tt-red">prosek <b>${NS.broj(r.prosek_12m)}</b> biciklista / dan</div>` };
      }
      ctl.prikaziVrednosti(v);
    } else ctl.filtriraj(new Set());
    kartica.remove();
  }

  // hover: cela ulica se istakne; klik: kartica deonice
  function dogadjaji() {
    let hoverU = null;
    m.on("mousemove", "st-pogodak", (e) => {
      if (prikaz === "udaljenost") return;
      m.getCanvas().style.cursor = "pointer";
      const u = e.features[0].properties.u;
      if (u !== hoverU) { hoverU = u; istakni(); }
    });
    m.on("mouseleave", "st-pogodak", () => { m.getCanvas().style.cursor = ""; hoverU = null; istakni(); });
    const istakni = () => {
      const u = hoverU != null && hoverU >= 0 ? hoverU : izabranaUlica;
      const f = u == null ? ["==", ["get", "u"], -2] : ["==", ["get", "u"], u];
      m.setFilter("st-sjaj", f);
      m.setFilter("st-istaknuto", f);
    };
    istakniUlicu = istakni;
    m.on("click", "st-pogodak", (e) => {
      if (prikaz === "udaljenost" || prikaz === "prekidi" && m.queryRenderedFeatures(e.point, { layers: ["st-pogodak-p"] }).length) return;
      const f = e.features[0], o = f.properties;
      setTimeout(() => karticaDeonice(e.lngLat, o, f), 0);
    });
    m.on("click", "st-putevi", (e) => {
      if (prikaz !== "udaljenost") return;
      const o = e.features[0].properties;
      const k = KLASE[o.c];
      setTimeout(() => kartica.setLngLat(e.lngLat).setHTML(`<b>${o.n || "Ulica bez naziva"}</b><div class="tt-red"><i class="st-tacka" style="background:${bojeKlasa()[o.c]}"></i>najbliža staza: <b>${k[0]}</b></div><div class="tt-red sitno">${k[1]}</div>`).addTo(m), 0);
    });
    m.on("mouseenter", "st-putevi", () => { if (prikaz === "udaljenost") m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "st-putevi", () => { m.getCanvas().style.cursor = ""; });
    m.on("click", "st-pogodak-p", (e) => { const o = e.features[0].properties; setTimeout(() => otvoriPrekid(o.vr, o.i, false), 0); });
    m.on("mouseenter", "st-pogodak-p", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "st-pogodak-p", () => { m.getCanvas().style.cursor = ""; });
  }
  let istakniUlicu = () => {};

  function karticaDeonice(lngLat, o, f) {
    const u = ulice[o.u];
    const duz = duzinaF(f) * 1000;
    const b = o.b != null ? brojac[o.b] : null;
    const prviS = b ? b.serije[0] : null;
    const prelaz = o.pr != null;
    const x = u ? ime(u.n) : prelaz ? { t: o.pr ? `Prelaz preko ulice ${o.pr}` : "Prelaz / veza između staza", sitno: "kratka deonica koja spaja staze" } : { t: "Staza", sitno: "" };
    kartica.setLngLat(lngLat).setHTML(`<b>${x.t}</b>${x.sitno ? `<div class="tt-red sitno">${x.sitno}</div>` : ""}
      <div class="tt-red"><i class="st-linija mala${o.t === "z" ? " isprekidana" : ""}" style="--boja:var(${VRSTE.find((v) => v[0] === o.t)[3]})"></i>${VRSTA[o.t]} · deonica ${metri(Math.round(duz / 10) * 10)}</div>
      ${o.r < 0.75 ? `<div class="tt-red sitno">sa druge strane ulice ide još jedna staza</div>` : ""}
      ${u ? `<div class="tt-red">${u.km_ulice ? `staza duž <b>${km(u.km_staze, 2)} km</b> od ${km(u.km_ulice, 2)} km ulice` : `cela staza: <b>${km(u.km_staze, 2)} km</b>`}</div>` : ""}
      ${b ? `<div class="tt-red">brojač <a href="stanica.html?id=${prviS}">${b.naziv}</a>: <b>${NS.broj(b.prosek)}</b> / dan</div>
        <div class="tt-red sitno">${o.b != null && b.ulica === (u && u.n) ? "najbliži brojač na istoj ulici" : ""}</div>` : prelaz ? "" : `<div class="tt-red sitno">na ovoj deonici nema brojača</div>`}
      ${u ? `<div class="tt-red"><button type="button" class="veza-dugme" data-ulica="${o.u}">Istakni celu ulicu</button></div>` : ""}`).addTo(m);
    const d = kartica.getElement().querySelector("[data-ulica]");
    if (d) d.addEventListener("click", () => izaberiUlicu(+d.dataset.ulica, { leti: true }));
  }

  function otvoriPrekid(vr, i, letiDo = true) {
    const p = vr === "kraj" ? A.krajevi[i] : A.prekidi[i];
    const tacke = vr === "kraj" ? p.put : [p.a, p.b];
    const b = tacke.reduce((o, [x, y]) => [Math.min(o[0], x), Math.min(o[1], y), Math.max(o[2], x), Math.max(o[3], y)], [180, 90, -180, -90]);
    const centar = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    if (letiDo) m.fitBounds(okvir(b), { padding: 90, maxZoom: 17, duration: 800 });
    const osm = `https://www.openstreetmap.org/#map=18/${centar[1].toFixed(5)}/${centar[0].toFixed(5)}`;
    const tekst = vr === "kraj"
      ? `<b>${p.ulica}</b><div class="tt-red">staza se završava, a ulica se nastavlja još <b>${metri(p.m)}</b> bez staze${p.m >= 2000 ? " (i dalje)" : ""}</div>`
      : `<b>${p.ulica}</b><div class="tt-red">staza se prekida na <b>${metri(p.m)}</b>, pa se nastavlja istim pravcem</div>${p.raskrsnica ? `<div class="tt-red sitno">preko raskrsnice — moguće je da prelaz postoji, ali nije ucrtan</div>` : ""}`;
    const pokazi = () => kartica.setLngLat(vr === "kraj" ? p.a : centar).setHTML(`${tekst}${p.strane === 2 ? `<div class="tt-red sitno">isto i sa druge strane ulice</div>` : ""}
      <div class="tt-red sitno"><a href="${osm}" target="_blank" rel="noopener">pogledaj na OpenStreetMap-u ↗</a></div>`).addTo(m);
    if (letiDo) m.once("moveend", pokazi); else pokazi();
  }

  // ---------------------------------------------------------------- bočna strana (zavisi od prikaza)
  const strana = document.getElementById("st-strana");
  const OPISI = {
    mreza: ["Mreža", "Kakve su staze", "Klikni na stazu za ulicu, vrstu i dužinu. Pređi mišem preko staze da se istakne cela ulica."],
    promet: ["Promet", "Koliko biciklista nosi staza", "Deonica je obojena po proseku najbližeg brojača na istoj ulici (do 1,5 km). Sive deonice nemaju brojač u blizini."],
    udaljenost: ["Do staze", "Koliko je daleko najbliža staza", "Svaka ulica je obojena po tome koliko je od nje udaljena najbliža biciklistička staza (vazdušnom linijom)."],
    prekidi: ["Prekidi", "Gde se staza prekida", "Mesta gde staza stane, a ulica ili staza se nastavljaju. Spisak je iz podataka OpenStreetMap-a — vredi ga proveriti na licu mesta."],
  };
  function crtajStranu() {
    const [oznaka, naslov, opis] = OPISI[prikaz];
    document.getElementById("st-mod-oznaka").textContent = oznaka;
    document.getElementById("st-mod-naslov").textContent = naslov;
    document.getElementById("st-mod-opis").textContent = opis;
    strana.innerHTML = { mreza: stranaMreza, promet: stranaPromet, udaljenost: stranaUdaljenost, prekidi: stranaPrekidi }[prikaz]();
    strana.scrollTop = 0;
  }
  const red = (attr, levo, desno, klasa = "") => `<button type="button" class="st-red ${klasa}" ${attr}><span>${levo}</span><span class="st-red-desno">${desno}</span></button>`;

  function stranaMreza() {
    const naj = ulice.filter((u) => !u.van_ulice).slice(0, 8);
    const maks = naj[0].km_staze;
    return `<div class="st-blok"><span class="eyebrow">Vrste staza</span>${VRSTE.map(([k, t, opis, boja]) =>
      `<label class="st-vrsta"><input type="checkbox" data-t="${k}" ${vrsteNaMapi.has(k) ? "checked" : ""}>
        <i class="st-linija${k === "z" ? " isprekidana" : ""}" style="--boja:var(${boja})"></i>
        <span><b>${t}</b><small>${opis}</small></span><span class="st-vrsta-km"><b>${km(U.km[k])}</b> km<small>${pct(udeo(k))}</small></span></label>`).join("")}</div>
      <div class="st-blok"><span class="eyebrow">Najduže ulice sa stazom${LJ.info("Dužina dela ulice duž kog ide staza (sa jedne ili obe strane). Klik vodi do ulice na mapi.")}</span>
      ${naj.map((u) => red(`data-ulica="${u.i}"`, `<span class="st-red-ime">${u.n}<small>${u.km_ulice ? `${pct(Math.min(1, u.km_ulice_staza / u.km_ulice))} ulice od ${km(u.km_ulice)} km` : ""}</small></span><span class="st-traka-mini"><i style="width:${(u.km_staze / maks) * 100}%"></i></span>`, `${km(u.km_staze)} km`, izabranaUlica === u.i ? "izabran" : "")).join("")}</div>`;
  }
  function stranaPromet() {
    const lista = [...A.brojaci].sort((x, y) => y.prosek - x.prosek);
    const maks = lista[0].prosek;
    return `<div class="st-blok"><span class="eyebrow">Biciklista dnevno (prosek)</span>
      <div class="st-gradijent" style="--g:linear-gradient(90deg,${bojePrometa().join(",")})"><i></i><span>300</span><span>1.300</span><span>3.500+</span></div>
      <p class="st-napomena">${km(kmSaBrojacem, 0)} od ${km(U.km_pravaca, 0)} km pravaca (${pct(kmSaBrojacem / U.km_pravaca)}) ima brojač na istoj ulici, na manje od 1,5 km. Prosek: 1. 9. 2025. – 31. 8. 2026.</p></div>
      <div class="st-blok"><span class="eyebrow">Brojači po prometu${LJ.info("Zbir oba brojača na istom mestu (a i b su dve strane ulice). Klik: ulica na mapi.")}</span>
      ${lista.map((x) => red(`data-mesto="${x.mesto}"`, `<span class="st-red-ime">${x.naziv}<small>${VRSTA[x.vrsta]}</small></span>
        <span class="st-traka-mini"><i style="width:${(x.prosek / maks) * 100}%;background:${bojaPrometa(x.prosek)}"></i></span>`, NS.broj(x.prosek), izabranaUlica != null && ulice[izabranaUlica].brojaci.includes(x.mesto) ? "izabran" : "")).join("")}</div>`;
  }
  const bojaPrometa = (p) => { const k = bojePrometa(); let c = k[0]; PROMET_GRANICE.forEach((g, i) => { if (p >= g) c = k[i]; }); return c; };
  function stranaUdaljenost() {
    const k = bojeKlasa(), z = gr.udaljenost_km.reduce((a, x) => a + x, 0);
    const daleko = [...A.delovi].filter((d) => d.medijana_m != null).sort((a, b) => b.medijana_m - a.medijana_m).slice(0, 6);
    return `<div class="st-blok"><span class="eyebrow">Ulice u gradu po udaljenosti od staze</span>
      ${KLASE.map(([t, opis], i) => `<div class="st-klasa"><i style="background:${k[i]}"></i><span><b>${t}</b><small>${opis}</small></span>
        <span class="st-vrsta-km"><b>${pct(gr.udaljenost_km[i] / z)}</b><small>${km(gr.udaljenost_km[i], 0)} km ulica</small></span></div>`).join("")}
      <div class="st-slozena">${gr.udaljenost_km.map((x, i) => `<i style="flex-grow:${x};background:${k[i]}" title="${KLASE[i][0]}: ${pct(x / z)}"></i>`).join("")}</div>
      <p class="st-napomena">Računato za ${km(gr.km_ulica, 0)} km ulica u ${A.delovi.length} delova grada (bez servisnih i pešačkih), od svakog dela ulice do najbliže tačke staze.</p></div>
      <div class="st-blok"><span class="eyebrow">Delovi grada najdalje od staze${LJ.info("Tipična udaljenost: polovina ulica u tom delu grada je bliže staze od ovoga (medijana).")}</span>
      ${daleko.map((d) => red(`data-deo="${d.n}"`, `<span class="st-red-ime">${d.n}<small>${pct(d.do_300)} ulica do 300 m od staze</small></span>`, metri(d.medijana_m), izabraniDeo === d.n ? "izabran" : "")).join("")}</div>`;
  }
  function stranaPrekidi() {
    const prekidi = A.prekidi.map((p, i) => ({ ...p, i })).filter((p) => saRaskrsnicama || !p.raskrsnica);
    const nRas = A.prekidi.filter((p) => p.raskrsnica).length;
    const obe = (p) => (p.strane === 2 ? `<small class="st-cip">obe strane</small>` : "");
    return `<div class="st-blok"><span class="eyebrow"><i class="st-tacka" style="background:#fb923c"></i>Staza staje · ${A.krajevi.length}${LJ.info("Kraj staze bez veze sa drugom stazom, a ista glavna ulica se nastavlja bar 250 m bez staze uz nju.")}</span>
      ${A.krajevi.map((p, i) => red(`data-kraj="${i}"`, `<span class="st-red-ime">${p.ulica}${obe(p)}<small>${p.uz && p.uz !== p.ulica ? `staza dolazi ${p.uz === "uz Dunav" ? "sa keja" : `od: ${ime(p.uz).t}`}` : "ulica se nastavlja bez staze"}</small></span>`, metri(p.m))).join("")}</div>
      <div class="st-blok"><span class="eyebrow"><i class="st-tacka" style="background:#ef4444"></i>Prekid u stazi · ${prekidi.length}${LJ.info("Kraj staze bez veze, a druga staza se nastavlja istim pravcem 15–150 m dalje, duž iste ulice.")}</span>
      <label class="st-vrsta mala"><input type="checkbox" id="st-raskrsnice" ${saRaskrsnicama ? "checked" : ""}><i class="st-tacka" style="background:#f472b6"></i><span>i preko raskrsnica (${nRas})<small>tu često postoji prelaz koji nije ucrtan</small></span></label>
      ${prekidi.map((p) => red(`data-prekid="${p.i}"`, `<span class="st-red-ime">${p.ulica}${obe(p)}<small>${p.raskrsnica ? "preko raskrsnice" : "duž ulice"}</small></span>`, metri(p.m))).join("")}</div>`;
  }

  strana.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.t) { if (t.checked) vrsteNaMapi.add(t.dataset.t); else vrsteNaMapi.delete(t.dataset.t); crtajSastav(); primeniPrikaz(); }
    if (t.id === "st-raskrsnice") { saRaskrsnicama = t.checked; crtajStranu(); primeniPrikaz(); }
  });
  strana.addEventListener("click", (e) => {
    const d = e.target.closest("button.st-red");
    if (!d) return;
    if (d.dataset.ulica) izaberiUlicu(+d.dataset.ulica, { leti: true });
    else if (d.dataset.mesto) {
      const b = brojac[+d.dataset.mesto], ui = ulice.findIndex((u) => u.n === b.ulica);
      if (ui >= 0) izaberiUlicu(ui, { leti: false });
      m.flyTo({ center: b.p, zoom: Math.max(m.getZoom(), 15), duration: 800 });
      const r = (serijeMesta[b.mesto] || [])[0];
      if (r) m.once("moveend", () => ctl.fokus(r.serija, { leti: false }));
    } else if (d.dataset.deo) izaberiDeo(d.dataset.deo);
    else if (d.dataset.kraj) otvoriPrekid("kraj", +d.dataset.kraj);
    else if (d.dataset.prekid) otvoriPrekid("prekid", +d.dataset.prekid);
  });
  // klik na vrstu (krug ili legenda): samo ta vrsta na mapi; ponovni klik na jedinu uključenu: sve
  function izaberiVrstu(k) {
    vrsteNaMapi = vrsteNaMapi.size === 1 && vrsteNaMapi.has(k) ? new Set(["s", "t", "z"]) : new Set([k]);
    crtajSastav();
    postaviPrikaz("mreza");
  }
  pvLegenda.addEventListener("click", (e) => { const d = e.target.closest("[data-t]"); if (d) izaberiVrstu(d.dataset.t); });

  function postaviPrikaz(p) {
    prikaz = p;
    document.querySelectorAll("#st-mod button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === p)));
    const u = new URL(location.href);
    if (p === "mreza") u.searchParams.delete("prikaz"); else u.searchParams.set("prikaz", p);
    history.replaceState(null, "", u);
    crtajStranu();
    primeniPrikaz();
  }
  NS.prekidac(document.getElementById("st-mod"), PRIKAZI, prikaz, postaviPrikaz);

  function izaberiUlicu(i, { leti: letiDo = false, skrol = false } = {}) {
    izabranaUlica = izabranaUlica === i && !letiDo ? null : i;
    istakniUlicu();
    if (izabranaUlica != null && letiDo) leti(ulice[i].b);
    if (skrol) el.scrollIntoView({ behavior: LJ && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    crtajStranu();
    tabela();
  }
  async function izaberiDeo(n) {
    izabraniDeo = n;
    const d = A.delovi.find((x) => x.n === n);
    if (!d) return;
    leti(d.b, 15);
    const g = await ucitajDelove();
    await spremna;
    if (g) m.getSource("st-deo").setData({ type: "FeatureCollection", features: g.features.filter((f) => f.properties.n === n && f.geometry.type !== "Point") });
    if (prikaz === "udaljenost") crtajStranu();
    dg.osvezi();
  }

  // ---------------------------------------------------------------- tabela ulica
  let sort = { kol: "km", smer: -1 };
  const nUlica = ulice.filter((u) => !u.van_ulice).length;
  document.getElementById("ul-oznaka").textContent = `${nUlica} ulica + ${ulice.length - nUlica} staza van ulica`;
  document.getElementById("ul-info").outerHTML = LJ.info("Svaki deo staze dobija naziv najbliže paralelne ulice; prelazi preko raskrsnica i kratke veze ne čine posebnu ulicu. Staza: dužina dela ulice duž kog ide staza. Ulica: dužina cele ulice (dvostruki kolovoz jednom). Brojač: najprometniji brojač na toj ulici, prosek biciklista dnevno (9/2025–8/2026).");
  function tabela() {
    const upit = bezK(document.getElementById("ul-pretraga").value.trim());
    const r = ulice.filter((u) => !upit || bezK(imeTekst(u.n)).includes(upit));
    const kljuc = { ime: (u) => ime(u.n).t, km: (u) => u.km_staze, ulica: (u) => u.km_ulice, pokr: (u) => (u.km_ulice ? u.km_ulice_staza / u.km_ulice : null),
      strane: (u) => u.obe_strane, prosek: (u) => u.prosek }[sort.kol];
    r.sort((a, b) => {
      const va = kljuc(a), vb = kljuc(b);
      if (sort.kol === "ime") return sort.smer * va.localeCompare(vb, "sr");
      if (va == null && vb == null) return b.km_staze - a.km_staze;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sort.smer * (va - vb) || b.km_staze - a.km_staze;
    });
    const th = (kol, tekst, kl = "") => `<th data-sort="${kol}" class="${kl}${sort.kol === kol ? " sortirano" : ""}" aria-sort="${sort.kol === kol ? (sort.smer > 0 ? "ascending" : "descending") : "none"}">${tekst}${
      sort.kol === kol ? `<span class="strelica-sort">${sort.smer > 0 ? "▲" : "▼"}</span>` : ""}</th>`;
    const vrstaBar = (u) => { const z = u.km || 1; return `<span class="st-slozena mala" title="${VRSTE.filter(([k]) => u.vrste[k]).map(([k, t]) => `${t}: ${km(u.vrste[k], 2)} km`).join(" · ")}">${
      VRSTE.filter(([k]) => u.vrste[k]).map(([k, , , boja]) => `<i style="flex-grow:${u.vrste[k] / z};background:var(${boja})"></i>`).join("")}</span>`; };
    document.getElementById("ul-tabela").innerHTML = `<thead><tr>${th("ime", "Ulica")}${th("km", "Staza", "broj")}${th("pokr", "Od ulice")}${th("strane", "Strane")}<th class="bez-sorta">Vrsta</th>${th("prosek", "Brojač", "broj")}</tr></thead><tbody>` +
      r.map((u) => {
        const x = ime(u.n), [st, stOpis] = strane(u);
        const b = u.brojaci.length ? u.brojaci.map((k) => brojac[k]).sort((a, c) => c.prosek - a.prosek)[0] : null;
        return `<tr data-u="${u.i}" tabindex="0" class="${u.i === izabranaUlica ? "izabran" : ""}"><td><b>${x.t}</b>${x.sitno ? `<small>${x.sitno}</small>` : ""}</td>
          <td class="broj">${km(u.km_staze, 2)}<small> km</small></td>
          <td>${u.km_ulice ? `<span class="st-pokr" title="staza duž ${km(u.km_ulice_staza, 2)} od ${km(u.km_ulice, 2)} km ulice"><span class="st-traka-mini"><i style="width:${Math.min(1, u.km_ulice_staza / u.km_ulice) * 100}%"></i></span><small>${pct(Math.min(1, u.km_ulice_staza / u.km_ulice))} od ${km(u.km_ulice)} km</small></span>` : "<span class=\"sitno\">van ulica</span>"}</td><td><span class="st-strane st-strane-${st}" title="${stOpis}">${st}</span></td><td>${vrstaBar(u)}</td>
          <td class="broj">${b ? `<a href="stanica.html?id=${b.serije[0]}" title="${b.naziv}">${NS.broj(b.prosek)}</a>${u.brojaci.length > 1 ? `<small> +${u.brojaci.length - 1}</small>` : ""}` : "<span class=\"sitno\">—</span>"}</td></tr>`;
      }).join("") + (r.length ? "" : `<tr><td colspan="6" class="sitno">Nema ulice „${document.getElementById("ul-pretraga").value}“ sa stazom.</td></tr>`) + "</tbody>";
  }
  const tab = document.getElementById("ul-tabela");
  tab.addEventListener("click", (e) => {
    const h = e.target.closest("th[data-sort]");
    if (h) { const k = h.dataset.sort; sort = { kol: k, smer: sort.kol === k ? -sort.smer : k === "ime" ? 1 : -1 }; tabela(); return; }
    if (e.target.closest("a")) return;
    const r = e.target.closest("tr[data-u]");
    if (r) izaberiUlicu(+r.dataset.u, { leti: true, skrol: true });
  });
  tab.addEventListener("keydown", (e) => { const r = e.target.closest("tr[data-u]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); izaberiUlicu(+r.dataset.u, { leti: true, skrol: true }); } });
  document.getElementById("ul-pretraga").addEventListener("input", tabela);

  // ---------------------------------------------------------------- delovi grada
  const MERE = {
    pokr: ["Ulice sa stazom", "Koliko ulica ima stazu", (d) => d.pokr_ulica, (v) => pct(v), "Udeo dužine ulica (bez servisnih i pešačkih) uz koje ide staza, na 30 m ili bliže."],
    blizu: ["Do 300 m", "Koliko je ulica blizu staze", (d) => d.do_300, (v) => pct(v), "Udeo dužine ulica od kojih je najbliža staza udaljena 300 m ili manje."],
    km: ["Km staza", "Koliko staza ima deo grada", (d) => d.km_pravaca, (v) => `${km(v)} km`, "Dužina pravaca staza unutar granica dela grada (obe strane ulice se računaju jednom)."],
    dalj: ["Udaljenost", "Koliko je daleko najbliža staza", (d) => d.medijana_m, (v) => metri(v), "Tipična udaljenost (medijana): polovina ulica u delu grada je bliže staze od ovoga. Manje je bolje."],
  };
  let mera = "pokr";
  const dgOpis = () => { document.getElementById("dg-naslov").textContent = MERE[mera][1]; document.getElementById("dg-opis").textContent = MERE[mera][4]; };
  NS.prekidac(document.getElementById("dg-mera"), Object.entries(MERE).map(([k, v]) => [k, v[0]]), mera, (v) => { mera = v; dgOpis(); dg.osvezi(); });
  dgOpis();
  const dgEl = document.getElementById("dg-grafik");
  dgEl.style.height = `${A.delovi.length * 24 + 40}px`;
  const dg = NS.grafik(dgEl, (b) => {
    const [, , f, fmt] = MERE[mera];
    const r = A.delovi.filter((d) => f(d) != null).sort((a, c) => (mera === "dalj" ? f(a) - f(c) : f(c) - f(a)));
    const maks = Math.max(...r.map(f));
    return {
      ...NS.osnova(b),
      tooltip: { ...NS.osnova(b).tooltip, trigger: "item", formatter: (p) => {
        const d = r[p.dataIndex];
        return `<b>${d.n}</b><br>staza: <b>${km(d.km_pravaca)} km</b> pravaca<br>ulice sa stazom: <b>${pct(d.pokr_ulica)}</b>${d.pokr_glavnih != null ? ` · glavne: ${pct(d.pokr_glavnih)}` : ""}<br>`
          + `do 300 m od staze: <b>${pct(d.do_300)}</b> ulica<br>tipična udaljenost: <b>${metri(d.medijana_m)}</b>${d.brojaci.length ? `<br>brojača: ${d.brojaci.length}` : ""}<br><span style="color:${b["ink-3"]}">klik: deo grada na mapi</span>`;
      } },
      grid: { left: 150, right: 64, top: 4, bottom: 4 },
      xAxis: { type: "value", show: false, max: mera === "pokr" || mera === "blizu" ? 1 : maks * 1.04 },
      yAxis: { type: "category", inverse: true, data: r.map((d) => d.n), ...NS.osaX(b), axisLine: { show: false },
        axisLabel: { color: b["ink-2"], fontSize: 12, width: 140, overflow: "truncate" } },
      series: [{ type: "bar", data: r.map((d) => ({ value: f(d), itemStyle: { color: d.n === izabraniDeo ? b.warning : b.primary, opacity: izabraniDeo && d.n !== izabraniDeo ? 0.55 : 1 } })),
        barWidth: 12, itemStyle: { borderRadius: 6 }, showBackground: true, backgroundStyle: { color: b.mreza, borderRadius: 6 },
        label: { show: true, position: "right", color: b["ink-2"], fontSize: 11.5, formatter: (p) => fmt(p.value) }, animationDuration: 900 }],
    };
  });
  dg.spreman.then(({ ec }) => ec.on("click", (p) => {
    const [, , f] = MERE[mera];
    const r = A.delovi.filter((d) => f(d) != null).sort((a, c) => (mera === "dalj" ? f(a) - f(c) : f(c) - f(a)));
    izaberiDeo(r[p.dataIndex].n);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }));

  // ---------------------------------------------------------------- o podacima
  const OSM_IZMENA = "https://www.openstreetmap.org/edit#map=14/45.2551/19.8452";
  document.getElementById("st-metod").innerHTML = [
    ["Izvor", `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap saradnici</a> (ODbL), preuzeto ${datum(A.staze_preuzeto_utc)} preko Overpass API-ja. Tri vrste: <b>izdvojena staza</b> (cycleway, track), <b>traka</b> (cycleway=lane) i <b>zajednička površina</b> (pešačka sa bicycle=designated). Ulice i delovi grada su iz istog izvora (${datum(A.putevi_preuzeto_utc)}).`],
    ["Pravci i ulice", `Staze sa obe strane bulevara su dve linije, ali jedan pravac: deo staze koji ima paralelnu stazu na 2,5–50 m broji se jednom. Svaki deo staze dobija naziv najbliže paralelne ulice (do 35 m, pa do 80 m; ako je najbliža ulica bez naziva, ne uzima tuđi naziv), a OSM deonica koja skreće u drugu ulicu deli se. Prelazi preko raskrsnica i veze kraće od 60 m pripadaju pravcu koji nastavljaju. Staze daleko od ulica nazvane su po najbližem mestu ili naselju.`],
    ["Promet", `Prosek biciklista dnevno sa brojača (kompletni dani, 1. 9. 2025. – 31. 8. 2026.), zbir obe strane ulice. Deonica dobija najbliži brojač na istoj ulici, ako je bliži od 1,5 km — to je procena prometa na toj ulici, ne merenje na svakoj deonici.`],
    ["Udaljenost i prekidi", `Udaljenost se meri vazdušnom linijom od svakog dela ulice do najbliže staze. Prekid je kraj staze bez veze, a staza se nastavlja istim pravcem 15–150 m dalje; kraj je mesto gde se ista glavna ulica nastavlja bar 250 m bez staze. OpenStreetMap ponekad nema ucrtan prelaz ili kratak deo staze, pa su ovo mesta za proveru. <a href="${OSM_IZMENA}" target="_blank" rel="noopener">Ispravi na OpenStreetMap-u ↗</a>`],
  ].map(([n, t]) => `<div><h3>${n}</h3><p>${t}</p></div>`).join("");

  // ---------------------------------------------------------------- početak
  crtajStranu();
  tabela();
  primeniPrikaz();
  const trazena = q.get("ulica");
  if (trazena) { const i = ulice.findIndex((u) => bezK(u.n) === bezK(trazena)); if (i >= 0) spremna.then(() => izaberiUlicu(i, { leti: true })); }
  LJ.pojave(main);
})();
