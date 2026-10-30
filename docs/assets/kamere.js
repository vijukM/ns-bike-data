/* Strana „Kamere uživo“ (Admin): HLS prenosi kamera iz data/kamere.json. Spisak se menja samo u JSON-u.
   Štednja protoka: u mreži se prikazuju SLIČICE (poster), a živ prenos kreće tek kad se uđe u kameru (fokus).
   Dok se kamera ne otvori ne šalje se nijedan zahtev ka serveru prenosa. Napuštanjem kamere prenos i brojanje staju. Odgovor 403 = server pušta samo svoje sajtove (Referer); rešenje: no-referrer + proksi (kamere-proksi/).
   U fokusu: zum (scroll), pomeranje (prevlačenje), strelice ←/→, ceo ekran, i u okviru snimka kontrole — brojanje,
   prikaz regiona i izbor klasa. Region interesa (polje „roi“ u kamere.json, poligon 0–1) se zadaje unapred. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const ROK_MS = 20000;            // koliko se čeka da prenos krene pre nego što se proglasi „ne radi“
  const NEMA_SLIKE = "assets/slike/kamere/nema-slike.svg";
  const P403 = "Server kamere ne dozvoljava prikaz sa ovog sajta (403).";
  const PNE = "Prenos trenutno ne radi.";
  let PROKSI = "";                 // adresa proksija iz kamere.json (prazno = direktno sa servera kamere)
  const krozProksi = (u) => PROKSI ? `${PROKSI}/?u=${encodeURIComponent(u)}` : u;
  const nativniHls = () => !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const IKONA_BROJ = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 0-2 2h-3"/><rect x="8" y="9.5" width="8" height="5" rx="1"/></svg>`;
  const IKONA_REGION = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 4 19 7 17 20 8 18 3 11Z"/></svg>`;
  const IKONA_LEVO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`;
  const IKONA_DESNO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

  // koje klase se broje (bira se u kontroli unutar snimka; podrazumevano sva vozila, bez pešaka i biciklista)
  const KLJUC_KLASE = "ns-kamere-klase";
  const SVE_KLASE = { car: "Automobili", truck: "Kamioni", bus: "Autobusi", motorcycle: "Motocikli", person: "Pešaci", bicycle: "Biciklisti" };
  const PODRAZUMEVANE = ["car", "truck", "bus", "motorcycle"];
  const izabraneKlase = (() => { try { const s = JSON.parse(localStorage.getItem(KLJUC_KLASE)); return new Set(Array.isArray(s) && s.length ? s : PODRAZUMEVANE); } catch (e) { return new Set(PODRAZUMEVANE); } })();
  const dajKlase = () => izabraneKlase;
  const povrsina = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

  /** Glavna adresa, pa ista sa drugim nazivom fajla (chunks.m3u8 ↔ playlist.m3u8); „bez_druge_adrese“ = samo glavna. */
  const adrese = (url, samoGlavna = false) => {
    if (samoGlavna) return [url];
    const druga = /chunks\.m3u8/.test(url) ? url.replace("chunks.m3u8", "playlist.m3u8")
      : /playlist\.m3u8/.test(url) ? url.replace("playlist.m3u8", "chunks.m3u8") : null;
    return druga ? [url, druga] : [url];
  };

  // ---------------------------------------------------------------- jedna kamera
  function kamera(k, el) {
    const video = el.querySelector("video"), stanjeEl = el.querySelector(".km-stanje"), poruka = el.querySelector(".km-poruka"), brojEl = el.querySelector(".km-broj");
    const platno = el.querySelector(".km-platno");
    let hls = null, tajmer = 0, stanje = "mirno", aktivna = null, kod = 0, brojac = null;
    let uzivo = false, brojOn = false;
    const roi = (k.roi && k.roi.length >= 3) ? k.roi : null;
    let roiOn = !!roi;                 // podrazumevano prikaži region ako ga ima
    const dajRoi = () => roi;
    const sveAdrese = () => adrese(k.url, !!k.bez_druge_adrese);
    if (k.slika) { const im = new Image(); im.onerror = () => { video.poster = NEMA_SLIKE; }; im.src = k.slika; }   // spoljna sličica ne radi → placeholder

    const vidEl = el.querySelector(".km-video");
    function postavi(novo, tekst = "") {
      stanje = novo; el.dataset.stanje = novo;
      vidEl.classList.toggle("ucitava", novo === "povezivanje" && uzivo);   // krug dok prenos ne krene
      stanjeEl.innerHTML = novo === "radi" ? LJ.stalnoUzivo(true)
        : novo === "ne-radi" ? LJ.stalnoUzivo(false, "NE RADI")
          : novo === "mirno" ? ""
            : `<span class="km-povezivanje">povezivanje…</span>`;
      poruka.textContent = tekst; poruka.hidden = !tekst;
    }


    // --- region (statički prikaz kad se ne broji) ---
    function osveziRoi() {
      if (brojac) return;                       // kad broji, region crta BROJAC
      if (!roi || !roiOn || !uzivo || stanje !== "radi") { platno.hidden = true; return; }
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
      const w = video.clientWidth || vw, h = video.clientHeight || vh;
      platno.width = w; platno.height = h; platno.hidden = false;
      const ctx = platno.getContext("2d"); ctx.clearRect(0, 0, w, h);
      const sk = Math.min(w / vw, h / vh), dx = (w - vw * sk) / 2, dy = (h - vh * sk) / 2;
      const put = () => { ctx.beginPath(); roi.forEach((p, i) => { const x = dx + p[0] * vw * sk, y = dy + p[1] * vh * sk; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
      put(); ctx.rect(0, 0, w, h); ctx.fillStyle = "rgba(2,10,28,.42)"; ctx.fill("evenodd");
      put(); ctx.lineWidth = Math.max(1.5, (w / 640) * 1.6); ctx.strokeStyle = "rgba(96,165,250,.9)"; ctx.stroke();
    }

    // --- brojanje (samo dok je kamera uživo / u fokusu) ---
    function naBroj(n, po) {
      const d = Object.entries(po).map(([kk, v]) => `${v} ${(window.BROJAC && BROJAC.KLASE[kk]) || kk}`).join(" · ");
      brojEl.hidden = false; brojEl.innerHTML = `<b>${n}</b><span class="km-broj-po">${d || "ništa u regionu"}</span>`;
    }
    async function brojStart() {
      if (!brojOn || !uzivo || brojac || stanje !== "radi") return;
      brojEl.hidden = false; brojEl.innerHTML = `<span class="km-broj-rad">učitavam model…</span>`;
      try {
        await LJ.ucitajSkript("assets/kamere-brojac.js");
        if (!brojOn || !uzivo || stanje !== "radi") { brojEl.hidden = true; osveziRoi(); return; }
        brojac = await BROJAC.ukljuci(video, platno, naBroj, () => (roiOn ? roi : null), dajKlase);
        platno.hidden = false;
      } catch (e) { brojEl.innerHTML = `<span class="km-broj-rad">brojanje nije dostupno</span>`; }
    }
    function brojStop() { if (brojac) { brojac.stop(); brojac = null; } brojEl.hidden = true; osveziRoi(); }

    // --- živ prenos (poziva se iz fokusa) ---
    function ugasiHls() { if (hls) { hls.destroy(); hls = null; } }
    function pokreniUzivo() { uzivo = true; kod = 0; postavi("povezivanje"); probaj(sveAdrese()); }
    function probaj(spisak) {
      ugasiHls(); clearTimeout(tajmer);
      if (!spisak.length) { postavi("ne-radi", kod === 403 ? `${P403} Zatvori i probaj kasnije.` : PNE); return; }
      const [url, ...ost] = spisak;
      if (stanje !== "radi") postavi("povezivanje");
      const dalje = () => { if (stanje !== "radi" || aktivna === url) probaj(ost); };
      tajmer = setTimeout(dalje, ROK_MS);
      video.onplaying = () => { clearTimeout(tajmer); aktivna = url; postavi("radi"); if (brojOn) brojStart(); else osveziRoi(); };
      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2 });
        hls.on(Hls.Events.ERROR, (_e, d) => { if (d.response && d.response.code) kod = d.response.code; if (d.fatal) { clearTimeout(tajmer); dalje(); } });
        hls.loadSource(krozProksi(url)); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      } else if (nativniHls()) {
        video.onerror = () => { clearTimeout(tajmer); dalje(); };
        video.src = krozProksi(url); video.play().catch(() => {});
      } else { clearTimeout(tajmer); postavi("ne-radi", "Ovaj pregledač ne može da prikaže prenos (HLS)."); }
    }
    function zaustaviUzivo() {    // napuštena kamera: prenos i brojanje staju
      uzivo = false; clearTimeout(tajmer);
      brojStop();
      ugasiHls();
      video.onplaying = null; try { video.pause(); } catch (e) { /* */ }
      video.removeAttribute("src"); try { video.load(); } catch (e) { /* */ }
      platno.hidden = true; brojEl.hidden = true;
      postavi("mirno");          // van fokusa se ništa ne proverava ni ne prenosi
    }
    function pauzirajUzivo(p) {
      if (!uzivo || stanje !== "radi") return;
      if (p) { if (hls) hls.stopLoad(); try { video.pause(); } catch (e) {} }
      else { if (hls) hls.startLoad(-1); video.play().catch(() => {}); }
    }

    // prekidači (iz kontrola u fokusu)
    function brojToggle() { brojOn = !brojOn; if (brojOn) brojStart(); else brojStop(); return brojOn; }
    function roiToggle() { roiOn = !roiOn; if (brojac) return roiOn; osveziRoi(); return roiOn; }

    return {
      pokreniUzivo, zaustaviUzivo, pauzirajUzivo, osveziRoi, brojToggle, roiToggle,
      imaRoi: () => !!roi, roiPokr: () => roi ? Math.round(povrsina(roi) * 100) : 0,
      stBroj: () => brojOn, stRoi: () => roiOn, stanje: () => stanje,
    };
  }

  // ---------------------------------------------------------------- strana
  let kamere = [];


  try {
    if (typeof KAPIJA !== "undefined") await KAPIJA.trazAdmina(main);
    const C = await fetch(`data/kamere.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`kamere.json: ${r.status}`); return r.json(); });
    PROKSI = (C.proksi || "").trim().replace(/\/+$/, "");
    const spisak = (C.kamere || []).filter((k) => k && k.url);
    main.innerHTML = `
      <header class="zaglavlje-strane pojava">
        <div><span class="eyebrow">Admin · drumski saobraćaj</span><h1>Kamere <em>uživo</em></h1></div>
        <div class="akcije">${LJ.stalnoUzivo(true)}</div>
      </header>
      <div class="km-mreza pojava">${spisak.map((k, i) => `
        <section class="kartica km-kartica" data-i="${i}" data-stanje="mirno">
          <div class="km-video${k.slika ? " ima-sliku" : " bez-slike"}" data-i="${i}">
            <div class="km-zum">
              <video muted playsinline preload="none" poster="${esc(k.slika || NEMA_SLIKE)}" aria-label="${esc(k.naziv)} — kamera"></video>
              <canvas class="km-platno" hidden></canvas>
            </div>
            <div class="km-broj" hidden></div>
            <div class="km-poruka" hidden></div>
            <div class="km-ucitava" role="status" aria-label="Učitavam prenos"><span class="km-krug"></span><span>Učitavam prenos…</span></div>
            <div class="km-alati">
              <button type="button" class="ikonica-dugme km-ceo" aria-label="Otvori uživo: ${esc(k.naziv)}" title="Otvori uživo (fokus)">${LJ.ik("expand")}</button>
            </div>
          </div>
          <div class="km-glava"><div><b>${esc(k.naziv)}</b><span class="sitno">${esc(k.opis || "")}</span></div><span class="km-stanje"></span></div>
        </section>`).join("")}</div>
      ${spisak.length ? "" : `<p class="sitno">U data/kamere.json nema kamera.</p>`}`;
    const kartice = [...main.querySelectorAll(".km-kartica")];
    kamere = kartice.map((el, i) => kamera(spisak[i], el));

    // --- fokus: uvećana jedna kamera; živ prenos, zum, pomeranje, strelice, ceo ekran, kontrole u snimku ---
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
      <div class="km-fokus-ram">
        <div class="km-kontrole">
          <button type="button" class="km-k-dug km-k-broj" aria-pressed="false">${IKONA_BROJ}<span>Brojanje</span></button>
          <button type="button" class="km-k-dug km-k-roi" aria-pressed="false">${IKONA_REGION}<span>Region</span></button>
          <div class="km-padaj">
            <button type="button" class="km-k-dug km-k-klase" aria-expanded="false" aria-haspopup="true">Broji: <b class="km-k-saz"></b> ▾</button>
            <div class="km-padaj-meni" role="menu" hidden>${Object.entries(SVE_KLASE).map(([kk, naz]) => `<label><input type="checkbox" value="${kk}"${izabraneKlase.has(kk) ? " checked" : ""}> ${naz}</label>`).join("")}</div>
          </div>
        </div>
      </div></div>`;
    document.body.appendChild(fokusEl);
    const ram = fokusEl.querySelector(".km-fokus-ram");
    const kDugBroj = fokusEl.querySelector(".km-k-broj"), kDugRoi = fokusEl.querySelector(".km-k-roi");
    const kKlaseDug = fokusEl.querySelector(".km-k-klase"), kKlaseMeni = fokusEl.querySelector(".km-padaj-meni"), kKlaseSaz = fokusEl.querySelector(".km-k-saz");
    const osveziSaz = () => { kKlaseSaz.textContent = izabraneKlase.size === Object.keys(SVE_KLASE).length ? "sve" : `${izabraneKlase.size}`; };
    osveziSaz();
    let uFokusu = -1, S = 1, X = 0, Y = 0, vuci = false, lx = 0, ly = 0;

    function osveziKontrole() {
      if (uFokusu < 0) return;
      const km = kamere[uFokusu];
      kDugBroj.setAttribute("aria-pressed", km.stBroj() ? "true" : "false"); kDugBroj.classList.toggle("ukljuceno", km.stBroj());
      kDugRoi.hidden = !km.imaRoi();
      kDugRoi.setAttribute("aria-pressed", km.stRoi() ? "true" : "false"); kDugRoi.classList.toggle("ukljuceno", km.stRoi());
    }
    function primeniZum() {
      const z = ram.querySelector(".km-zum"); if (!z) return;
      const r = ram.getBoundingClientRect(), mx = (S - 1) * r.width / 2, my = (S - 1) * r.height / 2;
      X = Math.max(-mx, Math.min(mx, X)); Y = Math.max(-my, Math.min(my, Y));
      z.style.transform = `translate(${X}px, ${Y}px) scale(${S})`;
      ram.classList.toggle("moze-vuci", S > 1);
    }
    function vratiVideo() {
      const kart = kartice[uFokusu], vid = ram.querySelector(".km-video");
      if (vid) { const z = vid.querySelector(".km-zum"); if (z) z.style.transform = ""; kart.insertBefore(vid, kart.querySelector(".km-glava")); }
      kart.classList.remove("u-fokusu");
      kamere[uFokusu].zaustaviUzivo();   // prenos i brojanje staju kad se napusti kamera
    }
    function otvoriFokus(i) {
      if (uFokusu === i) return;
      if (uFokusu >= 0) vratiVideo();
      ram.insertBefore(kartice[i].querySelector(".km-video"), ram.firstChild);
      kartice[i].classList.add("u-fokusu");
      fokusEl.querySelector(".km-fokus-ime").textContent = spisak[i].naziv;
      fokusEl.querySelector(".km-fokus-roi").textContent = kamere[i].imaRoi() ? `· region: ${kamere[i].roiPokr()}% slike` : "";
      S = 1; X = 0; Y = 0; primeniZum();
      fokusEl.hidden = false; document.body.classList.add("km-fokus-otvoren"); uFokusu = i;
      osveziKontrole();
      kamere[i].pokreniUzivo();
    }
    function zatvoriFokus() {
      if (uFokusu < 0) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      vratiVideo();
      fokusEl.hidden = true; document.body.classList.remove("km-fokus-otvoren");
      S = 1; X = 0; Y = 0; uFokusu = -1;
    }
    const prebaci = (d) => { if (uFokusu >= 0 && kartice.length > 1) otvoriFokus((uFokusu + d + kartice.length) % kartice.length); };
    function ceoEkran() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (fokusEl.requestFullscreen) fokusEl.requestFullscreen().catch(() => {}); }

    ram.addEventListener("wheel", (e) => {
      if (uFokusu < 0) return; e.preventDefault();
      const r = ram.getBoundingClientRect(), cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15, nS = Math.min(8, Math.max(1, S * f)), k2 = nS / S;
      X = cx - (cx - X) * k2; Y = cy - (cy - Y) * k2; S = nS; if (S <= 1.001) { S = 1; X = 0; Y = 0; }
      primeniZum();
    }, { passive: false });
    ram.addEventListener("pointerdown", (e) => { if (uFokusu < 0 || S <= 1 || e.target.closest(".km-kontrole")) return; vuci = true; lx = e.clientX; ly = e.clientY; try { ram.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
    ram.addEventListener("pointermove", (e) => { if (!vuci) return; X += e.clientX - lx; Y += e.clientY - ly; lx = e.clientX; ly = e.clientY; primeniZum(); });
    const krajVuce = () => { vuci = false; };
    ram.addEventListener("pointerup", krajVuce); ram.addEventListener("pointercancel", krajVuce);

    fokusEl.addEventListener("click", (e) => {
      if (e.target.closest(".km-fokus-x")) return zatvoriFokus();
      if (e.target.closest(".km-fokus-prev")) return prebaci(-1);
      if (e.target.closest(".km-fokus-next")) return prebaci(1);
      if (e.target.closest(".km-fokus-cel")) return ceoEkran();
      if (e.target.closest(".km-k-broj")) { kamere[uFokusu].brojToggle(); osveziKontrole(); return; }
      if (e.target.closest(".km-k-roi")) { kamere[uFokusu].roiToggle(); osveziKontrole(); return; }
      if (e.target.closest(".km-k-klase")) { e.stopPropagation(); const o = kKlaseMeni.hidden; kKlaseMeni.hidden = !o; kKlaseDug.setAttribute("aria-expanded", o ? "true" : "false"); return; }
      if (e.target.closest(".km-padaj-meni")) return;
      if (e.target === fokusEl) zatvoriFokus();
    });
    kKlaseMeni.addEventListener("change", (e) => {
      const cb = e.target.closest("input"); if (!cb) return;
      if (cb.checked) izabraneKlase.add(cb.value); else izabraneKlase.delete(cb.value);
      try { localStorage.setItem(KLJUC_KLASE, JSON.stringify([...izabraneKlase])); } catch (x) { /* */ }
      osveziSaz();
    });
    addEventListener("keydown", (e) => {
      if (uFokusu < 0) return;
      if (e.key === "Escape") zatvoriFokus();
      else if (e.key === "ArrowLeft") prebaci(-1);
      else if (e.key === "ArrowRight") prebaci(1);
    });
    addEventListener("resize", () => { if (uFokusu >= 0) kamere[uFokusu].osveziRoi(); });
    document.addEventListener("visibilitychange", () => { if (uFokusu >= 0) kamere[uFokusu].pauzirajUzivo(document.hidden); });

    // klik na karticu / dugme → otvori fokus (klik na kontrole u fokusu ide gore)
    document.addEventListener("click", (e) => {
      if (e.target.closest(".km-fokus")) return;
      const vidEl = e.target.closest(".km-video"); if (!vidEl) return;
      otvoriFokus(+vidEl.dataset.i);
    });
    LJ.pojave(main);
  } catch (e) {
    NS.greska(main, e);
  }
})();
