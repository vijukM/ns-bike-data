/* Mapa brojača (MapLibre GL): mapa se pomera, rotira i naginje (desni klik / Ctrl + prevlačenje, dva prsta), dugme
   3D podiže pogled i prikazuje zgrade. Podloge: CARTO i OpenStreetMap (rasterske) i tri „poster“ mape koje sajt sam
   crta iz vektorskih podataka OpenStreetMap-a (docs/data/mapa/, sajt/osnova_mape.py): tamno plava, siva i bela —
   oštre na svakom zumu. Pinovi po stanju brojača (hover = kartica, klik = fokus, „odskakivanje“ iz spiska),
   a/b razmaknuti u pikselima, biciklističke staze iz OSM-a, Ctrl + točkić za zum, filtriranje pinova,
   „danas do Xh“ iz docs/data/uzivo.json. */
"use strict";

const MAPA = (() => {
  const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> saradnici';
  const CARTO = '© <a href="https://carto.com/">CARTO</a>';
  const TIPOVI_STAZA = { s: "izdvojena staza", t: "traka na kolovozu", z: "zajednička sa pešacima" };
  const REDOSLED = ["radi", "delimicno", "ne_radi", "neispravan"];
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  const info = (tekst) => `<span class="info" tabindex="0" role="note" aria-label="${tekst}" data-info="${tekst}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>`;

  // ---------------------------------------------------------------- podloge
  const PODLOGE = [["carto", "CARTO"], ["osm", "OpenStreetMap"], ["plava", "Tamno plava"], ["siva", "Siva"], ["bela", "Bela"]];
  /** „Poster“ mape: boje slojeva i debljina ulica (k = klasa puta: a autoput, g glavna, s sporedna, o ostale). */
  const POSTERI = {
    plava: { pozadina: "#13233b", voda: "#0a1526", obalaVode: "#28466b", zelenilo: "#172b45", pruga: "#6d89b0", zgrade: "#5f7fa8",
      put: { a: "#ffffff", g: "#f1f5fb", s: "#c3d3e8", o: "#7f98ba" }, debljina: 1 },
    siva: { pozadina: "#46494c", voda: "#3a3d40", obalaVode: "#ffffff", zelenilo: "#4c4f52", pruga: "#d9d9d9", zgrade: "#9a9ea2",
      put: { a: "#ffffff", g: "#ffffff", s: "#f4f4f4", o: "#e2e2e2" }, debljina: 1.3 },
    bela: { pozadina: "#ffffff", voda: "#d9d9d9", obalaVode: null, zelenilo: "#f3f3f3", pruga: "#8c8c8c", zgrade: "#c9c9c9",
      put: { a: "#111111", g: "#151515", s: "#2a2a2a", o: "#6b6b6b" }, debljina: 1 },
  };
  const SIRINA = { a: [11, 1.6, 13, 3, 15, 7, 17, 16], g: [11, 1.1, 13, 2.2, 15, 5, 17, 12], s: [11, 0.35, 13, 0.9, 15, 2.4, 17, 7], o: [12, 0.2, 14, 0.6, 16, 2, 18, 4] };
  const sirina = (k, f) => ["interpolate", ["exponential", 1.5], ["zoom"], ...SIRINA[k].map((x, i) => (i % 2 ? x * f : x))];
  const SLOJEVI_OSNOVE = ["voda", "zelenilo", "putevi", "pruga"];

  // „danas do Xh“ (poslednje čitanje scraper-a)
  const uzivo = NS.json("uzivo.json", "data/").catch(() => null);
  const danasIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: NS.TZ }).format(new Date());
  async function danasTekst(serija) {
    const u = await uzivo;
    if (!u || !u.serije[serija]) return "";
    const [v, h] = u.serije[serija];
    const kad = u.datum === danasIso() ? "danas" : `${NS.datum(u.datum).slice(0, -5)}.`;
    return `<div class="tt-red">${kad} <b>${v == null ? "—" : NS.broj(v)}</b> <small>do ${h}h</small></div>`;
  }

  function duzinaKm(koord) {
    let m = 0;
    for (let i = 1; i < koord.length; i++) {
      const [a, b] = [koord[i - 1], koord[i]];
      const dy = (b[1] - a[1]) * 111320, dx = (b[0] - a[0]) * 111320 * Math.cos(a[1] * Math.PI / 180);
      m += Math.hypot(dx, dy);
    }
    return m / 1000;
  }

  /** Dugme 3D/2D u uglu mape: nagib 60° i zgrade, ili nazad na pogled odozgo. */
  class Dugme3D {
    constructor(naKlik) { this.naKlik = naKlik; }
    onAdd() {
      this.el = document.createElement("div");
      this.el.className = "maplibregl-ctrl maplibregl-ctrl-group dugme-3d";
      this.el.innerHTML = '<button type="button" title="Pogled iz ugla (3D) / odozgo (2D)" aria-label="3D pogled">3D</button>';
      this.el.querySelector("button").addEventListener("click", this.naKlik);
      return this.el;
    }
    onRemove() { this.el.remove(); }
    postavi(je3d) { const d = this.el.querySelector("button"); d.textContent = je3d ? "2D" : "3D"; d.classList.toggle("aktivno", je3d); }
  }

  /** opcije: {podlogaEl, stazeEl, naFokus(serija)} → kontroler */
  function napravi(el, s, opcije = {}) {
    const granice = s.serije.reduce((g, r) => g.extend([r.lon, r.lat]), new maplibregl.LngLatBounds([s.serije[0].lon, s.serije[0].lat], [s.serije[0].lon, s.serije[0].lat]));
    const m = new maplibregl.Map({
      container: el,
      style: { version: 8, sources: {}, layers: [{ id: "pozadina", type: "background", paint: { "background-color": css("--bg-muted") } }] },
      bounds: granice, fitBoundsOptions: { padding: 36 }, maxPitch: 70, dragRotate: true, touchPitch: true,
      cooperativeGestures: true, attributionControl: false,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Drži Ctrl i skroluj točkićem da uvećaš ili smanjiš mapu",
        "CooperativeGesturesHandler.MacHelpText": "Drži ⌘ i skroluj točkićem da uvećaš ili smanjiš mapu",
        "CooperativeGesturesHandler.MobileHelpText": "Pomeraj mapu sa dva prsta",
        "NavigationControl.ResetBearing": "Vrati sever gore i pogled odozgo", "NavigationControl.ZoomIn": "Uvećaj", "NavigationControl.ZoomOut": "Umanji",
        "AttributionControl.ToggleAttribution": "Izvori mape",
      },
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const d3 = new Dugme3D(() => postavi3D(m.getPitch() < 15));
    m.addControl(d3, "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");

    // ---------------------------------------------------------------- podloga i slojevi
    let izbor = "carto";
    try { if (PODLOGE.some(([k]) => k === localStorage.getItem("ns-podloga"))) izbor = localStorage.getItem("ns-podloga"); } catch (e) { /* */ }
    let osnovaUcitana = null, zgradeUcitane = null;
    const imaSloj = (id) => !!m.getLayer(id);
    const vidljiv = (id, da) => { if (imaSloj(id)) m.setLayoutProperty(id, "visibility", da ? "visible" : "none"); };

    function rasterSloj(id, tiles, attribution) {
      m.addSource(id, { type: "raster", tiles, tileSize: 256, maxzoom: 19, attribution });
      m.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" } });
    }
    function osnovniSlojevi() {
      rasterSloj("carto-svetla", ["a", "b", "c", "d"].map((x) => `https://${x}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png`), `${OSM} · ${CARTO}`);
      rasterSloj("carto-tamna", ["a", "b", "c", "d"].map((x) => `https://${x}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`), `${OSM} · ${CARTO}`);
      m.setPaintProperty("carto-tamna", "raster-brightness-min", 0.12);
      m.setPaintProperty("carto-tamna", "raster-contrast", -0.06);
      rasterSloj("osm", ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], OSM);
      m.addSource("staze", { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: OSM });
      m.addLayer({ id: "staze-obod", type: "line", source: "staze", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 13.5, 6, 16, 10], "line-opacity": 0.9 } });
      m.addLayer({ id: "staze", type: "line", source: "staze", filter: ["!=", ["get", "t"], "z"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 13.5, 2.8, 16, 4.5] } });
      m.addLayer({ id: "staze-z", type: "line", source: "staze", filter: ["==", ["get", "t"], "z"], layout: { "line-join": "round" },
        paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 13.5, 2.8, 16, 4.5], "line-dasharray": [2, 2] } });
    }
    /** Vektorska osnova (poster mape) se učitava tek kad zatreba. */
    function ucitajOsnovu() {
      if (osnovaUcitana) return osnovaUcitana;
      osnovaUcitana = Promise.all(SLOJEVI_OSNOVE.map((ime) => NS.json(`mapa/${ime}.geojson`, "data/"))).then(([voda, zelenilo, putevi, pruga]) => {
        const pre = imaSloj("zgrade-3d") ? "zgrade-3d" : "staze-obod";
        for (const [ime, data] of [["voda", voda], ["zelenilo", zelenilo], ["putevi", putevi], ["pruga", pruga]]) {
          m.addSource(`o-${ime}`, { type: "geojson", data, attribution: OSM, tolerance: 0.3 });
        }
        m.addLayer({ id: "o-zelenilo", type: "fill", source: "o-zelenilo", paint: {} }, pre);
        m.addLayer({ id: "o-voda", type: "fill", source: "o-voda", paint: {} }, pre);
        m.addLayer({ id: "o-obala", type: "line", source: "o-voda", paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 15, 2] } }, pre);
        m.addLayer({ id: "o-pruga", type: "line", source: "o-pruga", paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2.4], "line-dasharray": [3, 2] } }, pre);
        for (const k of ["o", "s", "g", "a"]) {
          m.addLayer({ id: `o-put-${k}`, type: "line", source: "o-putevi", filter: ["==", ["get", "k"], k], minzoom: k === "o" ? 12 : 0,
            layout: { "line-cap": "round", "line-join": "round" }, paint: {} }, pre);
        }
        return true;
      }).catch((e) => { console.warn(e); osnovaUcitana = null; return false; });
      return osnovaUcitana;
    }
    function ucitajZgrade() {
      if (zgradeUcitane) return zgradeUcitane;
      zgradeUcitane = NS.json("mapa/zgrade.geojson", "data/").then((data) => {
        m.addSource("zgrade", { type: "geojson", data, attribution: OSM });
        m.addLayer({ id: "zgrade-3d", type: "fill-extrusion", source: "zgrade", minzoom: 13.5,
          paint: { "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 14.5, ["get", "h"]], "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.85, "fill-extrusion-vertical-gradient": true } }, "staze-obod");
        return true;
      }).catch((e) => { console.warn(e); zgradeUcitane = null; return false; });
      return zgradeUcitane;
    }

    function boje() {
      const tamna = NS.tamna();
      const p = POSTERI[izbor];
      m.setPaintProperty("pozadina", "background-color", p ? p.pozadina : css("--bg-muted"));
      vidljiv("carto-svetla", izbor === "carto" && !tamna);
      vidljiv("carto-tamna", izbor === "carto" && tamna);
      vidljiv("osm", izbor === "osm");
      if (imaSloj("osm")) {               // OSM u tamnoj temi: obrnuta svetlina i ugašene boje (kao filter invert ranije)
        m.setPaintProperty("osm", "raster-brightness-min", tamna ? 0.92 : 0);
        m.setPaintProperty("osm", "raster-brightness-max", tamna ? 0.08 : 1);
        m.setPaintProperty("osm", "raster-hue-rotate", tamna ? 180 : 0);
        m.setPaintProperty("osm", "raster-saturation", tamna ? -0.45 : 0);
      }
      const poster = !!p;
      for (const id of ["o-zelenilo", "o-voda", "o-obala", "o-pruga", "o-put-o", "o-put-s", "o-put-g", "o-put-a"]) vidljiv(id, poster);
      if (poster && imaSloj("o-voda")) {
        m.setPaintProperty("o-zelenilo", "fill-color", p.zelenilo);
        m.setPaintProperty("o-voda", "fill-color", p.voda);
        m.setPaintProperty("o-obala", "line-color", p.obalaVode || p.voda);
        m.setPaintProperty("o-pruga", "line-color", p.pruga);
        for (const k of ["o", "s", "g", "a"]) {
          m.setPaintProperty(`o-put-${k}`, "line-color", p.put[k]);
          m.setPaintProperty(`o-put-${k}`, "line-width", sirina(k, p.debljina));
        }
      }
      if (imaSloj("zgrade-3d")) {
        m.setPaintProperty("zgrade-3d", "fill-extrusion-color", p ? p.zgrade : tamna ? "#3a4a66" : "#c9d2de");
      }
      const st = { obod: css("--staza-obod"), s: css("--staza"), t: css("--traka"), z: css("--zajednicka") };
      m.setPaintProperty("staze-obod", "line-color", st.obod);
      m.setPaintProperty("staze", "line-color", ["match", ["get", "t"], "t", st.t, st.s]);
      m.setPaintProperty("staze-z", "line-color", st.z);
      el.dataset.podloga = izbor;
    }
    async function postaviPodlogu(v) {
      if (POSTERI[v] && !(await ucitajOsnovu())) {
        LJ.tost("Vektorska osnova mape još nije pripremljena — prikazujem CARTO.", "map");
        v = "carto";
        if (opcije.podlogaEl) opcije.podlogaEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === v)));
      }
      izbor = v;
      try { localStorage.setItem("ns-podloga", v); } catch (e) { /* */ }
      boje();
    }
    async function postavi3D(da) {
      if (da) await ucitajZgrade();
      vidljiv("zgrade-3d", da);
      if (da) {
        if (imaSloj("zgrade-3d")) boje();
        m.easeTo({ pitch: 60, bearing: m.getBearing() || -17, zoom: Math.max(m.getZoom(), 14.6), duration: 1200 });
      } else m.easeTo({ pitch: 0, bearing: 0, duration: 900 });
      d3.postavi(da);
    }
    m.on("pitchend", () => {
      const je = m.getPitch() >= 15;
      d3.postavi(je);
      if (je) ucitajZgrade().then(() => { vidljiv("zgrade-3d", true); boje(); });
      else vidljiv("zgrade-3d", false);
    });

    const spremna = new Promise((ok) => m.on("load", ok)).then(async () => {
      osnovniSlojevi();
      boje();
      if (POSTERI[izbor]) await postaviPodlogu(izbor);
    });
    if (opcije.podlogaEl) NS.prekidac(opcije.podlogaEl, PODLOGE, izbor, (v) => spremna.then(() => postaviPodlogu(v)));

    // ---------------------------------------------------------------- staze
    let stazeUkljucene = true;
    try { stazeUkljucene = localStorage.getItem("ns-staze") !== "0"; } catch (e) { /* */ }
    const stazeSpremne = NS.json("staze.geojson", "data/").then(async (g) => {
      await spremna;
      m.getSource("staze").setData(g);
      for (const id of ["staze-obod", "staze", "staze-z"]) vidljiv(id, stazeUkljucene);
      const km = { s: 0, t: 0, z: 0 };
      for (const f of g.features) km[f.properties.t] += duzinaKm(f.geometry.coordinates);
      return km;
    }).catch(() => null);
    if (opcije.stazeEl) {
      opcije.stazeEl.innerHTML = `<label class="cip cip-stikla" style="--boja:var(--staza)"><input type="checkbox" ${stazeUkljucene ? "checked" : ""}>
        <span class="kvacica" aria-hidden="true"></span>Biciklističke staze</label>`;
      opcije.stazeEl.querySelector("input").addEventListener("change", (e) => {
        stazeUkljucene = e.target.checked;
        try { localStorage.setItem("ns-staze", stazeUkljucene ? "1" : "0"); } catch (x) { /* */ }
        spremna.then(() => { for (const id of ["staze-obod", "staze", "staze-z"]) vidljiv(id, stazeUkljucene); });
      });
    }

    // ---------------------------------------------------------------- pinovi
    const parovi = {};
    for (const r of s.serije) (parovi[r.mesto] = parovi[r.mesto] || []).push(r);
    /** a/b na istom mestu: razmaknuti ~28 px duž ulice (u metrima za trenutni zum, pa se pomeraju i rotiraju sa mapom). */
    function polozaj(r) {
      const par = parovi[r.mesto];
      if (par.length !== 2) return [r.lon, r.lat];
      const [a, c] = par;
      const lat0 = (a.lat + c.lat) / 2, lon0 = (a.lon + c.lon) / 2;
      const kos = Math.cos(lat0 * Math.PI / 180);
      let dy = c.lat_mapa - a.lat_mapa, dx = (c.lon_mapa - a.lon_mapa) * kos;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const mPoPx = 40075016.686 * kos / 2 ** (m.getZoom() + 9);
      const pomak = (r === a ? -1 : 1) * 14 * mPoPx / 111320;
      return [lon0 + dx * pomak / kos, lat0 + dy * pomak];
    }
    const pinovi = {}, naMapi = {}, stanjePina = {}, tekstovi = {};
    let izabrana = null, vidljive = null, menjam = false, prikazana = null, postavljeni = false;
    const kartica = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "300px", focusAfterOpen: false,
      offset: { top: [0, 4], "top-left": [6, 0], "top-right": [-6, 0], bottom: [0, -36], "bottom-left": [10, -30], "bottom-right": [-10, -30], left: [18, -17], right: [-18, -17] } });
    kartica.on("close", () => { prikazana = null; if (!menjam && izabrana) odznaci(); });

    function html(serija, stanje, brojTekst) {
      const sv = stanje === "nije_postavljen" || stanje === "neispravan" ? " svetli-obod" : "";
      return `<div class="pin${sv}${brojTekst == null ? " bez-broja" : ""}${serija === izabrana ? " izabran" : ""}">
        <div class="telo"><img class="n" src="${NS.pin(stanje)}" alt=""><img class="h" src="${NS.pin("izabrana")}" alt=""></div>
        <span class="pin-broj">${brojTekst ?? ""}</span></div>`;
    }
    for (const r of s.serije) {
      const e = document.createElement("div");
      e.className = "pin-omot";
      e.title = `${r.serija} ${r.naziv}`;
      e.innerHTML = html(r.serija, r.stanje);
      e.addEventListener("click", (ev) => { ev.stopPropagation(); fokus(r.serija, { leti: true }); });
      e.addEventListener("mouseenter", () => otvoriKarticu(r.serija));
      e.addEventListener("mouseleave", () => {
        if (r.serija === izabrana) return;
        if (izabrana) otvoriKarticu(izabrana); else { menjam = true; kartica.remove(); menjam = false; }
      });
      pinovi[r.serija] = new maplibregl.Marker({ element: e, anchor: "bottom" }).setLngLat(polozaj(r));
      stanjePina[r.serija] = { stanje: r.stanje, broj: null };
    }
    spremna.then(() => { postavljeni = true; for (const r of s.serije) osveziPin(r.serija); });
    m.on("zoomend", () => { for (const r of s.serije) pinovi[r.serija].setLngLat(polozaj(r)); if (prikazana) kartica.setLngLat(pinovi[prikazana].getLngLat()); });
    m.on("click", () => { if (izabrana) { menjam = true; kartica.remove(); menjam = false; odznaci(); } });
    const opis = (r) => `<b>${r.serija}</b> · ${r.naziv}<br><span class="sitno">${r.smerovi.join("<br>")}</span>`;

    function otvoriKarticu(serija) {
      const t = tekstovi[serija];
      if (!t || !naMapi[serija]) return;
      menjam = true;
      kartica.setLngLat(pinovi[serija].getLngLat())
        .setHTML(`${t}<div class="tt-red"><a href="stanica.html?id=${encodeURIComponent(serija)}">Otvori stanicu →</a></div>`);
      if (!kartica.isOpen()) kartica.addTo(m);
      prikazana = serija;
      menjam = false;
    }
    function osveziPin(serija) {
      const st = stanjePina[serija];
      const p = pinovi[serija];
      const sakriven = st.stanje === "sakriven" || (vidljive && !vidljive.has(serija));
      p.getElement().innerHTML = html(serija, st.stanje === "sakriven" ? "nije_postavljen" : st.stanje, st.broj);
      p.getElement().style.zIndex = serija === izabrana ? 5 : "";
      if (sakriven && naMapi[serija]) { p.remove(); naMapi[serija] = false; if (prikazana === serija) { menjam = true; kartica.remove(); menjam = false; } }
      else if (!sakriven && !naMapi[serija] && postavljeni) { p.addTo(m); naMapi[serija] = true; }
    }
    function postaviPin(serija, stanje, brojTekst, tekst) {
      stanjePina[serija] = { stanje, broj: brojTekst };
      tekstovi[serija] = tekst || null;
      osveziPin(serija);
      if (prikazana === serija) { if (tekst) otvoriKarticu(serija); else { menjam = true; kartica.remove(); menjam = false; } }
    }
    function skoci(serija) {
      const e = pinovi[serija].getElement().querySelector(".pin");
      if (e) { e.classList.remove("skok"); void e.offsetWidth; e.classList.add("skok"); }
    }
    function odznaci() {
      const pret = izabrana;
      izabrana = null;
      if (pret) osveziPin(pret);
      if (opcije.naFokus) opcije.naFokus(null);
    }
    let poziv = 0;                  // noviji prikaz (npr. sat iz „dan na mapi“) prekida stariji koji još čeka podatke
    async function prikaziStanje() {
      const moj = ++poziv;
      await spremna;
      for (const r of s.serije) {
        const danas = await danasTekst(r.serija);
        if (moj !== poziv) return;
        postaviPin(r.serija, r.stanje, null, `${opis(r)}<div class="tt-red"><span class="znacka tacka z-${r.stanje}">${s.stanja[r.stanje]}</span></div>
          ${r.prosek_12m != null && r.stanje !== "neispravan" ? `<div class="tt-red">prosek <b>${NS.broj(r.prosek_12m)}</b> / dan
            <small>kompletni dani, 1. 9. 2025. – 31. 8. 2026.</small></div>` : ""}${danas}
          ${r.napomena ? `<div class="tt-red sitno">${r.napomena}</div>` : ""}`);
      }
    }
    /** Prikaz jednog sata iz sati/<YYYY-MM>.json (indeks i u nizu). */
    function prikaziSat(mes, i, oznaka) {
      poziv++;
      for (const r of s.serije) {
        const niz = mes.v[r.serija];
        const kod = niz ? NS.razlogSata(mes.r[r.serija], i) : 9;
        if (kod === 9) { postaviPin(r.serija, "sakriven", null, null); continue; }
        const v = niz[i];
        if (v == null) postaviPin(r.serija, kod === 8 ? "neispravan" : "ne_radi", null, `${opis(r)}<br><b>nema podataka</b>: ${NS.razlog(kod)}`);
        else postaviPin(r.serija, "radi", NS.broj(v), `${opis(r)}<br><b>${NS.broj(v)}</b> biciklista, ${oznaka}`);
      }
    }
    /** Fokus: pin ostaje uvećan, mapa ga centrira, otvara se ista kartica kao na hover.
        skok = true samo kad se bira iz spiska/pretrage (pin tada odskoči kad mapa stigne do njega). */
    function fokus(serija, { leti = true, skok = false } = {}) {
      const pret = izabrana;
      izabrana = serija;
      if (pret && pret !== serija) osveziPin(pret);
      if (!serija) return;
      osveziPin(serija);
      const posle = () => { otvoriKarticu(serija); if (skok) skoci(serija); };
      if (leti) { m.flyTo({ center: pinovi[serija].getLngLat(), zoom: Math.max(m.getZoom(), 15), duration: 700 }); m.once("moveend", posle); } else posle();
      if (opcije.naFokus) opcije.naFokus(serija);
    }
    /** Prikazuje samo zadate serije (null = sve). */
    function filtriraj(skup) {
      vidljive = skup;
      for (const r of s.serije) osveziPin(r.serija);
    }
    document.addEventListener("tema", () => spremna.then(boje));
    prikaziStanje();
    return { mapa: m, prikaziStanje, prikaziSat, fokus, izaberi: (x, leti) => fokus(x, { leti, skok: true }), filtriraj, stazeSpremne, TIPOVI_STAZA };
  }

  /** Legenda „Stanje brojača“ sa info-oblačićima + staze. */
  function legenda(el, s, saStazama = true) {
    const brojevi = {};
    for (const r of s.serije) brojevi[r.stanje] = (brojevi[r.stanje] || 0) + 1;
    const opis = s.stanja_opis || {};
    el.className = "legenda-pinova";
    el.innerHTML = `<span class="eyebrow">Stanje brojača</span>` + REDOSLED.map((k) =>
      `<span><img src="${NS.pin(k)}" alt="" class="${k === "neispravan" ? "svetli" : ""}">${s.stanja[k]} <b class="mono">${brojevi[k] || 0}</b>${info(opis[k] || "")}</span>`).join("") +
      `<span><img src="${NS.pin("izabrana")}" alt="">izabrana${info("stanica u fokusu: pređi mišem preko pina ili klikni na njega (ili u spisku)")}</span>` +
      (saStazama ? `<span class="eyebrow" style="margin-left:6px">Staze</span><span><i class="linija" style="--b:var(--staza)"></i>staza</span><span><i class="linija" style="--b:var(--traka)"></i>traka</span>
        <span><i class="linija" style="--b:var(--zajednicka)"></i>zajednička</span>` : "") +
      `<span class="sitno" style="margin-left:auto">${info("Desni klik (ili Ctrl) + prevlačenje okreće i naginje mapu; na telefonu dva prsta. Dugme 3D gore desno daje pogled iz ugla sa zgradama, kompas vraća pogled odozgo.")} rotacija i nagib</span>`;
  }

  /** Krofna: koliko brojača je u kom stanju (boje kao pinovi), animira se kad dođe na ekran. */
  function stanjeGrafik(el, s, naKlik) {
    const brojevi = {};
    for (const r of s.serije) brojevi[r.stanje] = (brojevi[r.stanje] || 0) + 1;
    const g = NS.grafik(el, (b) => {
      const boje = Object.fromEntries(REDOSLED.map((k) => [k, css(`--pin-${k}`)]));
      const usko = el.clientWidth < 420;
      return {
        animationType: "expansion", animationDuration: 2600, animationEasing: "cubicInOut",
        textStyle: { fontFamily: "Inter, system-ui, sans-serif" },
        tooltip: { trigger: "item", backgroundColor: b.povrsina, borderColor: b.osa, textStyle: { color: b.ink },
          formatter: (q) => `<b>${q.name}</b><br>${q.value} brojača (${NS.dec(q.percent)} %)<br><span style="color:${b["ink-2"]}">${(s.stanja_opis || {})[q.data.k] || ""}</span>` },
        legend: usko ? { bottom: 0, left: "center", icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 10, textStyle: { color: b["ink-2"], fontSize: 11.5 },
          formatter: (ime) => { const k = REDOSLED.find((x) => s.stanja[x] === ime); return `${ime} ${brojevi[k] || 0}`; } } : { orient: "vertical", left: "64%", top: "middle", icon: "circle", itemWidth: 10, itemHeight: 10, itemGap: 14,
          textStyle: { color: b["ink-2"], fontSize: 13 }, formatter: (ime) => { const k = REDOSLED.find((x) => s.stanja[x] === ime); return `${ime}  ${brojevi[k] || 0}`; } },
        title: { text: String(s.serije.length), subtext: "brojača", left: usko ? "49%" : "34%", top: usko ? "30%" : "40%", textAlign: "center",
          textStyle: { color: b.ink, fontSize: 28, fontWeight: 700, fontFamily: "Inter Tight, Inter, sans-serif" }, subtextStyle: { color: b["ink-3"], fontSize: 12 } },
        series: [{ type: "pie", radius: ["52%", "78%"], center: usko ? ["50%", "40%"] : ["35%", "50%"], padAngle: 2, itemStyle: { borderRadius: 6, borderColor: b.povrsina, borderWidth: 2 },
          label: { show: false }, emphasis: { scaleSize: 6, label: { show: false } },
          data: REDOSLED.filter((k) => brojevi[k]).map((k) => ({ name: s.stanja[k], value: brojevi[k], k, itemStyle: { color: boje[k] } })) }],
      };
    });
    if (naKlik) g.spreman.then(() => g.ec.on("click", (q) => naKlik(q.data.k)));
    return g;
  }

  return { napravi, legenda, stanjeGrafik, duzinaKm, TIPOVI_STAZA, REDOSLED, info };
})();
