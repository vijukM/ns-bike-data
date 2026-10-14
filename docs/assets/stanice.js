/* Tabela stanica (kao datatable): pretraga, filter po stanju, sortiranje, straničenje, izvoz CSV. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  try {
    const s = await NS.stanice();
    document.getElementById("period").textContent = s.stanje_period;
    const bez = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
    let upit = "", filter = "sve", sort = "serija", smer = 1, strana = 0, poStrani = 25;

    const brojevi = { sve: s.serije.length };
    for (const r of s.serije) brojevi[r.stanje] = (brojevi[r.stanje] || 0) + 1;
    const filterEl = document.getElementById("filter");
    filterEl.className = "cipovi";
    filterEl.innerHTML = [["sve", "Sve"], ["radi", "Radi"], ["delimicno", "Delimično"], ["ne_radi", "Ne radi"], ["neispravan", "Neispravan"]]
      .filter(([k]) => brojevi[k]).map(([k, t]) => `<button class="cip" data-k="${k}" aria-pressed="${k === filter}" style="--boja:var(--primary)">${t}<span class="broj">${brojevi[k]}</span></button>`).join("");
    filterEl.addEventListener("click", (e) => {
      const d = e.target.closest("button"); if (!d) return;
      filter = d.dataset.k; strana = 0;
      filterEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === d)));
      crtaj();
    });
    document.getElementById("pretraga").addEventListener("input", (e) => { upit = bez(e.target.value); strana = 0; crtaj(); });
    document.getElementById("po-strani").addEventListener("change", (e) => { poStrani = +e.target.value; strana = 0; crtaj(); });

    const kolone = [
      ["serija", "Stanica", (r) => [r.mesto, r.serija]],
      ["mesto", "Mesto", (r) => r.mesto, "broj"],
      ["stanje", "Stanje", (r) => ["radi", "delimicno", "ne_radi", "neispravan"].indexOf(r.stanje)],
      ["prosek", "Prosek / dan", (r) => r.prosek_12m ?? -1, "broj"],
      ["udeo", "Kompletnih dana", (r) => r.udeo_validnih_dana],
      ["k30", "Poslednjih 30", (r) => r.kompletnih_30d, "broj"],
      ["period", "Period rada", (r) => r.od],
      ["akcije", "", null],
    ];
    const tabela = document.getElementById("tabela");
    function redovi() {
      const k = kolone.find((x) => x[0] === sort);
      return s.serije.filter((r) => (filter === "sve" || r.stanje === filter) && (!upit || bez(`${r.serija} ${r.naziv} ${r.smerovi.join(" ")}`).includes(upit)))
        .sort((a, b) => {
          const x = k[2](a), y = k[2](b);
          return (Array.isArray(x) ? (x[0] - y[0]) || String(x[1]).localeCompare(y[1]) : typeof x === "number" ? x - y : String(x).localeCompare(String(y), "sr")) * smer;
        });
    }
    function crtaj() {
      const sve = redovi();
      const ukupno = sve.length, strane = Math.max(1, Math.ceil(ukupno / poStrani));
      strana = Math.min(strana, strane - 1);
      const deo = sve.slice(strana * poStrani, (strana + 1) * poStrani);
      tabela.innerHTML = `<thead><tr>${kolone.map(([id, t, f, c]) => `<th data-k="${f ? id : ""}" class="${c || ""}"
          aria-sort="${id === sort ? (smer > 0 ? "ascending" : "descending") : "none"}">${t}${id === sort ? (smer > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
        <tbody>${deo.map((r) => `<tr>
          <td><a class="stanica-celija" href="stanica.html?id=${encodeURIComponent(r.serija)}" style="color:inherit;text-decoration:none">
            <img src="${NS.pin(r.stanje)}" alt=""><span><b>${r.serija} · ${r.naziv}</b><small>${r.smerovi.join(" · ")}</small></span></a></td>
          <td class="broj mono">${r.mesto}</td>
          <td><span class="znacka tacka z-${r.stanje}">${s.stanja[r.stanje]}</span>${r.napomena ? `<small class="sitno" style="display:block;margin-top:4px">${r.napomena}</small>` : ""}</td>
          <td class="broj"><b>${r.stanje === "neispravan" ? "—" : NS.broj(r.prosek_12m)}</b></td>
          <td><div class="mini-traka"><div class="traka-napretka"><i style="width:${Math.round(100 * r.udeo_validnih_dana)}%;--boja:${r.udeo_validnih_dana > 0.9 ? "var(--success)" : r.udeo_validnih_dana > 0.7 ? "var(--warning)" : "var(--danger)"}"></i></div>
            <span class="mono">${Math.round(100 * r.udeo_validnih_dana)}%</span></div></td>
          <td class="broj mono">${r.kompletnih_30d}/30</td>
          <td class="mono">${NS.datum(r.od)}<br>${NS.datum(r.do)}</td>
          <td style="white-space:nowrap"><a class="ikonica-dugme" style="display:inline-grid" href="stanica.html?id=${encodeURIComponent(r.serija)}" title="Otvori stanicu">${LJ.ik("eye")}</a>
            <a class="ikonica-dugme" style="display:inline-grid" href="mapa.html?id=${encodeURIComponent(r.serija)}" title="Na mapi">${LJ.ik("pin")}</a></td>
        </tr>`).join("") || `<tr><td colspan="${kolone.length}" class="sitno">Nema stanica za ovu pretragu.</td></tr>`}</tbody>`;
      tabela.querySelectorAll("th[data-k]").forEach((th) => th.dataset.k && th.addEventListener("click", () => {
        if (sort === th.dataset.k) smer = -smer; else { sort = th.dataset.k; smer = ["prosek", "udeo", "k30"].includes(sort) ? -1 : 1; }
        crtaj();
      }));
      const od = ukupno ? strana * poStrani + 1 : 0, do_ = Math.min(ukupno, (strana + 1) * poStrani);
      document.getElementById("stranicenje").innerHTML = `<span>Prikazano <b>${od}–${do_}</b> od <b>${ukupno}</b></span>
        <div class="dugmad"><button data-p="${strana - 1}" ${strana === 0 ? "disabled" : ""} aria-label="Prethodna">‹</button>
        ${Array.from({ length: strane }, (_, i) => `<button data-p="${i}" aria-current="${i === strana}">${i + 1}</button>`).join("")}
        <button data-p="${strana + 1}" ${strana >= strane - 1 ? "disabled" : ""} aria-label="Sledeća">›</button></div>`;
    }
    document.getElementById("stranicenje").addEventListener("click", (e) => {
      const d = e.target.closest("button[data-p]"); if (!d || d.disabled) return;
      strana = +d.dataset.p; crtaj();
    });
    document.getElementById("izvoz").addEventListener("click", () => {
      const zag = ["serija", "mesto", "naziv", "smerovi", "lat", "lon", "stanje", "prosek_12m", "udeo_validnih_dana", "kompletnih_30d", "od", "do", "napomena"];
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [zag.join(","), ...redovi().map((r) => zag.map((k) => esc(Array.isArray(r[k]) ? r[k].join(" | ") : r[k])).join(","))].join("\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      Object.assign(document.createElement("a"), { href: url, download: "stanice-novi-sad.csv" }).click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
    crtaj();
  } catch (e) {
    NS.greska(main, e);
  }
})();
