/* Animacija znaka na ekranu „Sajt je u izradi“ (kapija). Učitava je kapija.js samo kad se taj ekran prikaže.
 *
 * Redosled (trajanja u T, ispod):
 *   1. točkovi se iscrtavaju kao kazaljka na satu — zadnji od desne sredine, prednji od vrha (gde prsten počinje);
 *   2. N (od donjeg kraja leve nožice) i S (od donjeg repa), zajedno i završe u isto vreme;
 *   3. sic (sleva nadesno) i korman (odozdo nagore), brzo;
 *   4. kopija slova NS se spusti iz bicikla na mesto natpisa i smanji na veličinu natpisa (spojena kao u biciklu;
 *      NS u biciklu ostaje), pa se N pomeri levo, a S desno na svoja mesta u natpisu;
 *   5. kucanje: posle N „a“, posle S „i“, „c“, „u“ (dva kursora u isto vreme, ista brzina).
 *
 * Crta se iz natpis-tamna.svg / natpis-svetla.svg (tu su i bicikl i natpis u istom koordinatnom sistemu); id-jevi
 * dobijaju predznak „kp-“. Sve se pokreće tek kad je strana učitana i vidljiva. Uz „manje pokreta“ se ne poziva
 * (kapija tada prikaže gotov znak). */
"use strict";

