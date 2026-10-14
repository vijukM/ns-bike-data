/* Mapa brojača (Leaflet): pinovi po stanju brojača, a/b razmaknuti u pikselima, biciklističke staze iz OSM-a
   (kao na bikemap-u: žuto-zelena sredina, zeleni obod), podloge CARTO / OpenStreetMap / „Nacrtana“ (u razvoju). */
"use strict";

const MAPA = (() => {
  const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const PODLOGE = {
    carto: () => L.tileLayer(`https://{s}.basemaps.cartocdn.com/${NS.tamna() ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`,
      { maxZoom: 19, subdomains: "abcd", attribution: `${OSM} · © <a href="https://carto.com/">CARTO</a>` }),
    osm: () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM }),
  };
  const TIPOVI_STAZA = { s: "izdvojena staza", t: "traka na kolovozu", z: "zajednička sa pešacima" };
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();

  function duzinaKm(koord) {
    let m = 0;
    for (let i = 1; i < koord.length; i++) {
      const [a, b] = [koord[i - 1], koord[i]];
      const dy = (b[1] - a[1]) * 111320, dx = (b[0] - a[0]) * 111320 * Math.cos(a[1] * Math.PI / 180);
      m += Math.hypot(dx, dy);
    }
    return m / 1000;
  }

  /** opcije: {podlogaEl, stazeEl, naKlik(serija), zum} → kontroler */
  function napravi(el, s, opcije = {}) {
    const m = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.5, preferCanvas: true });
    const r0 = s.serije.map((r) => [r.lat, r.lon]);
    m.fitBounds(L.latLngBounds(r0).pad(0.06));
    if (opcije.zum) m.setZoom(opcije.zum);

    // podloga
    let izbor = "carto";
    try { if (PODLOGE[localStorage.getItem("ns-podloga")]) izbor = localStorage.getItem("ns-podloga"); } catch (e) { /* */ }
    let podloga = null;
    function postaviPodlogu() {
      if (podloga) m.removeLayer(podloga);
      podloga = PODLOGE[izbor]().addTo(m);
      el.classList.toggle("podloga-carto", izbor === "carto");
      el.classList.toggle("podloga-osm", izbor === "osm");
    }
    postaviPodlogu();
    if (opcije.podlogaEl) {
      NS.prekidac(opcije.podlogaEl, [["carto", "CARTO"], ["osm", "OpenStreetMap"], ["nacrtana", "Nacrtana"]], izbor, (v) => {
        if (v === "nacrtana") {
          L.popup().setLatLng(m.getCenter()).setContent("<b>Nacrtana mapa</b><br>Trenutno je u razvoju — uskoro.").openOn(m);
          opcije.podlogaEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === izbor)));
          return;
        }
        izbor = v;
        try { localStorage.setItem("ns-podloga", v); } catch (e) { /* */ }
        postaviPodlogu();
      });
    }

    // staze
    const okvir = L.canvas({ padding: 0.3 });
    let staze = null, stazePodaci = null;
    const stilStaze = () => ({ obod: css("--staza-obod"), s: css("--staza"), t: css("--traka"), z: css("--zajednicka") });
    function crtajStaze() {
      if (!stazePodaci) return;
      if (staze) m.removeLayer(staze);
      const b = stilStaze();
      const zum = m.getZoom();
      const sirina = zum >= 15 ? 1.6 : zum >= 13.5 ? 1.2 : 0.9;
      staze = L.layerGroup([
        L.geoJSON(stazePodaci, { renderer: okvir, interactive: false, style: () => ({ color: b.obod, weight: 6 * sirina, opacity: 0.9, lineCap: "round" }) }),
        L.geoJSON(stazePodaci, { renderer: okvir, interactive: false, style: (f) => ({
          color: b[f.properties.t] || b.s, weight: 2.6 * sirina, opacity: 1, lineCap: "round",
          dashArray: f.properties.t === "z" ? "6 6" : null }) }),
      ]);
      if (stazeUkljucene) staze.addTo(m);
    }
    let stazeUkljucene = true;
    try { stazeUkljucene = localStorage.getItem("ns-staze") !== "0"; } catch (e) { /* */ }
    const stazeSpremne = NS.json("staze.geojson", "data/").then((g) => {
      stazePodaci = g;
      crtajStaze();
      const km = { s: 0, t: 0, z: 0 };
      for (const f of g.features) km[f.properties.t] += duzinaKm(f.geometry.coordinates);
      return km;
    }).catch(() => null);
    if (opcije.stazeEl) {
      NS.cipovi(opcije.stazeEl, [["staze", "Biciklističke staze", css("--staza"), stazeUkljucene]], (sk) => {
        stazeUkljucene = sk.has("staze");
        try { localStorage.setItem("ns-staze", stazeUkljucene ? "1" : "0"); } catch (e) { /* */ }
        if (staze) { if (stazeUkljucene) staze.addTo(m); else m.removeLayer(staze); }
      });
      stazeSpremne.then((km) => { if (!km) opcije.stazeEl.title = "staze još nisu preuzete (workflow sajt_istorija, sta=staze)"; });
    }
    m.on("zoomend", crtajStaze);

    // pinovi
    const parovi = {};
    for (const r of s.serije) (parovi[r.mesto] = parovi[r.mesto] || []).push(r);
    function polozaj(r) {
      const par = parovi[r.mesto];
      if (par.length !== 2) return [r.lat, r.lon];
      const [a, c] = par;
      const lat0 = (a.lat + c.lat) / 2, lon0 = (a.lon + c.lon) / 2;
      const kos = Math.cos(lat0 * Math.PI / 180);
      let dy = c.lat_mapa - a.lat_mapa, dx = (c.lon_mapa - a.lon_mapa) * kos;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const mPoPx = 40075016.686 * kos / 2 ** (m.getZoom() + 8);
      const pomak = (r === a ? -1 : 1) * 14 * mPoPx / 111320;
      return [lat0 + dy * pomak, lon0 + dx * pomak / kos];
    }
    const pinovi = {};
    let izabrana = null;
    const stanjePina = {};
    function ikona(serija, stanje, brojTekst) {
      const sv = stanje === "nije_postavljen" || stanje === "neispravan" ? " svetli-obod" : "";
      const slika = serija === izabrana ? "izabrana" : stanje;
      return L.divIcon({
        className: "", iconSize: [34, 34], iconAnchor: [17, 33], tooltipAnchor: [0, -30],
        html: `<div class="pin${sv}${brojTekst == null ? " bez-broja" : ""}${serija === izabrana ? " izabran" : ""}">
          <img src="${NS.pin(slika)}" alt=""><span class="pin-broj">${brojTekst ?? ""}</span></div>`,
      });
    }
    for (const r of s.serije) {
      const p = L.marker(polozaj(r), { icon: ikona(r.serija, r.stanje), riseOnHover: true, keyboard: true, title: `${r.serija} ${r.naziv}` }).addTo(m);
      p.on("click", () => (opcije.naKlik ? opcije.naKlik(r.serija) : (location.href = `stanica.html?id=${encodeURIComponent(r.serija)}`)));
      pinovi[r.serija] = p;
      stanjePina[r.serija] = { stanje: r.stanje, broj: null };
    }
    m.on("zoomend", () => { for (const r of s.serije) pinovi[r.serija].setLatLng(polozaj(r)); });
    const opis = (r) => `<b>${r.serija}</b> · ${r.naziv}<br><span class="sitno">${r.smerovi.join("<br>")}</span>`;

    function postaviPin(serija, stanje, brojTekst, tekst) {
      stanjePina[serija] = { stanje, broj: brojTekst, tekst };
      const p = pinovi[serija];
      p.setIcon(ikona(serija, stanje === "sakriven" ? "nije_postavljen" : stanje, brojTekst));
      p.setOpacity(stanje === "sakriven" ? 0 : 1);
      if (tekst) p.bindTooltip(tekst, { direction: "top", offset: [0, -2] }); else p.unbindTooltip();
    }
    function prikaziStanje() {
      for (const r of s.serije) {
        postaviPin(r.serija, r.stanje, null, `${opis(r)}<br><span class="znacka tacka z-${r.stanje}">${s.stanja[r.stanje]}</span>
          ${r.prosek_12m != null && r.stanje !== "neispravan" ? ` &nbsp;prosek <b>${NS.broj(r.prosek_12m)}</b>/dan` : ""}
          ${r.napomena ? `<br><span class="sitno">${r.napomena}</span>` : ""}`);
      }
    }
    /** Prikaz jednog sata iz sati/<YYYY-MM>.json (indeks i u nizu). */
    function prikaziSat(mes, i, oznaka) {
      for (const r of s.serije) {
        const niz = mes.v[r.serija];
        const kod = niz ? NS.razlogSata(mes.r[r.serija], i) : 9;
        if (kod === 9) { postaviPin(r.serija, "sakriven", null, null); continue; }
        const v = niz[i];
        if (v == null) {
          postaviPin(r.serija, kod === 8 ? "neispravan" : "ne_radi", null, `${opis(r)}<br><b>nema podataka</b>: ${NS.razlog(kod)}`);
        } else {
          postaviPin(r.serija, "radi", NS.broj(v), `${opis(r)}<br><b>${NS.broj(v)}</b> biciklista, ${oznaka}`);
        }
      }
    }
    function izaberi(serija, leti = true) {
      const pret = izabrana;
      izabrana = serija;
      for (const x of [pret, serija]) {
        if (!x || !pinovi[x]) continue;
        const st = stanjePina[x];
        pinovi[x].setIcon(ikona(x, st.stanje === "sakriven" ? "nije_postavljen" : st.stanje, st.broj));
      }
      if (serija && leti) m.flyTo(pinovi[serija].getLatLng(), Math.max(m.getZoom(), 15), { duration: 0.8 });
    }
    document.addEventListener("tema", () => { postaviPodlogu(); crtajStaze(); });
    prikaziStanje();
    return { mapa: m, prikaziStanje, prikaziSat, izaberi, stazeSpremne, TIPOVI_STAZA };
  }

  /** Legenda: pinovi po stanju + staze. */
  function legenda(el, s, saStazama = true) {
    const brojevi = {};
    for (const r of s.serije) brojevi[r.stanje] = (brojevi[r.stanje] || 0) + 1;
    el.className = "legenda-pinova";
    el.innerHTML = ["radi", "delimicno", "ne_radi", "neispravan"].map((k) =>
      `<span><img src="${NS.pin(k)}" alt="">${s.stanja[k]} <b class="mono">${brojevi[k] || 0}</b></span>`).join("") +
      `<span><img src="${NS.pin("izabrana")}" alt="">izabrana</span>` +
      (saStazama ? `<span><i class="linija" style="--b:var(--staza)"></i>staza</span><span><i class="linija" style="--b:var(--traka)"></i>traka</span>
        <span><i class="linija" style="--b:var(--zajednicka)"></i>zajednička</span>` : "");
  }

  return { napravi, legenda, duzinaKm, TIPOVI_STAZA };
})();
