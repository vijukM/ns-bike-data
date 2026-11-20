/* Provera prevoda: obilazi sve strane dostupne iz menija na engleskom (uz klikove na dugmad, prozore ljuske i oblačiće
   grafika) i upisuje tekstove koji nisu prevedeni (PREVOD.promaseno iz assets/prevod.js) u JSON.

     node tests/prevod/obilazak.js http://localhost:8766/ promaseno.json

   Pokreće ga tests/test_prevod.py (Node + Playwright). Kapija i admin se otvaraju upisom ulaza u pregledač (HES iz
   kapija.js), bez lozinke. Biblioteke sa CDN-a: ako nema mreže, NS_ECHARTS / NS_MAPLIBRE_JS / NS_MAPLIBRE_CSS = putanje
   do lokalnih kopija (inače se zahtevi ka spoljnim adresama propuštaju). Zaključane strane (katanac u meniju) se ne obilaze. */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BAZA = process.argv[2] || "http://localhost:8766/";
const IZLAZ = process.argv[3] || "promaseno.json";
const STRANE = ["", "danas", "mapa", "staze", "grafici", "stanice", "stanica?id=23a", "stanica?id=28", "stanica?id=36b",
  "poredjenje", "poredjenje?id=34a,23a,42a", "kalendar", "rekordi", "ritam", "o-projektu", "kamere", "preuzimanje", "razvoj", "nepostojeca-strana"];
const kapija = fs.readFileSync(path.join(__dirname, "../../docs/assets/kapija.js"), "utf8");
const HES = /const HES = "([0-9a-f]{64})"/.exec(kapija)[1];
const AHES = /const ADMIN_HES = "([0-9a-f]{64})"/.exec(kapija)[1];
const LOKALNO = { "echarts@": process.env.NS_ECHARTS, "maplibre-gl.js": process.env.NS_MAPLIBRE_JS, "maplibre-gl.css": process.env.NS_MAPLIBRE_CSS };

const sve = {};
const greske = [];
async function skupi(pg, s) {
  const m = await pg.evaluate(() => (typeof PREVOD !== "undefined" ? [...PREVOD.promaseno.entries()] : [])).catch(() => []);
  for (const [k, g] of m) { (sve[k] ||= { gde: g, strane: [] }); if (!sve[k].strane.includes(s)) sve[k].strane.push(s); }
}
async function kontekst(b, { ulaz = true, admin = true, w = 1440, h = 900 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([HES, AHES, ulaz, admin]) => {
    try {
      localStorage.setItem("ns-jezik", "en");
      if (ulaz) localStorage.setItem("ns-kapija", JSON.stringify({ h: HES, do: Date.now() + 864e5 }));
      if (admin) sessionStorage.setItem("ns-admin", JSON.stringify({ h: AHES, do: Date.now() + 864e5 }));
    } catch (e) { /* */ }
  }, [HES, AHES, ulaz, admin]);
  const pg = await ctx.newPage();
  await pg.route("**/*", (r) => {
    const u = r.request().url();
    for (const [deo, put] of Object.entries(LOKALNO)) {
      if (put && u.includes(deo) && (u.endsWith(".js") || u.endsWith(".css")))
        return r.fulfill({ path: put, contentType: u.endsWith(".css") ? "text/css" : "application/javascript" });
    }
    // stanje drumskog saobraćaja (ns-trafic-data na GitHub-u) → primer iz testa, da se i taj deo strane proveri
    if (/\/stanje\.json/.test(u) && !u.startsWith(BAZA))
      return r.fulfill({ path: path.join(__dirname, "stanje_drumski.json"), contentType: "application/json" });
    if (u.startsWith(BAZA) || u.includes("cdn.jsdelivr.net") || u.includes("fonts.g")) return r.continue();
    return r.abort();                                    // uživo izvori (NS bike, kamere) se ne pozivaju
  });
  pg.on("pageerror", (e) => greske.push(String(e).slice(0, 200)));
  pg.on("dialog", (d) => d.dismiss());
  return { ctx, pg };
}
const cekaj = (pg, ms) => pg.waitForTimeout(ms);
async function oblacici(pg) {
  for (const e of (await pg.$$("[_echarts_instance_]")).slice(0, 25)) {
    try {
      await e.scrollIntoViewIfNeeded(); await cekaj(pg, 250);
      const r = await e.boundingBox(); if (!r || r.width < 50) continue;
      for (const fx of [0.25, 0.5, 0.75]) for (const fy of [0.4, 0.6]) { await pg.mouse.move(r.x + r.width * fx, r.y + r.height * fy); await cekaj(pg, 100); }
    } catch (x) { /* */ }
  }
}
async function dugmad(pg, s) {
  const n = await pg.$$eval("main button", (l) => l.length).catch(() => 0);
  for (let i = 0; i < Math.min(n, 60); i++) {
    try {
      const b = (await pg.$$("main button"))[i]; if (!b) break;
      const t = (await b.innerText().catch(() => "")) + (await b.getAttribute("aria-label") || "");
      if (/Delete|Lock|Download/i.test(t) || !(await b.isVisible())) continue;
      await b.click({ timeout: 800 }); await cekaj(pg, 220); await skupi(pg, s);
      if (await pg.$("dialog[open], .km-fokus")) { await pg.keyboard.press("Escape"); await cekaj(pg, 120); }
    } catch (x) { /* */ }
  }
}