window.KAPIJA_LOGO = (() => {
  // trajanja u ms
  const T = {
    pocetak: 300,        // pauza posle prikaza strane
    tockovi: 1100,       // oba točka u isto vreme
    slova: 900,          // N i S u isto vreme
    sicKorman: 380,      // sic i korman u isto vreme
    pauza: 220,
    spustanje: 850,      // NS iz bicikla na visinu natpisa + smanjenje
    razdvajanje: 450,    // N levo, S desno
    zamena: 160,         // pretapanje kopije NS u slova natpisa
    slovo: 120,          // razmak između otkucanih slova
    kursorKraj: 650,     // kursor još malo trepće, pa nestaje
  };
  // geometrija znaka (koordinate bicikla iz SVG-a, pre pomaka „translate(0,-26)“ grupe bicikl)
  const TOCKOVI = [
    { cx: 481, cy: 510, od: 344, ugao: 302 },     // zadnji: od desne sredine (gde prsten počinje), u smeru kazaljke
    { cx: 1057, cy: 510, od: 239, ugao: 305 },    // prednji: od vrha prstena
  ];
  // „kičma“ slova: maska se iscrtava duž ove linije (debljina D), pa se slovo pojavljuje kao da se piše
  const KICMA_N = { d: [[487, 513], [606, 304], [740, 512], [829, 298]], D: 112 };
  const KICMA_S = { d: [[752, 524], [859, 480], [906, 436], [893, 408], [828, 396], [800, 364], [818, 314], [878, 292], [985, 278]], D: 74 };

  const NS = "http://www.w3.org/2000/svg";
  const el = (ime, atr = {}, deca = []) => {
    const e = document.createElementNS(NS, ime);
    for (const [k, v] of Object.entries(atr)) e.setAttribute(k, v);
    for (const d of deca) e.appendChild(d);
    return e;
  };
  const glatko = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);    // easeInOutCubic
  const izlaz = (t) => 1 - Math.pow(1 - t, 3);                                         // easeOutCubic
  const cekaj = (ms) => new Promise((r) => setTimeout(r, ms));
  /** jednostavan tween preko requestAnimationFrame: fn(p) za p od 0 do 1 */
  const tween = (ms, fn, ease = glatko) => new Promise((ok) => {
    const t0 = performance.now();
    const korak = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(korak); else ok();
    };
    requestAnimationFrame(korak);
  });

  /** strana učitana, prikazana i vidljiva (dva kadra posle „load“) */
  const spremno = () => new Promise((ok) => {
    const dalje = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.visibilityState === "visible") ok();
      else document.addEventListener("visibilitychange", function v() { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", v); ok(); } });
    }));
    if (document.readyState === "complete") dalje(); else addEventListener("load", dalje, { once: true });
  });

  async function napravi(mesto, tema) {
    const tekst = await fetch(`assets/slike/brend/natpis-${tema === "light" ? "svetla" : "tamna"}.svg`).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const svgTekst = tekst.replace(/id="([^"]+)"/g, 'id="kp-$1"').replace(/url\(#([^)]+)\)/g, "url(#kp-$1)");
    const izvor = new DOMParser().parseFromString(svgTekst, "image/svg+xml").documentElement;
    const defs = izvor.querySelector("defs"), bicikl = izvor.querySelector("#kp-bicikl"), natpis = izvor.querySelector("#kp-natpis");
    if (!defs || !bicikl || !natpis) throw new Error("znak: nepotpun SVG");

    // ---- jedan SVG: bicikl (150 px, kao znak) iznad natpisa (170 px), isto kao dosadašnje dve slike
    const W = 170, H = 194, sB = 150 / 980.9, sN = 170 / 884, yN = 156;
    const BICIKL = `translate(10,0) scale(${sB}) translate(-277.6,125.4)`;
    const NATPIS = `translate(0,${yN}) scale(${sN}) translate(-325,-718)`;
    const koren = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "k-logo-svg", role: "img", "aria-label": "NaSicu" });
    koren.appendChild(document.importNode(defs, true));
    const mDefs = el("defs");
    koren.appendChild(mDefs);

    // bicikl
    const b = document.importNode(bicikl, true);
    b.removeAttribute("display");
    const gB = el("g", { transform: BICIKL }, [b]);
    koren.appendChild(gB);
    // natpis: svako slovo u svojoj grupi na vrhu (pomeranje u koordinatama korena)
    const n = document.importNode(natpis, true);
    const deca = [...n.children];
    const unutra = (els) => el("g", { transform: `${NATPIS} ${n.getAttribute("transform") || ""}` }, els);
    // natpis redom: N (clipPath + senke), „a“ (bela grupa), S, „icu“ (bela grupa) — bele grupe se prepoznaju po fill-u
    const bele = deca.map((d, i) => (d.tagName === "g" && /gWhite|#[0-9a-f]{3,6}/i.test((d.querySelector("path") || d).getAttribute("fill") || "") && !d.hasAttribute("clip-path") ? i : -1)).filter((i) => i >= 0);
    if (bele.length !== 2) throw new Error("znak: natpis nije prepoznat");
    const [iA, iIcu] = bele;
    const slovoN = el("g", { opacity: 0 }, [unutra(deca.slice(0, iA))]);
    const slovoA = el("g", { opacity: 0 }, [unutra([deca[iA]])]);
    const slovoS = el("g", { opacity: 0 }, [unutra(deca.slice(iA + 1, iIcu))]);
    // „icu“ je jedna putanja: delimo je na slova (i = crtica + tačka, c, u)
    const icuG = deca[iIcu], icuP = icuG.querySelector("path");
    const delovi = icuP.getAttribute("d").split(/(?=M)/).filter((x) => x.trim());
    const atr = { fill: icuP.getAttribute("fill"), "fill-rule": icuP.getAttribute("fill-rule") || "nonzero" };
    const slovoIcu = (ds) => el("g", { opacity: 0 }, [unutra([el("g", { transform: icuG.getAttribute("transform") }, ds.map((d) => el("path", { d, ...atr })))])]);
    // redosled podputanja po x (u: 0, c: 1, crtica i tačka: 2 i 3) → grupisanje po levoj ivici
    const po = delovi.map((d) => ({ d, x: +(/M\s*([-\d.]+)/.exec(d) || [0, 0])[1] })).sort((p, q) => p.x - q.x);
    const slovoI = slovoIcu([po[0].d, po[1].d]), slovoC = slovoIcu([po[2].d]), slovoU = slovoIcu([po[3].d]);
    for (const g of [slovoN, slovoA, slovoS, slovoI, slovoC, slovoU]) koren.appendChild(g);

    mesto.replaceChildren(koren);
    return { koren, b, gB, mDefs, slovoN, slovoA, slovoS, slovoI, slovoC, slovoU, BICIKL };
  }

  // ---- maske
  function maskaTocka(mDefs, id, t) {
    const r = 100, obim = 2 * Math.PI * r, duz = (obim * t.ugao) / 360;
    const k = el("circle", { cx: t.cx, cy: t.cy, r, fill: "none", stroke: "#fff", "stroke-width": 2 * r + 20,
      transform: `rotate(${t.od} ${t.cx} ${t.cy})`, "stroke-dasharray": `${duz} ${obim}`, "stroke-dashoffset": duz });
    mDefs.appendChild(el("mask", { id, maskUnits: "userSpaceOnUse", x: -3000, y: -3000, width: 8000, height: 8000 }, [k]));
    return (p) => k.setAttribute("stroke-dashoffset", duz * (1 - p));
  }
  function maskaKicme(mDefs, id, kicma) {
    const p = el("path", { d: "M" + kicma.d.map((t) => t.join(",")).join(" L"), fill: "none", stroke: "#fff", "stroke-width": kicma.D,
      "stroke-linecap": "round", "stroke-linejoin": "round" });
    mDefs.appendChild(el("mask", { id, maskUnits: "userSpaceOnUse", x: -3000, y: -3000, width: 8000, height: 8000 }, [p]));
    const L = p.getTotalLength() + kicma.D;
    p.setAttribute("stroke-dasharray", `${L} ${L}`); p.setAttribute("stroke-dashoffset", L);
    return (q) => p.setAttribute("stroke-dashoffset", L * (1 - q));
  }
  function maskaPravougaonik(mDefs, id, bb, smer) {   // smer: "desno" (sleva nadesno) ili "gore" (odozdo nagore)
    const m = 6, r = el("rect", { x: bb.x - m, y: bb.y - m, width: 0, height: bb.height + 2 * m, fill: "#fff" });
    mDefs.appendChild(el("mask", { id, maskUnits: "userSpaceOnUse", x: -3000, y: -3000, width: 8000, height: 8000 }, [r]));
    return smer === "desno"
      ? (p) => r.setAttribute("width", (bb.width + 2 * m) * p)
      : (p) => { r.setAttribute("width", bb.width + 2 * m); const h = (bb.height + 2 * m) * p; r.setAttribute("y", bb.y + bb.height + m - h); r.setAttribute("height", h); };
  }
  const omotaj = (deca, maska) => {   // deca idu u novu grupu sa maskom, na mesto prvog deteta
    const g = el("g", { mask: `url(#${maska})` });
    deca[0].parentNode.insertBefore(g, deca[0]);
    for (const d of deca) g.appendChild(d);
    return g;
  };

  /** okvir elementa u koordinatama korena */
  function okvir(e, koren) {
    const bb = e.getBBox(), m = e.getCTM(), k = koren.getCTM();
    const inv = k ? k.inverse().multiply(m) : m;
    const tacke = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]
      .map(([x, y]) => [inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f]);
    const xs = tacke.map((t) => t[0]), ys = tacke.map((t) => t[1]);
    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }
  /** okvir samog oblika slova: gradijent je veliki pravougaonik isečen putanjom (clipPath), pa se meri ta putanja
      (privremena vidljiva kopija na istom mestu) */
  function okvirOblika(g, koren) {
    const putanje = [...g.querySelectorAll("clipPath path")];
    if (!putanje.length) return okvir(g, koren);
    const kutije = putanje.map((p) => {
      const c = p.cloneNode(true); c.removeAttribute("id"); c.setAttribute("visibility", "hidden");
      p.parentNode.parentNode.insertBefore(c, p.parentNode);
      const o = okvir(c, koren); c.remove(); return o;
    });
    const x = Math.min(...kutije.map((o) => o.x)), y = Math.min(...kutije.map((o) => o.y));
    const w = Math.max(...kutije.map((o) => o.x + o.w)) - x, h = Math.max(...kutije.map((o) => o.y + o.h)) - y;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }
  const poza = (g, s, tx, ty) => g.setAttribute("transform", `translate(${tx},${ty}) scale(${s})`);

  async function pokreni(mesto, tema) {
    const z = await napravi(mesto, tema);
    const { koren, b, mDefs } = z;
    // ---- sve sakriveno: maske na nuli
    const tockovi = [...b.querySelector("#kp-tockovi").children];
    const tPokreti = tockovi.map((p, i) => { const f = maskaTocka(mDefs, `kp-m-t${i}`, TOCKOVI[i]); omotaj([p], `kp-m-t${i}`); return f; });
    const ram = b.querySelector("#kp-ram_NS"), r = [...ram.children];
    const fN = maskaKicme(mDefs, "kp-m-n", KICMA_N), fS = maskaKicme(mDefs, "kp-m-s", KICMA_S);
    const gS = omotaj(r.slice(0, 3), "kp-m-s"), gN = omotaj(r.slice(3), "kp-m-n");
    const sic = b.querySelector("#kp-sic"), korman = b.querySelector("#kp-korman");
    const oSic = el("g"), oKor = el("g");
    sic.parentNode.insertBefore(oSic, sic); oSic.appendChild(sic);
    korman.parentNode.insertBefore(oKor, korman); oKor.appendChild(korman);
    const fSic = maskaPravougaonik(mDefs, "kp-m-sic", oSic.getBBox(), "desno");
    const fKor = maskaPravougaonik(mDefs, "kp-m-kor", oKor.getBBox(), "gore");
    oSic.setAttribute("mask", "url(#kp-m-sic)"); oKor.setAttribute("mask", "url(#kp-m-kor)");
    mesto.classList.remove("k-logo-ceka");

    await spremno();
    await cekaj(T.pocetak);
    // 1. točkovi
    await tween(T.tockovi, (p) => tPokreti.forEach((f) => f(p)));
    // 2. N i S zajedno
    await tween(T.slova, (p) => { fN(p); fS(p); });
    // 3. sic i korman, brzo
    await tween(T.sicKorman, (p) => { fSic(p); fKor(p); }, izlaz);
    for (const g of koren.querySelectorAll("[mask]")) g.removeAttribute("mask");   // gotovo: bez maski
    mDefs.replaceChildren();
    await cekaj(T.pauza);

    // 4. kopija NS iz bicikla → natpis
    const kopija = (g) => {
      const c = g.cloneNode(true);
      c.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));   // clipPath-ovi se koriste preko originala
      const spolja = el("g", {}, [el("g", { transform: `${z.BICIKL} ${b.getAttribute("transform") || ""}` }, [c])]);
      koren.appendChild(spolja);
      return spolja;
    };
    const kS = kopija(gS), kN = kopija(gN);
    const bN = okvirOblika(kN, koren), bS = okvirOblika(kS, koren), cN = okvirOblika(z.slovoN, koren), cS = okvirOblika(z.slovoS, koren);
    const unija = { x: Math.min(bN.x, bS.x), y: Math.min(bN.y, bS.y) };
    unija.w = Math.max(bN.x + bN.w, bS.x + bS.w) - unija.x; unija.h = Math.max(bN.y + bN.h, bS.y + bS.h) - unija.y;
    unija.cx = unija.x + unija.w / 2; unija.cy = unija.y + unija.h / 2;
    const k = cN.h / bN.h, kS2 = cS.h / bS.h;                       // veličina slova u natpisu
    const cilj = { cx: (cN.cx + cS.cx) / 2, cy: (cN.cy + cS.cy) / 2 }; // spojeno NS, na visini natpisa
    const spojeno = { s: k, tx: cilj.cx - k * unija.cx, ty: cilj.cy - k * unija.cy };
    const kraj = (bb, c, s) => ({ s, tx: c.cx - s * bb.cx, ty: c.cy - s * bb.cy });
    const krajN = kraj(bN, cN, k), krajS = kraj(bS, cS, kS2);
    const lerp = (a, b2, p) => a + (b2 - a) * p;
    const izmedju = (g, A, B, p) => poza(g, lerp(A.s, B.s, p), lerp(A.tx, B.tx, p), lerp(A.ty, B.ty, p));
    const nula = { s: 1, tx: 0, ty: 0 };
    await tween(T.spustanje, (p) => { izmedju(kN, nula, spojeno, p); izmedju(kS, nula, spojeno, p); });
    await tween(T.razdvajanje, (p) => { izmedju(kN, spojeno, krajN, p); izmedju(kS, spojeno, krajS, p); });
    // pretapanje u prava slova natpisa
    // prava slova se pojave ispod kopije, pa kopija nestane (bez trenutka kad su oba providna)
    z.slovoN.setAttribute("opacity", 1); z.slovoS.setAttribute("opacity", 1);
    await tween(T.zamena, (p) => { kN.setAttribute("opacity", 1 - p); kS.setAttribute("opacity", 1 - p); }, (x) => x);
    kN.remove(); kS.remove();

    // 5. kucanje: dva kursora u isto vreme
    const svetla = tema === "light";
    const okU = okvir(z.slovoU, koren);
    const kursor = () => { const c = el("rect", { width: 1.4, height: okU.h * 0.92, y: okU.y + okU.h * 0.04, rx: 0.6, fill: svetla ? "#0B1630" : "#EAF2FB" }); koren.appendChild(c); return c; };
    const k1 = kursor(), k2 = kursor();
    const postavi = (c, g) => { const o = okvirOblika(g, koren); c.setAttribute("x", o.x + o.w + 1.2); };
    postavi(k1, z.slovoN); postavi(k2, z.slovoS);
    const trep = setInterval(() => { for (const c of [k1, k2]) c.setAttribute("opacity", c.getAttribute("opacity") === "0" ? 1 : 0); }, 260);
    await cekaj(T.slovo * 1.5);
    const koraci = [[z.slovoA, z.slovoI], [null, z.slovoC], [null, z.slovoU]];
    for (const [a, s] of koraci) {
      if (a) { a.setAttribute("opacity", 1); postavi(k1, a); }
      if (s) { s.setAttribute("opacity", 1); postavi(k2, s); }
      for (const c of [k1, k2]) c.setAttribute("opacity", 1);
      await cekaj(T.slovo);
    }
    k1.remove();                                                     // posle „a“ se ne kuca dalje
    await cekaj(T.kursorKraj);
    clearInterval(trep); k2.remove();
  }

  return { pokreni, T };
})();
