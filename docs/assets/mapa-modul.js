/* Mapa brojača (Leaflet): pinovi po stanju brojača (hover menja ikonicu, klik fokusira pin uz „odskakivanje“),
   a/b razmaknuti u pikselima, biciklističke staze iz OSM-a (kao na bikemap-u), podloge CARTO / OpenStreetMap /
   „Nacrtana“ (u razvoju), Ctrl + točkić za zum, filtriranje pinova, „danas do Xh“ iz docs/data/uzivo.json. */
"use strict";

const MAPA = (() => {
  const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const PODLOGE = {
    carto: () => L.tileLayer(`https://{s}.basemaps.cartocdn.com/${NS.tamna() ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`,
      { maxZoom: 19, subdomains: "abcd", attribution: `${OSM} · © <a href="https://carto.com/">CARTO</a>` }),
    osm: () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM }),
  };
  const TIPOVI_STAZA = { s: "izdvojena staza", t: "traka na kolovozu", z: "zajednička sa pešacima" };
  const REDOSLED = ["radi", "delimicno", "ne_radi", "neispravan"];
  const css = (ime) => getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
  const info = (tekst) => `<span class="info" tabindex="0" role="note" aria-label="${tekst}" data-info="${tekst}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>`;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

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

  /** opcije: {podlogaEl, stazeEl, naFokus(serija)} → kontroler */
  function napravi(el, s, opcije = {}) {
    const m = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.5, zoomDelta: 0.5, preferCanvas: true });
    m.fitBounds(L.latLngBounds(s.serije.map((r) => [r.lat, r.lon])).pad(0.06));

    // Ctrl (⌘) + točkić = zum; bez Ctrl-a strana se normalno skroluje, uz kratku napomenu
    const savet = document.createElement("div");
    savet.className = "mapa-savet";
    savet.textContent = `Drži ${mac ? "⌘" : "Ctrl"} i skroluj točkićem da uvećaš ili smanjiš mapu`;
    el.appendChild(savet);
    let savetTajmer;
    el.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        m.setZoomAround(m.mouseEventToContainerPoint(e), m.getZoom() + (e.deltaY < 0 ? 0.5 : -0.5));
        savet.classList.remove("vidljiv");
      } else {
        savet.classList.add("vidljiv");
        clearTimeout(savetTajmer);
        savetTajmer = setTimeout(() => savet.classList.remove("vidljiv"), 1400);
      }
    }, { passive: false });

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
    let stazeUkljucene = true;
    try { stazeUkljucene = localStorage.getItem("ns-staze") !== "0"; } catch (e) { /* */ }
    function crtajStaze() {
      if (!stazePodaci) return;
      if (staze) m.removeLayer(staze);
      const b = { obod: css("--staza-obod"), s: css("--staza"), t: css("--traka"), z: css("--zajednicka") };
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
    const stazeSpremne = NS.json("staze.geojson", "data/").then((g) => {
      stazePodaci = g;
      crtajStaze();
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
        if (staze) { if (stazeUkljucene) staze.addTo(m); else m.removeLayer(staze); }
      });
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
    const stanjePina = {};
    let izabrana = null, vidljive = null, menjam = false;
    function ikona(serija, stanje, brojTekst) {
      const sv = stanje === "nije_postavljen" || stanje === "neispravan" ? " svetli-obod" : "";
      const izab = serija === izabrana;
      return L.divIcon({
        className: "", iconSize: [34, 34], iconAnchor: [17, 33], tooltipAnchor: [0, -30], popupAnchor: [0, -34],
        html: `<div class="pin${sv}${brojTekst == null ? " bez-broja" : ""}${izab ? " izabran" : ""}">
          <div class="telo"><img class="n" src="${NS.pin(stanje)}" alt=""><img class="h" src="${NS.pin("izabrana")}" alt=""></div>
          <span class="pin-broj">${brojTekst ?? ""}</span></div>`,
      });
    }
    const rPo = Object.fromEntries(s.serije.map((r) => [r.serija, r]));
    for (const r of s.serije) {
      const p = L.marker(polozaj(r), { icon: ikona(r.serija, r.stanje), riseOnHover: true, keyboard: true, title: `${r.serija} ${r.naziv}` }).addTo(m);
      p.on("click", () => fokus(r.serija, { leti: true }));
      p.on("mouseover", () => naHover(r.serija));
      p.on("mouseout", () => {
        if (r.serija === izabrana) return;
        menjam = true;
        p.closePopup();
        if (izabrana && pinovi[izabrana]) pinovi[izabrana].openPopup();      // vrati karticu izabranog pina
        menjam = false;
      });
      p.on("popupopen", () => poravnaj(p));
      // X na kartici (ili klik na mapu) skida fokus sa pina
      p.on("popupclose", () => { if (!menjam && r.serija === izabrana) odznaci(); });
      pinovi[r.serija] = p;
      stanjePina[r.serija] = { stanje: r.stanje, broj: null };
    }
    m.on("zoomend", () => { for (const r of s.serije) pinovi[r.serija].setLatLng(polozaj(r)); });
    const opis = (r) => `<b>${r.serija}</b> · ${r.naziv}<br><span class="sitno">${r.smerovi.join("<br>")}</span>`;

    function osveziPin(serija) {
      const st = stanjePina[serija];
      const p = pinovi[serija];
      const sakriven = st.stanje === "sakriven" || (vidljive && !vidljive.has(serija));
      p.setIcon(ikona(serija, st.stanje === "sakriven" ? "nije_postavljen" : st.stanje, st.broj));
      p.setZIndexOffset(serija === izabrana ? 1000 : 0);
      if (sakriven) { if (m.hasLayer(p)) p.remove(); } else if (!m.hasLayer(p)) p.addTo(m);
    }
    function postaviPin(serija, stanje, brojTekst, tekst) {
      stanjePina[serija] = { stanje, broj: brojTekst, tekst };
      osveziPin(serija);
      const p = pinovi[serija];
      p.unbindPopup();
      if (tekst) p.bindPopup(`${tekst}<div class="tt-red"><a href="stanica.html?id=${encodeURIComponent(serija)}">Otvori stanicu →</a></div>`,
        { closeButton: true, autoPan: false, offset: [0, -2] });
      if (tekst) p.off("click", p._openPopup, p);          // klik ne „prebacuje“ karticu; to radi fokus()
    }
    /** Prelazak mišem: otvori se ista kartica kao na klik (bez skoka). */
    function naHover(serija) {
      menjam = true;
      pinovi[serija].openPopup();
      menjam = false;
    }
    /** Kartica se otvara na suprotnu stranu od položaja pina (pin gore levo → kartica dole desno). */
    function poravnaj(p) {
      const pop = p.getPopup();
      const el = pop && pop.getElement();
      if (!el) return;
      const pt = m.latLngToContainerPoint(p.getLatLng());
      const vel = m.getSize();
      const w = el.offsetWidth, h = el.offsetHeight;
      // prvo: iznad pina (kao ranije), ako cela kartica staje u mapu
      const iznad = pt.y - 34 - h - 12 >= 0 && pt.x - w / 2 >= 4 && pt.x + w / 2 <= vel.x - 4;
      if (iznad) {
        pop.options.offset = L.point(0, -2);
        el.classList.remove("bez-vrha");
      } else {                                   // inače ukoso, na suprotnu stranu od pina
        const dx = pt.x < vel.x / 2 ? w / 2 + 14 : -(w / 2 + 14);
        const dy = pt.y < vel.y / 2 ? h + 34 + 12 : -4;
        pop.options.offset = L.point(dx, dy);
        el.classList.add("bez-vrha");
      }
      pop.update();
    }
    function skoci(serija) {
      const el = pinovi[serija].getElement() && pinovi[serija].getElement().querySelector(".pin");
      if (el) { el.classList.remove("skok"); void el.offsetWidth; el.classList.add("skok"); }
    }
    function odznaci() {
      const pret = izabrana;
      izabrana = null;
      if (pret) osveziPin(pret);
      if (opcije.naFokus) opcije.naFokus(null);
    }
    async function prikaziStanje() {
      for (const r of s.serije) {
        const danas = await danasTekst(r.serija);
        postaviPin(r.serija, r.stanje, null, `${opis(r)}<div class="tt-red"><span class="znacka tacka z-${r.stanje}">${s.stanja[r.stanje]}</span></div>
          ${r.prosek_12m != null && r.stanje !== "neispravan" ? `<div class="tt-red">prosek <b>${NS.broj(r.prosek_12m)}</b> / dan
            <small>kompletni dani, 1. 9. 2025. – 31. 8. 2026.</small></div>` : ""}${danas}
          ${r.napomena ? `<div class="tt-red sitno">${r.napomena}</div>` : ""}`);
      }
    }
    /** Prikaz jednog sata iz sati/<YYYY-MM>.json (indeks i u nizu). */
    function prikaziSat(mes, i, oznaka) {
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
      if (pret && pret !== serija) { osveziPin(pret); menjam = true; pinovi[pret].closePopup(); menjam = false; }
      if (!serija) return;
      osveziPin(serija);
      const posle = () => { menjam = true; pinovi[serija].openPopup(); menjam = false; if (skok) skoci(serija); };
      if (leti) { m.flyTo(pinovi[serija].getLatLng(), Math.max(m.getZoom(), 15), { duration: 0.7 }); setTimeout(posle, 750); } else posle();
      if (opcije.naFokus) opcije.naFokus(serija);
    }
    /** Prikazuje samo zadate serije (null = sve). */
    function filtriraj(skup) {
      vidljive = skup;
      for (const r of s.serije) osveziPin(r.serija);
    }
    document.addEventListener("tema", () => { postaviPodlogu(); crtajStaze(); });
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
