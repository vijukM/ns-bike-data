/* Strana „Danas uživo“: data/danas.json (pravi ga sajt/danas.py posle svakog satnog čitanja i posle svake prognoze).
   Sve je po lokalnom vremenu; sati idu redom od pocetak_utc (23, 24 ili 25 na dan promene vremena).
   „Prema prognozi“ poredi samo sate koji su prošli i za koje postoje i izbrojano i prognoza (zvanična, iz ponoći).
   Strana sama proverava novo čitanje na 5 min i crta ga bez ponovnog učitavanja. */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const IZVOR = "data/danas.json";
  const PROVERA_MS = 5 * 60e3, TON = 15;                  // ± % razlike od prognoze za zelenu / crvenu oznaku
  const STANJE = {
    radi: ["javlja", "var(--success)", "radi"], kasni: ["kasni", "var(--warning)", "delimicno"],
    nula: ["0 danas", "var(--danger)", "ne_radi"], nema_podataka: ["nema podataka", "var(--danger)", "ne_radi"],
    neispravan: ["neispravan", "var(--t-light)", "neispravan"],
  };
  let D = null, s = null, ctl = null;
  let izabrana = null, zbirno = false, saPrognozom = false, sort = { kol: "danas", smer: -1 };
  const g = {};

  async function ucitaj() {
    const r = await fetch(`${IZVOR}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`danas.json: HTTP ${r.status}`);
    const x = await r.json();
    x.uzivo = true;
    return x;
  }
  // ---------------------------------------------------------------- prošli dani
  // izvori: danas.json (danas, uživo) · data/dani/YYYY-MM-DD.json (od 9. 10. 2026., konačni snimak sa prognozom i vremenom)
  // · istorija sati/YYYY-MM.json + meteo_sati (2021 – 31. 8. 2026., bez prognoze)
  const danasLok = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
  let dostupno = { od: "2021-01-01", do: "2026-08-31", prazni_dani: [] }, arhiva = [], ziv = null;
  const prazan = (iso) => (dostupno.prazni_dani || []).includes(iso);
  async function ucitajDan(iso) {
    if (!iso || iso === danasLok() || (ziv && iso === ziv.datum)) return ziv || (ziv = await ucitaj());
    if (arhiva.includes(iso)) {
      const r = await fetch(`data/dani/${iso}.json?v=${Date.now() / 36e5 | 0}`);
      if (r.ok) { const x = await r.json(); x.uzivo = false; x.izvor = "arhiva"; return x; }
    }
    return izIstorije(iso);
  }
  /** Dan iz istorije (satni fajl meseca + izmereno vreme) u obliku danas.json. */
  async function izIstorije(iso) {
    const ym = iso.slice(0, 7);
    const [mes, met, pros] = await Promise.all([NS.json(`sati/${ym}.json`), NS.json(`meteo_sati/${ym}.json`).catch(() => null),
      NS.json("prosek_dana.json").catch(() => null)]);
    const dan = mes.dani.find((x) => x[0] === iso);
    if (!dan) throw new Error(`nema podataka za ${iso}`);
    const [, i0, n] = dan;
    const pocetak = new Date(Date.parse(mes.pocetak_utc) + i0 * 3600e3);
    const lok = NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n).map((o) => String(o.sat).padStart(2, "0"));
    const serije = {};
    for (const [k, v] of Object.entries(mes.v)) {
      const sati = v.slice(i0, i0 + n);
      const neispravan = sati.every((x, j) => x == null && NS.razlogSata(mes.r[k], i0 + j) === 8);
      const kodovi = sati.map((x, j) => (x == null ? NS.razlogSata(mes.r[k], i0 + j) : 0));
      if (kodovi.every((c) => c === 9)) continue;                       // brojač još nije postavljen
      serije[k] = { sati, danas: sati.some((x) => x != null) ? zbir(sati) : null, juce: null, brojac: "24:00",
        stanje: neispravan ? "neispravan" : sati.every((x) => x == null) ? "nema_podataka" : "radi",
        ...(neispravan ? { napomena: "brojač neispravan od 04/2026" } : {}) };
    }
    const ukljucene = Object.keys(serije).filter((k) => serije[k].stanje !== "neispravan");
    const grad = lok.map((_, j) => { const v = ukljucene.map((k) => serije[k].sati[j]).filter((x) => x != null); return v.length ? zbir(v) : null; });
    const dow = (NS.danUNedelji(iso) + 6) % 7, mesec = +iso.slice(5, 7);
    const pr = pros && pros.grad[`${dow}-${mesec}`];
    const satLok = NS.satneOznake(Date.parse(mes.pocetak_utc), i0, n).map((o) => o.sat);
    return { uzivo: false, izvor: "istorija", datum: iso, pocetak_utc: pocetak.toISOString().slice(0, 16) + "Z", sati: lok, sati_gotovo: n,
      grad, serije, danas: zbir(ukljucene.map((k) => serije[k].danas || 0)), juce: null, ove_godine: null, brojaci_do: "24:00",
      prognoza: { zvanicna: null, najnovija: null }, prosek_isti_dan: pr ? satLok.map((h) => pr[h]) : null,
      vreme: met ? { istorija: true, preuzeto_utc: null, temperatura: met.temp.slice(i0, i0 + n), padavine: met.pad.slice(i0, i0 + n),
        oblacnost: null, vetar: null, vlaznost: null, zracenje: null, osecaj: null } : null };
  }
  function urlDana(iso) {
    const u = new URL(location.href);
    if (iso) u.searchParams.set("dan", iso); else u.searchParams.delete("dan");
    history.replaceState(null, "", u);
  }
  function korakDana(iso, smer, min, max) {
    let d = NS.dodajDane(iso, smer);
    for (let i = 0; i < 400 && prazan(d) && d > min && d < max; i++) d = NS.dodajDane(d, smer);
    return d;
  }

  // ---------------------------------------------------------------- izvedeno
  const zbir = (a) => a.reduce((x, y) => x + (y || 0), 0);
  const pct = (a, b) => (b > 0 ? (100 * (a - b)) / b : null);
  const znak = (p) => (p == null ? "—" : `${p > 0.5 ? "+" : p < -0.5 ? "−" : "±"}${NS.broj(Math.abs(Math.round(p)))} %`);
  const ton = (p) => (p == null ? null : p > TON ? "vise" : p < -TON ? "manje" : null);
  const sat = (iso) => new Date(iso.replace(/Z?$/, "Z")).toLocaleTimeString("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" });
  const prognoza = () => D.prognoza.zvanicna || D.prognoza.najnovija;
  const najnovija = () => D.prognoza.najnovija || D.prognoza.zvanicna;
  const oznake = () => NS.satneOznake(Date.parse(D.pocetak_utc), 0, D.sati.length);

  /** X osa po satima: stubić zauzima ceo sat (između oznaka h i h+1), oznake stoje na granicama sati.
      Osa 0 = kategorije (stubići, linije u sredini sata, hover po satu); osa 1 = vrednosti 0…n samo za oznake i „sada“. */
  function osaSati(b, korak = 1) {
    const n = D.sati.length, kraj = String((+D.sati[n - 1] + 1) % 24).padStart(2, "0");
    return [
      { type: "category", data: D.sati, boundaryGap: true, axisLine: { lineStyle: { color: b.osa } },
        axisTick: { show: true, alignWithLabel: false, interval: 0, lineStyle: { color: b.osa } }, axisLabel: { show: false } },
      { type: "value", min: 0, max: n, interval: korak, position: "bottom", axisLine: { show: false }, axisTick: { show: false },
        splitLine: { show: false }, axisPointer: { show: false }, triggerEvent: false,
        axisLabel: { color: b["ink-3"], fontSize: 10.5, fontFamily: "JetBrains Mono", hideOverlap: true, formatter: (v) => (v >= n ? (kraj === "00" ? "24" : kraj) : D.sati[v]) } },
    ];
  }
  /** Tooltip se otvara ručno (hover() ispod) i stoji ~30 px desno-iznad miša, da ne pokriva stubić. */
  const TIP = { triggerOn: "none", position: (t, _p, _d, _r, vel) => {
    const [w, h] = vel.contentSize, [W, H] = vel.viewSize;
    let x = t[0] + 30, y = t[1] - h - 24;
    if (x + w > W - 4) x = t[0] - w - 30;
    if (y < 4) y = Math.min(t[1] + 24, H - h - 4);
    return [Math.max(4, x), y];
  } };
  /** Sat ispod miša iz UDELA širine grafika (clientX − levo) / širina: tačno i uz CSS zoom sajta (0,9),
      skaliranje ekrana ili uvećanje pregledača, gde se ECharts-ova računica položaja miša zna pomeriti. */
  function hover(gr) {
    gr.spreman.then(({ ec, el }) => {
      const tacka = (e) => {
        const r = el.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * ec.getWidth(), ((e.clientY - r.top) / r.height) * ec.getHeight()];
      };
      el.addEventListener("mousemove", (e) => {
        const [x, y] = tacka(e);
        const grid = ec.getModel().getComponent("grid").coordinateSystem.getRect();
        if (x < grid.x || x > grid.x + grid.width || y < grid.y - 10 || y > grid.y + grid.height + 20) { ec.dispatchAction({ type: "hideTip" }); return; }
        ec.dispatchAction({ type: "showTip", x, y });
      });
      el.addEventListener("mouseleave", () => ec.dispatchAction({ type: "hideTip" }));
    });
  }
  /** Prazna serija na brojčanoj osi: vertikalna linija „sada“ na granici poslednjeg završenog sata. */
  function linijaSada(b, saOznakom = true) {
    if (D.sati_gotovo >= D.sati.length) return [];
    return [{ type: "line", xAxisIndex: 1, data: [], silent: true, tooltip: { show: false },
      markLine: { symbol: "none", silent: true, animation: false, data: [{ xAxis: D.sati_gotovo }], lineStyle: { color: b["ink-3"], type: "solid", width: 1 },
        label: saOznakom ? { formatter: "sada", color: b["ink-2"], fontFamily: "JetBrains Mono", fontSize: 11, position: "insideEndTop" } : { show: false } } }];
  }

  /** Zašto sat nema izbrojano: traje, tek dolazi, čeka čitanje ili brojač nije javio. */
  function statusSata(i) {
    if (!D.uzivo) return "nema podataka";
    const od = Date.parse(D.pocetak_utc) + i * 3600e3, sada = Date.now();
    if (sada >= od && sada < od + 3600e3) return "sat još traje";
    if (od >= sada) return "budući sat";
    if (i >= D.sati_gotovo) return "čeka se sledeće čitanje";
    return "nema podataka";
  }
  function infoPrognoze() {
    const P = prognoza(), el = document.getElementById("prognoza-info");
    if (!P) { el.innerHTML = MAPA.info(D.uzivo ? "Prognoza za danas još nije izdata. Zvanična se izdaje u 01:03, osvežene u 07:03, 13:03 i 19:03."
      : "Za ovaj dan nema prognoze modela-v2: prognoze se čuvaju od 21. 10. 2026."); return; }
    const model = String(P.verzija_modela).replace(/ x /g, " × ").replace(/0,5/g, "0,5");
    el.innerHTML = MAPA.info(`Model ${model}: prosek 3 TFT mreže (medijana) i 3 XGBoost modela, učen na satnim podacima 2021–2026. `
      + (D.prognoza.zvanicna ? "Prikazana je zvanična prognoza iz ponoći (samo podaci do 24:00 juče). "
        : `Prikazano je izdanje u ${sat(P.izdato_utc)} (podaci do 24:00 juče + novija vremenska prognoza). `)
      + "Interval 10–90 % je iz TFT-a. Greška na test godini sa pravom vremenskom prognozom: RMSE 12,71 biciklista po satu i brojaču."
      + (D.prognoza.zvanicna && (D.prognoza.zvanicna.dopunjeni_sati || []).length
        ? ` Sati ${D.prognoza.zvanicna.dopunjeni_sati.map((i) => oznake()[i].oznaka).join(", ")} nemaju zvaničnu prognozu (nije izdata), pa je prikazano poslednje izdanje objavljeno pre početka tog sata.` : ""));
  }
  /** Izbor „Svi brojači“ ili jedan brojač — isti izgled kao na strani Grafici (dugme + panel sa pretragom). */
  function izborBrojaca() {
    const omot = document.getElementById("g-izbor");
    const naziv = Object.fromEntries(s.serije.map((x) => [x.serija, x.naziv]));
    const bez = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "dj");
    if (!omot.querySelector(".izbor-dugme")) {
      omot.innerHTML = `<button type="button" class="dugme malo izbor-dugme" aria-haspopup="true"></button>`;
      omot.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        const stari = omot.querySelector(".panel");
        if (stari) { stari.remove(); return; }
        const p = document.createElement("div");
        p.className = "panel izbor-stanica";
        p.innerHTML = `<input type="search" placeholder="Pretraži stanice…" aria-label="Pretraga stanica">
          <label class="red-izbora"><input type="radio" name="danas-brojac" value="" ${izabrana ? "" : "checked"}><b>Svi brojači (ceo grad)</b></label>
          <div class="spisak-izbora">${s.serije.filter((r) => D.serije[r.serija]).map((r) => `<label class="red-izbora" data-t="${bez(`${r.serija} ${naziv[r.serija]}`)}">
            <input type="radio" name="danas-brojac" value="${r.serija}" ${izabrana === r.serija ? "checked" : ""}><img src="${NS.pin((STANJE[D.serije[r.serija].stanje] || [])[2] || "radi")}" alt="">
            <span>${r.serija} · ${naziv[r.serija]}</span></label>`).join("")}</div>`;
        omot.appendChild(p);
        const q = p.querySelector("input[type=search]");
        q.addEventListener("input", () => {
          const t = bez(q.value);
          p.querySelectorAll(".spisak-izbora .red-izbora").forEach((l) => { l.style.display = !t || l.dataset.t.includes(t) ? "" : "none"; });
        });
        p.addEventListener("change", (ev) => { if (ev.target.name === "danas-brojac") { p.remove(); izaberi(ev.target.value, { skrol: false }); } });
        q.focus();
      });
    }
    omot.querySelector(".izbor-dugme").textContent = `${izabrana ? `Brojač: ${izabrana} · ${naziv[izabrana] || ""}` : "Svi brojači (ceo grad)"} ▾`;
  }

  /** Izbrojano prema prognozi na istim satima (prošli sati sa obe vrednosti). */
  function poredjenje(stv, pr) {
    let a = 0, b = 0, n = 0;
    for (let i = 0; i < D.sati_gotovo; i++) if (stv[i] != null && pr && pr[i] != null) { a += stv[i]; b += pr[i]; n++; }
    return { stv: a, prog: b, n, pct: n ? pct(a, b) : null };
  }
  function redSerije(k) {
    const x = D.serije[k], P = prognoza();
    const p = poredjenje(x.sati, P && P.serije[k]);
    return { k, ...x, prog: p.n ? p.prog : null, odst: x.stanje === "radi" && p.n ? p.pct : null };
  }

  // ---------------------------------------------------------------- zaglavlje
  function zaglavlje() {
    const izbor = document.getElementById("dan-izbor");
    izbor.value = D.datum;
    document.getElementById("dan-pre").disabled = D.datum <= izbor.min;
    document.getElementById("dan-posle").disabled = D.datum >= izbor.max;
    document.getElementById("dan-danas").disabled = !!D.uzivo;
    if (!D.uzivo) {
      const [dan, datum] = NS.datumDug(D.datum).split(", ");
      document.getElementById("danas-datum").textContent = `Pregled dana · ${D.izvor === "istorija" ? "istorija" : "konačni podaci"}`;
      document.getElementById("danas-naslov").innerHTML = `${dan}, <em>${datum}</em>`;
      document.getElementById("danas-uzivo").innerHTML = `<span class="danas-osvezeno">${D.izvor === "istorija"
        ? "očišćeni satni podaci iz istorije (master rada)" : `čitanja brojača · poslednje u <b>${D.citanje_lokalno}</b>`}</span>`;
      const ob = document.getElementById("danas-obavestenje");
      ob.classList.toggle("skriveno", !prazan(D.datum));
      ob.textContent = "Za ovaj dan nema podataka — između istorije (do 31. 8. 2026.) i čitanja brojača uživo (od 9. 10. 2026.).";
      return;
    }
    document.getElementById("danas-naslov").innerHTML = "Danas <em>uživo</em>";
    document.getElementById("danas-datum").textContent = `Pregled · ${NS.datumDug(D.datum)}`;
    const starost = (Date.now() - Date.parse(D.citanje_utc)) / 60e3;
    const sledece = Math.max(0, 60 - starost);
    const staro = starost > 75;
    document.getElementById("danas-uzivo").innerHTML = `${LJ.uzivoZnak()}
      <span class="danas-osvezeno">čitanje u <b>${D.citanje_lokalno}</b> · brojači do <b>${D.brojaci_do}</b>
        · ${staro ? `<span class="upozorenje">pre ${Math.round(starost)} min</span>` : `sledeće oko <b>${sat(new Date(Date.parse(D.citanje_utc) + 3600e3).toISOString())}</b>`}</span>
      <span class="danas-traka" title="do sledećeg čitanja"><span style="width:${staro ? 100 : Math.round(100 * (1 - sledece / 60))}%"></span></span>`;
    LJ.osveziUzivo();
    const ob = document.getElementById("danas-obavestenje");
    const danasLok = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
    ob.classList.toggle("skriveno", D.datum === danasLok);
    if (D.datum !== danasLok) ob.textContent = `Prikazan je ${NS.datum(D.datum)} — prvo čitanje za danas stiže u 00:02 posle ponoći.`;
  }

  // ---------------------------------------------------------------- KPI
  function kpiProsli() {
    const P = prognoza();
    const ser = Object.values(D.serije);
    const javlja = ser.filter((x) => x.stanje === "radi").length;
    const p = poredjenje(D.grad, P && P.grad.pred);
    const pr = poredjenje(D.grad, D.prosek_isti_dan);
    const dan = NS.datumDug(D.datum).split(",")[0].toLowerCase();
    const problemi = {};
    for (const [k, x] of Object.entries(D.serije)) if (x.stanje !== "radi") (problemi[x.stanje] = problemi[x.stanje] || []).push(k);
    const k = (boja, ikona, naslov, delta, vrednost, dole) => `<div class="kpi ${boja}"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
      <span class="naslov">${naslov}</span>${delta ? `<span class="kpi-delta">${delta}</span>` : ""}</div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
    const boja = (x) => (x == null ? "c-plava" : x > 5 ? "c-zelena" : x < -5 ? "c-narandzasta" : "c-plava");
    document.getElementById("kpi").innerHTML = [
      k("c-plava", "activity", "Ceo dan", D.izvor === "istorija" ? "istorija" : "konačno", NS.broj(D.danas),
        `na <b>${javlja}/${ser.length}</b> brojača${D.juce != null ? ` · dan pre <b>${NS.broj(D.juce)}</b>` : ""}`),
      k(boja(p.pct), "chart", "Prema prognozi", p.pct == null ? "" : D.prognoza.zvanicna ? "iz ponoći" : "osvežena",
        p.pct == null ? "—" : `${znak(p.pct).replace(" %", "")}<sup>%</sup>`,
        p.pct == null ? (D.izvor === "istorija" ? "prognoza se izdaje od 10/2026" : "za ovaj dan nema prognoze model-v2 (od 21. 10. 2026.)")
          : `prognoza za iste sate: <b>${NS.broj(Math.round(p.prog))}</b>`),
      k(boja(pr.pct), "target", `Prema prosečnom danu`, "", pr.pct == null ? "—" : `${znak(pr.pct).replace(" %", "")}<sup>%</sup>`,
        pr.pct == null ? "nema proseka" : `prosečan ${dan} u ovom mesecu: <b>${NS.broj(Math.round(pr.prog))}</b>${MAPA.info("Isti sati, prosek istog dana u nedelji i istog meseca, 9/2024–8/2026, bez praznika.")}`),
      k(javlja === ser.length ? "c-zelena" : "c-narandzasta", "pin", "Brojači", "", `${javlja}<sup>/${ser.length}</sup>`,
        Object.keys(problemi).length ? Object.entries(problemi).map(([st, l]) => `${STANJE[st][0]}: <b>${l.join(", ")}</b>`).join(" · ") : "svi su radili"),
    ].join("");
  }
  function kpi() {
    if (!D.uzivo) { kpiProsli(); return; }
    const P = prognoza(), N = najnovija();
    const ser = Object.values(D.serije);
    const javlja = ser.filter((x) => x.stanje === "radi").length;
    const p = poredjenje(D.grad, P && P.grad.pred);
    const doSata = D.sati_gotovo < D.sati.length ? `${D.sati[D.sati_gotovo]} h` : "ponoći";
    let ostatak, intervalTxt, izvorOstatka;
    if (N) {
      const od = D.sati_gotovo;
      ostatak = zbir(N.grad.pred.slice(od));
      intervalTxt = `${NS.broj(D.danas + zbir(N.grad.q10.slice(od)))} – ${NS.broj(D.danas + zbir(N.grad.q90.slice(od)))}`;
      izvorOstatka = `izbrojano + prognoza (izdata u ${sat(N.izdato_utc)})`;
    } else if (D.prosek_isti_dan) {
      ostatak = zbir(D.prosek_isti_dan.slice(D.sati_gotovo));
      izvorOstatka = "izbrojano + prosečan isti dan";
    }
    const problemi = {};
    for (const [k, x] of Object.entries(D.serije)) if (x.stanje !== "radi") (problemi[x.stanje] = problemi[x.stanje] || []).push(k);
    const k = (boja, ikona, naslov, delta, vrednost, dole) => `<div class="kpi ${boja}"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
      <span class="naslov">${naslov}</span>${delta ? `<span class="kpi-delta">${delta}</span>` : ""}</div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
    document.getElementById("kpi").innerHTML = [
      k("c-plava", "activity", `Danas do ${doSata}`, "uživo", NS.broj(D.danas),
        `na <b>${javlja}/${ser.length}</b> brojača · juče ceo dan <b>${NS.broj(D.juce)}</b>`),
      k(p.pct == null ? "c-plava" : p.pct > 5 ? "c-zelena" : p.pct < -5 ? "c-narandzasta" : "c-plava", "chart", "Prema prognozi",
        P ? (D.prognoza.zvanicna ? "iz ponoći" : "osvežena") : "",
        p.pct == null ? "—" : `${znak(p.pct).replace(" %", "")}<sup>%</sup>`,
        p.pct == null ? (P ? "još nema završenog sata sa prognozom" : "prognoza za danas još nije izdata")
          : `prognoza za iste sate: <b>${NS.broj(Math.round(p.prog))}</b>${MAPA.info("Poređenje samo za sate koji su prošli i za koje postoje i izbrojano i prognoza. Zvanična prognoza je izdata u ponoć, samo iz podataka do 24:00 juče.")}`),
      k("c-ljubicasta", "target", "Očekuje se do ponoći", "", ostatak == null ? "—" : `~${NS.broj(Math.round((D.danas + ostatak) / 10) * 10)}`,
        ostatak == null ? "nema prognoze ni proseka" : `${izvorOstatka}${intervalTxt ? ` · <b>${intervalTxt}</b>${MAPA.info("Raspon je zbir intervala 10–90 % po brojačima, pa je širi od stvarne nesigurnosti za ceo grad.")}` : ""}`),
      k(javlja === ser.length ? "c-zelena" : "c-narandzasta", "pin", "Brojači", "", `${javlja}<sup>/${ser.length}</sup>`,
        Object.keys(problemi).length ? Object.entries(problemi).map(([st, l]) => `${STANJE[st][0]}: <b>${l.join(", ")}</b>`).join(" · ") : "svi javljaju"),
    ].join("");
  }

  // ---------------------------------------------------------------- glavni grafik
  function nizovi() {
    const P = saPrognozom ? prognoza() : null;
    const stv = izabrana ? D.serije[izabrana].sati : D.grad;
    const pr = P ? (izabrana ? P.serije[izabrana] : P.grad.pred) : null;
    const q = P && !izabrana ? [P.grad.q10, P.grad.q90] : null;
    const pros = izabrana ? null : D.prosek_isti_dan;
    const proslo = stv.map((v, i) => (i < D.sati_gotovo ? v : null));
    if (!zbirno) return { stv: proslo, pr, q, pros };
    const kum = (a, do_ = a.length) => { let t = 0; return a.map((v, i) => (i < do_ ? (t += v || 0) : null)); };
    return { stv: kum(stv, D.sati_gotovo), pr: pr && kum(pr), q: null, pros: pros && kum(pros) };
  }
  function crtajGlavni(b) {
    const n = nizovi(), P = prognoza(), x = oznake();
    const boja = { stv: b.bicikl, pr: b.warning, pros: b["ink-3"] };
    document.getElementById("g-oznaka").textContent = izabrana ? `Brojač ${izabrana} · ${(s.serije.find((r) => r.serija === izabrana) || {}).naziv || ""}` : `Ceo grad · ${zbirno ? "zbirno od ponoći" : "sat po sat"}`;
    const kad = D.uzivo ? "Danas" : "Tog dana";
    document.getElementById("g-naslov").textContent = izabrana ? `${kad} prema prognozi za ovaj brojač` : `${kad} prema prognozi i prosečnom istom danu`;
    document.getElementById("mapa-oznaka").textContent = D.uzivo ? "Mapa danas" : `Mapa · ${NS.datum(D.datum)}`;
    izborBrojaca();
    document.getElementById("g-legenda").innerHTML = [
      `<span><i style="background:${boja.stv}"></i>izbrojano</span>`,
      n.pr ? `<span><i style="background:${boja.pr}"></i>prognoza (${D.prognoza.zvanicna ? "iz ponoći" : `izdata u ${sat(P.izdato_utc)}`})</span>` : "",
      n.q ? `<span><i style="background:${boja.pr};opacity:.3"></i>interval 10–90 %</span>` : "",
      n.pros ? `<span><i class="isprekidano" style="border-color:${boja.pros}"></i>prosečan ${NS.datumDug(D.datum).split(",")[0].toLowerCase()} u ovom mesecu</span>` : "",
      saPrognozom && !P ? `<span class="sitno">prognoza za danas još nije izdata</span>` : "",
    ].join("");
    const serije = [
      { name: "izbrojano", type: zbirno ? "line" : "bar", data: n.stv, barMaxWidth: 22, itemStyle: { color: boja.stv, borderRadius: [4, 4, 0, 0] },
        lineStyle: { color: boja.stv, width: 3 }, symbol: "none", areaStyle: zbirno ? { color: boja.stv, opacity: 0.14 } : undefined, z: 3 },
      ...linijaSada(b),
    ];
    if (n.pr) serije.push({ name: "prognoza", type: "line", data: n.pr, symbol: "none", smooth: 0.3, lineStyle: { color: boja.pr, width: 2.5 }, itemStyle: { color: boja.pr }, z: 4 });
    if (n.q) serije.push(
      { name: "q10", type: "line", data: n.q[0], stack: "int", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      { name: "int", type: "line", data: n.q[1].map((v, i) => (v == null || n.q[0][i] == null ? null : v - n.q[0][i])), stack: "int", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: boja.pr, opacity: 0.16 }, silent: true, tooltip: { show: false } });
    if (n.pros) serije.push({ name: "prosečan isti dan", type: "line", data: n.pros, symbol: "none", smooth: 0.3, lineStyle: { color: boja.pros, width: 1.6, type: "dashed" }, itemStyle: { color: boja.pros } });
    const o = NS.osnova(b);
    return { ...o,
      grid: { left: 52, right: 12, top: 18, bottom: 28 },
      tooltip: { ...o.tooltip, ...TIP, axisPointer: { type: "shadow", shadowStyle: { color: b["ink-3"], opacity: 0.12 } }, formatter: (ps) => {
        ps = ps.filter((p) => p.axisIndex !== 1 && p.seriesType !== undefined && p.dataIndex != null);
        if (!ps.length) return "";
        const i = ps[0].dataIndex;
        return `<b>${x[i].oznaka}</b><br>` + ps.filter((p) => !["q10", "int"].includes(p.seriesName)).map((p) => `${p.marker}${p.seriesName}: <b>${
          p.value == null ? (p.seriesName === "izbrojano" ? statusSata(i) : "—") : NS.broj(Math.round(p.value))}</b>`).join("<br>")
          + (n.q && !zbirno && P.grad.q10[i] != null ? `<br><span style="opacity:.7">interval ${NS.broj(Math.round(P.grad.q10[i]))} – ${NS.broj(Math.round(P.grad.q90[i]))}</span>` : "");
      } },
      xAxis: osaSati(b),
      yAxis: { type: "value", ...NS.osaY(b) },
      series: serije,
    };
  }

  // ---------------------------------------------------------------- vreme
  // vreme: šta može da se prikaže (k = ključ u danas.json → vreme); os: 0 °C (vidljiva), 1 % (vidljiva), ostale skrivene
  const VREME = [
    { k: "temperatura", ime: "temperatura", jed: "°C", tip: "line", os: 0, boja: (b) => b.temp },
    { k: "osecaj", ime: "osećaj temperature", jed: "°C", tip: "line", os: 0, boja: (b) => b.temp, crtica: true },
    { k: "oblacnost", ime: "oblačnost", jed: "%", tip: "bar", os: 1, boja: (b) => b["ink-3"], providno: 0.28 },
    { k: "padavine", ime: "kiša", jed: "mm/h", tip: "bar", os: 2, boja: (b) => b.kisa, dec: true },
    // vetar i zračenje na desnoj osi (%): 100 % = 99,9. percentil satnih vrednosti u Novom Sadu 2021–2026
    // (vetar: medijana 8,4, p99,9 30,2, najviše 38,8 km/h; zračenje: p99,9 906, najviše 939 W/m²) — ekstremi idu do vrha
    { k: "vetar", ime: "vetar", jed: "km/h", tip: "line", os: 1, puna: 30, boja: (b) => b["tip-3"] },
    { k: "vlaznost", ime: "vlažnost vazduha", jed: "%", tip: "line", os: 1, boja: () => (NS.tamna() ? "#86efac" : "#22c55e") },
    { k: "zracenje", ime: "sunčevo zračenje", jed: "W/m²", tip: "line", os: 1, puna: 900, boja: (b) => b.warning, povrsina: true },
  ];
  let vremeIzbor = new Set(["temperatura", "oblacnost", "padavine"]);
  try { const z = JSON.parse(localStorage.getItem("ns-danas-vreme") || "null"); if (Array.isArray(z) && z.length) vremeIzbor = new Set(z); } catch (e) { /* */ }
  const imaVreme = (v) => D.vreme && Array.isArray(D.vreme[v.k]) && D.vreme[v.k].some((x) => x != null);

  function crtajVreme(b) {
    const V = D.vreme, x = oznake();
    if (!V) return { title: { text: "nema vremenske prognoze", left: "center", top: "middle", textStyle: { color: b["ink-3"], fontSize: 13 } } };
    const izabrane = VREME.filter((v) => vremeIzbor.has(v.k) && imaVreme(v));
    const ima = (os) => izabrane.some((v) => v.os === os);
    const o = NS.osnova(b);
    const kisaMax = Math.max(4, ...V.padavine.filter((v) => v != null));
    const skrivena = (extra = {}) => ({ type: "value", show: false, min: 0, ...extra });
    return { ...o,
      grid: { left: ima(0) ? 36 : 14, right: ima(1) ? 40 : 14, top: 14, bottom: 26 },
      tooltip: { ...o.tooltip, ...TIP, axisPointer: { type: "shadow", shadowStyle: { color: b["ink-3"], opacity: 0.12 } },
        formatter: (ps) => (ps = ps.filter((p) => p.axisIndex !== 1 && p.dataIndex != null && p.seriesName)).length === 0 ? "" : `<b>${x[ps[0].dataIndex].oznaka}</b><br>`
          + ps.map((p) => { const v = VREME.find((z) => z.ime === p.seriesName), val = V[v.k][p.dataIndex];
            return `${p.marker}${p.seriesName}: <b>${val == null ? "—" : `${v.dec || v.jed === "°C" ? NS.dec(val) : NS.broj(Math.round(val))} ${v.jed}`}</b>`; }).join("<br>") },
      xAxis: osaSati(b),
      yAxis: [{ type: "value", show: ima(0), scale: true, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], fontSize: 10.5, formatter: "{value}°" } }) },
        { type: "value", show: ima(1), min: 0, max: 100, ...NS.osaY(b, { splitLine: { show: !ima(0) }, axisLabel: { color: b["ink-3"], fontSize: 10.5, formatter: "{value} %" } }) },
        skrivena({ max: kisaMax * 1.6 }), skrivena(), skrivena()],
      series: [
        ...izabrane.map((v) => v.tip === "bar"
          ? { name: v.ime, type: "bar", yAxisIndex: v.os, data: V[v.k], barGap: "-100%", barWidth: v.k === "padavine" ? "40%" : "70%",
              itemStyle: { color: v.boja(b), opacity: v.providno || 1, borderRadius: [3, 3, 0, 0] }, z: v.k === "padavine" ? 3 : 1 }
          : { name: v.ime, type: "line", yAxisIndex: v.os, data: v.puna ? V[v.k].map((z) => (z == null ? null : Math.min(100, (100 * z) / v.puna))) : V[v.k], symbol: "none", smooth: 0.3, z: 4,
              lineStyle: { color: v.boja(b), width: 2.4, type: v.crtica ? "dashed" : "solid" }, itemStyle: { color: v.boja(b) },
              areaStyle: v.povrsina ? { color: v.boja(b), opacity: 0.12 } : undefined }),
        ...linijaSada(b, false),
      ] };
  }
  function izborVremena() {
    const omot = document.getElementById("vreme-izbor");
    const natpis = () => {
      const n = VREME.filter((v) => vremeIzbor.has(v.k) && imaVreme(v)).length;
      omot.querySelector(".izbor-dugme").textContent = `${n ? `${n} ${n === 1 ? "veličina" : n < 5 ? "veličine" : "veličina"}` : "ništa"} ▾`;
    };
    if (!omot.querySelector(".izbor-dugme")) {
      omot.innerHTML = `<button type="button" class="dugme malo izbor-dugme" aria-haspopup="true"></button>`;
      omot.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        const stari = omot.querySelector(".panel");
        if (stari) { stari.remove(); return; }
        const p = document.createElement("div");
        p.className = "panel izbor-stanica izbor-vremena";
        p.innerHTML = `<button type="button" class="panel-x" aria-label="Zatvori" title="Zatvori">${LJ.ik("x")}</button>` + VREME.map((v) => `<label class="red-izbora${imaVreme(v) ? "" : " onemoguceno"}"><input type="checkbox" data-k="${v.k}" ${vremeIzbor.has(v.k) && imaVreme(v) ? "checked" : ""} ${imaVreme(v) ? "" : "disabled"}>
          <span>${v.ime} <span class="jedinica">(${v.jed})</span>${imaVreme(v) ? "" : `<small>${D.vreme && D.vreme.istorija ? "nema u istoriji" : "stiže sa sledećim preuzimanjem prognoze"}</small>`}</span></label>`).join("");
        p.insertAdjacentHTML("beforeend", `<p class="sitno skala-napomena">Vetar i sunčevo zračenje su na desnoj osi: 100 % = 30 km/h, odnosno 900 W/m² (skoro najviše izmereno u Novom Sadu 2021–2026).</p>`);
        omot.appendChild(p);
        p.querySelector(".panel-x").addEventListener("click", (ev) => { ev.stopPropagation(); p.remove(); });
        p.addEventListener("change", (ev) => {
          const k = ev.target.dataset.k;
          if (!k) return;
          if (ev.target.checked) vremeIzbor.add(k); else vremeIzbor.delete(k);
          try { localStorage.setItem("ns-danas-vreme", JSON.stringify([...vremeIzbor])); } catch (e2) { /* */ }
          natpis(); legendaVremena(); g.vreme.osvezi();
        });
      });
    }
    natpis();
  }
  function legendaVremena() {
    const b = NS.boje();
    document.getElementById("vreme-legenda").innerHTML = D.vreme ? VREME.filter((v) => vremeIzbor.has(v.k) && imaVreme(v)).map((v) =>
      `<span><i class="${v.crtica ? "isprekidano" : ""}" style="${v.crtica ? `border-color:${v.boja(b)}` : `background:${v.boja(b)};${v.tip === "line" ? "height:3px;" : ""}${v.providno ? `opacity:${v.providno + 0.1}` : ""}`}"></i>${v.ime}</span>`).join("") : "";
  }
  function opisVremena() {
    const V = D.vreme;
    document.getElementById("vreme-datum").textContent = V && V.istorija ? `Izmereno vreme · ${NS.datum(D.datum)}` : `Vremenska prognoza za ${NS.datum(D.datum)}`;
    document.getElementById("vreme-naslov").textContent = D.uzivo ? "Kakvo je vreme danas?" : "Kakvo je vreme bilo?";
    document.getElementById("vreme-info").innerHTML = V && V.istorija
      ? MAPA.info("Izmereno vreme iz istorije (isti podaci kao za grafike na sajtu): temperatura i padavine po satu.")
      : V ? MAPA.info(`Vremenska prognoza Open-Meteo za Novi Sad, preuzeta ${NS.datum(new Date(V.preuzeto_utc).toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" }))} u ${sat(V.preuzeto_utc)}. Osvežava se uz svako izdanje prognoze biciklista (01, 07, 13 i 19 h).`)
      : MAPA.info("Vremenska prognoza još nije preuzeta.");
    izborVremena(); legendaVremena();
  }

  // ---------------------------------------------------------------- tabela
  function spark(niz) {
    const w = 96, h = 24, bw = w / niz.length, max = Math.max(1, ...niz.map((v) => v || 0));
    return `<svg class="danas-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">` +
      niz.map((v, i) => {
        if (i >= D.sati_gotovo) return `<rect x="${(i * bw).toFixed(1)}" y="${h - 2}" width="${(bw - 1).toFixed(1)}" height="2" rx="1" class="buduce"/>`;
        if (v == null) return `<rect x="${(i * bw).toFixed(1)}" y="${h - 2}" width="${(bw - 1).toFixed(1)}" height="2" rx="1" class="nema"/>`;
        const vh = Math.max(1, (v / max) * (h - 2));
        return `<rect x="${(i * bw).toFixed(1)}" y="${(h - vh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${vh.toFixed(1)}" rx="1"/>`;
      }).join("") + "</svg>";
  }
  function tabela() {
    const naz = Object.fromEntries(s.serije.map((x) => [x.serija, x.naziv]));
    const bezK = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "dj");
    const upit = bezK(document.getElementById("t-pretraga").value || "");
    const r = Object.keys(D.serije).map(redSerije).filter((x) => !upit || bezK(`${x.k} ${naz[x.k] || ""}`).includes(upit));
    const red = Object.keys(STANJE);
    const kljuc = { serija: (x) => x.k, danas: (x) => x.danas, prog: (x) => x.prog, odst: (x) => x.odst, stanje: (x) => red.indexOf(x.stanje) }[sort.kol];
    const brojSerije = (k) => [parseInt(k, 10), k];
    r.sort((a, b) => {
      let va = kljuc(a), vb = kljuc(b);
      if (sort.kol === "serija") { const [na, sa] = brojSerije(va), [nb, sb] = brojSerije(vb); return sort.smer * (na - nb || sa.localeCompare(sb)); }
      if (va == null && vb == null) return (b.danas ?? -1) - (a.danas ?? -1);
      if (va == null) return 1;                                   // prazno uvek na dno
      if (vb == null) return -1;
      return sort.smer * (va - vb) || (b.danas ?? -1) - (a.danas ?? -1);
    });
    const th = (kol, tekst, kl = "", info = "") => `<th data-sort="${kol}" class="${kl}${sort.kol === kol ? " sortirano" : ""}" aria-sort="${sort.kol === kol ? (sort.smer > 0 ? "ascending" : "descending") : "none"}">${tekst}${
      sort.kol === kol ? `<span class="strelica-sort">${sort.smer > 0 ? "▲" : "▼"}</span>` : ""}${info}</th>`;
    const naziv = Object.fromEntries(s.serije.map((x) => [x.serija, x.naziv]));
    document.getElementById("tabela").innerHTML = `<thead><tr>${th("serija", "Brojač")}${th("danas", "Danas", "broj")}${
      th("prog", "Prognoza", "broj", MAPA.info("prognoza za iste sate za koje postoji izbrojano"))}${th("odst", "Razlika", "broj", MAPA.info("Razlika = (izbrojano − prognoza) / prognoza × 100, za zbir sati koji su prošli. To je odstupanje ukupnog broja (relativna greška zbira), nije MAPE ni WAPE: te mere sabiraju apsolutne greške po satu, pa ne mogu da budu negativne. Plus znači više biciklista od prognoze."))}<th class="bez-sorta">Sat po sat</th>${
      th("stanje", "Stanje")}</tr></thead><tbody>` + r.map((x) => {
      const [txt, boja] = STANJE[x.stanje] || ["", "var(--t-light)"];
      const t = ton(x.odst);
      return `<tr data-s="${x.k}" tabindex="0" class="${x.k === izabrana ? "izabran" : ""}"><td><div class="stanica-celija"><div><b>${x.k}</b><small>${naziv[x.k] || ""}</small></div></div></td>
        <td class="broj">${NS.broj(x.danas)}</td><td class="broj">${x.prog == null ? "—" : NS.broj(Math.round(x.prog))}</td>
        <td class="broj"><span class="danas-razlika ${t ? `ton-${t}` : ""}">${znak(x.odst)}</span></td>
        <td>${spark(x.sati)}</td><td><span class="danas-stanje"><i style="background:${boja}"></i>${txt}${x.napomena ? MAPA.info(x.napomena) : ""}</span></td></tr>`;
    }).join("") + (r.length ? "" : `<tr><td colspan="6" class="sitno">Nema brojača za „${document.getElementById("t-pretraga").value}“.</td></tr>`) + "</tbody>";
    document.getElementById("t-oznaka").textContent = D.uzivo ? `Brojači · danas do ${D.brojaci_do}` : `Brojači · ${NS.datum(D.datum)}`;
  }

  // ---------------------------------------------------------------- mapa
  function mapaVrednosti() {
    const v = {};
    for (const k of Object.keys(D.serije)) {
      const x = redSerije(k), [txt, , pin] = STANJE[x.stanje] || ["", "", "radi"];
      v[k] = { stanje: pin, broj: x.danas == null ? null : NS.broj(x.danas), ton: x.stanje === "radi" ? ton(x.odst) : null,
        tekst: `<div class="tt-red"><b>${NS.broj(x.danas)}</b> biciklista danas (do ${x.brojac})</div>`
          + (x.prog != null ? `<div class="tt-red">prognoza za iste sate ${NS.broj(Math.round(x.prog))} · <b>${znak(x.odst)}</b></div>` : "")
          + (x.stanje !== "radi" ? `<div class="tt-red sitno">${txt}${x.napomena ? ` — ${x.napomena}` : ""}</div>` : "") };
    }
    ctl.prikaziVrednosti(v);
    document.getElementById("mapa-legenda").innerHTML = `<span><span class="danas-razlika ton-vise">+%</span> više od prognoze (&gt; ${TON} %)</span>
      <span><span class="danas-razlika">±%</span> u okviru</span><span><span class="danas-razlika ton-manje">−%</span> manje (&lt; −${TON} %)</span>
      <span><img src="${NS.pin("ne_radi")}" alt="">0 ili bez podataka</span>`;
  }

  // ---------------------------------------------------------------- mini kartice
  async function mini() {
    const max = D.grad.slice(0, D.sati_gotovo).reduce((m, v, i) => (v != null && (m < 0 || v > D.grad[m]) ? i : m), -1);
    const x = oznake();
    const el = document.getElementById("mini");
    if (!D.uzivo) {
      const naj = Object.entries(D.serije).filter(([, v]) => v.danas != null && v.stanje !== "neispravan").sort((a, b) => b[1].danas - a[1].danas)[0];
      const naziv = naj && (s.serije.find((r) => r.serija === naj[0]) || {}).naziv;
      el.innerHTML = `
        <div class="kartica danas-mini-k"><span class="eyebrow">${D.ove_godine != null ? "Od 1. januara do ovog dana" : "Ceo dan, svi brojači"}</span>
          <div class="vrednost">${NS.broj(D.ove_godine != null ? D.ove_godine : D.danas)}</div><span class="sitno">${D.ove_godine != null ? "zbir „ove godine“ sa svih brojača" : "zbir svih sati sa podacima"}</span></div>
        <div class="kartica danas-mini-k"><span class="eyebrow">Najprometniji sat</span><div class="vrednost">${max < 0 ? "—" : x[max].oznaka}</div>
          <span class="sitno">${max < 0 ? "nema podataka" : `${NS.broj(D.grad[max])} biciklista na svim brojačima`}</span></div>
        <div class="kartica danas-mini-k"><span class="eyebrow">Najprometniji brojač</span><div class="vrednost">${naj ? naj[0] : "—"}</div>
          <span class="sitno">${naj ? `${naziv || ""} · ${NS.broj(naj[1].danas)} biciklista` : "nema podataka"}</span></div>`;
      return;
    }
    el.innerHTML = `
      <div class="kartica danas-mini-k"><span class="eyebrow">Od 1. januara</span><div class="vrednost">${NS.broj(D.ove_godine)}</div><span class="sitno">zbir „ove godine“ sa svih brojača, raste svakog sata</span></div>
      <div class="kartica danas-mini-k"><span class="eyebrow">Najprometniji sat do sada</span><div class="vrednost">${max < 0 ? "—" : x[max].oznaka}</div>
        <span class="sitno">${max < 0 ? "još nema završenog sata" : `${NS.broj(D.grad[max])} biciklista na svim brojačima`}</span></div>
      <div class="kartica danas-mini-k"><span class="eyebrow">NS bike sada ${LJ.uzivoZnak(true).replace("uzivo-znak", "uzivo-znak sveze")}</span><div class="vrednost" id="nsb-broj">…</div><span class="sitno" id="nsb-opis">javni bicikli na stanicama</span></div>`;
    try {
      const r = await fetch("https://app.nsbike.rs/stanje", { cache: "no-store" });
      const st = r.ok ? await r.json() : null;
      if (!Array.isArray(st) || !st.length) throw new Error("prazno");
      document.getElementById("nsb-broj").textContent = NS.broj(zbir(st.map((x) => x.zauzeto)));
      document.getElementById("nsb-opis").textContent = `bicikala na ${st.length} stanica · ${NS.broj(zbir(st.map((x) => x.slobodno)))} slobodnih mesta`;
    } catch (e) {
      document.getElementById("nsb-broj").textContent = "—";
      document.getElementById("nsb-opis").textContent = "stanje trenutno nije dostupno";
    }
  }

  // ---------------------------------------------------------------- interakcija
  /** Grad ili jedan brojač na glavnom grafiku; izabrani brojač se na mapi fokusira i odskoči. */
  function izaberi(k, { saMape = false, skrol = true } = {}) {
    izabrana = k || null;
    if (!saMape && ctl) ctl.fokus(izabrana, { leti: !!izabrana, skok: !!izabrana });
    g.glavni.osvezi();
    tabela();
    const red = izabrana && document.querySelector(`#tabela tr[data-s="${CSS.escape(izabrana)}"]`);
    const omot = document.querySelector(".danas-tabela-omot");
    if (red && omot) omot.scrollTo({ top: red.offsetTop - omot.clientHeight / 2, behavior: "smooth" });
    if (izabrana && skrol) document.getElementById("g-glavni").closest(".kartica").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.getElementById("t-pretraga").addEventListener("input", () => tabela());
  document.getElementById("tabela").addEventListener("click", (e) => {
    const t = e.target.closest("th[data-sort]");
    if (!t || e.target.closest(".info")) return;
    e.stopPropagation();
    const kol = t.dataset.sort;
    sort = { kol, smer: sort.kol === kol ? -sort.smer : (kol === "serija" ? 1 : -1) };
    tabela();
  }, true);
  // klik na već izabran red vraća grad
  document.getElementById("tabela").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-s]"); if (tr) izaberi(tr.dataset.s === izabrana ? null : tr.dataset.s); });
  document.getElementById("tabela").addEventListener("keydown", (e) => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-s]"); if (tr) izaberi(tr.dataset.s === izabrana ? null : tr.dataset.s); } });

  function nacrtajSve() {
    zaglavlje(); kpi(); izborBrojaca(); infoPrognoze(); tabela(); opisVremena(); mini();
    if (ctl) mapaVrednosti();
    for (const x of Object.values(g)) x.osvezi();
  }

  try {
    const q = new URLSearchParams(location.search);
    [s] = await Promise.all([NS.stanice(),
      NS.json("sati_dostupno.json").then((x) => { dostupno = x; }).catch(() => {}),
      fetch("data/dani/spisak.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { dani: [] })).then((x) => { arhiva = x.dani || []; }).catch(() => {})]);
    ziv = await ucitaj().catch(() => null);
    const izbor = document.getElementById("dan-izbor");
    izbor.min = dostupno.od;
    izbor.max = ziv ? ziv.datum : danasLok();
    const trazeni = q.get("dan");
    D = await ucitajDan(trazeni && /^\d{4}-\d\d-\d\d$/.test(trazeni) && trazeni >= izbor.min && trazeni <= izbor.max ? trazeni : null);
    async function idiNa(iso) {
      if (iso < izbor.min) iso = izbor.min;
      if (iso > izbor.max) iso = izbor.max;
      try { D = await ucitajDan(iso); } catch (e) { LJ.tost(`Za ${NS.datum(iso)} nema podataka.`, "info"); izbor.value = D.datum; return; }
      urlDana(D.uzivo ? null : D.datum);
      if (izabrana && !D.serije[izabrana]) izabrana = null;
      nacrtajSve();
    }
    izbor.addEventListener("change", () => { if (izbor.value) idiNa(izbor.value); });
    document.getElementById("dan-pre").addEventListener("click", () => idiNa(korakDana(D.datum, -1, izbor.min, izbor.max)));
    document.getElementById("dan-posle").addEventListener("click", () => idiNa(korakDana(D.datum, 1, izbor.min, izbor.max)));
    document.getElementById("dan-danas").addEventListener("click", () => idiNa(izbor.max));
    const prog = document.getElementById("g-prognoza");
    prog.innerHTML = `<label class="prekidac-ui"><input type="checkbox" id="prikazi-prognozu"><span class="klizac" aria-hidden="true"></span><span>prikaži</span></label>`;
    prog.querySelector("input").addEventListener("change", (e) => { saPrognozom = e.target.checked; g.glavni.osvezi(); });
    NS.prekidac(document.getElementById("g-prikaz"), [["sat", "Po satu"], ["zbirno", "Zbirno od ponoći"]], "sat", (v) => { zbirno = v === "zbirno"; g.glavni.osvezi(); });
    g.glavni = NS.grafik(document.getElementById("g-glavni"), crtajGlavni, { odmah: true });
    g.vreme = NS.grafik(document.getElementById("g-vreme"), crtajVreme);
    hover(g.glavni); hover(g.vreme);
    g.vreme.spreman.then(({ ec, el }) => new ResizeObserver(() => ec.resize()).observe(el));
    ctl = MAPA.napravi(document.getElementById("mapa"), s, { naFokus: (k) => { if (k && k !== izabrana) izaberi(k, { saMape: true }); } });
    nacrtajSve();
    LJ.pojave(main);
    setInterval(() => { if (D.uzivo) zaglavlje(); }, 60e3);
    setInterval(async () => {
      if (document.hidden || !D.uzivo) return;
      try {
        const novo = await ucitaj();
        if (novo.citanje_utc !== D.citanje_utc || novo.napravljeno_utc !== D.napravljeno_utc) { ziv = novo; D = novo; nacrtajSve(); }
      } catch (e) { /* bez mreže: ostaje poslednje stanje */ }
    }, PROVERA_MS);
  } catch (e) {
    NS.greska(main, e);
  }
})();
