/* Mapa brojača (MapLibre GL): mapa se pomera, rotira i naginje (desni klik / Ctrl + prevlačenje, dva prsta), dugme
   3D podiže pogled i prikazuje zgrade. Tip mape: Standardna — svetla i tamna (iste OSM pločice kao na sajtu UGZINS, tamna kroz filter boja), Satelitska (Esri) i Vektor — tri „poster“ mape koje sajt sam
   crta iz vektorskih podataka OpenStreetMap-a (docs/data/mapa/, sajt/osnova_mape.py): tamno plava, siva i bela —
   oštre na svakom zumu. Pinovi po stanju brojača (hover = kartica, klik = fokus, „odskakivanje“ iz spiska),
   a/b razmaknuti u pikselima, biciklističke staze iz OSM-a, Ctrl + točkić za zum, filtriranje pinova,
   „danas do Xh“ iz docs/data/uzivo.json. */
"use strict";

const MAPA = (() => {
  const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> saradnici';
  const TIPOVI_STAZA = { s: "izdvojena staza", t: "traka na kolovozu", z: "zajednička sa pešacima" };
  const REDOSLED = ["radi", "delimicno", "ne_radi", "neispravan"];
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  const info = (tekst) => `<span class="info" tabindex="0" role="note" aria-label="${tekst}" data-info="${tekst}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>`;

  // ---------------------------------------------------------------- podloge
  const PODLOGE = [["svetla", "Svetla"], ["tamna", "Tamna"], ["satelit", "Satelitska"], ["plava", "Tamno plava"], ["siva", "Siva"], ["bela", "Bela"]];
  // tip mape → nijanse (dvobojni krug: boja mape – boja ulica); satelitska nema nijanse
  const STANDARDNE = [["svetla", "Svetla", "#f2efe9", "#ffffff"], ["tamna", "Tamna", "#1e2026", "#5b616b"]];
  const NIJANSE = [["plava", "Tamno plavo – belo"], ["siva", "Sivo – belo"], ["bela", "Belo – crno"]];
  const tipMape = (v) => (v === "satelit" ? "satelit" : v === "svetla" || v === "tamna" ? "standardna" : "vektor");
  // nazivi ulica (vektorska i satelitska mapa): boja teksta i oreola
  const NAZIVI = { plava: ["#ffffff", "#13233b"], siva: ["#ffffff", "#2e3134"], bela: ["#1a1a1a", "#ffffff"], satelit: ["#ffffff", "rgba(0,0,0,0.85)"] };
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

  // tačke za bicikliste iz OSM-a (docs/data/mapa/parking.geojson) i njihove ikonice (crtaju se na platnu, 2×)
  const TACKE = { p: "Parking za bicikle", i: "Iznajmljivanje bicikala", s: "Servis / prodavnica bicikala", r: "Stanica za popravku bicikla" };
  const VRSTE_PARKINGA = { stands: "stalci (obrnuto U)", wall_loops: "držači za točak", rack: "rešetka", bollard: "stubići", shed: "kućica / nadstrešnica",
    building: "u zgradi", lockers: "ormarići", two_tier: "na dva nivoa", "two-tier": "na dva nivoa", wheel_loops: "držači za točak", anchors: "ankeri u tlu", ground_slots: "žlebovi u tlu", informal: "neformalno" };
  function ikonaParkinga(t) {
    const c = document.createElement("canvas"); c.width = c.height = 48;
    const g = c.getContext("2d");
    const boja = { p: "#2f7de1", i: "#16a34a", s: "#8b5a2b", r: "#d97706" }[t];
    g.fillStyle = boja; g.strokeStyle = "#fff"; g.lineWidth = 3;
    g.beginPath(); g.roundRect(3, 3, 42, 42, t === "p" || t === "i" ? 10 : 21); g.fill(); g.stroke();
    g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
    const bicikl = (x, y, r, lw) => {             // točkovi, ram, sedište, volan
      g.lineWidth = lw;
      g.beginPath(); g.arc(x - r * 1.5, y, r, 0, 2 * Math.PI); g.stroke();
      g.beginPath(); g.arc(x + r * 1.5, y, r, 0, 2 * Math.PI); g.stroke();
      g.beginPath(); g.moveTo(x - r * 1.5, y); g.lineTo(x - r * 0.4, y - r * 1.5); g.lineTo(x + r * 1.0, y - r * 1.5); g.lineTo(x + r * 1.5, y);
      g.moveTo(x - r * 1.5, y); g.lineTo(x + r * 0.05, y); g.lineTo(x + r * 1.0, y - r * 1.5); g.moveTo(x - r * 0.4, y - r * 1.5); g.lineTo(x + r * 0.05, y); g.stroke();
    };
    if (t === "p") {
      g.font = "800 22px Inter, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("P", 24, 17);
      bicikl(24, 34, 4.2, 2.4);
    } else if (t === "i") {
      bicikl(24, 28, 6, 3);
    } else {                                       // ključ
      g.lineWidth = 5; g.beginPath(); g.moveTo(16, 32); g.lineTo(30, 18); g.stroke();
      g.lineWidth = 3.2; g.beginPath(); g.arc(32, 16, 6, Math.PI * 0.9, Math.PI * 2.6); g.stroke();
      g.beginPath(); g.arc(15, 33, 3.4, 0, 2 * Math.PI); g.fill();
    }
    return c;
  }

  // „danas do Xh“ (poslednje čitanje scraper-a)
  const uzivo = NS.json("uzivo.json", "data/").catch(() => null);
  const danasIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: NS.TZ }).format(new Date());
  async function danasTekst(serija) {
    const u = await uzivo;
    if (!u || !u.serije[serija]) return "";
    const [v, h] = u.serije[serija];
    const danas = u.datum === danasIso();
    const kad = danas ? "danas" : `${NS.datum(u.datum).slice(0, -5)}.`;
    return `<div class="tt-red tt-uzivo">${danas ? LJ.uzivoZnak(true) : ""}${kad} <b>${v == null ? "—" : NS.broj(v)}</b> <small>do ${h}h</small></div>`;
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
      style: { version: 8, sources: {}, glyphs: `${location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "")}assets/glifovi/{fontstack}/{range}.pbf`,
        layers: [{ id: "pozadina", type: "background", paint: { "background-color": css("--bg-muted") } }] },
      bounds: granice, fitBoundsOptions: { padding: 36 }, maxPitch: 70, dragRotate: true, touchPitch: true,
      cooperativeGestures: true, attributionControl: false,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Drži Ctrl i skroluj točkićem da uvećaš ili smanjiš mapu",
        "CooperativeGesturesHandler.MacHelpText": "Drži ⌘ i skroluj točkićem da uvećaš ili smanjiš mapu",
        "CooperativeGesturesHandler.MobileHelpText": "Pomeraj mapu sa dva prsta",
        "NavigationControl.ResetBearing": "Vrati sever gore i pogled odozgo", "NavigationControl.ZoomIn": "Uvećaj", "NavigationControl.ZoomOut": "Umanji",
        "FullscreenControl.Enter": "Mapa preko celog ekrana", "FullscreenControl.Exit": "Izađi iz prikaza preko celog ekrana",
      },
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const d3 = new Dugme3D(() => postavi3D(m.getPitch() < 15));
    m.addControl(d3, "top-right");
    // dole desno: preko celog ekrana (tada točkić zumira i bez Ctrl-a); izvori mapa su na strani O projektu
    const ceoEkran = new maplibregl.FullscreenControl({ container: el });
    m.addControl(ceoEkran, "bottom-right");
    ceoEkran.on("fullscreenstart", () => { m.cooperativeGestures.disable(); el.classList.add("ceo-ekran"); setTimeout(() => m.resize(), 60); });
    ceoEkran.on("fullscreenend", () => { m.cooperativeGestures.enable(); el.classList.remove("ceo-ekran"); setTimeout(() => m.resize(), 60); });
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
    // gore levo, na samoj mapi: padajući meni „Natpisi“ (samo vektorska i satelitska; na standardnoj su natpisi deo slike)
    let naziviUkljuceni = true;
    try { naziviUkljuceni = localStorage.getItem("ns-nazivi") !== "0"; } catch (e) { /* */ }
    const naziviEl = document.createElement("div");
    naziviEl.className = "maplibregl-ctrl natpisi-ctrl skriveno";
    naziviEl.innerHTML = `<button type="button" class="natpisi-dugme" aria-expanded="false" aria-haspopup="true">Natpisi${LJ.ik("chevron")}</button>
      <div class="natpisi-panel skriveno" role="group" aria-label="Natpisi na mapi">
        <label class="red-izbora"><input type="checkbox" data-natpis="nazivi" ${naziviUkljuceni ? "checked" : ""}><span>Nazivi ulica</span></label></div>`;
    const natpisiDugme = naziviEl.querySelector(".natpisi-dugme"), natpisiPanel = naziviEl.querySelector(".natpisi-panel");
    const zatvoriNatpise = () => { natpisiPanel.classList.add("skriveno"); natpisiDugme.setAttribute("aria-expanded", "false"); };
    natpisiDugme.addEventListener("click", () => {
      const otvori = natpisiPanel.classList.contains("skriveno");
      natpisiPanel.classList.toggle("skriveno", !otvori);
      natpisiDugme.setAttribute("aria-expanded", String(otvori));
    });
    naziviEl.querySelector('[data-natpis="nazivi"]').addEventListener("change", (e) => {
      naziviUkljuceni = e.target.checked;
      try { localStorage.setItem("ns-nazivi", naziviUkljuceni ? "1" : "0"); } catch (x) { /* */ }
      spremna.then(() => postaviPodlogu(izbor));
    });
    document.addEventListener("click", (e) => { if (!naziviEl.contains(e.target)) zatvoriNatpise(); });
    m.addControl({ onAdd: () => naziviEl, onRemove() {} }, "top-left");

    // ---------------------------------------------------------------- podloga i slojevi
    let izbor = "svetla";
    const STARI_NAZIVI = { ugzins: "svetla", osm: "tamna", carto: "svetla" };   // ranije zapamćeni izbori
    try {
      const z = localStorage.getItem("ns-podloga");
      const k = STARI_NAZIVI[z] || z;
      if (PODLOGE.some(([x]) => x === k)) izbor = k;
    } catch (e) { /* */ }
    let osnovaUcitana = null, zgradeUcitane = null;
    const imaSloj = (id) => !!m.getLayer(id);
    const vidljiv = (id, da) => { if (imaSloj(id)) m.setLayoutProperty(id, "visibility", da ? "visible" : "none"); };

    function rasterSloj(id, tiles, attribution) {
      m.addSource(id, { type: "raster", tiles, tileSize: 256, maxzoom: 19, attribution });
      m.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" } });
    }
    function osnovniSlojevi() {
      // standardne OpenStreetMap pločice (isto što koristi sajt UGZINS: OpenLayers + tile.openstreetmap.org);
      // dva sloja iz istog izvora: „UGZINS“ uvek u originalnim bojama, „OpenStreetMap“ u tamnoj temi potamnjen
      rasterSloj("osm", ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], OSM);
      m.addLayer({ id: "osm-svetla", type: "raster", source: "osm", layout: { visibility: "none" } }, "osm");
      // satelitski snimci: Esri World Imagery (Maxar, Earthstar Geographics i drugi)
      rasterSloj("satelit", ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], "Esri, Maxar, Earthstar Geographics");
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
        // nazivi ulica pored linije (font Noto Sans, assets/glifovi): glavne od zuma 13, sporedne od 15
        m.addLayer({ id: "o-nazivi", type: "symbol", source: "o-putevi", filter: ["all", ["has", "n"], ["any", ["!=", ["get", "k"], "s"], [">=", ["zoom"], 15]]], minzoom: 13,
          layout: { "symbol-placement": "line", "text-field": ["get", "n"], "text-font": ["noto"], "text-max-angle": 30, "text-padding": 4,
            "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12.5, 18, 15], "symbol-spacing": 320, "text-letter-spacing": 0.02, "text-offset": [0, 0.85], visibility: "none" },
          paint: { "text-halo-width": 1.6, "text-halo-blur": 0.3 } }, imaSloj("parking") ? "parking" : undefined);   // iznad staza, ispod ikonica
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
      vidljiv("osm-svetla", izbor === "svetla");
      vidljiv("osm", izbor === "tamna");
      vidljiv("satelit", izbor === "satelit");
      const nazivi = NAZIVI[izbor];
      vidljiv("o-nazivi", !!nazivi && naziviUkljuceni);
      if (nazivi && imaSloj("o-nazivi")) { m.setPaintProperty("o-nazivi", "text-color", nazivi[0]); m.setPaintProperty("o-nazivi", "text-halo-color", nazivi[1]); }
      naziviEl.classList.toggle("skriveno", !nazivi);        // na standardnoj mapi natpisi su deo slike i ne mogu se sakriti
      if (!nazivi) zatvoriNatpise();
      // Svetla: OSM pločice u originalnim bojama, kao na sajtu UGZINS (u tamnoj temi sajta samo malo prigušeno)
      if (imaSloj("osm-svetla")) m.setPaintProperty("osm-svetla", "raster-brightness-max", tamna ? 0.88 : 1);
      if (imaSloj("osm")) {               // Tamna: iste pločice, obrnuta svetlina i ugašene boje (filter na grafičkoj kartici)
        m.setPaintProperty("osm", "raster-brightness-min", 0.92);
        m.setPaintProperty("osm", "raster-brightness-max", 0.08);
        m.setPaintProperty("osm", "raster-hue-rotate", 180);
        m.setPaintProperty("osm", "raster-saturation", -0.45);
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
      const trebaOsnova = POSTERI[v] || (v === "satelit" && naziviUkljuceni);      // satelitskoj treba samo za nazive
      if (trebaOsnova && !(await ucitajOsnovu()) && POSTERI[v]) {
        LJ.tost("Vektorska osnova mape još nije pripremljena — prikazujem svetlu mapu.", "map");
        v = "svetla";
      }
      izbor = v;
      if (POSTERI[v]) poslednjiVektor = v;
      if (tipMape(v) === "standardna") poslednjaStandardna = v;
      try {
        localStorage.setItem("ns-podloga", v);
        if (POSTERI[v]) localStorage.setItem("ns-vektor", v);
        if (tipMape(v) === "standardna") localStorage.setItem("ns-standardna", v);
      } catch (e) { /* */ }
      boje();
      crtajIzborPodloge();
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

    if (typeof PIN3D !== "undefined") PIN3D.pripremi();      // ikonica „izabrana“ = snimak 3D modela
    const spremna = new Promise((ok) => m.on("load", ok)).then(async () => {
      osnovniSlojevi();
      boje();
      if (izbor !== "svetla" && izbor !== "tamna") await postaviPodlogu(izbor);
    });
    // tip mape: Standardna (svetla / tamna) | Satelitska | Vektor (tri nijanse: boja mape – boja ulica)
    let poslednjiVektor = POSTERI[izbor] ? izbor : "plava", poslednjaStandardna = tipMape(izbor) === "standardna" ? izbor : "svetla";
    try {
      if (!POSTERI[izbor] && POSTERI[localStorage.getItem("ns-vektor")]) poslednjiVektor = localStorage.getItem("ns-vektor");
      if (tipMape(izbor) !== "standardna" && ["svetla", "tamna"].includes(localStorage.getItem("ns-standardna"))) poslednjaStandardna = localStorage.getItem("ns-standardna");
    } catch (e) { /* */ }
    function crtajIzborPodloge() {
      const el = opcije.podlogaEl;
      if (!el) return;
      const tip = tipMape(izbor);
      const krug = (k, t, a, b) => `<button type="button" class="nijansa" data-n="${k}" role="radio" aria-checked="${izbor === k}" aria-pressed="${izbor === k}"
        title="${t}" aria-label="${t}" style="--a:${a};--b:${b}"><i></i></button>`;
      el.className = "izbor-podloge";
      el.innerHTML = `<div class="segment" role="group" aria-label="Tip mape">
          <button type="button" data-v="standardna" aria-pressed="${tip === "standardna"}" title="OpenStreetMap mapa (svetla ili tamna), sa nazivima ulica">Standardna</button>
          <button type="button" data-v="satelit" aria-pressed="${tip === "satelit"}" title="Satelitski snimci">Satelitska</button>
          <button type="button" data-v="vektor" aria-pressed="${tip === "vektor"}" title="Vektorska mapa: oštra na svakom zumu, boje po izboru">Vektor</button></div>
        ${tip === "standardna" ? `<div class="nijanse" role="radiogroup" aria-label="Pozadina standardne mape">${STANDARDNE.map(([k, t, a, b]) => krug(k, t, a, b)).join("")}</div>` : ""}
        ${tip === "vektor" ? `<div class="nijanse" role="radiogroup" aria-label="Nijansa vektorske mape">${NIJANSE.map(([k, t]) => krug(k, t, POSTERI[k].pozadina, POSTERI[k].put.g)).join("")}</div>` : ""}`;
    }
    if (opcije.podlogaEl) {
      crtajIzborPodloge();
      opcije.podlogaEl.addEventListener("click", (e) => {
        const d = e.target.closest("[data-v],[data-n]");
        if (!d) return;
        const v = d.dataset.n || { standardna: poslednjaStandardna, vektor: poslednjiVektor, satelit: "satelit" }[d.dataset.v];
        spremna.then(() => postaviPodlogu(v));
      });
    }

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
    // ---------------------------------------------------------------- parking i ostale tačke za bicikliste (OSM)
    let parkingUkljucen = false, parkingUcitan = null, parkingTipovi = new Set(Object.keys(TACKE));
    try {
      parkingUkljucen = localStorage.getItem("ns-parking") === "1";
      const z = JSON.parse(localStorage.getItem("ns-parking-tipovi") || "null");
      if (Array.isArray(z)) parkingTipovi = new Set(z.filter((t) => TACKE[t]));
    } catch (e) { /* */ }
    const filterParkinga = () => ["in", ["get", "t"], ["literal", [...parkingTipovi]]];
    function ucitajParking() {
      if (parkingUcitan) return parkingUcitan;
      parkingUcitan = NS.json("mapa/parking.geojson", "data/").then((data) => {
        for (const t of Object.keys(TACKE)) if (!m.hasImage(`bp-${t}`)) m.addImage(`bp-${t}`, ikonaParkinga(t).getContext("2d").getImageData(0, 0, 48, 48), { pixelRatio: 2 });
        m.addSource("parking", { type: "geojson", data, attribution: OSM });
        m.addLayer({ id: "parking", type: "symbol", source: "parking", minzoom: 11.5, filter: filterParkinga(),
          layout: { "icon-image": ["concat", "bp-", ["get", "t"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 11.5, 0.6, 14, 0.85, 16, 1.05],
            "icon-allow-overlap": false, "icon-padding": 1, "symbol-sort-key": ["match", ["get", "t"], "i", 0, "p", 1, 2] } });
        const kartica = new maplibregl.Popup({ closeButton: true, maxWidth: "260px", offset: 14, className: "kartica-parking" });
        m.on("click", "parking", (e) => {
          const f = e.features[0], o = f.properties;
          const red = (t) => `<div class="tt-red">${t}</div>`;
          kartica.setLngLat(f.geometry.coordinates).setHTML(`<b>${TACKE[o.t]}</b>${o.ime ? `<br>${o.ime}` : ""}` +
            (o.kap ? red(`mesta za bicikle: <b>${o.kap}</b>`) : "") + (o.vrsta ? red(`vrsta: ${VRSTE_PARKINGA[o.vrsta] || o.vrsta}`) : "") +
            (o.pok ? red("natkriveno") : "") + (o.op ? red(`<span class="sitno">${o.op}</span>`) : "")).addTo(m);
        });
        m.on("mouseenter", "parking", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "parking", () => { m.getCanvas().style.cursor = ""; });
        return data.features.length;
      }).catch((e) => { console.warn(e); parkingUcitan = null; LJ.tost("Podaci o parkinzima još nisu pripremljeni.", "map"); return 0; });
      return parkingUcitan;
    }
    async function prikaziParking(da) {
      if (da) await ucitajParking();
      vidljiv("parking", da);
    }
    const NAPOMENA_PARKING = "Ovo nisu svi parkinzi, servisi i stanice u gradu, već samo oni koji su javno upisani na internetu.";
    function crtajTipoveParkinga() {
      const lista = opcije.stazeEl && opcije.stazeEl.querySelector(".tipovi-parkinga");
      if (!lista) return;
      lista.innerHTML = `<p class="sitno">${NAPOMENA_PARKING}</p>` + Object.entries(TACKE).map(([t, ime]) =>
        `<label class="red-izbora"><input type="checkbox" data-t="${t}" ${parkingTipovi.has(t) ? "checked" : ""}><img src="${ikonaParkinga(t).toDataURL()}" alt="">
          <span>${ime}</span></label>`).join("") +
        `<div class="tipovi-dno"><button type="button" class="dugme malo" data-svi="1">Sve</button><button type="button" class="dugme malo" data-svi="0">Ništa</button></div>`;
    }
    function postaviTipove(skup) {
      parkingTipovi = skup;
      try { localStorage.setItem("ns-parking-tipovi", JSON.stringify([...skup])); } catch (e) { /* */ }
      if (imaSloj("parking")) m.setFilter("parking", filterParkinga());
      crtajTipoveParkinga();
      // ikonice na čipu: u boji su vrste koje se prikazuju (kad je sloj uključen), ostale su blede
      if (opcije.stazeEl) for (const img of opcije.stazeEl.querySelectorAll(".cip-parking img[data-t]")) img.classList.toggle("ukljuceno", parkingTipovi.has(img.dataset.t));
    }
    spremna.then(() => { if (parkingUkljucen) prikaziParking(true); });

    if (opcije.stazeEl) {
      opcije.stazeEl.innerHTML = `<label class="cip cip-stikla" style="--boja:var(--staza)"><input type="checkbox" ${stazeUkljucene ? "checked" : ""}>
        <span class="kvacica" aria-hidden="true"></span>Biciklističke staze</label>`;
      // za bicikliste (parking, NS bike, servisi, stanice za popravku): štikla uključuje sloj, strelica otvara izbor vrsta (sve štiklirano dok se ne promeni)
      const opisParkinga = "Za bicikliste: " + Object.values(TACKE).join(", ").toLowerCase();
      opcije.stazeEl.insertAdjacentHTML("beforeend", `<div class="parking-grupa">
          <label class="cip cip-stikla cip-parking" style="--boja:#2f7de1" title="${opisParkinga}"><input type="checkbox" aria-label="${opisParkinga}" ${parkingUkljucen ? "checked" : ""}>
            <span class="kvacica" aria-hidden="true"></span><span class="ikonice-parkinga">${Object.keys(TACKE).map((t) =>
              `<img src="${ikonaParkinga(t).toDataURL()}" alt="" data-t="${t}">`).join("")}</span></label>
          <button type="button" class="cip cip-strelica" aria-expanded="false" aria-label="Izaberi šta se prikazuje" title="Izaberi šta se prikazuje">${LJ.ik("chevron")}</button>
          <div class="panel tipovi-parkinga skriveno" role="group" aria-label="Šta se prikazuje"></div></div>`);
      const grupa = opcije.stazeEl.querySelector(".parking-grupa");
      const panel = grupa.querySelector(".tipovi-parkinga"), strelica = grupa.querySelector(".cip-strelica");
      crtajTipoveParkinga();
      postaviTipove(parkingTipovi);
      grupa.querySelector(".cip-parking input").addEventListener("change", (e) => {
        parkingUkljucen = e.target.checked;
        try { localStorage.setItem("ns-parking", parkingUkljucen ? "1" : "0"); } catch (x) { /* */ }
        spremna.then(() => prikaziParking(parkingUkljucen));
      });
      strelica.addEventListener("click", (e) => {
        e.stopPropagation();
        const otvori = panel.classList.contains("skriveno");
        panel.classList.toggle("skriveno", !otvori);
        strelica.setAttribute("aria-expanded", String(otvori));
        if (otvori && !parkingUkljucen) { grupa.querySelector(".cip-parking input").click(); }
      });
      panel.addEventListener("click", (e) => {
        e.stopPropagation();
        const svi = e.target.closest("[data-svi]");
        if (svi) postaviTipove(new Set(svi.dataset.svi === "1" ? Object.keys(TACKE) : []));
      });
      panel.addEventListener("change", (e) => {
        const t = e.target.dataset.t;
        if (!t) return;
        const novo = new Set(parkingTipovi);
        if (e.target.checked) novo.add(t); else novo.delete(t);
        postaviTipove(novo);
      });
      document.addEventListener("click", (e) => { if (!grupa.contains(e.target)) { panel.classList.add("skriveno"); strelica.setAttribute("aria-expanded", "false"); } });
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
    // kartica običnog pina odmah iznad njega; kod izabranog (uvećan 1,4×, odskače ~30 px) dovoljno visoko da se skok vidi
    const POMAK = { top: [0, 4], "top-left": [6, 0], "top-right": [-6, 0], bottom: [0, -38], "bottom-left": [10, -32], "bottom-right": [-10, -32], left: [18, -17], right: [-18, -17] };
    const POMAK_IZABRAN = { top: [0, 6], "top-left": [8, 2], "top-right": [-8, 2], bottom: [0, -88], "bottom-left": [14, -80], "bottom-right": [-14, -80], left: [28, -30], right: [-28, -30] };
    const kartica = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "300px", focusAfterOpen: false, offset: POMAK });
    kartica.on("close", () => { prikazana = null; if (!menjam && izabrana) odznaci(); });

    function html(serija, stanje, brojTekst) {
      const sv = stanje === "nije_postavljen" || stanje === "neispravan" ? " svetli-obod" : "";
      return `<div class="pin${sv}${brojTekst == null ? " bez-broja" : ""}${serija === izabrana ? " izabran" : ""}">
        <div class="telo"><img class="n" src="${NS.pin(stanje)}" alt=""><img class="h" src="${NS.pin("izabrana")}" alt=""></div>
        <span class="pin-broj">${brojTekst ?? ""}</span><span class="senka"></span></div>`;
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
      kartica.setOffset(serija === izabrana ? POMAK_IZABRAN : POMAK);
      kartica.options.anchor = serija === izabrana ? "bottom" : undefined;      // izabrani: kartica uvek iznad pina
      kartica.setLngLat(pinovi[serija].getLngLat())
        .setHTML(`${t}<div class="tt-red"><a href="stanica.html?id=${encodeURIComponent(serija)}">Otvori stanicu →</a></div>`);
      LJ.osveziUzivo();
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
      if (serija === izabrana && typeof PIN3D !== "undefined" && PIN3D.aktivan()) PIN3D.prikaci(p.getElement().querySelector(".telo"));
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
    /** Izabrani pin je odmah 3D model; okretanje kreće posle skoka (ili odmah ako skoka nema). */
    let tajmer3d = null;
    function pokreni3D(serija) {
      clearTimeout(tajmer3d);
      if (typeof PIN3D === "undefined" || !naMapi[serija]) return;
      PIN3D.pokreni(pinovi[serija].getElement().querySelector(".telo"));
    }
    function rotiraj3D(posle) {
      clearTimeout(tajmer3d);
      if (typeof PIN3D !== "undefined") tajmer3d = setTimeout(() => PIN3D.rotiraj(), posle);
    }
    function zaustavi3D() { clearTimeout(tajmer3d); if (typeof PIN3D !== "undefined") PIN3D.zaustavi(); }
    function odznaci() {
      zaustavi3D();
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
            ${info("prosečan broj biciklista dnevno — samo kompletni dani, 1. 9. 2025. – 31. 8. 2026. (poslednjih 12 meseci istorije)")}</div>` : ""}${danas}
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
      if (pret !== serija) zaustavi3D();
      izabrana = serija;
      if (pret && pret !== serija) osveziPin(pret);
      if (!serija) return;
      osveziPin(serija);
      if (pret !== serija || typeof PIN3D === "undefined" || !PIN3D.aktivan()) pokreni3D(serija);
      if (!skok) rotiraj3D(0);
      const posle = () => {
        otvoriKarticu(serija);
        if (skok) { skoci(serija); rotiraj3D(1200); }      // 3D model odskoči, pa se okreće
      };
      // pin malo ispod sredine mape, da kartica uvek stane iznad njega
      if (leti) { m.flyTo({ center: pinovi[serija].getLngLat(), zoom: Math.max(m.getZoom(), 15), duration: 700, offset: [0, Math.round(el.clientHeight * 0.24)] }); m.once("moveend", posle); } else posle();
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
