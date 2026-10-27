/* Strana mape: velika mapa sa spiskom stanica (pretraga, filter po stanju). URL: ?id=23a
   (dan sat po sat na mapi je na strani Danas uživo, dugme „Pusti dan“) */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const q = new URLSearchParams(location.search);
  try {
    const s = await NS.stanice();
    let izabrana = null;
    const ctl = MAPA.napravi(document.getElementById("mapa"), s, {
      podlogaEl: document.getElementById("podloga"), stazeEl: document.getElementById("staze-cip"),
      naFokus: (serija) => { izabrana = serija; crtajSpisak(); if (serija) skrolujDo(serija); },
    });
    MAPA.legenda(document.getElementById("legenda-mape"), s);
    document.getElementById("stanje-period").innerHTML = MAPA.info(`Stanje svakog brojača računa se iz poslednjih 30 dana sa podacima (${s.stanje_period}).`);

    // spisak + filter (filter i pretraga važe i za pinove na mapi)
    let filter = "sve", upit = "";
    const bez = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
    const brojevi = { sve: s.serije.length };
    for (const r of s.serije) brojevi[r.stanje] = (brojevi[r.stanje] || 0) + 1;
    const filterEl = document.getElementById("spisak-filter");
    filterEl.className = "cipovi";
    // redosled filtera: sve, radi, ne radi, delimično radi, neispravan (staje u dva reda)
    filterEl.innerHTML = [["sve", "Sve"], ...["radi", "ne_radi", "delimicno", "neispravan"].map((k) => [k, s.stanja[k]])].filter(([k]) => brojevi[k])
      .map(([k, t]) => `<button class="cip" data-k="${k}" aria-pressed="${k === filter}" style="--boja:var(--primary)"
        title="${k === "sve" ? "svi brojači" : (s.stanja_opis || {})[k] || ""}">${k === "sve" ? "" : `<img src="${NS.pin(k)}" alt="">`}${t}<span class="broj">${brojevi[k]}</span></button>`).join("");
    // filter: null = nijedan (klik na već uključen filter ga gasi, pa se ne prikazuje nijedan brojač)
    function postaviFilter(k) {
      filter = k;
      filterEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === k)));
      crtajSpisak();
    }
    filterEl.addEventListener("click", (e) => { const d = e.target.closest("button"); if (d) postaviFilter(d.dataset.k === filter ? null : d.dataset.k); });
    document.getElementById("spisak-pretraga").addEventListener("input", (e) => { upit = bez(e.target.value); crtajSpisak(); });
    function crtajSpisak() {
      const el = document.getElementById("spisak");
      const red = s.serije.filter((r) => filter && (filter === "sve" || r.stanje === filter) && (!upit || bez(`${r.serija} ${r.naziv} ${r.smerovi.join(" ")}`).includes(upit)));
      ctl.filtriraj(filter === "sve" && !upit ? null : new Set(red.map((r) => r.serija)));
      document.getElementById("spisak-kolona").innerHTML = `prosek / dan${MAPA.info("prosečan broj biciklista dnevno: kompletni dani, 1. 9. 2025. – 31. 8. 2026. (poslednjih 12 meseci istorije)")}`;
      el.innerHTML = red.map((r) => {
        const desno = r.prosek_12m != null && r.stanje !== "neispravan" ? NS.broj(r.prosek_12m) : "—";
        return `<button type="button" data-s="${r.serija}" class="${r.serija === izabrana ? "izabran" : ""}" role="listitem">
          <img src="${NS.pin(r.serija === izabrana ? "izabrana" : r.stanje)}" alt=""><span>${r.serija} · ${r.naziv}<small>${r.smerovi[0]}</small></span>
          <span class="vrednost-reda" title="prosek biciklista dnevno (12 meseci)">${desno}</span></button>`;
      }).join("") || `<p class="sitno" style="padding:10px">${filter ? "Nema stanica za ovaj filter." : "Nijedan filter nije uključen — klikni na neki iznad."}</p>`;
    }
    const skrolujDo = (serija) => {
      const d = document.querySelector(`#spisak button[data-s="${CSS.escape(serija)}"]`);
      const sp = document.getElementById("spisak");
      if (d) sp.scrollTo({ top: d.offsetTop - sp.offsetTop - 40, behavior: "smooth" });
    };
    document.getElementById("spisak").addEventListener("click", (e) => {
      const d = e.target.closest("button[data-s]"); if (!d) return;
      if (izabrana === d.dataset.s) location.href = `stanica.html?id=${encodeURIComponent(d.dataset.s)}`;
      else ctl.fokus(d.dataset.s, { leti: true, skok: true });
    });
    crtajSpisak();
    MAPA.stanjeGrafik(document.getElementById("krofna"), s, (k) => {
      postaviFilter(k);
      document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    if (q.get("id") && s.serije.some((r) => r.serija === q.get("id"))) setTimeout(() => ctl.fokus(q.get("id"), { leti: true, skok: true }), 400);

  } catch (e) {
    NS.greska(main, e);
  }
})();
