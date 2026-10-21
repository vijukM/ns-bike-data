/* Strana mape: velika mapa sa spiskom stanica (pretraga, filter po stanju)
   i režim „dan na mapi“ (datum, klizač sata, ▶, satni grafik grada). URL: ?rezim=dan&dan=2025-09-05&sat=7&id=23a */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const q = new URLSearchParams(location.search);
  try {
    const [s, g] = await Promise.all([NS.stanice(), NS.json("grad_dnevno.json")]);
    let izabrana = null;
    const ctl = MAPA.napravi(document.getElementById("mapa"), s, {
      podlogaEl: document.getElementById("podloga"), stazeEl: document.getElementById("staze-cip"),
      naFokus: (serija) => { izabrana = serija; crtajSpisak(); if (serija) skrolujDo(serija); },
    });
    MAPA.legenda(document.getElementById("legenda-mape"), s);
    document.getElementById("stanje-period").innerHTML = MAPA.info(`Stanje svakog brojača računa se iz poslednjih 30 dana sa podacima (${s.stanje_period}).`);

    // spisak + filter (filter i pretraga važe i za pinove na mapi)
    let filter = "sve", upit = "", vrednostiSata = null;
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
      document.getElementById("spisak-kolona").innerHTML = vrednostiSata
        ? `u izabranom satu${MAPA.info("broj biciklista koji je brojač izbrojao u izabranom satu izabranog dana")}`
        : `prosek / dan${MAPA.info("prosečan broj biciklista dnevno: kompletni dani, 1. 9. 2025. – 31. 8. 2026. (poslednjih 12 meseci istorije)")}`;
      el.innerHTML = red.map((r) => {
        const v = vrednostiSata ? vrednostiSata[r.serija] : null;
        const desno = vrednostiSata ? (v == null ? "—" : NS.broj(v)) : (r.prosek_12m != null && r.stanje !== "neispravan" ? NS.broj(r.prosek_12m) : "—");
        return `<button type="button" data-s="${r.serija}" class="${r.serija === izabrana ? "izabran" : ""}" role="listitem">
          <img src="${NS.pin(r.serija === izabrana ? "izabrana" : r.stanje)}" alt=""><span>${r.serija} · ${r.naziv}<small>${r.smerovi[0]}</small></span>
          <span class="vrednost-reda" title="${vrednostiSata ? "biciklista u izabranom satu" : "prosek biciklista dnevno (12 meseci)"}">${desno}</span></button>`;
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

    // dan na mapi
    const dan = danNaMapi(s, g, ctl, (vrednosti) => { vrednostiSata = vrednosti; crtajSpisak(); });
    NS.prekidac(document.getElementById("rezim"), [["stanje", "Stanje brojača"], ["dan", "Dan na mapi"]], q.get("rezim") === "dan" ? "dan" : "stanje",
      (v) => postaviRezim(v));
    function postaviRezim(v) {
      document.getElementById("dan-panel").classList.toggle("skriveno", v !== "dan");
      if (v === "dan") dan.ukljuci(q.get("dan"), q.get("sat"));
      else { dan.iskljuci(); vrednostiSata = null; ctl.prikaziStanje().then(crtajSpisak); }
      setTimeout(() => ctl.mapa.resize(), 50);
    }
    postaviRezim(q.get("rezim") === "dan" ? "dan" : "stanje");
  } catch (e) {
    NS.greska(main, e);
  }
})();

