/* Admin strana „Verzije i zadaci“: dve kartice.
   - Istorija verzija: data/verzije.json (python -m sajt.verzije, iz git commit-ova) — svaka verzija sa datumom, naslovom
     i stavkama izmena; commit-ovi pre uvođenja oznake verzije grupisani po danu. Pretraga po tekstu.
   - Zadaci: zahtevi za izmene sa ID-jem, autorom (prijavljeni administrator, ne menja se), datumom zahteva, hitnošću
     i statusom (na čekanju → primljeno → u izradi → gotovo). Novi zahtev, izmena (svaka izmena se beleži i vidi uz
     zahtev) i brisanje. Polazni spisak je data/zadaci.json, a izmene se čuvaju u pregledaču (localStorage „ns-zadaci“). */
"use strict";

(async () => {
  const main = document.getElementById("sadrzaj");
  const AUTOR = "Administrator";                  // ko je prijavljen na admin stranu; autor zahteva se ne menja
  const KLJUC = "ns-zadaci";
  const HITNOST = { niska: "Niska", srednja: "Srednja", visoka: "Visoka", hitno: "Hitno" };
  const STATUS = { na_cekanju: "Na čekanju", primljeno: "Primljeno", u_izradi: "U izradi", gotovo: "Gotovo" };
  const POLJA = { naslov: "naslov", opis: "opis", hitnost: "hitnost", status: "status" };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fDatum = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric" });
  const fVreme = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const kad = (iso, saVremenom = true) => (iso ? (saVremenom ? fVreme : fDatum).format(new Date(iso)) : "—");
  const sada = () => { const d = new Date(), p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const vrednost = (polje, v) => (polje === "hitnost" ? HITNOST[v] : polje === "status" ? STATUS[v] : v) || "—";

  try {
    if (typeof KAPIJA !== "undefined") await KAPIJA.trazAdmina(main);
    const [V, Z] = await Promise.all([NS.json("verzije.json", "data/"), NS.json("zadaci.json", "data/")]);
    let zadaci;
    try { zadaci = JSON.parse(localStorage.getItem(KLJUC) || "null"); } catch (e) { zadaci = null; }
    if (!Array.isArray(zadaci)) zadaci = Z.zadaci.map((z) => ({ ...z, izmene: [...(z.izmene || [])] }));
    const sacuvaj = () => { try { localStorage.setItem(KLJUC, JSON.stringify(zadaci)); } catch (e) { /* */ } };
    const sledeciId = () => `ZAH-${String(zadaci.reduce((m, z) => Math.max(m, parseInt(z.id.slice(4), 10) || 0), 0) + 1).padStart(3, "0")}`;

    const tab = location.hash === "#zadaci" ? "zadaci" : "verzije";
    main.innerHTML = `
      <header class="zaglavlje-strane pojava">
        <div><span class="eyebrow">Admin · razvoj aplikacije</span><h1>Verzije i <em>zadaci</em></h1></div>
        <div class="akcije"><span class="znacka">v ${esc(LJ.VERZIJA)}</span></div>
      </header>
      <div class="rz-tabovi" role="tablist">
        <button type="button" role="tab" data-tab="verzije" aria-selected="${tab === "verzije"}">${LJ.ik("clock")}Istorija verzija</button>
        <button type="button" role="tab" data-tab="zadaci" aria-selected="${tab === "zadaci"}">${LJ.ik("check")}Zadaci <span class="rz-br" id="rz-br-otv"></span></button>
      </div>
      <section class="rz-panel" id="rz-verzije" role="tabpanel"${tab === "verzije" ? "" : " hidden"}></section>
      <section class="rz-panel" id="rz-zadaci" role="tabpanel"${tab === "zadaci" ? "" : " hidden"}></section>`;
    const tabovi = main.querySelector(".rz-tabovi");
    tabovi.addEventListener("click", (e) => {
      const d = e.target.closest("[data-tab]"); if (!d) return;
      tabovi.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === d)));
      main.querySelectorAll(".rz-panel").forEach((p) => { p.hidden = p.id !== `rz-${d.dataset.tab}`; });
      history.replaceState(null, "", d.dataset.tab === "zadaci" ? "#zadaci" : location.pathname + location.search);
    });

    // ---------------------------------------------------------------- istorija verzija
    const pv = document.getElementById("rz-verzije");
    const brPre = V.pre_verzija.reduce((n, d) => n + d.stavke.length, 0);
    pv.innerHTML = `
      <div class="rz-alati">
        <label class="rz-trazi">${LJ.ik("search")}<input type="search" placeholder="Pretraži izmene (npr. kamere, meni, prognoza)…" aria-label="Pretraži izmene"></label>
        <span class="sitno" id="rz-v-br"></span>
      </div>
      <ol class="rz-verzije" id="rz-v-lista"></ol>
      <h2 class="rz-pod">Pre uvođenja oznake verzije <span class="sitno">${V.pre_verzija.length} dana · ${brPre} izmena</span></h2>
      <div class="rz-dani" id="rz-v-dani"></div>`;
    const bez = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
    const crtajVerzije = () => {
      const q = bez(pv.querySelector("input").value.trim());
      const pog = (t) => !q || bez(t).includes(q);
      const ver = V.verzije.filter((v) => pog(`${v.verzija} ${v.naslov} ${v.stavke.join(" ")}`));
      document.getElementById("rz-v-lista").innerHTML = ver.map((v, i) => `
        <li class="rz-verzija kartica${i === 0 && !q ? " najnovija" : ""}">
          <div class="rz-v-glava"><span class="rz-v-broj">v ${esc(v.verzija)}</span><time datetime="${esc(v.datum)}">${kad(v.datum)}</time>
            ${i === 0 && !q ? '<span class="rz-oznaka">trenutna</span>' : ""}${v.commit ? `<code class="rz-commit" title="commit">${esc(v.commit)}</code>` : ""}</div>
          <h3>${esc(v.naslov)}</h3>
          ${v.stavke.length ? `<ul>${v.stavke.map((s) => `<li${s.startsWith("— ") ? ' class="pod"' : ""}>${esc(s.replace(/^— /, ""))}</li>`).join("")}</ul>` : ""}
        </li>`).join("") || '<li class="sitno">Nema verzija za ovaj upit.</li>';
      const dani = V.pre_verzija.map((d) => ({ ...d, stavke: d.stavke.filter((s) => pog(`${s.naslov} ${s.stavke.join(" ")}`)) })).filter((d) => d.stavke.length);
      document.getElementById("rz-v-dani").innerHTML = dani.map((d) => `
        <details class="rz-dan kartica"${q ? " open" : ""}><summary><b>${kad(d.dan + "T12:00", false)}</b><span class="sitno">${d.stavke.length} ${d.stavke.length === 1 ? "izmena" : "izmena"}</span></summary>
          <ul>${d.stavke.map((s) => `<li><span class="rz-vreme">${esc(s.vreme)}</span><div><b>${esc(s.naslov)}</b>${s.stavke.length
            ? `<ul>${s.stavke.map((x) => `<li>${esc(x.replace(/^— /, ""))}</li>`).join("")}</ul>` : ""}</div><code class="rz-commit">${esc(s.commit)}</code></li>`).join("")}</ul>
        </details>`).join("") || '<p class="sitno">Nema izmena za ovaj upit.</p>';
      document.getElementById("rz-v-br").textContent = `${ver.length} od ${V.verzije.length} verzija · ${dani.reduce((n, d) => n + d.stavke.length, 0)} od ${brPre} ranijih izmena`;
    };
    pv.querySelector("input").addEventListener("input", crtajVerzije);
    crtajVerzije();

    // ---------------------------------------------------------------- zadaci
    const pz = document.getElementById("rz-zadaci");
    let filter = "svi";
    pz.innerHTML = `
      <div class="kartica rz-napredak" id="rz-napredak"></div>
      <div class="rz-alati">
        <div class="rz-filteri" role="radiogroup" aria-label="Status"></div>
        <button type="button" class="dugme primarno" id="rz-novi">${LJ.ik("olovka")}Novi zahtev</button>
      </div>
      <div class="kartica rz-tabela-omot"><table class="tabela rz-tabela">
        <thead><tr><th>ID</th><th>Zahtev</th><th>Hitnost</th><th>Status</th><th>Autor</th><th>Zatraženo</th><th></th></tr></thead>
        <tbody id="rz-z-telo"></tbody></table></div>
      <dialog class="rz-dijalog kartica" id="rz-forma"></dialog>
      <dialog class="rz-dijalog kartica" id="rz-brisanje"></dialog>`;

    const crtajZadatke = () => {
      const br = Object.fromEntries(Object.keys(STATUS).map((k) => [k, zadaci.filter((z) => z.status === k).length]));
      const otv = zadaci.length - br.gotovo;
      document.getElementById("rz-br-otv").textContent = otv;
      const ud = (k) => (zadaci.length ? (100 * br[k]) / zadaci.length : 0);
      document.getElementById("rz-napredak").innerHTML = `
        <div class="rz-np-glava"><div><span class="eyebrow">Dokle se stiglo</span><h2>${br.gotovo} od ${zadaci.length} gotovo</h2></div>
          <b class="rz-np-pct">${zadaci.length ? Math.round(ud("gotovo")) : 0}%</b></div>
        <div class="rz-np-traka">${Object.keys(STATUS).map((k) => `<i class="st-${k}" style="width:${ud(k)}%" title="${STATUS[k]}: ${br[k]}"></i>`).join("")}</div>
        <div class="rz-np-legenda">${Object.keys(STATUS).map((k) => `<span><i class="st-${k}"></i>${STATUS[k]} <b>${br[k]}</b></span>`).join("")}</div>`;
      pz.querySelector(".rz-filteri").innerHTML = [["svi", "Svi", zadaci.length], ...Object.entries(STATUS).map(([k, t]) => [k, t, br[k]])]
        .map(([k, t, n]) => `<button type="button" role="radio" data-f="${k}" aria-checked="${k === filter}">${t} <span>${n}</span></button>`).join("");
      const red = ["hitno", "visoka", "srednja", "niska"];
      const lista = zadaci.filter((z) => filter === "svi" || z.status === filter)
        .sort((a, b) => (a.status === "gotovo") - (b.status === "gotovo") || red.indexOf(a.hitnost) - red.indexOf(b.hitnost) || b.zatrazeno.localeCompare(a.zatrazeno));
      document.getElementById("rz-z-telo").innerHTML = lista.map((z) => {
        const posl = z.izmene[z.izmene.length - 1];
        return `<tr data-id="${esc(z.id)}" class="${z.status === "gotovo" ? "gotov" : ""}">
          <td class="mono">${esc(z.id)}</td>
          <td><b>${esc(z.naslov)}</b>${z.opis ? `<small>${esc(z.opis)}</small>` : ""}
            ${posl ? `<button type="button" class="rz-izmenjeno" aria-expanded="false">${LJ.ik("clock")}izmenjeno ${kad(posl.kad)} · ${z.izmene.length}×</button>
              <ol class="rz-istorija" hidden>${[...z.izmene].reverse().map((iz) => `<li><span>${kad(iz.kad)} · ${esc(iz.autor)}</span>${Object.entries(iz.polja)
                .map(([p, [st, nv]]) => `<div><b>${POLJA[p] || p}:</b> <s>${esc(vrednost(p, st))}</s> → ${esc(vrednost(p, nv))}</div>`).join("")}</li>`).join("")}</ol>` : ""}</td>
          <td><span class="rz-hitnost h-${z.hitnost}">${HITNOST[z.hitnost]}</span></td>
          <td><span class="rz-status st-${z.status}">${STATUS[z.status]}</span></td>
          <td>${esc(z.autor)}</td>
          <td class="mono">${kad(z.zatrazeno)}</td>
          <td class="rz-akcije"><button type="button" class="ikonica-dugme" data-a="izmeni" aria-label="Izmeni ${esc(z.id)}" title="Izmeni">${LJ.ik("olovka")}</button>
            <button type="button" class="ikonica-dugme" data-a="obrisi" aria-label="Obriši ${esc(z.id)}" title="Obriši">${LJ.ik("kanta")}</button></td></tr>`;
      }).join("") || '<tr><td colspan="7" class="sitno">Nema zahteva sa ovim statusom.</td></tr>';
    };

    const forma = document.getElementById("rz-forma"), brisanje = document.getElementById("rz-brisanje");
    const opcije = (obj, izabrano) => Object.entries(obj).map(([k, t]) => `<option value="${k}"${k === izabrano ? " selected" : ""}>${t}</option>`).join("");
    function otvoriFormu(z = null) {
      const nov = !z;
      const id = nov ? sledeciId() : z.id, kadZ = nov ? sada() : z.zatrazeno;
      forma.innerHTML = `<form method="dialog" class="rz-f">
        <div class="rz-f-glava"><h2>${nov ? "Novi zahtev za izmenu" : `Izmena zahteva ${esc(id)}`}</h2>
          <button type="button" class="ikonica-dugme" data-a="zatvori" aria-label="Zatvori">${LJ.ik("x")}</button></div>
        <div class="rz-f-meta"><span><small>ID zahteva</small><b class="mono">${esc(id)}</b></span><span><small>Autor</small><b>${esc(nov ? AUTOR : z.autor)}</b></span>
          <span><small>Zatraženo</small><b class="mono">${kad(kadZ)}</b></span></div>
        <label>Naslov<input name="naslov" required maxlength="140" value="${esc(z?.naslov || "")}"></label>
        <label>Opis<textarea name="opis" rows="3" maxlength="800">${esc(z?.opis || "")}</textarea></label>
        <div class="rz-f-red"><label>Hitnost<select name="hitnost">${opcije(HITNOST, z?.hitnost || "srednja")}</select></label>
          <label>Status<select name="status">${opcije(STATUS, z?.status || "na_cekanju")}</select></label></div>
        <div class="rz-f-dugmad"><button type="button" class="dugme" data-a="zatvori">Otkaži</button>
          <button type="submit" class="dugme primarno">${nov ? "Dodaj zahtev" : "Sačuvaj izmene"}</button></div></form>`;
      forma.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        f.naslov = f.naslov.trim(); f.opis = f.opis.trim();
        if (!f.naslov) return;
        if (nov) zadaci.push({ id, naslov: f.naslov, opis: f.opis, autor: AUTOR, zatrazeno: kadZ, hitnost: f.hitnost, status: f.status, izmene: [] });
        else {
          const promene = {};
          for (const p of Object.keys(POLJA)) if ((z[p] || "") !== (f[p] || "")) { promene[p] = [z[p] || "", f[p]]; z[p] = f[p]; }
          if (Object.keys(promene).length) z.izmene.push({ kad: sada(), autor: AUTOR, polja: promene });
        }
        sacuvaj(); forma.close(); crtajZadatke();
        LJ.tost(nov ? `Dodat zahtev ${id}.` : `Sačuvane izmene zahteva ${id}.`, "check");
      });
      forma.showModal();
      forma.querySelector("[name=naslov]").focus();
    }
    function potvrdiBrisanje(z) {
      brisanje.innerHTML = `<div class="rz-f"><div class="rz-f-glava"><h2>Obrisati zahtev ${esc(z.id)}?</h2>
          <button type="button" class="ikonica-dugme" data-a="zatvori" aria-label="Zatvori">${LJ.ik("x")}</button></div>
        <p class="muted">„${esc(z.naslov)}“ će biti uklonjen sa spiska.</p>
        <div class="rz-f-dugmad"><button type="button" class="dugme" data-a="zatvori">Otkaži</button>
          <button type="button" class="dugme opasno" data-a="potvrdi">Obriši</button></div></div>`;
      brisanje.querySelector("[data-a=potvrdi]").addEventListener("click", () => {
        zadaci = zadaci.filter((x) => x !== z); sacuvaj(); brisanje.close(); crtajZadatke();
        LJ.tost(`Zahtev ${z.id} je obrisan.`, "x");
      });
      brisanje.showModal();
    }
    for (const d of [forma, brisanje]) {
      d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-a=zatvori]")) d.close(); });
    }
    document.getElementById("rz-novi").addEventListener("click", () => otvoriFormu());
    pz.addEventListener("click", (e) => {
      const f = e.target.closest(".rz-filteri [data-f]");
      if (f) { filter = f.dataset.f; crtajZadatke(); return; }
      const iz = e.target.closest(".rz-izmenjeno");
      if (iz) { const ol = iz.nextElementSibling; ol.hidden = !ol.hidden; iz.setAttribute("aria-expanded", String(!ol.hidden)); return; }
      const a = e.target.closest("[data-a]"); const tr = e.target.closest("tr[data-id]");
      if (!a || !tr) return;
      const z = zadaci.find((x) => x.id === tr.dataset.id); if (!z) return;
      if (a.dataset.a === "izmeni") otvoriFormu(z); else if (a.dataset.a === "obrisi") potvrdiBrisanje(z);
    });
    crtajZadatke();
    LJ.pojave(main);
  } catch (e) {
    NS.greska(main, e);
  }
})();
