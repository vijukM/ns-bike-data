/* Kapija: dok sajt nije gotov, sve strane traže lozinku. Učitava se u <head> svake strane, pre sadržaja.
   Proverava se PBKDF2-SHA256 (Web Crypto) lozinke prema SO i HES ispod; lozinka se nigde ne čuva.
   Posle tačne lozinke pregledač pamti ulaz TRAJANJE_DANA dana (localStorage), dok se ne klikne „Zaključaj“.
   Ovo je zavesa za posetioce, ne zaštita podataka: JSON fajlovi i kod su i dalje javni.
   Nova lozinka: python -m sajt.kapija "nova lozinka" → upisati SO i HES (stari ulazi tada prestaju da važe). */
"use strict";

const KAPIJA = (() => {
  const SO = "0f94729c18654a3dd238d4b5d34c9386";
  const HES = "444a6ef98ffe633a03cd8075b0124ea487d81adc5b352fec9063dee3a484f5c4";
  const PONAVLJANJA = 300000;
  const TRAJANJE_DANA = 30;
  const KLJUC = "ns-kapija";

  const otvorena = () => {
    try {
      const z = JSON.parse(localStorage.getItem(KLJUC) || "null");
      return !!z && z.h === HES && z.do > Date.now();
    } catch (e) { return false; }
  };
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const bajtovi = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  async function proveri(lozinka) {
    const kljuc = await crypto.subtle.importKey("raw", new TextEncoder().encode(lozinka), "PBKDF2", false, ["deriveBits"]);
    const bitovi = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bajtovi(SO), iterations: PONAVLJANJA }, kljuc, 256);
    return hex(bitovi) === HES;
  }

  function zakljucaj() {
    try { localStorage.removeItem(KLJUC); } catch (e) { /* */ }
    location.reload();
  }

  if (otvorena()) return { zakljucaj };

  // sadržaj strane se ne prikazuje dok se ne unese lozinka
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

  function prikazi() {
    const k = document.createElement("main");
    k.id = "kapija";
    const tamna = d.dataset.theme !== "light";
    k.innerHTML = `<img class="k-znak" src="assets/slike/brend/NaSicu_ikonica_bicikl.svg" alt="">
      <img class="k-natpis" src="assets/slike/brend/natpis-${tamna ? "tamna" : "svetla"}.svg" alt="NaSicu">
      <form class="k-kartica" autocomplete="off">
        <h1>Sajt je u izradi</h1>
        <p>Za sada je otvoren samo za tim. Unesi lozinku za pristup.</p>
        <label for="k-lozinka" style="position:absolute;left:-9999px">Lozinka</label>
        <input id="k-lozinka" type="password" placeholder="Lozinka" autofocus required>
        <button type="submit">Uđi</button>
        <div class="k-greska" role="alert"></div>
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
      if (ok) {
        try { localStorage.setItem(KLJUC, JSON.stringify({ h: HES, do: Date.now() + TRAJANJE_DANA * 864e5 })); } catch (x) { /* */ }
        location.reload();
        return;
      }
      dugme.disabled = false;
      if (!greska.textContent) greska.textContent = "Pogrešna lozinka.";
      polje.select();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prikazi); else prikazi();
  return { zakljucaj };
})();
