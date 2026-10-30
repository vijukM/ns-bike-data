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
  // koje su kamere uključile brojanje vozila (pamti se u pregledaču)
  const KLJUC_BROJ = "ns-kamere-brojac";
  const brojOmogucen = (() => { try { return new Set(JSON.parse(localStorage.getItem(KLJUC_BROJ) || "[]")); } catch (e) { return new Set(); } })();
  const upisiBroj = () => { try { localStorage.setItem(KLJUC_BROJ, JSON.stringify([...brojOmogucen])); } catch (e) { /* */ } };

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
        brojac = await BROJAC.ukljuci(video, platno, naBroj);
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
    return { pokreni, vidljivost, tumbler: brojTumbler, stanje: () => stanje };
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
  async function preko(el) {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.querySelector("video").webkitEnterFullscreen) el.querySelector("video").webkitEnterFullscreen();   // iPhone
    } catch (e) { /* pregledač odbio */ }
  }

  try {
    if (typeof KAPIJA !== "undefined") await KAPIJA.trazAdmina(main);
    const C = await fetch(`data/kamere.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`kamere.json: ${r.status}`); return r.json(); });
    PROKSI = (C.proksi || "").trim().replace(/\/+$/, "");
    const spisak = (C.kamere || []).filter((k) => k && k.url);
    main.innerHTML = `
      <header class="zaglavlje-strane pojava">
        <div><span class="eyebrow">Admin · drumski saobraćaj</span><h1>Kamere <em>uživo</em></h1>
          <p class="uvod">Prenos sa kamera saobraćaja u Novom Sadu. Klik na kameru ili dugme ${LJ.ik("expand")} prikazuje je preko celog ekrana.
            Dugme ${IKONA_BROJ} uključuje brojanje vozila na toj kameri (radi na uređaju, ništa se ne šalje).</p></div>
        <div class="akcije"><span id="km-uzivo">${LJ.stalnoUzivo(true)}</span><span class="znacka" id="km-zbir">…</span></div>
      </header>
      <div class="km-mreza pojava">${spisak.map((k, i) => `
        <section class="kartica km-kartica" data-i="${i}" data-stanje="povezivanje">
          <div class="km-video${k.slika ? " ima-sliku" : " bez-slike"}">
            <video muted playsinline autoplay preload="none" poster="${esc(k.slika || NEMA_SLIKE)}" aria-label="${esc(k.naziv)} — prenos uživo"></video>
            <canvas class="km-platno" hidden></canvas>
            <div class="km-broj" hidden></div>
            <div class="km-poruka" hidden></div>
            <div class="km-alati">
              <button type="button" class="ikonica-dugme km-prebroj" aria-pressed="false" aria-label="Brojanje vozila: ${esc(k.naziv)}" title="Brojanje vozila (uključi/isključi)">${IKONA_BROJ}</button>
              <button type="button" class="ikonica-dugme km-ceo" aria-label="Preko celog ekrana: ${esc(k.naziv)}" title="Preko celog ekrana">${LJ.ik("expand")}</button>
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
    main.addEventListener("click", (e) => {
      const kartEl = e.target.closest(".km-kartica");
      if (!kartEl) return;
      if (e.target.closest(".km-prebroj")) { kamere[+kartEl.dataset.i].tumbler(); return; }
      if (e.target.closest(".km-ceo") || e.target.closest(".km-video")) preko(kartEl.querySelector(".km-video"));
    });
    LJ.pojave(main);
  } catch (e) {
    NS.greska(main, e);
  }
})();
