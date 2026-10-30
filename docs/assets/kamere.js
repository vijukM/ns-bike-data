/* Strana „Kamere uživo“ (Admin): HLS prenosi kamera drumskog saobraćaja iz data/kamere.json.
   Spisak se menja samo u JSON-u (bez izmene koda). Da li prenos radi, strana proverava sama: ako glavna adresa ne
   odgovori, proba i drugi naziv fajla (chunks.m3u8 ↔ playlist.m3u8); kamera koja ne radi proverava se ponovo na
   PONOVO_MS, pa se sama prikaže kad proradi. Prenos se pauzira van ekrana i u sakrivenom tabu.
   Opciono polje „slika“ (snimak kamere) se prikazuje dok prenos ne radi; kamera bez slike dobija placeholder.
   Odgovor 403 = server kamere pušta samo svoje sajtove (proverava Referer). Pregledač ne da JavaScript-u da lažira
   Referer, pa čisto front-end rešenje ne postoji; strana zato (1) ne šalje Referer (<meta referrer no-referrer> u
   kamere.html) i (2) ume da prenos provuče kroz proksi iz polja „proksi“ u kamere.json (Cloudflare Worker iz
   kamere-proksi/, koji šalje dozvoljeni Referer). Za javni rad treba dozvola/licenca vlasnika prenosa.
   Kasnije: brojanje vozila (okviri oko vozila i linija prolaska) — ovde je samo prikaz. */
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
  const IKONA_REGION = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 4 19 7 17 20 8 18 3 11Z"/><circle cx="5" cy="4" r="1.4" fill="currentColor"/><circle cx="19" cy="7" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/><circle cx="3" cy="11" r="1.4" fill="currentColor"/></svg>`;
  // koje su kamere uključile brojanje vozila (pamti se u pregledaču)
  const KLJUC_BROJ = "ns-kamere-brojac";
  const brojOmogucen = (() => { try { return new Set(JSON.parse(localStorage.getItem(KLJUC_BROJ) || "[]")); } catch (e) { return new Set(); } })();
  const upisiBroj = () => { try { localStorage.setItem(KLJUC_BROJ, JSON.stringify([...brojOmogucen])); } catch (e) { /* */ } };
  // region interesa (poligon 0–1) po kameri — detekcija samo tu (brže, bez lažnih vozila na zgradama)
  const KLJUC_ROI = "ns-kamere-roi";
  const roiMapa = (() => { try { return JSON.parse(localStorage.getItem(KLJUC_ROI) || "{}") || {}; } catch (e) { return {}; } })();
  const upisiRoi = () => { try { localStorage.setItem(KLJUC_ROI, JSON.stringify(roiMapa)); } catch (e) { /* */ } };

  /** Glavna adresa, pa ista sa drugim nazivom fajla (chunks.m3u8 ↔ playlist.m3u8). */
  const adrese = (url) => {
    const druga = /chunks\.m3u8/.test(url) ? url.replace("chunks.m3u8", "playlist.m3u8")
      : /playlist\.m3u8/.test(url) ? url.replace("playlist.m3u8", "chunks.m3u8") : null;
    return druga ? [url, druga] : [url];
  };

  // ---------------------------------------------------------------- jedna kamera
  function kamera(k, el) {
    const video = el.querySelector("video"), stanjeEl = el.querySelector(".km-stanje"), poruka = el.querySelector(".km-poruka");
    const platno = el.querySelector(".km-platno"), brojEl = el.querySelector(".km-broj"), dugmeB = el.querySelector(".km-prebroj"), dugmeR = el.querySelector(".km-region");
    let hls = null, tajmer = 0, ponovo = 0, vidljiva = false, stanje = "povezivanje", aktivna = null, ceka = true, kod = 0, brojac = null;
    let roi = roiMapa[k.id] || k.roi || null, crtanjeRoi = false, tacke = [], alatRoi = null;   // region interesa (poligon 0–1)
    const dajRoi = () => roi;

    // --- brojanje vozila (lenjo: BROJAC se učita tek kad se uključi) ---
    const brojUkljucen = () => brojOmogucen.has(k.id);
    function naBroj(n, po) {
      const d = Object.entries(po).map(([kk, v]) => `${v} ${(window.BROJAC && BROJAC.KLASE[kk]) || kk}`).join(" · ");
      brojEl.innerHTML = `<b>${n}</b> ${n === 1 ? "vozilo" : "vozila"}${d ? `<span class="km-broj-po">${d}</span>` : ""}`;
    }
    async function brojStart() {
      if (!brojUkljucen() || brojac || stanje !== "radi") return;
      brojEl.hidden = false; brojEl.innerHTML = `<span class="km-broj-rad">učitavam model…</span>`;
      try {
        await LJ.ucitajSkript("assets/kamere-brojac.js");
        if (!brojUkljucen() || stanje !== "radi") { if (!brojUkljucen()) brojEl.hidden = true; return; }
        brojac = await BROJAC.ukljuci(video, platno, naBroj, dajRoi);
        platno.hidden = false;
      } catch (e) { brojEl.innerHTML = `<span class="km-broj-rad">brojanje nije dostupno</span>`; }
    }
    function brojStop() { if (brojac) { brojac.stop(); brojac = null; } platno.hidden = true; brojEl.hidden = true; }
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

    // --- region interesa: crtanje poligona po slici (detekcija samo unutar njega) ---
    dugmeR.classList.toggle("ima-roi", !!roi);
    const transformRoi = () => {
      const w = platno.width || platno.clientWidth, h = platno.height || platno.clientHeight;
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9, sk = Math.min(w / vw, h / vh);
      return { w, h, vw, vh, sk, dx: (w - vw * sk) / 2, dy: (h - vh * sk) / 2 };
    };
    function crtajRoi() {
      const ctx = platno.getContext("2d"), { w, h, vw, vh, sk, dx, dy } = transformRoi();
      ctx.clearRect(0, 0, w, h);
      if (!tacke.length) return;
      ctx.beginPath();
      tacke.forEach((p, i) => { const x = dx + p[0] * vw * sk, y = dy + p[1] * vh * sk; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      if (tacke.length >= 3) { ctx.closePath(); ctx.fillStyle = "rgba(37,99,235,.18)"; ctx.fill(); }
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(96,165,250,.95)"; ctx.stroke();
      ctx.fillStyle = "#fff";
      tacke.forEach((p) => { ctx.beginPath(); ctx.arc(dx + p[0] * vw * sk, dy + p[1] * vh * sk, 4, 0, 7); ctx.fill(); });
    }
    const tackaIz = (e) => {
      const r = platno.getBoundingClientRect();
      const px = (e.clientX - r.left) * (platno.width / r.width), py = (e.clientY - r.top) * (platno.height / r.height);
      const { vw, vh, sk, dx, dy } = transformRoi();
      return [Math.min(1, Math.max(0, (px - dx) / sk / vw)), Math.min(1, Math.max(0, (py - dy) / sk / vh))];
    };
    const uRegionKlik = (e) => { if (!crtanjeRoi) return; e.stopPropagation(); e.preventDefault(); tacke.push(tackaIz(e)); crtajRoi(); };
    function regionAlat() {
      alatRoi = document.createElement("div"); alatRoi.className = "km-region-alat";
      alatRoi.innerHTML = `<span>Klikni tačke oko puta (min. 3)</span>
        <button type="button" data-a="undo">Poništi tačku</button>
        <button type="button" data-a="save">Sačuvaj</button>
        <button type="button" data-a="clear">Obriši region</button>
        <button type="button" data-a="cancel">Otkaži</button>`;
      alatRoi.addEventListener("click", (e) => {
        const a = e.target.closest("button"); if (!a) return; e.stopPropagation();
        if (a.dataset.a === "undo") { tacke.pop(); crtajRoi(); }
        else if (a.dataset.a === "save") { if (tacke.length >= 3) { roi = tacke.slice(); roiMapa[k.id] = roi; upisiRoi(); } izadjiRegion(); }
        else if (a.dataset.a === "clear") { roi = null; delete roiMapa[k.id]; upisiRoi(); tacke = []; izadjiRegion(); }
        else izadjiRegion();
      });
      el.querySelector(".km-video").appendChild(alatRoi);
    }
    function udjiRegion() {
      if (crtanjeRoi || stanje !== "radi") return;
      crtanjeRoi = true; dugmeR.classList.add("ukljuceno");
      if (brojac) { brojac.stop(); brojac = null; }        // pauza brojanja dok se crta
      brojEl.hidden = true;
      platno.hidden = false; platno.style.pointerEvents = "auto"; platno.style.cursor = "crosshair";
      platno.width = platno.clientWidth; platno.height = platno.clientHeight;
      tacke = roi ? roi.map((p) => p.slice()) : []; crtajRoi();
      platno.addEventListener("click", uRegionKlik);
      regionAlat();
    }
    function izadjiRegion() {
      crtanjeRoi = false; dugmeR.classList.remove("ukljuceno"); dugmeR.classList.toggle("ima-roi", !!roi);
      platno.removeEventListener("click", uRegionKlik);
      platno.style.pointerEvents = ""; platno.style.cursor = "";
      if (alatRoi) { alatRoi.remove(); alatRoi = null; }
      platno.getContext("2d").clearRect(0, 0, platno.width, platno.height);
      platno.hidden = true;
      if (brojUkljucen() && stanje === "radi") brojStart();   // nastavi brojanje sa novim regionom
    }
    function regionTumbler() { if (crtanjeRoi) izadjiRegion(); else udjiRegion(); }
    addEventListener("resize", () => { if (crtanjeRoi) { platno.width = platno.clientWidth; platno.height = platno.clientHeight; crtajRoi(); } });

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
      if (crtanjeRoi) izadjiRegion();
      brojStop();
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
      video.onplaying = () => { clearTimeout(tajmer); aktivna = url; postavi("radi"); brojStart(); };
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
        if (stanje === "radi") { brojStop(); if (hls) hls.stopLoad(); video.pause(); }
        else if (stanje === "povezivanje") { ugasi(); ceka = true; }
        return;
      }
      if (stanje === "radi") { if (hls) hls.startLoad(-1); video.play().catch(() => {}); brojStart(); }
      else if (ceka || stanje === "ne-radi") { ceka = false; pokreni(); }
    }
    return { pokreni, vidljivost, tumbler: brojTumbler, region: regionTumbler, stanje: () => stanje };
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
        <div class="akcije"><span id="km-uzivo">${LJ.stalnoUzivo(true)}</span><span class="znacka" id="km-zbir">…</span></div>
      </header>
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
              <button type="button" class="ikonica-dugme km-region" aria-label="Region brojanja: ${esc(k.naziv)}" title="Region brojanja (nacrtaj deo puta)">${IKONA_REGION}</button>
              <button type="button" class="ikonica-dugme km-prebroj" aria-pressed="false" aria-label="Brojanje vozila: ${esc(k.naziv)}" title="Brojanje vozila (uključi/isključi)">${IKONA_BROJ}</button>
              <button type="button" class="ikonica-dugme km-ceo" aria-label="Uvećaj kameru: ${esc(k.naziv)}" title="Uvećaj (fokus na ovu kameru)">${LJ.ik("expand")}</button>
            </div>
          </div>
          <div class="km-glava"><div><b>${esc(k.naziv)}</b><span class="sitno">${esc(k.opis || "")}</span></div><span class="km-stanje"></span></div>
        </section>`).join("")}</div>
      ${spisak.length ? "" : `<p class="sitno">U data/kamere.json nema kamera.</p>`}`;
    const kartice = [...main.querySelectorAll(".km-kartica")];
    kamere = kartice.map((el, i) => kamera(spisak[i], el));
    const io = new IntersectionObserver((zapisi) => zapisi.forEach((z) => kamere[+z.target.dataset.i].vidljivost(z.isIntersecting)), { rootMargin: "100px" });
    kartice.forEach((el) => io.observe(el));
    document.addEventListener("visibilitychange", () => kartice.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      kamere[i].vidljivost(!document.hidden && r.bottom > 0 && r.top < innerHeight);
    }));
    // --- fokus: uvećana jedna kamera sa zumom (scroll) i pomeranjem (prevlačenje) ---
    const fokusEl = document.createElement("div");
    fokusEl.className = "km-fokus"; fokusEl.hidden = true;
    fokusEl.innerHTML = `<div class="km-fokus-poz">
      <div class="km-fokus-traka"><span class="km-fokus-ime"></span>
        <button type="button" class="ikonica-dugme km-fokus-x" aria-label="Zatvori (Esc)" title="Zatvori (Esc)">${LJ.ik("x") || "✕"}</button></div>
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
      if (uFokusu >= 0) zatvoriFokus();
      ram.appendChild(kartice[i].querySelector(".km-video"));
      kartice[i].classList.add("u-fokusu");
      fokusEl.querySelector(".km-fokus-ime").textContent = spisak[i].naziv;
      S = 1; X = 0; Y = 0; primeniZum();
      fokusEl.hidden = false; document.body.classList.add("km-fokus-otvoren"); uFokusu = i;
    }
    function zatvoriFokus() {
      if (uFokusu < 0) return;
      const kart = kartice[uFokusu], vid = ram.querySelector(".km-video");
      if (vid) { const z = vid.querySelector(".km-zum"); if (z) z.style.transform = ""; kart.insertBefore(vid, kart.querySelector(".km-glava")); }
      kart.classList.remove("u-fokusu"); fokusEl.hidden = true; document.body.classList.remove("km-fokus-otvoren");
      S = 1; X = 0; Y = 0; uFokusu = -1;
    }
    ram.addEventListener("wheel", (e) => {
      if (uFokusu < 0) return; e.preventDefault();
      const r = ram.getBoundingClientRect(), cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15, nS = Math.min(8, Math.max(1, S * f)), k2 = nS / S;
      X = cx - (cx - X) * k2; Y = cy - (cy - Y) * k2; S = nS; if (S <= 1.001) { S = 1; X = 0; Y = 0; }
      primeniZum();
    }, { passive: false });
    ram.addEventListener("pointerdown", (e) => { if (uFokusu < 0 || S <= 1) return; vuci = true; lx = e.clientX; ly = e.clientY; try { ram.setPointerCapture(e.pointerId); } catch (x) {} });
    ram.addEventListener("pointermove", (e) => { if (!vuci) return; X += e.clientX - lx; Y += e.clientY - ly; lx = e.clientX; ly = e.clientY; primeniZum(); });
    const krajVuce = () => { vuci = false; };
    ram.addEventListener("pointerup", krajVuce); ram.addEventListener("pointercancel", krajVuce);
    fokusEl.addEventListener("click", (e) => { if (e.target === fokusEl || e.target.closest(".km-fokus-x")) zatvoriFokus(); });
    addEventListener("keydown", (e) => { if (e.key === "Escape") zatvoriFokus(); });

    // dugmad i otvaranje fokusa rade i u mreži i u uvećanom prikazu (klik se pronalazi preko .km-video[data-i])
    document.addEventListener("click", (e) => {
      const vidEl = e.target.closest(".km-video"); if (!vidEl) return;
      const i = +vidEl.dataset.i;
      if (e.target.closest(".km-prebroj")) { kamere[i].tumbler(); return; }
      if (e.target.closest(".km-region")) { kamere[i].region(); return; }
      if (e.target.closest(".km-ceo")) { otvoriFokus(i); return; }
      if (uFokusu < 0) otvoriFokus(i);   // klik na karticu u mreži → uvećaj
    });
    LJ.pojave(main);
  } catch (e) {
    NS.greska(main, e);
  }
})();