// ---------------------------------------------------------------- dan na mapi
function danNaMapi(s, g, ctl, naPromenu) {
  const datumEl = document.getElementById("dan-datum");
  const satEl = document.getElementById("dan-sat");
  const pustiEl = document.getElementById("dan-pusti");
  const stanjeEl = document.getElementById("dan-stanje");
  let dan = null, tajmer = null, mini = null, ukljucen = false;
  const dugmePusti = (igra) => { pustiEl.innerHTML = `${LJ.ik(igra ? "pause" : "play")}${igra ? "Zaustavi" : "Pusti dan"}`; };
  dugmePusti(false);

  // dostupni dani: istorija 2021–08/2026 + satni obračun scraper-a (sati_dostupno.json) + danas (data/danas.json)
  let dostupno = { od: "2021-01-01", do: "2026-08-31", prazni_dani: [] }, danasD = null;
  const spremno = Promise.all([
    NS.json("sati_dostupno.json").then((x) => { dostupno = x; }).catch(() => {}),
    fetch(`data/danas.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((x) => { danasD = x; }).catch(() => {}),
  ]).then(() => {
    datumEl.min = dostupno.od;
    datumEl.max = danasD && danasD.datum > dostupno.do ? danasD.datum : dostupno.do;
  });
  const prazan = (iso) => (dostupno.prazni_dani || []).includes(iso);
  /** Današnji dan iz danas.json u obliku mesečnog fajla (samo sati koji su prošli). */
  function mesDanas() {
    const D = danasD, v = {}, r = {};
    for (const [k, x] of Object.entries(D.serije)) {
      v[k] = x.sati;
      const kod = x.sati.map((y) => (x.stanje === "neispravan" ? 8 : y == null ? 1 : 0));
      r[k] = []; let i = 0;
      while (i < kod.length) { if (!kod[i]) { i++; continue; } let j = i; while (j < kod.length && kod[j] === kod[i]) j++; r[k].push([i, j - i, kod[i]]); i = j; }
    }
    return { pocetak_utc: D.pocetak_utc, dani: [[D.datum, 0, Math.max(1, D.sati_gotovo)]], v, r };
  }
  /** Sledeći dan sa podacima u smeru (−1 / +1); preskače rupu bez podataka. */
  function korak(iso, smer) {
    let d = NS.dodajDane(iso, smer);
    for (let k = 0; k < 400 && prazan(d) && d >= datumEl.min && d <= datumEl.max; k++) d = NS.dodajDane(d, smer);
    return d;
  }
  async function ucitaj(iso) {
    await spremno;
    if (iso < datumEl.min) iso = datumEl.min;
    if (iso > datumEl.max) iso = datumEl.max;
    datumEl.value = iso;
    const jeDanas = danasD && iso === danasD.datum;
    const mes = jeDanas ? mesDanas() : await NS.json(`sati/${iso.slice(0, 7)}.json`);
    const [, i0, n] = mes.dani.find((x) => x[0] === iso);
    const oznake = NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n);
    const zbir = [], ok = [], bez = [];
    for (let k = 0; k < n; k++) {
      let z = 0, o = 0, x = 0;
      for (const ser of Object.keys(mes.v)) {
        const v = mes.v[ser][i0 + k];
        if (v == null) { if (NS.razlogSata(mes.r[ser], i0 + k) !== 9) x++; } else { z += v; o++; }
      }
      zbir.push(o ? z : null); ok.push(o); bez.push(x);
    }
    dan = { iso, mes, i0, n, oznake, zbir, ok, bez, jeDanas, prazan: prazan(iso) };
    document.getElementById("dan-pre").disabled = iso <= datumEl.min;
    document.getElementById("dan-posle").disabled = iso >= datumEl.max;
    satEl.max = n - 1;
    if (+satEl.value > n - 1) satEl.value = n - 1;
    if (mini) mini.osvezi(); else crtajMini();
    prikazi(+satEl.value);
  }
  function prikazi(k) {
    if (!dan || !ukljucen) return;
    ctl.prikaziSat(dan.mes, dan.i0 + k, dan.oznake[k].oznaka);
    const vr = {};
    for (const r of s.serije) vr[r.serija] = dan.mes.v[r.serija] ? dan.mes.v[r.serija][dan.i0 + k] : null;
    naPromenu(vr);
    stanjeEl.innerHTML = `<b>${NS.datumDug(dan.iso)}</b>${dan.jeDanas ? ` <span class="sitno">(danas, do ${danasD.brojaci_do})</span>` : ""} · ${dan.oznake[k].oznaka}<br>` + (dan.prazan
      ? `<span style="color:var(--warning)">za ovaj dan nema podataka</span> — između istorije (do 31. 8. 2026.) i čitanja brojača uživo (od 9. 10. 2026.)`
      : dan.zbir[k] == null
      ? "nijedan brojač nema podatak za ovaj sat"
      : `<b>${NS.broj(dan.zbir[k])}</b> biciklista na ${dan.ok[k]} brojača${dan.bez[k] ? ` · <span style="color:var(--warning)">${dan.bez[k]} bez podataka</span>` : ""}`);
    if (mini) mini.osvezi();
  }
  function crtajMini() {
    mini = NS.grafik(document.getElementById("dan-grafik"), (b) => {
      if (!dan) return {};
      const k = +satEl.value;
      const maks = Math.max(...dan.zbir.filter((x) => x != null), 1);
      return {
        ...NS.osnova(b), animationDuration: 500,
        grid: { left: 46, right: 8, top: 26, bottom: 22 },
        xAxis: { type: "category", data: dan.oznake.map((o) => NS.dvaMesta(o.sat)), ...NS.osaX(b) },
        yAxis: { type: "value", name: "grad, po satu", splitNumber: 3, ...NS.osaY(b) },
        tooltip: { ...NS.osnova(b).tooltip, axisPointer: { type: "shadow", shadowStyle: { color: b.mreza, opacity: 0.5 } },
          formatter: (q) => { const i = q[0].dataIndex; return `${dan.oznake[i].oznaka}<br>` + (dan.zbir[i] == null ? "nema podataka" : `<b>${NS.broj(dan.zbir[i])}</b> · ${dan.ok[i]} brojača`); } },
        series: [
          { type: "bar", silent: true, barCategoryGap: "22%", data: dan.zbir.map((v) => (v == null ? maks : null)), itemStyle: { color: b.nema, opacity: 0.35 } },
          { type: "bar", barGap: "-100%", barCategoryGap: "22%", data: dan.zbir.map((v, i) => ({ value: v,
            itemStyle: { color: i === k ? b.primary : b["bicikl-blago"], borderRadius: [3, 3, 0, 0] } })) },
        ],
      };
    }, { odmah: true });
    mini.spreman.then(() => mini.ec.on("click", (p) => { satEl.value = p.dataIndex; prikazi(p.dataIndex); }));
  }
  function zaustavi() { clearInterval(tajmer); tajmer = null; dugmePusti(false); }
  pustiEl.addEventListener("click", () => {
    if (tajmer) { zaustavi(); return; }
    if (+satEl.value >= dan.n - 1) satEl.value = 0;
    dugmePusti(true);
    prikazi(+satEl.value);
    tajmer = setInterval(() => {
      const k = +satEl.value + 1;
      if (k > dan.n - 1) { zaustavi(); return; }
      satEl.value = k; prikazi(k);
    }, 650);
  });
  satEl.addEventListener("input", () => prikazi(+satEl.value));
  datumEl.addEventListener("change", () => { if (datumEl.value) { zaustavi(); ucitaj(datumEl.value); } });
  document.getElementById("dan-pre").addEventListener("click", () => { zaustavi(); ucitaj(korak(datumEl.value, -1)); });
  document.getElementById("dan-posle").addEventListener("click", () => { zaustavi(); ucitaj(korak(datumEl.value, 1)); });
  return {
    ukljuci(datum, sat) {
      ukljucen = true;
      spremno.then(() => {
        // podrazumevano danas, na poslednjem završenom satu (ili 07–08 h za druge dane)
        const iso = datum && /^\d{4}-\d\d-\d\d$/.test(datum) ? datum : (dan ? dan.iso : (danasD ? danasD.datum : dostupno.do));
        if (sat != null && /^\d+$/.test(sat)) satEl.value = sat;
        else if (!dan) satEl.value = danasD && iso === danasD.datum ? Math.max(0, danasD.sati_gotovo - 1) : 7;
        return ucitaj(iso);
      }).then(() => mini && mini.ec && mini.ec.resize());
    },
    iskljuci() { ukljucen = false; zaustavi(); },
  };
}
