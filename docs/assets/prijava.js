/* Prozor „Prijava“: nalog — „Imam nalog“ (prijava) ili „Novi nalog“ (registracija), Email i Lozinka.
   Učitava ga ljuska tek na klik (LJ.ucitajSkript). Nalozi stižu sa backend-om; do tada slanje samo javlja da stižu uskoro.
   Biciklista (avatar) je poseban prozor: assets/profil.js (klik na profil u dnu menija). */
"use strict";

const PRIJAVA = (() => {
  let dlg = null;

  function napravi() {
    dlg = document.createElement("dialog");
    dlg.className = "prijava prijava-nalog";
    dlg.setAttribute("aria-labelledby", "prijava-naslov");
    dlg.innerHTML = `<div class="prijava-glava"><div><span class="eyebrow">Nalog</span><h2 id="prijava-naslov">Prijava</h2></div>
        <button type="button" class="ikonica-dugme" data-zatvori aria-label="Zatvori">${LJ.ik("x")}</button></div>
      <div class="pr-nalog">
        <div id="pr-vrsta"></div>
        <form class="pr-forma" autocomplete="on">
          <label>Email<input type="email" name="email" autocomplete="email" placeholder="ime@primer.rs" required></label>
          <label>Lozinka<input type="password" name="lozinka" autocomplete="current-password" placeholder="••••••••" required></label>
          <button class="dugme primarno" type="submit" id="pr-posalji">Prijavi se</button>
        </form>
      </div>`;
    document.body.append(dlg);
    NS.prekidac(dlg.querySelector("#pr-vrsta"), [["prijava", "Imam nalog"], ["novi", "Novi nalog"]], "prijava", (v) => {
      dlg.querySelector("#prijava-naslov").textContent = v === "novi" ? "Registracija" : "Prijava";
      dlg.querySelector("#pr-posalji").textContent = v === "novi" ? "Napravi nalog" : "Prijavi se";
      dlg.querySelector("[name=lozinka]").autocomplete = v === "novi" ? "new-password" : "current-password";
    });
    dlg.querySelector(".pr-forma").addEventListener("submit", (e) => { e.preventDefault(); LJ.tost("Nalozi stižu uskoro.", "info"); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-zatvori]")) dlg.close(); });
  }

  function otvori() {
    if (!dlg) napravi();
    dlg.showModal();
    dlg.querySelector("[name=email]").focus();
  }

  return { otvori };
})();
