/*
 * Scena vožnje za profil: panorama mesta (SVG) klizi ulevo u beskonačnoj petlji, a biciklista se crta VEKTORSKI
 * (assets/nasicu/nasicu-likovi.js). Isto kao gotova scena „Reka“ (assets/nasicu/reka-scena.js, ne menja se), uz:
 *   - širinu panorame po mestu (`sirinaPanorame`: reka 4800, centar 6720; visina uvek 300, staza na y = 272),
 *   - promenu panorame u hodu (`podesi({ panorama, sirinaPanorame })`): nova slika se prikaže tek kad se učita,
 *     a širina petlje se menja zajedno sa njom (bez skoka).
 *
 *   const scena = NaSicuScenaVoznje.napravi(element, {
 *     lik: 'studentkinja-mtb', sirinaPrikaza: 750, velicinaLika: 0.62, polozaj: 0.32, brzina: 1,
 *     panorama: 'mesto-voznje/centar/centar-dan.svg', sirinaPanorame: 6720,
 *   });
 *   scena.podesi({ panorama: 'mesto-voznje/centar/centar-noc.svg' });  scena.stani();  scena.kreni();
 *
 * Potrebno pre ovog fajla: nasicu-likovi.js i likovi-probni.js.
 */
(function (root) {
  'use strict';
  const H = 300, GY = 272, CIKLUS_MS = 1600;
  const NS = 'http://www.w3.org/2000/svg';

  function napravi(el, opcije = {}) {
    const L = root.NaSicuLikovi;
    const svi = Object.values(root.NaSicuProbniLikovi).flat();
    const o = { lik: svi[0].id, sirinaPrikaza: 560, velicinaLika: 0.56, polozaj: 0.3, brzina: 1,
      panorama: 'mesto-voznje/reka/reka-dan.svg', sirinaPanorame: 4800, ...opcije };

    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    const traka = document.createElement('div');
    traka.style.cssText = 'position:absolute;left:0;top:0;height:100%;display:flex;will-change:transform';
    const slike = [];
    for (let i = 0; i < 2; i++) {
      const img = document.createElement('img');
      img.src = o.panorama; img.alt = ''; img.draggable = false;
      img.style.cssText = 'height:100%;width:auto;display:block;flex:none';
      traka.appendChild(img);
      slike.push(img);
    }
    const sloj = document.createElementNS(NS, 'svg');
    sloj.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
    el.append(traka, sloj);

    let lik, r, k = 1, pomeraj = 0, t = 0, posl = null, rad = true, raf = 0;
    let prikazana = o.panorama, sirina = o.sirinaPanorame;     // slika i širina petlje koje se trenutno vide
    const podesi = (n = {}) => {
      Object.assign(o, n);
      if (o.panorama !== prikazana) {
        const p = o.panorama, w = o.sirinaPanorame, nova = new Image();
        prikazana = p;
        nova.src = p;
        (nova.decode ? nova.decode() : Promise.resolve()).catch(() => {}).then(() => {
          if (prikazana !== p) return;                          // u međuvremenu izabrana druga panorama
          slike.forEach((img) => { img.src = p; });
          sirina = w;
          pomeraj %= w;
          crtaj();
        });
      }
      lik = svi.find((l) => l.id === o.lik) || svi[0];
      const b = L.BIKES[lik.bike.type];
      r = b.directDrive ? b.rFront : b.r;                       // poluprečnik točka u jedinicama crteža
      el.style.aspectRatio = `${o.sirinaPrikaza} / ${H}`;
      sloj.setAttribute('viewBox', `0 0 ${o.sirinaPrikaza} ${H}`);
      crtaj();
    };
    const meri = () => { k = el.clientHeight / H; };
    new ResizeObserver(meri).observe(el);

    function crtaj() {
      const x = o.sirinaPrikaza * o.polozaj, s = o.velicinaLika;
      sloj.innerHTML = `<g transform="translate(${x},${GY}) scale(${s}) translate(-200,${-GY})">${L.renderFrame(lik, t, { inner: true, wheelTurns: 1 })}</g>`;
      traka.style.transform = `translateX(${-(pomeraj * k).toFixed(2)}px)`;
    }
    function kadar(now) {
      if (posl != null) {
        const dt = Math.min(0.1, (now - posl) / 1000) * o.brzina;
        t = (t + dt * 1000 / CIKLUS_MS) % 1;
        // pozadina prelazi tačno obim točka (umanjen kao lik) za svaki krug pedala
        pomeraj = (pomeraj + dt * 2 * Math.PI * r * o.velicinaLika * 1000 / CIKLUS_MS) % sirina;
      }
      posl = now;
      crtaj();
      if (rad) raf = requestAnimationFrame(kadar);
    }
    const kreni = () => { if (!raf || !rad) { rad = true; posl = null; raf = requestAnimationFrame(kadar); } };
    const stani = () => { rad = false; cancelAnimationFrame(raf); raf = 0; };
    meri(); podesi();
    if (!(root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) kreni();
    return { podesi, kreni, stani };
  }

  root.NaSicuScenaVoznje = { napravi };
})(window);
