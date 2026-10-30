/* Strana „Kamere uživo“ (Admin): HLS prenosi kamera drumskog saobraćaja iz data/kamere.json.
   Spisak se menja samo u JSON-u (bez izmene koda). Da li prenos radi, strana proverava sama: ako glavna adresa ne
   odgovori, proba i drugi naziv fajla (chunks.m3u8 ↔ playlist.m3u8); kamera koja ne radi proverava se ponovo na
   PONOVO_MS, pa se sama prikaže kad proradi. Prenos se pauzira van ekrana i u sakrivenom tabu.
   Opciono polje „slika“ (snimak kamere) se prikazuje dok prenos ne radi; kamera bez slike dobija placeholder.
   Odgovor 403 = server kamere pušta samo svoje sajtove (proverava Referer); rešenje: no-referrer + proksi (kamere-proksi/).
   Region interesa (polje „roi“ u kamere.json, poligon 0–1): deo slike gde se broji; prikazuje se na kameri i vidi se
   koliko je kadra pokriveno. Uvećan prikaz (fokus) ima zum, pomeranje, strelice za sledeću kameru i ceo ekran. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const ROK_MS = 20000;            // koliko se čeka da prenos krene pre nego što se proglasi „ne radi“
  const PONOVO_MS = 2 * 60000;     // ponovna provera kamere koja ne radi
  const NEMA_SLIKE = "assets/slike/kamere/nema-slike.svg";
  let PROKSI = "";                 // adresa proksija iz kamere.json (prazno = direktno sa servera kamere)
  const krozProksi = (u) => PROKSI ? `${PROKSI}/?u=${encodeURIComponent(u)}` : u;
  const nativniHls = () => !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const IKONA_BROJ = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 0-2 2h-3"/><rect x="8" y="9.5" width="8" height="5" rx="1"/></svg>`;
  const IKONA_INFO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>`;
  const IKONA_LEVO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`;
  const IKONA_DESNO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

  // koje su kamere uključile brojanje vozila (pamti se u pregledaču)
  const KLJUC_BROJ = "ns-kamere-brojac";
  const brojOmogucen = (() => { try { return new Set(JSON.parse(localStorage.getItem(KLJUC_BROJ) || "[]")); } catch (e) { return new Set(); } })();
  const upisiBroj = () => { try { localStorage.setItem(KLJUC_BROJ, JSON.stringify([...brojOmogucen])); } catch (e) { /* */ } };
  // koje klase se broje (padajuća lista; podrazumevano sva vozila, bez pešaka i biciklista)
  const KLJUC_KLASE = "ns-kamere-klase";
  const SVE_KLASE = { car: "Automobili", truck: "Kamioni", bus: "Autobusi", motorcycle: "Motocikli", person: "Pešaci", bicycle: "Biciklisti" };
  const PODRAZUMEVANE = ["car", "truck", "bus", "motorcycle"];
  const izabraneKlase = (() => { try { const s = JSON.parse(localStorage.getItem(KLJUC_KLASE)); return new Set(Array.isArray(s) && s.length ? s : PODRAZUMEVANE); } catch (e) { return new Set(PODRAZUMEVANE); } })();
  const dajKlase = () => izabraneKlase;

  // površina poligona (udeo kadra) i udeo graničnog pravougaonika (koliko se obrađuje → ušteda)
  const povrsina = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  const okvirUdeo = (poly) => { const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };

  /** Glavna adresa, pa ista sa drugim nazivom fajla (chunks.m3u8 ↔ playlist.m3u8). */
  const adrese = (url) => {
    const druga = /chunks\.m3u8/.test(url) ? url.replace("chunks.m3u8", "playlist.m3u8")
      : /playlist\.m3u8/.test(url) ? url.replace("playlist.m3u8", "chunks.m3u8") : null;
    return druga ? [url, druga] : [url];
  };

  // ---------------------------------------------------------------- jedna kamera
  function kamera(k, el) {
    const video = el.querySelector("video"), stanjeEl = el.querySelector(".km-stanje"), poruka = el.querySelector(".km-poruka");
    const platno = el.querySelector(".km-platno"), brojEl = el.querySelector(".km-broj"), dugmeB = el.querySelector(".km-prebroj");
    let hls = null, tajmer = 0, ponovo = 0, vidljiva = false, stanje = "povezivanje", aktivna = null, ceka = true, kod = 0, brojac = null;
    const roi = (k.roi && k.roi.length >= 3) ? k.roi : null;   // region interesa (poligon 0–1) iz kamere.json
    const dajRoi = () => roi;

    // --- brojanje vozila (lenjo: BROJAC se učita tek kad se uključi) ---
    const brojUkljucen = () => brojOmogucen.has(k.id);
    function naBroj(n, po) {
      const d = Object.entries(po).map(([kk, v]) => `${v} ${(window.BROJAC && BROJAC.KLASE[kk]) || kk}`).join(" · ");
      brojEl.hidden = false;
      brojEl.innerHTML = `<b>${n}</b><span class="km-broj-po">${d || "ništa u regionu"}</span>`;
    }
    /** Statički prikaz regiona (kad brojanje nije uključeno): zatamni van, tanka linija. */
    function osveziRoi() {
      if (brojac) return;                       // kad broji, okvire crta BROJAC (i region)
      if (!roi || stanje !== "radi") { platno.hidden = true; return; }
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
      const w = video.clientWidth || vw, h = video.clientHeight || vh;
      platno.width = w; platno.height = h; platno.hidden = false;
      const ctx = platno.getContext("2d"); ctx.clearRect(0, 0, w, h);
      const sk = Math.min(w / vw, h / vh), dx = (w - vw * sk) / 2, dy = (h - vh * sk) / 2;
      const put = () => { ctx.beginPath(); roi.forEach((p, i) => { const x = dx + p[0] * vw * sk, y = dy + p[1] * vh * sk; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
      put(); ctx.rect(0, 0, w, h); ctx.fillStyle = "rgba(2,10,28,.42)"; ctx.fill("evenodd");   // zatamni van regiona
      put(); ctx.lineWidth = Math.max(1.5, (w / 640) * 1.6); ctx.strokeStyle = "rgba(96,165,250,.9)"; ctx.stroke();
    }
    async function brojStart() {
      if (!brojUkljucen() || brojac || stanje !== "radi") return;
      brojEl.hidden = false; brojEl.innerHTML = `<span class="km-broj-rad">učitavam model…</span>`;
      try {
        await LJ.ucitajSkript("assets/kamere-brojac.js");
        if (!brojUkljucen() || stanje !== "radi") { if (!brojUkljucen()) { brojEl.hidden = true; osveziRoi(); } return; }
        brojac = await BROJAC.ukljuci(video, platno, naBroj, dajRoi, dajKlase);
        platno.hidden = false;
      } catch (e) { brojEl.innerHTML = `<span class="km-broj-rad">brojanje nije dostupno</span>`; }
    }
    function brojStop() {         // korisnik isključio brojanje: ostaje prikaz regiona
      if (brojac) { brojac.stop(); brojac = null; }
      brojEl.hidden = true; osveziRoi();
    }
    function skloni() {           // potpuno skloni (pauza, van ekrana, gašenje)
      if (brojac) { brojac.stop(); brojac = null; }
      brojEl.hidden = true; platno.hidden = true;
      try { platno.getContext("2d").clearRect(0, 0, platno.width, platno.height); } catch (e) { /* */ }
    }
    function brojTumbler() {
      const on = !brojUkljucen();
      if (on) brojOmogucen.add(k.id); else brojOmogucen.delete(k.id);
      upisiBroj();
      dugmeB.setAttribute("aria-pressed", on ? "true" : "false");
      dugmeB.classList.toggle("ukljuceno", on);
      if (on) brojStart(); else brojStop();
    }
    dugmeB.setAttribute("aria-pressed", brojUkljucen() ? "true" : "false");
    dugmeB.classList.toggle("ukljuceno", brojUkljucen());

    function postavi(novo, tekst = "") {
      stanje = novo;
      el.dataset.stanje = novo;
      stanjeEl.innerHTML = novo === "radi" ? LJ.stalnoUzivo(true)
        : novo === "ne-radi" ? LJ.stalnoUzivo(false, "NE RADI") : `<span class="km-povezivanje">povezivanje…</span>`;
      poruka.textContent = tekst;
      poruka.hidden = !tekst;
      osveziZbir();
    }
    function ugasi() {
      clearTimeout(tajmer);
      skloni();
      if (hls) { hls.destroy(); hls = null; }
      video.removeAttribute("src");
      video.load();
    }
    function neRadi() {
      ugasi();
      postavi("ne-radi", kod === 403
        ? "Server kamere ne dozvoljava prikaz sa ovog sajta (403). Proveravam ponovo na 2 minuta."
        : "Prenos trenutno ne radi. Proveravam ponovo na 2 minuta.");
      clearTimeout(ponovo);
      ponovo = setTimeout(() => { if (vidljiva && !document.hidden) pokreni(); }, PONOVO_MS);
    }
    /** Proba adrese redom; prva koja krene ostaje. */
    function pokreni(spisak = adrese(k.url)) {
      ugasi();
      clearTimeout(ponovo);
      if (!spisak.length) { neRadi(); return; }
      if (spisak.length === adrese(k.url).length) kod = 0;
      const [url, ...ostale] = spisak;
      if (stanje !== "radi") postavi("povezivanje");
      const dalje = () => { if (stanje !== "radi" || aktivna === url) pokreni(ostale); };
      tajmer = setTimeout(dalje, ROK_MS);
      video.onplaying = () => { clearTimeout(tajmer); aktivna = url; postavi("radi"); if (brojUkljucen()) brojStart(); else osveziRoi(); };
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2 });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (d.response && d.response.code) kod = d.response.code;
          if (d.fatal) { clearTimeout(tajmer); dalje(); }
        });
        hls.loadSource(krozProksi(url));
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      } else if (nativniHls()) {
        video.onerror = () => { clearTimeout(tajmer); dalje(); };
        video.src = krozProksi(url);
        video.play().catch(() => {});
      } else {
        clearTimeout(tajmer);
        postavi("ne-radi", "Ovaj pregledač ne može da prikaže prenos (HLS).");
      }
    }
    // pauza van ekrana i u sakrivenom tabu (štedi protok); nastavak kad se vrati. Kamera koja se još povezuje se
    // van ekrana prekida (ne sme da dobije „ne radi“ samo zato što je pauzirana) i kreće ponovo kad se vrati.
    function vidljivost(v) {
      vidljiva = v;
      if (!v || document.hidden) {
        if (stanje === "radi") { skloni(); if (hls) hls.stopLoad(); video.pause(); }
        else if (stanje === "povezivanje") { ugasi(); ceka = true; }
        return;
      }
      if (stanje === "radi") { if (hls) hls.startLoad(-1); video.play().catch(() => {}); if (brojUkljucen()) brojStart(); else osveziRoi(); }
      else if (ceka || stanje === "ne-radi") { ceka = false; pokreni(); }
    }
    return { pokreni, vidljivost, tumbler: brojTumbler, osveziRoi, imaRoi: () => !!roi, stanje: () => stanje };
  }

  // ---------------------------------------------------------------- strana
  let kamere = [];
  function osveziZbir() {
    const radi = kamere.filter((x) => x.stanje() === "radi").length, nr = kamere.filter((x) => x.stanje() === "ne-radi").length;
    const el = document.getElementById("km-zbir");
    if (el) el.textContent = `${radi} od ${kamere.length} radi${nr ? ` · ${nr} ne radi` : ""}`;
    const zn = document.getElementById("km-uzivo");   // sivo kad nijedna ne radi
    if (zn && radi + nr) zn.innerHTML = LJ.stalnoUzivo(radi > 0, radi > 0 ? "UŽIVO" : "NE RADI");
  }

  try {
    if (typeof KAPIJA !== "undefined") await KAPIJA.trazAdmina(main);
    const C = await fetch(`data/kamere.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`kamere.json: ${r.status}`); return r.json(); });
    PROKSI = (C.proksi || "").trim().replace(/\/+$/, "");
    const spisak = (C.kamere || []).filter((k) => k && k.url);
    main.innerHTML = `
      <header class="zaglavlje-strane pojava">
        <div><span class="eyebrow">Admin · drumski saobraćaj</span><h1>Kamere <em>uživo</em></h1></div>
        <div class="akcije">
          <span id="km-uzivo">${LJ.stalnoUzivo(true)}</span><span class="znacka" id="km-zbir">…</span>
          <div class="km-padaj" id="km-klase-omot">
            <button type="button" class="znacka km-padaj-dug" id="km-klase-dug" aria-expanded="false" aria-haspopup="true">Broji: <b id="km-klase-saz"></b> ▾</button>
            <div class="km-padaj-meni" id="km-klase-meni" role="menu" hidden></div>
          </div>
          <button type="button" class="ikonica-dugme" id="km-info-dug" aria-label="Objašnjenje regiona (ROI)" title="Šta je region (ROI)">${IKONA_INFO}</button>
        </div>
      </header>
      <div class="km-info" id="km-info" hidden></div>
      <div class="km-mreza pojava">${spisak.map((k, i) => `
        <section class="kartica km-kartica" data-i="${i}" data-stanje="povezivanje">
          <div class="km-video${k.slika ? " ima-sliku" : " bez-slike"}" data-i="${i}">
            <div class="km-zum">
              <video muted playsinline autoplay preload="none" poster="${esc(k.slika || NEMA_SLIKE)}" aria-label="${esc(k.naziv)} — prenos uživo"></video>
              <canvas class="km-platno" hidden></canvas>
            </div>
            <div class="km-broj" hidden></div>
            <div class="km-poruka" hidden></div>
            <div class="km-alati">
              <button type="button" class="ikonica-dugme km-prebroj" aria-pressed="false" aria-label="Brojanje vozila: ${esc(k.naziv)}" title="Brojanje vozila (uključi/isključi)">${IKONA_BROJ}</button>
              <button type="button" class="ikonica-dugme km-ceo" aria-label="Uvećaj kameru: ${esc(k.naziv)}" title="Uvećaj (fokus na ovu kameru)">${LJ.ik("expand")}</button>
            </div>
          </div>
          <div class="km-glava"><div><b>${esc(k.naziv)}</b><span class="sitno">${esc(k.opis || "")}</span></div><span class="km-stanje"></span></div>
        </section>`).join("")}</div>
      ${spisak.length ? "" : `<p class="sitno">U data/kamere.json nema kamera.</p>`}`;
    const kartice = [...main.querySelectorAll(".km-kartica")];
    kamere = kartice.map((el, i) => kamera(spisak[i], el));

    // --- padajuća lista klasa koje se broje ---
    const klaseDug = document.getElementById("km-klase-dug"), klaseMeni = document.getElementById("km-klase-meni"), klaseSaz = document.getElementById("km-klase-saz");
    klaseMeni.innerHTML = Object.entries(SVE_KLASE).map(([kk, naz]) =>
      `<label><input type="checkbox" value="${kk}"${izabraneKlase.has(kk) ? " checked" : ""}> ${naz}</label>`).join("");
    const osveziSaz = () => { klaseSaz.textContent = izabraneKlase.size === Object.keys(SVE_KLASE).length ? "sve" : `${izabraneKlase.size}`; };
    osveziSaz();
    klaseMeni.addEventListener("change", (e) => {
      const cb = e.target.closest("input"); if (!cb) return;
      if (cb.checked) izabraneKlase.add(cb.value); else izabraneKlase.delete(cb.value);
      try { localStorage.setItem(KLJUC_KLASE, JSON.stringify([...izabraneKlase])); } catch (x) { /* */ }
      osveziSaz();
    });
    klaseDug.addEventListener("click", (e) => { e.stopPropagation(); const o = klaseMeni.hidden; klaseMeni.hidden = !o; klaseDug.setAttribute("aria-expanded", o ? "true" : "false"); });

    // --- info o regionu (ROI) i ušteda po kameri ---
    const infoEl = document.getElementById("km-info"), infoDug = document.getElementById("km-info-dug");
    const redovi = spisak.filter((k) => k.roi && k.roi.length >= 3).map((k) => {
      const cov = Math.round(povrsina(k.roi) * 100), ust = Math.round((1 - okvirUdeo(k.roi)) * 100);
      return `<tr><td>${esc(k.naziv)}</td><td>${cov}%</td><td>~${ust}%</td></tr>`;
    }).join("");
    infoEl.innerHTML = `
      <p><b>Region interesa (ROI)</b> je deo slike gde se broji saobraćaj — zadaje se unapred u <code>data/kamere.json</code>
      (polje <code>roi</code>) jer su kamere statične. Ostatak kadra (zgrade, drveće, parking, trotoar) se preskače, pa je
      brže i nema lažnih vozila. Na kameri je taj deo svetliji, a ostatak zatamnjen.</p>
      ${redovi ? `<table class="km-info-tab"><thead><tr><th>Kamera</th><th>gleda se</th><th>brže ~</th></tr></thead><tbody>${redovi}</tbody></table>
      <p class="sitno">„gleda se“ = udeo slike u regionu; „brže“ = procena uštede obrade (detekcija radi samo oko regiona).</p>`
        : `<p class="sitno">Nijedna kamera za sada nema zadat region.</p>`}`;
    infoDug.addEventListener("click", (e) => { e.stopPropagation(); infoEl.hidden = !infoEl.hidden; });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#km-klase-omot")) { klaseMeni.hidden = true; klaseDug.setAttribute("aria-expanded", "false"); }
      if (!e.target.closest("#km-info") && !e.target.closest("#km-info-dug")) infoEl.hidden = true;
    });

    const io = new IntersectionObserver((zapisi) => zapisi.forEach((z) => kamere[+z.target.dataset.i].vidljivost(z.isIntersecting)), { rootMargin: "100px" });
    kartice.forEach((el) => io.observe(el));
    document.addEventListener("visibilitychange", () => kartice.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      kamere[i].vidljivost(!document.hidden && r.bottom > 0 && r.top < innerHeight);
    }));

    // --- fokus: uvećana jedna kamera; zum (scroll), pomeranje (prevlačenje), strelice, ceo ekran ---
    const fokusEl = document.createElement("div");
    fokusEl.className = "km-fokus"; fokusEl.hidden = true;
    fokusEl.innerHTML = `<div class="km-fokus-poz">
      <div class="km-fokus-traka">
        <div class="km-fokus-levo">
          <button type="button" class="ikonica-dugme km-fokus-prev" aria-label="Prethodna kamera" title="Prethodna (←)">${IKONA_LEVO}</button>
          <button type="button" class="ikonica-dugme km-fokus-next" aria-label="Sledeća kamera" title="Sledeća (→)">${IKONA_DESNO}</button>
          <span class="km-fokus-ime"></span><span class="km-fokus-roi sitno"></span>
        </div>
        <div class="km-fokus-desno">
          <button type="button" class="ikonica-dugme km-fokus-cel" aria-label="Ceo ekran" title="Ceo ekran">${LJ.ik("expand")}</button>
          <button type="button" class="ikonica-dugme km-fokus-x" aria-label="Zatvori (Esc)" title="Zatvori (Esc)">${LJ.ik("x") || "✕"}</button>
        </div>
      </div>
      <div class="km-fokus-ram"></div></div>`;
    document.body.appendChild(fokusEl);
    const ram = fokusEl.querySelector(".km-fokus-ram");
    let uFokusu = -1, S = 1, X = 0, Y = 0, vuci = false, lx = 0, ly = 0;
    function primeniZum() {
      const z = ram.querySelector(".km-zum"); if (!z) return;
      const r = ram.getBoundingClientRect(), mx = (S - 1) * r.width / 2, my = (S - 1) * r.height / 2;
      X = Math.max(-mx, Math.min(mx, X)); Y = Math.max(-my, Math.min(my, Y));
      z.style.transform = `translate(${X}px, ${Y}px) scale(${S})`;
      ram.classList.toggle("moze-vuci", S > 1);
    }
    function otvoriFokus(i) {
      if (uFokusu === i) return;
      if (uFokusu >= 0) {
        const kart = kartice[uFokusu], vid = ram.querySelector(".km-video");
        if (vid) { const z = vid.querySelector(".km-zum"); if (z) z.style.transform = ""; kart.insertBefore(vid, kart.querySelector(".km-glava")); }
        kart.classList.remove("u-fokusu"); kamere[uFokusu].osveziRoi();
      }
      ram.appendChild(kartice[i].querySelector(".km-video"));
      kartice[i].classList.add("u-fokusu");
      fokusEl.querySelector(".km-fokus-ime").textContent = spisak[i].naziv;
      const r = spisak[i].roi && spisak[i].roi.length >= 3 ? spisak[i].roi : null;
      fokusEl.querySelector(".km-fokus-roi").textContent = r ? `· region: gleda se ${Math.round(povrsina(r) * 100)}% slike` : "";
      S = 1; X = 0; Y = 0; primeniZum();
      fokusEl.hidden = false; document.body.classList.add("km-fokus-otvoren"); uFokusu = i;
      kamere[i].osveziRoi();   // region iscrtan na uvećanoj slici
    }
    function zatvoriFokus() {
      if (uFokusu < 0) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      const kart = kartice[uFokusu], vid = ram.querySelector(".km-video");
      if (vid) { const z = vid.querySelector(".km-zum"); if (z) z.style.transform = ""; kart.insertBefore(vid, kart.querySelector(".km-glava")); }
      kart.classList.remove("u-fokusu"); fokusEl.hidden = true; document.body.classList.remove("km-fokus-otvoren");
      const bio = uFokusu; S = 1; X = 0; Y = 0; uFokusu = -1;
      kamere[bio].osveziRoi();
    }
    const prebaci = (d) => { if (uFokusu >= 0 && kartice.length > 1) otvoriFokus((uFokusu + d + kartice.length) % kartice.length); };
    function ceoEkran() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (fokusEl.requestFullscreen) fokusEl.requestFullscreen().catch(() => {});
    }
    ram.addEventListener("wheel", (e) => {
      if (uFokusu < 0) return; e.preventDefault();
      const r = ram.getBoundingClientRect(), cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15, nS = Math.min(8, Math.max(1, S * f)), k2 = nS / S;
      X = cx - (cx - X) * k2; Y = cy - (cy - Y) * k2; S = nS; if (S <= 1.001) { S = 1; X = 0; Y = 0; }
      primeniZum();
    }, { passive: false });
    ram.addEventListener("pointerdown", (e) => { if (uFokusu < 0 || S <= 1) return; vuci = true; lx = e.clientX; ly = e.clientY; try { ram.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
    ram.addEventListener("pointermove", (e) => { if (!vuci) return; X += e.clientX - lx; Y += e.clientY - ly; lx = e.clientX; ly = e.clientY; primeniZum(); });
    const krajVuce = () => { vuci = false; };
    ram.addEventListener("pointerup", krajVuce); ram.addEventListener("pointercancel", krajVuce);
    fokusEl.addEventListener("click", (e) => {
      if (e.target.closest(".km-fokus-x")) return zatvoriFokus();
      if (e.target.closest(".km-fokus-prev")) return prebaci(-1);
      if (e.target.closest(".km-fokus-next")) return prebaci(1);
      if (e.target.closest(".km-fokus-cel")) return ceoEkran();
      if (e.target === fokusEl) zatvoriFokus();
    });
    addEventListener("keydown", (e) => {
      if (uFokusu < 0) return;
      if (e.key === "Escape") zatvoriFokus();
      else if (e.key === "ArrowLeft") prebaci(-1);
      else if (e.key === "ArrowRight") prebaci(1);
    });
    addEventListener("resize", () => { if (uFokusu >= 0) kamere[uFokusu].osveziRoi(); });

    // dugmad i otvaranje fokusa rade i u mreži i u uvećanom prikazu (klik se pronalazi preko .km-video[data-i])
    document.addEventListener("click", (e) => {
      const vidEl = e.target.closest(".km-video"); if (!vidEl) return;
      const i = +vidEl.dataset.i;
      if (e.target.closest(".km-prebroj")) { kamere[i].tumbler(); return; }
      if (e.target.closest(".km-ceo")) { otvoriFokus(i); return; }
      if (uFokusu < 0) otvoriFokus(i);   // klik na karticu u mreži → uvećaj
    });
    LJ.pojave(main);
  } catch (e) {
    NS.greska(main, e);
  }
})();