(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, pg } = await kontekst(b, { w, h });
    for (const s of STRANE) {
      await pg.goto(BAZA + s); await cekaj(pg, 1800);
      const H = await pg.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < H; y += 700) { await pg.evaluate((y) => window.scrollTo(0, y), y); await cekaj(pg, 180); }
      await oblacici(pg); await skupi(pg, s || "index");
      // pinovi na mapi: prelaz mišem i klik otvaraju karticu stanice
      for (const p of (await pg.$$(".pin-omot")).slice(0, 3)) {
        try { await p.hover({ timeout: 600 }); await cekaj(pg, 200); await p.click({ timeout: 600 }); await cekaj(pg, 400); await skupi(pg, s || "index"); } catch (x) { /* */ }
      }
      if (w > 1000) { await dugmad(pg, s || "index"); await oblacici(pg); await skupi(pg, s || "index"); }
    }
    // ljuska: pretraga, prilagodi, obaveštenja, jezik, prijava, profil, privremeni pristup, zaključavanje
    await pg.goto(BAZA); await cekaj(pg, 1500);
    const korak = async (f) => { try { await f(); } catch (x) { /* */ } await cekaj(pg, 350); await skupi(pg, "ljuska"); };
    await korak(async () => {
      await pg.keyboard.press("Control+k"); await cekaj(pg, 300); await pg.keyboard.type("bul"); await cekaj(pg, 500);
      for (const f of await pg.$$("[role=dialog] button")) { try { await f.click({ timeout: 400 }); await cekaj(pg, 120); } catch (x) { /* */ } }
      await pg.keyboard.press("Escape");
    });
    await korak(async () => { await pg.keyboard.press("Control+k"); await cekaj(pg, 300); await pg.keyboard.type("xyzq"); await cekaj(pg, 400); await pg.keyboard.press("Escape"); });
    await korak(async () => {
      await pg.click("#prilagodi-dugme"); await cekaj(pg, 500);
      for (const o of await pg.$$(".prilagodi [data-k]")) { try { await o.click({ timeout: 400 }); } catch (x) { /* */ } }
      await pg.click(".prilagodi [data-vrati]"); await cekaj(pg, 300); await pg.keyboard.press("Escape");
    });
    for (const id of ["#obavestenja-dugme", "#jezik-dugme"]) await korak(async () => { await pg.click(id); await cekaj(pg, 450); await skupi(pg, "ljuska"); await pg.click(id); });
    await korak(async () => {
      await pg.click("#prijava-dugme"); await cekaj(pg, 1200); await skupi(pg, "ljuska");
      for (const t of await pg.$$("[role=dialog] [role=tab], [role=dialog] .segment button")) { try { await t.click({ timeout: 400 }); await cekaj(pg, 250); await skupi(pg, "ljuska"); } catch (x) { /* */ } }
      for (const f of await pg.$$("[role=dialog] form")) { try { await f.evaluate((x) => x.requestSubmit()); await cekaj(pg, 250); await skupi(pg, "ljuska"); } catch (x) { /* */ } }
      await pg.keyboard.press("Escape");
    });
    await korak(async () => {
      await pg.evaluate(() => LJ.otvoriProfil && LJ.otvoriProfil()); await cekaj(pg, 2500); await skupi(pg, "ljuska");
      for (let k = 0; k < 6; k++) {
        for (const c of (await pg.$$("[role=dialog] button")).slice(0, 30)) {
          try { if (/Close|Next|Save/.test(await c.innerText())) continue; await c.click({ timeout: 300 }); await cekaj(pg, 100); } catch (x) { /* */ }
        }
        await skupi(pg, "ljuska");
        const d = await pg.$("[role=dialog] .dugme.primarno:not([disabled])"); if (!d) break;
        try { await d.click({ timeout: 700 }); } catch (x) { /* */ }
        await cekaj(pg, 900); await skupi(pg, "ljuska");
      }
      await pg.keyboard.press("Escape");
    });
    await korak(async () => {
      const p = await pg.$("#pristup-dugme"); if (!p) return;
      await p.click(); await cekaj(pg, 600); await skupi(pg, "ljuska");
      const f = await pg.$("[role=dialog] form"); if (f) { await f.evaluate((x) => x.requestSubmit()); await cekaj(pg, 600); }
      await pg.keyboard.press("Escape");
    });
    await korak(async () => { const z = await pg.$(".zakljucaj-dugme"); if (z) { await z.click(); await cekaj(pg, 500); await skupi(pg, "ljuska"); await pg.keyboard.press("Escape"); } });
    await ctx.close();
  }
  // kapija (bez ulaza), pogrešna lozinka, neispravan privremeni link; admin forma
  {
    const { ctx, pg } = await kontekst(b, { ulaz: false, admin: false });
    await pg.goto(BAZA); await cekaj(pg, 6000); await skupi(pg, "kapija");
    try { await pg.fill("#k-lozinka", "pogresna"); await pg.click("#kapija button[type=submit]"); await cekaj(pg, 2500); await skupi(pg, "kapija"); } catch (x) { /* */ }
    await pg.goto(BAZA + "?pristup=abc.def"); await cekaj(pg, 2000); await skupi(pg, "kapija");
    await ctx.close();
    const a = await kontekst(b, { ulaz: true, admin: false });
    for (const s of ["kamere", "preuzimanje", "razvoj"]) {
      await a.pg.goto(BAZA + s); await cekaj(a.pg, 1500); await skupi(a.pg, "admin");
      try { await a.pg.fill("#admin-lozinka", "pogresna"); await a.pg.click(".admin-kapija button[type=submit]"); await cekaj(a.pg, 2500); await skupi(a.pg, "admin"); } catch (x) { /* */ }
    }
    await a.ctx.close();
  }
  await b.close();
  fs.writeFileSync(IZLAZ, JSON.stringify(sve, null, 1));
  console.log(`bez prevoda: ${Object.keys(sve).length}; greške na strani: ${greske.length}`);
  for (const g of [...new Set(greske)].slice(0, 10)) console.log("  ", g);
})();
