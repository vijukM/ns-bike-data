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
  // natpisi na vektorskoj i satelitskoj mapi: delovi grada, parkovi i trgovi, važna mesta (docs/data/mapa/delovi, mesta)
  const NATPISI = [["nazivi", "Nazivi ulica"], ["delovi", "Delovi grada"], ["mesta", "Parkovi i trgovi"], ["vazna", "Važna mesta"]];
  // boje gradskih delova (dovoljno različite i na tamnoj, svetloj i satelitskoj podlozi)
  // poređane po nijansi (u krug): susedni delovi ne dobijaju istu ni susednu (sličnu) boju
  const PALETA_DELOVA = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6", "#8b5cf6", "#ec4899"];
  const VAZNA = { f: "Fakultet / visoka škola", b: "Bolnica", k: "Pozorište / muzej", z: "Železnička / autobuska stanica", c: "Tržni centar", s: "Stadion" };
  function ikonaMesta(t) {
    const c = document.createElement("canvas"); c.width = c.height = 40;
    const g = c.getContext("2d");
    g.fillStyle = { f: "#7c3aed", b: "#dc2626", k: "#db2777", z: "#0f766e", c: "#ea580c", s: "#16a34a" }[t];
    g.strokeStyle = "#fff"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(20, 20, 17, 0, 2 * Math.PI); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineJoin = "round"; g.lineCap = "round";
    if (t === "b") { g.fillRect(17, 10, 6, 20); g.fillRect(10, 17, 20, 6); }
    else if (t === "f") {                                   // kapa za diplomu
      g.beginPath(); g.moveTo(20, 11); g.lineTo(32, 17); g.lineTo(20, 23); g.lineTo(8, 17); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(13, 20); g.lineTo(13, 26); g.quadraticCurveTo(20, 30, 27, 26); g.lineTo(27, 20); g.lineTo(20, 24); g.closePath(); g.fill();
      g.lineWidth = 1.6; g.beginPath(); g.moveTo(31, 17); g.lineTo(31, 25); g.stroke();
    } else if (t === "k") {                                 // zgrada sa stubovima
      g.beginPath(); g.moveTo(9, 15); g.lineTo(20, 9); g.lineTo(31, 15); g.closePath(); g.fill();
      for (const x of [11.5, 18, 24.5]) g.fillRect(x, 17, 4, 9);
      g.fillRect(9, 27, 22, 3);
    } else if (t === "z") {                                 // vozilo spreda
      g.beginPath(); g.roundRect(12, 9, 16, 19, 4); g.fill();
      g.fillStyle = "#0f766e"; g.fillRect(14.5, 12, 11, 7); g.beginPath(); g.arc(16, 23.5, 1.6, 0, 7); g.arc(24, 23.5, 1.6, 0, 7); g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(14, 28); g.lineTo(12, 32); g.moveTo(26, 28); g.lineTo(28, 32); g.stroke();
    } else if (t === "c") {                                 // kesa
      g.beginPath(); g.roundRect(11, 15, 18, 15, 2.5); g.fill();
      g.lineWidth = 2.4; g.beginPath(); g.arc(20, 15, 4.5, Math.PI, 0); g.stroke();
    } else {                                                // stadion
      g.lineWidth = 3; g.beginPath(); g.ellipse(20, 20, 11, 7, 0, 0, 2 * Math.PI); g.stroke();
      g.lineWidth = 1.6; g.beginPath(); g.moveTo(20, 13); g.lineTo(20, 27); g.stroke();
    }
    return c;
  }
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
    const natpisi = { nazivi: true, delovi: true, granice: false, okolina: false, mesta: true, vazna: true };
    try {
      if (localStorage.getItem("ns-nazivi") === "0") natpisi.nazivi = false;      // ranije zapamćeno
      Object.assign(natpisi, JSON.parse(localStorage.getItem("ns-natpisi") || "{}"));
    } catch (e) { /* */ }
    const naziviEl = document.createElement("div");
    naziviEl.className = "maplibregl-ctrl natpisi-ctrl skriveno";
    naziviEl.innerHTML = `<button type="button" class="natpisi-dugme" aria-expanded="false" aria-haspopup="true">Natpisi${LJ.ik("chevron")}</button>
      <div class="natpisi-panel skriveno" role="group" aria-label="Natpisi na mapi">
        ${NATPISI.map(([k, ime]) => `<label class="red-izbora"><input type="checkbox" data-natpis="${k}" ${natpisi[k] ? "checked" : ""}><span>${ime}</span></label>` +
          (k === "delovi" ? `<label class="red-izbora pod-izbor${natpisi.delovi ? "" : " skriveno"}" title="Granice gradskih delova, svaki deo u svojoj boji">
            <input type="checkbox" data-natpis="granice" ${natpisi.granice ? "checked" : ""}><span>Prikaži granice</span></label>
            <label class="red-izbora pod-izbor${natpisi.delovi ? "" : " skriveno"}" title="Granice okolnih naselja: Petrovaradin, Sremska Kamenica, Veternik, Futog, Kać…">
            <input type="checkbox" data-natpis="okolina" ${natpisi.okolina ? "checked" : ""}><span>Okolna naselja</span></label>` : "")).join("")}</div>`;
    const natpisiDugme = naziviEl.querySelector(".natpisi-dugme"), natpisiPanel = naziviEl.querySelector(".natpisi-panel");
    const zatvoriNatpise = () => { natpisiPanel.classList.add("skriveno"); natpisiDugme.setAttribute("aria-expanded", "false"); };
    natpisiDugme.addEventListener("click", () => {
      const otvori = natpisiPanel.classList.contains("skriveno");
      natpisiPanel.classList.toggle("skriveno", !otvori);
      natpisiDugme.setAttribute("aria-expanded", String(otvori));
    });
    natpisiPanel.addEventListener("change", (e) => {
      const k = e.target.dataset.natpis;
      if (!k) return;
      natpisi[k] = e.target.checked;
      try { localStorage.setItem("ns-natpisi", JSON.stringify(natpisi)); } catch (x) { /* */ }
      if (k === "delovi" && !natpisi.delovi) ocistiDeo();
      if (k === "delovi") for (const el of naziviEl.querySelectorAll(".pod-izbor")) el.classList.toggle("skriveno", !natpisi.delovi);   // granice samo uz delove grada
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
    const sporedneKartice = new Set();                         // kartice tačaka; zatvaraju se kad se otvori kartica brojača
    // Ctrl + točkić iznad kartice zumira mapu (kao iznad same mape), a ne celu stranicu
    el.addEventListener("wheel", (e) => {
      if (!e.ctrlKey || !e.target.closest(".maplibregl-popup")) return;
      e.preventDefault();
      const r = m.getCanvas().getBoundingClientRect(), k = r.width / m.getCanvas().offsetWidth || 1;
      const oko = m.unproject([(e.clientX - r.left) / k, (e.clientY - r.top) / k]);
      m.zoomTo(m.getZoom() - Math.max(-1, Math.min(1, e.deltaY / 100)) * 0.5, { around: oko, duration: 120 });
    }, { passive: false });
    // delovi grada (klik na natpis: fokus i obris granice), parkovi i trgovi, važna mesta — samo vektorska i satelitska mapa
    let natpisiUcitani = null, izabraniDeo = null;
    function ucitajNatpise() {
      if (natpisiUcitani) return natpisiUcitani;
      const pre = () => (imaSloj("parking") ? "parking" : undefined);           // iznad ulica i staza, ispod ikonica za bicikliste
      const deo = NS.json("mapa/delovi.geojson", "data/").then((data) => {
        m.addSource("o-delovi", { type: "geojson", data, attribution: OSM });
        const nijedan = ["==", ["get", "n"], "\u0000"];
        // „Prikaži granice“: gradski delovi (četvrti), svaki u svojoj boji; „Okolna naselja“: Petrovaradin, Kamenica, Veternik, Futog…
        // (mesne zajednice se ne crtaju jer se preklapaju sa četvrtima)
        const sGranicom = data.features.filter((f) => f.geometry.type === "Point" && f.properties.b);
        const prstenovi = {};                                                       // naziv → spoljni prstenovi granice
        for (const f of data.features) {
          if (f.geometry.type === "Polygon") prstenovi[f.properties.n] = [f.geometry.coordinates[0]];
          else if (f.geometry.type === "MultiPolygon") prstenovi[f.properties.n] = f.geometry.coordinates.map((p) => p[0]);
        }
        const unutra = ([x, y], prsten) => {
          let u = false;
          for (let i = 1; i < prsten.length; i++) {
            const [x1, y1] = prsten[i - 1], [x2, y2] = prsten[i];
            if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) u = !u;
          }
          return u;
        };
        const cetvrti = sGranicom.filter((f) => f.properties.v === "quarter" || f.properties.n === "Liman");
        // manja naselja sa granicom koja nisu deo neke četvrti (Satelit, Jugovićevo, Kamenjar) su takođe gradski delovi
        const gradski = cetvrti.concat(sGranicom.filter((f) => f.properties.v === "neighbourhood" &&
          !cetvrti.some((c) => (prstenovi[c.properties.n] || []).some((p) => unutra(f.geometry.coordinates, p)))));
        const okolna = sGranicom.filter((f) => ["town", "village"].includes(f.properties.v) || (f.properties.v === "suburb" && f.properties.n !== "Liman"));
        const pre2 = () => (imaSloj("o-put-o") ? "o-put-o" : pre());              // boje ispod ulica, da ulice ostanu čitljive
        const obojeni = (lista) => {
          // „Liman“ obuhvata Liman 1–4: boje dobijaju samo delovi bez pod-delova; susedi (preklopljeni okviri) dobijaju različite boje
          const imena = lista.map((f) => f.properties.n);
          const listovi = lista.filter((f) => !imena.some((x) => x.startsWith(f.properties.n + " ")));
          // susedi = granice se dodiruju (tačke granica, progušćene na ~25 m, bliže od ~35 m)
          const KX = 111320 * Math.cos(45.25 * Math.PI / 180), KY = 110574, CELIJA = 35;
          const resetka = new Map();
          for (const f of listovi) {
            const n = f.properties.n;
            for (const p of prstenovi[n] || []) {
              for (let i = 1; i < p.length; i++) {
                const ax = p[i - 1][0] * KX, ay = p[i - 1][1] * KY, bx = p[i][0] * KX, by = p[i][1] * KY;
                const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 25));
                for (let j = 0; j < k; j++) {
                  const x = ax + (bx - ax) * j / k, y = ay + (by - ay) * j / k, kljuc = `${Math.floor(x / CELIJA)},${Math.floor(y / CELIJA)}`;
                  if (!resetka.has(kljuc)) resetka.set(kljuc, new Set());
                  resetka.get(kljuc).add(n);
                }
              }
            }
          }
          const susedi = Object.fromEntries(listovi.map((f) => [f.properties.n, new Set()]));
          for (const [kljuc, imena] of resetka) {
            const [cx, cy] = kljuc.split(",").map(Number);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
              for (const b of resetka.get(`${cx + dx},${cy + dy}`) || []) for (const a of imena) if (a !== b) { susedi[a].add(b); susedi[b].add(a); }
            }
          }
          const N = PALETA_DELOVA.length, boja = {};
          const razlika = (a, b) => Math.min(Math.abs(a - b), N - Math.abs(a - b));
          for (const f of [...listovi].sort((a, b) => susedi[b.properties.n].size - susedi[a.properties.n].size)) {
            const n = f.properties.n;
            const koriscenje = PALETA_DELOVA.map((_, i) => Object.values(boja).filter((x) => x === i).length);
            const cena = (i) => [...susedi[n]].reduce((z, s) => z + (boja[s] === undefined ? 0 : razlika(i, boja[s]) === 0 ? 100 : razlika(i, boja[s]) === 1 ? 10 : 0), 0) + koriscenje[i] * 0.5;
            boja[n] = PALETA_DELOVA.map((_, i) => i).sort((x, y) => cena(x) - cena(y))[0];
          }
          const izraz = ["match", ["get", "n"]];
          for (const [n, i] of Object.entries(boja)) izraz.push(n, PALETA_DELOVA[i]);
          izraz.push("rgba(0,0,0,0)");
          return { imena: Object.keys(boja), izraz };
        };
        for (const [kraj, lista] of [["grad", gradski], ["ok", okolna]]) {
          const o = obojeni(lista), sve = lista.map((f) => f.properties.n);
          m.addLayer({ id: `o-boje-${kraj}`, type: "fill", source: "o-delovi", layout: { visibility: "none" },
            filter: ["all", ["!=", ["geometry-type"], "Point"], ["in", ["get", "n"], ["literal", o.imena]]],
            paint: { "fill-color": o.izraz, "fill-opacity": 0.24 } }, pre2());
          const filterGranica = ["all", ["!=", ["geometry-type"], "Point"], ["in", ["get", "n"], ["literal", sve]]];
          m.addLayer({ id: `o-granice-${kraj}-senka`, type: "line", source: "o-delovi", filter: filterGranica, layout: { "line-join": "round", visibility: "none" },
            paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 6.5], "line-opacity": 0.5, "line-blur": 0.5 } }, pre());
          m.addLayer({ id: `o-granice-${kraj}`, type: "line", source: "o-delovi", filter: filterGranica, layout: { "line-join": "round", visibility: "none" },
            paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 16, 3], "line-dasharray": [4, 1.5], "line-opacity": 0.9 } }, pre());
        }
        m.addLayer({ id: "o-deo-povrs", type: "fill", source: "o-delovi", filter: ["all", ["!=", ["geometry-type"], "Point"], nijedan],
          paint: { "fill-opacity": 0.12 } }, pre());
        m.addLayer({ id: "o-deo-obod-senka", type: "line", source: "o-delovi", filter: ["all", ["!=", ["geometry-type"], "Point"], nijedan],
          layout: { "line-join": "round" }, paint: { "line-width": 6, "line-opacity": 0.55, "line-blur": 1 } }, pre());
        m.addLayer({ id: "o-deo-obod", type: "line", source: "o-delovi", filter: ["all", ["!=", ["geometry-type"], "Point"], nijedan],
          layout: { "line-join": "round" }, paint: { "line-width": 2.6 } }, pre());
        const v = ["get", "v"];
        m.addLayer({ id: "o-delovi", type: "symbol", source: "o-delovi", minzoom: 10, maxzoom: 17,
          filter: ["all", ["==", ["geometry-type"], "Point"], ["any", ["in", v, ["literal", ["town", "village"]]],
            ["all", ["in", v, ["literal", ["suburb", "quarter"]]], [">=", ["zoom"], 11.5]], [">=", ["zoom"], 13.5]]],   // mesne zajednice i manji delovi tek bliže
          layout: { "text-field": ["get", "n"], "text-font": ["noto"], "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 7,
            "text-size": ["match", v, ["town", "village"], 13, ["suburb", "quarter"], 12, 10.5], "text-padding": 6,
            "symbol-sort-key": ["match", v, ["town", "village"], 0, ["suburb", "quarter"], 1, 2], visibility: "none" },
          paint: { "text-halo-width": 1.8, "text-opacity": 0.9 } }, pre());
        m.on("click", "o-delovi", (e) => { e.preventDefault(); izaberiDeo(e.features[0]); });
        m.on("mouseenter", "o-delovi", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "o-delovi", () => { m.getCanvas().style.cursor = ""; });
      });
      const mesto = NS.json("mapa/mesta.geojson", "data/").then((data) => {
        m.addSource("o-mesta", { type: "geojson", data, attribution: OSM });
        for (const t of Object.keys(VAZNA)) if (!m.hasImage(`vm-${t}`)) m.addImage(`vm-${t}`, ikonaMesta(t).getContext("2d").getImageData(0, 0, 40, 40), { pixelRatio: 2 });
        m.addLayer({ id: "o-mesta", type: "symbol", source: "o-mesta", minzoom: 13.5, filter: ["in", ["get", "t"], ["literal", ["park", "trg"]]],
          layout: { "text-field": ["get", "n"], "text-font": ["noto"], "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10.5, 17, 13], "text-max-width": 8,
            "text-padding": 4, visibility: "none" }, paint: { "text-halo-width": 1.6 } }, pre());
        m.addLayer({ id: "o-vazna", type: "symbol", source: "o-mesta", minzoom: 13, filter: ["in", ["get", "t"], ["literal", Object.keys(VAZNA)]],
          layout: { "icon-image": ["concat", "vm-", ["get", "t"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.75, 16, 1],
            "text-field": ["step", ["zoom"], "", 14.5, ["get", "n"]], "text-font": ["noto"], "text-size": 10.5, "text-max-width": 8,
            "text-anchor": "top", "text-offset": [0, 1.05], "text-optional": true, "icon-padding": 2, visibility: "none" },
          paint: { "text-halo-width": 1.5 } }, pre());
        const kartica = new maplibregl.Popup({ closeButton: true, maxWidth: "260px", offset: 12, className: "kartica-parking" });
        sporedneKartice.add(kartica);
        m.on("click", "o-vazna", (e) => {
          const f = e.features[0];
          setTimeout(() => kartica.setLngLat(f.geometry.coordinates).setHTML(`<b>${f.properties.n}</b><div class="tt-red sitno">${VAZNA[f.properties.t]}</div>`).addTo(m), 0);
        });
        m.on("mouseenter", "o-vazna", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "o-vazna", () => { m.getCanvas().style.cursor = ""; });
      });
      natpisiUcitani = Promise.allSettled([deo, mesto]).then((r) => {
        // bez podataka (još nisu pripremljeni) stavka se ne nudi u meniju
        r.forEach((x, i) => {
          if (x.status !== "rejected") return;
          console.warn(x.reason);
          for (const k of i ? ["mesta", "vazna"] : ["delovi", "granice", "okolina"]) naziviEl.querySelector(`[data-natpis="${k}"]`).closest("label").classList.add("skriveno");
        });
        return true;
      });
      return natpisiUcitani;
    }
    const filterDela = (n) => ["all", ["!=", ["geometry-type"], "Point"], ["==", ["get", "n"], n]];
    function izaberiDeo(f) {
      const o = f.properties;
      if (izabraniDeo === o.n) { ocistiDeo(); return; }
      izabraniDeo = o.n;
      for (const id of ["o-deo-povrs", "o-deo-obod-senka", "o-deo-obod"]) m.setFilter(id, filterDela(o.n));
      const b = typeof o.b === "string" ? JSON.parse(o.b) : o.b;               // MapLibre nizove u svojstvima vraća kao tekst
      if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 15.5, duration: 1100 });
      else m.flyTo({ center: f.geometry.coordinates, zoom: Math.max(m.getZoom(), 14.5), duration: 1100 });
    }
    function ocistiDeo() {
      izabraniDeo = null;
      for (const id of ["o-deo-povrs", "o-deo-obod-senka", "o-deo-obod"]) if (imaSloj(id)) m.setFilter(id, filterDela("\u0000"));
    }
    m.on("click", (e) => {                                                      // klik van natpisa dela grada skida izbor
      if (izabraniDeo && !e.defaultPrevented && imaSloj("o-delovi") && !m.queryRenderedFeatures(e.point, { layers: ["o-delovi"] }).length) ocistiDeo();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && izabraniDeo) ocistiDeo(); });

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
      vidljiv("o-nazivi", !!nazivi && natpisi.nazivi);
      vidljiv("o-delovi", !!nazivi && natpisi.delovi);
      vidljiv("o-mesta", !!nazivi && natpisi.mesta);
      vidljiv("o-vazna", !!nazivi && natpisi.vazna);
      for (const id of ["o-deo-povrs", "o-deo-obod-senka", "o-deo-obod"]) vidljiv(id, !!nazivi && natpisi.delovi);
      for (const [kraj, ukljuceno] of [["grad", natpisi.granice], ["ok", natpisi.okolina]]) {
        for (const id of [`o-boje-${kraj}`, `o-granice-${kraj}`, `o-granice-${kraj}-senka`]) vidljiv(id, !!nazivi && natpisi.delovi && ukljuceno);
      }
      if (!nazivi && izabraniDeo) ocistiDeo();
      if (nazivi) {
        for (const id of ["o-nazivi", "o-delovi", "o-mesta", "o-vazna"]) {
          if (!imaSloj(id)) continue;
          m.setPaintProperty(id, "text-color", nazivi[0]);
          m.setPaintProperty(id, "text-halo-color", nazivi[1]);
        }
        const svetla = izbor === "bela";
        if (imaSloj("o-mesta")) m.setPaintProperty("o-mesta", "text-color", ["match", ["get", "t"], "park", svetla ? "#2e7d32" : "#a7e3b0", nazivi[0]]);
        if (imaSloj("o-deo-obod")) {
          const akcenat = svetla ? "#1d4ed8" : "#fbbf24";
          m.setPaintProperty("o-deo-obod", "line-color", akcenat);
          m.setPaintProperty("o-deo-povrs", "fill-color", akcenat);
          m.setPaintProperty("o-deo-obod-senka", "line-color", nazivi[1]);
          for (const kraj of ["grad", "ok"]) {
            m.setPaintProperty(`o-granice-${kraj}`, "line-color", nazivi[0]);
            m.setPaintProperty(`o-granice-${kraj}-senka`, "line-color", nazivi[1]);
            m.setPaintProperty(`o-boje-${kraj}`, "fill-opacity", izbor === "satelit" ? 0.36 : svetla ? 0.32 : 0.34);
          }
        }
      }
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
      const trebaOsnova = POSTERI[v] || (v === "satelit" && natpisi.nazivi);       // satelitskoj osnova treba samo za nazive ulica
      if (NAZIVI[v]) await ucitajNatpise();
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

    // ---------------------------------------------------------------- staze (tri vrste iz OSM-a; sloj se vidi kad je uključena bar jedna)
    const VRSTE_STAZA = ["s", "t", "z"];
    let stazeTipovi = new Set(VRSTE_STAZA);
    try {
      if (localStorage.getItem("ns-staze") === "0") stazeTipovi = new Set();
      const z = JSON.parse(localStorage.getItem("ns-staze-tipovi") || "null");
      if (Array.isArray(z) && localStorage.getItem("ns-staze") !== "0") stazeTipovi = new Set(z.filter((t) => VRSTE_STAZA.includes(t)));
    } catch (e) { /* */ }
    const filteriStaza = () => {
      const u = ["in", ["get", "t"], ["literal", [...stazeTipovi]]];
      return { "staze-obod": u, staze: ["all", ["!=", ["get", "t"], "z"], u], "staze-z": ["all", ["==", ["get", "t"], "z"], u] };
    };
    function primeniStaze() {
      const f = filteriStaza();
      for (const id of ["staze-obod", "staze", "staze-z"]) {
        if (!imaSloj(id)) continue;
        m.setFilter(id, f[id]);
        vidljiv(id, stazeTipovi.size > 0);
      }
    }
    const stazeSpremne = NS.json("staze.geojson", "data/").then(async (g) => {
      await spremna;
      m.getSource("staze").setData(g);
      primeniStaze();
      const km = { s: 0, t: 0, z: 0 };
      for (const f of g.features) km[f.properties.t] += duzinaKm(f.geometry.coordinates);
      return km;
    }).catch(() => null);
    // ---------------------------------------------------------------- parking i ostale tačke za bicikliste (OSM)
    // sloj se vidi kad je uključena bar jedna vrsta (parking, NS bike, servis, stanica za popravku)
    const SVE_VRSTE = Object.keys(TACKE);
    let parkingUcitan = null, parkingTipovi = new Set();
    try {
      if (localStorage.getItem("ns-parking") === "1") {
        const z = JSON.parse(localStorage.getItem("ns-parking-tipovi") || "null");
        parkingTipovi = new Set(Array.isArray(z) ? z.filter((t) => TACKE[t]) : SVE_VRSTE);
      }
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
        sporedneKartice.add(kartica);
        // kartica se puni posle podrazumevanog zatvaranja na klik (closeOnClick), inače bi klik na drugu tačku samo zatvorio staru
        m.on("click", "parking", (e) => { const f = e.features[0]; setTimeout(() => otvoriKarticuTacke(f), 0); });
        function otvoriKarticuTacke(f) {
          const o = f.properties;
          const red = (t) => `<div class="tt-red">${t}</div>`;
          if (o.nsb) {                     // zvanična NS bike stanica: naziv, opis, slika (Google My Maps, učitava se tek sada) i stanje uživo
            let slike = [];
            try { slike = typeof o.slike === "string" ? JSON.parse(o.slike) : o.slike || []; } catch (x) { /* */ }
            kartica.setLngLat(f.geometry.coordinates).setHTML(`<b>${o.ime}</b><div class="tt-red sitno">NS bike · stanica za iznajmljivanje</div>` +
              red(o.adr) + (slike.length ? `<button type="button" class="nsb-slika-omot" title="${slike.length > 1 ? "Sledeća slika" : o.ime}">
                <img class="nsb-slika" src="${slike[0]}" alt="Stanica ${o.ime}" onerror="this.parentNode.remove()">
                ${slike.length > 1 ? `<span class="nsb-slika-broj">1/${slike.length}</span>` : ""}</button>` : "") +
              `<div class="tt-red nsb-uzivo" data-sif="${o.sif}"><span class="sitno">učitavam stanje uživo…</span></div>`).addTo(m);
            const omot = kartica.getElement() && kartica.getElement().querySelector(".nsb-slika-omot");
            if (omot && slike.length > 1) {
              let i = 0;
              omot.addEventListener("click", () => {
                i = (i + 1) % slike.length;
                omot.querySelector("img").src = slike[i];
                omot.querySelector(".nsb-slika-broj").textContent = `${i + 1}/${slike.length}`;
              });
            }
            stanjeNSBike().then((sve) => {
              const el = kartica.getElement() && kartica.getElement().querySelector(`.nsb-uzivo[data-sif="${o.sif}"]`);
              if (!el) return;
              const st = sve && sve.find((x) => x.biciklana === o.sif);
              if (!st) { el.innerHTML = `<span class="sitno">Stanje uživo trenutno nije dostupno.</span>`; return; }
              const vreme = String(st.vreme || "").slice(11, 16);
              el.innerHTML = `<div class="nsb-brojevi"><span><b>${st.zauzeto}</b> ${st.zauzeto === 1 ? "bicikl" : st.zauzeto % 10 >= 2 && st.zauzeto % 10 <= 4 && (st.zauzeto % 100 < 12 || st.zauzeto % 100 > 14) ? "bicikla" : "bicikala"}</span>
                <span><b>${st.slobodno}</b> slobodnih mesta</span></div>
                <div class="nsb-meta">${LJ.uzivoZnak().replace("uzivo-znak", "uzivo-znak sveze")}<span class="sitno">${vreme ? `stanje u ${vreme}` : ""}</span></div>`;
            });
            return;
          }
          kartica.setLngLat(f.geometry.coordinates).setHTML(`<b>${TACKE[o.t]}${o.sif ? ` ${o.sif}` : ""}</b>${o.ime ? `<br>${o.ime}` : ""}` +
            (o.adr ? red(o.adr) : "") + (o.pribl ? red(`<span class="sitno">približan položaj</span>`) : "") +
            (o.kap ? red(`mesta za bicikle: <b>${o.kap}</b>`) : "") + (o.vrsta ? red(`vrsta: ${VRSTE_PARKINGA[o.vrsta] || o.vrsta}`) : "") +
            (o.pok ? red("natkriveno") : "") + (o.op ? red(`<span class="sitno">${o.op}</span>`) : "")).addTo(m);
        }
        m.on("mouseenter", "parking", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "parking", () => { m.getCanvas().style.cursor = ""; });
        return data.features.length;
      }).catch((e) => { console.warn(e); parkingUcitan = null; LJ.tost("Podaci o parkinzima još nisu pripremljeni.", "map"); return 0; });
      return parkingUcitan;
    }
    // stanje NS bike stanica uživo (isti javni izvor koji koristi ns-bike.web.app): preuzima se čim se uključe NS bike stanice
    // (da kartica ne čeka) i osvežava na minut dok su uključene i stranica je vidljiva
    let nsbStanje = null, nsbVreme = 0, nsbTajmer = null, nsbOsvezeno = null;
    // red „Iznajmljivanje bicikala“ u panelu: oznaka UŽIVO i vreme poslednjeg uspešnog osvežavanja
    const nsbOsvezenoTekst = () => (nsbOsvezeno
      ? `osveženo u ${nsbOsvezeno.toLocaleTimeString("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" })}`
      : "osvežava se na minut");
    function osveziNSBikeRed() {
      const el = opcije.stazeEl && opcije.stazeEl.querySelector(".grupa-tacaka .nsb-osvezeno");
      if (el) el.textContent = nsbOsvezenoTekst();
    }
    function stanjeNSBike() {
      if (nsbStanje && Date.now() - nsbVreme < 60000) return nsbStanje;
      nsbVreme = Date.now();
      nsbStanje = fetch("https://app.nsbike.rs/stanje", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((d) => { if (d) { nsbOsvezeno = new Date(); osveziNSBikeRed(); } else nsbVreme = 0; return d; });
      return nsbStanje;
    }
    function pratiNSBike(da) {
      clearInterval(nsbTajmer); nsbTajmer = null;
      if (!da) return;
      stanjeNSBike();
      nsbTajmer = setInterval(() => { if (!document.hidden) stanjeNSBike(); }, 60000);
    }
    async function prikaziParking(da) {
      if (da) await ucitajParking();
      vidljiv("parking", da);
    }
    /** zaglavlje padajućeg panela: X (zatvori) u gornjem levom uglu + naslov */
    const glavaPanela = (naslov) => `<div class="panel-glava"><button type="button" class="panel-x" data-zatvori aria-label="Zatvori" title="Zatvori">${LJ.ik("x")}</button>
      <span class="eyebrow">${naslov}</span></div>`;
    function crtajTipoveParkinga() {
      const lista = opcije.stazeEl && opcije.stazeEl.querySelector(".grupa-tacaka .tipovi-parkinga");
      if (!lista) return;
      lista.innerHTML = glavaPanela("Na mapi") + Object.entries(TACKE).map(([t, ime]) =>
        `<label class="red-izbora${t === "i" ? " red-uzivo" : ""}"><input type="checkbox" data-t="${t}" ${parkingTipovi.has(t) ? "checked" : ""}><img src="${ikonaParkinga(t).toDataURL()}" alt="">
          ${t === "i" ? `<span>${ime}<small class="nsb-osvezeno">${nsbOsvezenoTekst()}</small></span>
            <span class="uzivo-znak sveze" title="Broj slobodnih bicikala na NS bike stanicama preuzima se uživo i osvežava na minut">${LJ.ODASILJAC}<b>UŽIVO</b></span>`
          : `<span>${ime}</span>`}</label>`).join("");
    }
    function postaviTipove(skup) {
      parkingTipovi = skup;
      try {
        localStorage.setItem("ns-parking", skup.size ? "1" : "0");
        localStorage.setItem("ns-parking-tipovi", JSON.stringify([...skup]));
      } catch (e) { /* */ }
      if (imaSloj("parking")) m.setFilter("parking", filterParkinga());
      if (skup.size || imaSloj("parking")) spremna.then(() => prikaziParking(parkingTipovi.size > 0));
      pratiNSBike(skup.has("i"));
      crtajTipoveParkinga();
      // čip: svaka ikonica je u boji kad se ta vrsta prikazuje; glavna štikla je štiklirana (sve), polu (neke) ili prazna (nijedna)
      const cip = opcije.stazeEl && opcije.stazeEl.querySelector(".grupa-tacaka .cip-parking");
      if (!cip) return;
      for (const d of cip.querySelectorAll("[data-t]")) d.setAttribute("aria-pressed", String(skup.has(d.dataset.t)));
      const sve = cip.querySelector("input");
      sve.checked = skup.size === SVE_VRSTE.length;
      sve.indeterminate = skup.size > 0 && skup.size < SVE_VRSTE.length;
      cip.classList.toggle("aktivno", skup.size > 0);
    }

    if (opcije.stazeEl) {
      // staze: glavna štikla pali ili gasi sve tri vrste; strelica otvara legendu sa izborom vrsta, opisom i dužinama
      const OPIS_STAZA = {
        s: ["Izdvojena staza", "Posebna staza samo za bicikle, odvojena od kolovoza i trotoara."],
        t: ["Traka na kolovozu", "Obeležena traka za bicikle na kolovozu, uz automobile."],
        z: ["Zajednička sa pešacima", "Površina koju dele pešaci i biciklisti; na mapi isprekidana linija."],
      };
      const linijaStaze = (t) => `<i class="linija-staze${t === "z" ? " isprekidana" : ""}" style="--b:var(--${{ s: "staza", t: "traka", z: "zajednicka" }[t]})"></i>`;
      opcije.stazeEl.innerHTML = `<div class="parking-grupa staze-grupa">
          <div class="cip cip-parking cip-staze" style="--boja:var(--staza)">
            <label class="parking-sve" title="Sve biciklističke staze: uključi ili isključi"><input type="checkbox" aria-label="Sve biciklističke staze">
              <span class="kvacica" aria-hidden="true"></span></label><span class="cip-naziv">Biciklističke staze</span></div>
          <button type="button" class="cip cip-strelica" aria-expanded="false" aria-label="Vrste staza i legenda" title="Vrste staza i legenda">${LJ.ik("chevron")}</button>
          <div class="panel tipovi-parkinga tipovi-staza skriveno" role="group" aria-label="Vrste staza"></div></div>`;
      const sGrupa = opcije.stazeEl.querySelector(".staze-grupa");
      const sPanel = sGrupa.querySelector(".tipovi-staza"), sStrelica = sGrupa.querySelector(".cip-strelica");
      let kmStaza = null;
      const crtajStaze = () => {
        sPanel.innerHTML = glavaPanela("Biciklističke staze") + VRSTE_STAZA.map((t) =>
          `<label class="red-izbora red-staze"><input type="checkbox" data-s="${t}" ${stazeTipovi.has(t) ? "checked" : ""}>${linijaStaze(t)}
            <span><b>${OPIS_STAZA[t][0]}</b>${kmStaza ? ` <span class="mono sitno">${NS.broj(Math.round(kmStaza[t]))} km</span>` : ""}<small>${OPIS_STAZA[t][1]}</small></span></label>`).join("");
      };
      const postaviStaze = (skup) => {
        stazeTipovi = skup;
        try {
          localStorage.setItem("ns-staze", skup.size ? "1" : "0");
          localStorage.setItem("ns-staze-tipovi", JSON.stringify([...skup]));
        } catch (x) { /* */ }
        spremna.then(primeniStaze);
        crtajStaze();
        const cip = sGrupa.querySelector(".cip-staze");
        const sve = cip.querySelector("input");
        sve.checked = skup.size === VRSTE_STAZA.length;
        sve.indeterminate = skup.size > 0 && skup.size < VRSTE_STAZA.length;
        cip.classList.toggle("aktivno", skup.size > 0);
      };
      postaviStaze(stazeTipovi);
      stazeSpremne.then((km) => { if (km) { kmStaza = km; crtajStaze(); } });
      sGrupa.querySelector(".parking-sve input").addEventListener("change", () => postaviStaze(new Set(stazeTipovi.size === VRSTE_STAZA.length ? [] : VRSTE_STAZA)));
      sStrelica.addEventListener("click", () => {           // bez stopPropagation: klik zatvara ostale padajuće panele
        const otvori = sPanel.classList.contains("skriveno");
        sPanel.classList.toggle("skriveno", !otvori);
        sStrelica.setAttribute("aria-expanded", String(otvori));
      });
      sPanel.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.closest("[data-zatvori]")) { sPanel.classList.add("skriveno"); sStrelica.setAttribute("aria-expanded", "false"); }
      });
      sPanel.addEventListener("change", (e) => {
        const t = e.target.dataset.s;
        if (!t) return;
        const novo = new Set(stazeTipovi);
        if (e.target.checked) novo.add(t); else novo.delete(t);
        postaviStaze(novo);
      });
      // capture: zatvara i kad se klikne na pin (pin zaustavlja širenje klika)
      document.addEventListener("click", (e) => { if (!sGrupa.contains(e.target)) { sPanel.classList.add("skriveno"); sStrelica.setAttribute("aria-expanded", "false"); } }, true);
      // za bicikliste: glavna štikla pali ili gasi sve 4 vrste, svaka ikonica se pali i gasi posebno, strelica otvara spisak sa nazivima
      opcije.stazeEl.insertAdjacentHTML("beforeend", `<div class="parking-grupa grupa-tacaka">
          <div class="cip cip-parking" style="--boja:#2f7de1">
            <label class="parking-sve" title="Sve za bicikliste: uključi ili isključi"><input type="checkbox" aria-label="Sve za bicikliste">
              <span class="kvacica" aria-hidden="true"></span></label>
            ${SVE_VRSTE.map((t) => `<button type="button" class="ikonica-parkinga" data-t="${t}" aria-pressed="false" title="${TACKE[t]}" aria-label="${TACKE[t]}">
              <img src="${ikonaParkinga(t).toDataURL()}" alt=""></button>`).join("")}</div>
          <button type="button" class="cip cip-strelica" aria-expanded="false" aria-label="Izaberi šta se prikazuje" title="Izaberi šta se prikazuje">${LJ.ik("chevron")}</button>
          <div class="panel tipovi-parkinga skriveno" role="group" aria-label="Šta se prikazuje"></div></div>`);
      const grupa = opcije.stazeEl.querySelector(".grupa-tacaka");
      const panel = grupa.querySelector(".tipovi-parkinga"), strelica = grupa.querySelector(".cip-strelica");
      crtajTipoveParkinga();
      postaviTipove(parkingTipovi);
      grupa.querySelector(".parking-sve input").addEventListener("change", () => {
        postaviTipove(new Set(parkingTipovi.size === SVE_VRSTE.length ? [] : SVE_VRSTE));
      });
      grupa.querySelector(".cip-parking").addEventListener("click", (e) => {
        const d = e.target.closest(".ikonica-parkinga");
        if (!d) return;
        const novo = new Set(parkingTipovi);
        if (novo.has(d.dataset.t)) novo.delete(d.dataset.t); else novo.add(d.dataset.t);
        postaviTipove(novo);
      });
      strelica.addEventListener("click", () => {
        const otvori = panel.classList.contains("skriveno");
        panel.classList.toggle("skriveno", !otvori);
        strelica.setAttribute("aria-expanded", String(otvori));
      });
      panel.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.closest("[data-zatvori]")) { panel.classList.add("skriveno"); strelica.setAttribute("aria-expanded", "false"); }
      });
      panel.addEventListener("change", (e) => {
        const t = e.target.dataset.t;
        if (!t) return;
        const novo = new Set(parkingTipovi);
        if (e.target.checked) novo.add(t); else novo.delete(t);
        postaviTipove(novo);
      });
      document.addEventListener("click", (e) => { if (!grupa.contains(e.target)) { panel.classList.add("skriveno"); strelica.setAttribute("aria-expanded", "false"); } }, true);
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
      for (const k of sporedneKartice) k.remove();            // kartica parkinga / NS bike / važnog mesta se zatvara
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
  function legenda(el, s, saStazama = false) {          // značenja staza su u padajućem panelu „Biciklističke staze“
    const opis = s.stanja_opis || {};
    el.className = "legenda-pinova";
    el.innerHTML = `<span class="eyebrow">Stanje brojača</span>` + REDOSLED.map((k) =>
      `<span><img src="${NS.pin(k)}" alt="" class="${k === "neispravan" ? "svetli" : ""}">${s.stanja[k]}${info(opis[k] || "")}</span>`).join("") +
      `<span><img src="${NS.pin("izabrana")}" alt="">izabrana${info("stanica u fokusu: pređi mišem preko pina ili klikni na njega (ili u spisku)")}</span>` +
      (saStazama ? `<span class="eyebrow" style="margin-left:6px">Staze</span><span><i class="linija" style="--b:var(--staza)"></i>staza</span><span><i class="linija" style="--b:var(--traka)"></i>traka</span>
        <span><i class="linija" style="--b:var(--zajednicka)"></i>zajednička</span>` : "");
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
