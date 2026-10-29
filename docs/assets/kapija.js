/* Kapija: dok sajt nije gotov, sve strane traže lozinku. Učitava se u <head> svake strane, pre sadržaja.
   - Lozinka: PBKDF2-SHA256 (Web Crypto) prema SO i HES; lozinka se nigde ne čuva. Ulaz se pamti TRAJANJE_DANA dana.
   - Privremeni link (?pristup=…): ko zna lozinku pravi link koji važi nekoliko minuta (dugme u dnu menija).
     Link nosi vreme isteka potpisano ECDSA P-256 ključem; sajt ima samo JAVNI ključ, a TAJNI je šifrovan
     lozinkom (AES-GCM, PBKDF2 sa SO_K) — bez lozinke se link ne može napraviti ni produžiti.
   Ovo je zavesa za posetioce, ne zaštita podataka: JSON fajlovi i kod su i dalje javni.
   Nova lozinka (i novi ključevi): python -m sajt.kapija "nova lozinka" --upisi */
"use strict";

const KAPIJA = (() => {
  const SO = "07e2317ab984951e7e2f50e82dbe7643";
  const HES = "95a77bf9983187464aa8659dd7d111b6091cc4e7710867f87e3b38a49e767c5c";
  const SO_K = "d557e84eb712650368ac9fd9d3b4cbca";
  const JAVNI = "BCwQR9fxBS52YShwpeRDmHuh1VneRshI5Q3URG/fwOSrxlEHoUIIxUcCz6O5YwgidFbDrwSGMuaKhp9Ik3jAzfQ=";
  const TAJNI = "7KtRFoMcjMJCcJQptgbhqo7cBn939K/js2CD/SVmE1nW9XeMxRBiLcHDIwKg27vxHDWgkXh7mfzNuhRegGO5Xa2PQr0tfvbOP+L2sbRn1uRXSEjwXSQJgQIvrX4ef/QjV0jfOn6nGSuwuT2cl1qGj64sXPpAnWLiMh2xZ6WEx0GyrQUxGno5aI0cnAJ8EAV6jbLco6V4OO02HntmTr/SgL8uoEW05w==";
  const PONAVLJANJA = 300000;
  const TRAJANJE_DANA = 30;
  const KLJUC = "ns-kapija";
  const PORUKA = "nasicu-pristup:";

  const ulaz = () => { try { return JSON.parse(localStorage.getItem(KLJUC) || "null"); } catch (e) { return null; } };
  const otvorena = () => { const z = ulaz(); return !!z && z.h === HES && z.do > Date.now(); };
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const izHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  const izB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const uB64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tekst = (s) => new TextEncoder().encode(s);

  async function pbkdf2(lozinka, so) {
    const k = await crypto.subtle.importKey("raw", tekst(lozinka), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: izHex(so), iterations: PONAVLJANJA }, k, 256);
  }
  const proveri = async (lozinka) => hex(await pbkdf2(lozinka, SO)) === HES;
  function zapamti(doKada, privremen) {
    try { localStorage.setItem(KLJUC, JSON.stringify({ h: HES, do: doKada, ...(privremen ? { p: 1 } : {}) })); } catch (e) { /* */ }
  }

  /** Link koji važi `minuta` minuta (samo uz tačnu lozinku). */
  async function napraviLink(lozinka, minuta) {
    if (!(await proveri(lozinka))) throw new Error("Pogrešna lozinka.");
    const sif = izB64(TAJNI);
    const aes = await crypto.subtle.importKey("raw", await pbkdf2(lozinka, SO_K), "AES-GCM", false, ["decrypt"]);
    const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sif.slice(0, 12) }, aes, sif.slice(12));
    const tajni = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const istek = (Math.ceil(Date.now() / 60000) + minuta).toString(36);
    const potpis = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, tajni, tekst(PORUKA + istek));
    return { link: `${location.origin}/?pristup=${istek}.${uB64url(potpis)}`, istice: parseInt(istek, 36) * 60000 };
  }
  /** Vreme isteka (ms) ako je potpis linka ispravan, inače null. */
  async function proveriLink(kod) {
    const [istek, potpis] = String(kod).split(".");
    if (!istek || !potpis) return null;
    const javni = await crypto.subtle.importKey("raw", izB64(JAVNI), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, javni, izB64(potpis), tekst(PORUKA + istek));
    return ok ? parseInt(istek, 36) * 60000 : null;
  }
  function zakljucaj() {
    try { localStorage.removeItem(KLJUC); } catch (e) { /* */ }
    location.reload();
  }
  const privremen = () => { const z = ulaz(); return otvorena() && !!z.p; };
  const javno = { zakljucaj, napraviLink, privremen, istice: () => (otvorena() ? ulaz().do : null) };

  const adresa = new URL(location.href);
  const kod = adresa.searchParams.get("pristup");
  const bezKoda = () => { adresa.searchParams.delete("pristup"); return adresa.pathname + adresa.search + adresa.hash; };
  // privremeni ulaz se zatvara čim istekne, i na otvorenoj strani
  if (privremen()) setTimeout(() => location.reload(), Math.min(ulaz().do - Date.now() + 1000, 2 ** 31 - 1));
  if (!kod && otvorena()) return javno;
  if (kod && otvorena() && !privremen()) { history.replaceState(null, "", bezKoda()); return javno; }

  // sadržaj strane se ne prikazuje dok se ne unese lozinka (ili ne proveri link)
  const d = document.documentElement;
  d.classList.add("kapija");
  document.write(`<style id="kapija-stil">
    html.kapija body > :not(#kapija) { display: none !important; }
    html.kapija body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box;
      background: radial-gradient(120% 80% at 45% 0%, #0B2A52 0%, #04162F 55%, #020E22 100%) fixed; color: #F1F5F9; font: 15px/1.6 Inter, system-ui, sans-serif; }
    html.kapija[data-theme="light"] body { background: linear-gradient(180deg, #F0F5FB, #E2ECF7); color: #0B1630; }
    #kapija { width: min(400px, 100%); text-align: center; }
    #kapija .k-znak { width: 150px; height: auto; display: block; margin: 0 auto 6px; }
    #kapija .k-natpis { width: 170px; height: auto; display: block; margin: 0 auto 18px; }
    #kapija .k-kartica { padding: 24px; border-radius: 16px; border: 1px solid #1C3558; background: #0B1F3D; text-align: left; box-shadow: 0 24px 60px rgb(0 0 0 / .35); }
    html.kapija[data-theme="light"] #kapija .k-kartica { border-color: #D5E0EE; background: #fff; box-shadow: 0 18px 40px rgb(15 23 42 / .1); }
    #kapija h1 { font: 700 19px/1.3 "Inter Tight", Inter, sans-serif; margin: 0 0 4px; }
    #kapija p { margin: 0 0 16px; font-size: 13.5px; color: #9FB3CC; }
    html.kapija[data-theme="light"] #kapija p { color: #4A5D78; }
    #kapija input { width: 100%; box-sizing: border-box; height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid #1C3558; background: #04162F; color: inherit; font: inherit; }
    html.kapija[data-theme="light"] #kapija input { border-color: #D5E0EE; background: #F7FAFD; }
    #kapija input:focus { outline: 2px solid #14A0F5; outline-offset: 1px; }
    #kapija button { width: 100%; height: 44px; margin-top: 12px; border: 0; border-radius: 10px; font: 600 14.5px Inter, sans-serif; cursor: pointer;
      background: linear-gradient(135deg, #3AD0FF, #14A0F5); color: #04162F; }
    #kapija button:disabled { opacity: .6; cursor: wait; }
    #kapija .k-greska { min-height: 20px; margin-top: 10px; font-size: 13px; color: #FF7550; }
  </style>`);

  async function prikazi() {
    let poruka = "";
    if (kod) {
      let istek = null;
      try { istek = await proveriLink(kod); } catch (e) { /* neispravan kod */ }
      if (istek && istek > Date.now()) { zapamti(istek, true); location.replace(bezKoda()); return; }
      poruka = istek ? "Link za pristup je istekao. Zatraži novi ili unesi lozinku." : "Link za pristup nije ispravan.";
      history.replaceState(null, "", bezKoda());
    }
    const z = ulaz();
    if (!poruka && z && z.p && z.h === HES) poruka = "Privremeni pristup je istekao.";
    const k = document.createElement("main");
    k.id = "kapija";
    k.innerHTML = `<img class="k-znak" src="assets/slike/brend/NaSicu_ikonica_bicikl.svg" alt="">
      <img class="k-natpis" src="assets/slike/brend/natpis-${d.dataset.theme !== "light" ? "tamna" : "svetla"}.svg" alt="NaSicu">
      <form class="k-kartica" autocomplete="off">
        <h1>Sajt je u izradi</h1>
        <p>Za sada je otvoren samo za tim. Unesi lozinku za pristup.</p>
        <label for="k-lozinka" style="position:absolute;left:-9999px">Lozinka</label>
        <input id="k-lozinka" type="password" placeholder="Lozinka" required>
        <button type="submit">Uđi</button>
        <div class="k-greska" role="alert">${poruka}</div>
      </form>`;
    document.body.prepend(k);
    const forma = k.querySelector("form"), polje = k.querySelector("input"), dugme = k.querySelector("button"), greska = k.querySelector(".k-greska");
    polje.focus();
    forma.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!polje.value) return;
      dugme.disabled = true; greska.textContent = "";
      let ok = false;
      try { ok = await proveri(polje.value); } catch (x) { greska.textContent = "Pregledač ne podržava proveru (potreban je https)."; }
      if (ok) { zapamti(Date.now() + TRAJANJE_DANA * 864e5, false); location.reload(); return; }
      dugme.disabled = false;
      if (!greska.textContent) greska.textContent = "Pogrešna lozinka.";
      polje.select();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prikazi); else prikazi();
  return javno;
})();
