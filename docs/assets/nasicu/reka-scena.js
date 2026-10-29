/*
 * NaSicu – scena „Reka”: panorama (jedna SVG slika) klizi ulevo u beskonačnoj petlji,
 * a biciklista se crta VEKTORSKI (nasicu-likovi.js), pa je oštar na svakom ekranu.
 * Pozadina i pedale idu po istom satu, pa su točkovi uvek usklađeni sa stazom.
 *
 *   const scena = NaSicuRekaScena.napravi(element, {
 *     lik: 'studentkinja-mtb',   // id lika
 *     sirinaPrikaza: 560,        // koliko panorame se vidi (od 4800); manje = uži prikaz
 *     velicinaLika: 0.56,        // veličina biciklista u odnosu na panoramu (1 = kao na kartici)
 *     polozaj: 0.3,              // gde stoji biciklista (0 = levo, 1 = desno)
 *     brzina: 1,                 // 1 = normalno, 0.5 = duplo sporije
 *     panorama: 'reka/reka-panorama.svg',
 *   });
 *   scena.podesi({ sirinaPrikaza: 480 });  // menjanje u hodu
 *   scena.stani(); scena.kreni();
 *
 * Potrebno pre ovog fajla: nasicu-likovi.js i likovi-probni.js.
 */
(function (root) {
  'use strict';
  const RIVER_W = 4800, H = 300, GY = 272, CIKLUS_MS = 1600;
  const NS = 'http://www.w3.org/2000/svg';

  function napravi(el, opcije = {}) {
    const L = root.NaSicuLikovi;
    const svi = Object.values(root.NaSicuProbniLikovi).flat();
    const o = { lik: svi[0].id, sirinaPrikaza: 560, velicinaLika: 0.56, polozaj: 0.3, brzina: 1, panorama: 'reka/reka-panorama.svg', ...opcije };

    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    const traka = document.createElement('div');
    traka.style.cssText = 'position:absolute;left:0;top:0;height:100%;display:flex;will-change:transform';
    for (let i = 0; i < 2; i++) {
      const img = document.createElement('img');
      img.src = o.panorama; img.alt = ''; img.draggable = false;
      img.style.cssText = 'height:100%;width:auto;display:block;flex:none';
      traka.appendChild(img);
    }
    const sloj = document.createElementNS(NS, 'svg');
    sloj.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
    el.append(traka, sloj);

    let lik, r, k = 1, pomeraj = 0, t = 0, posl = null, rad = true, raf = 0;
    const podesi = (n = {}) => {
      Object.assign(o, n);
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
        pomeraj = (pomeraj + dt * 2 * Math.PI * r * o.velicinaLika * 1000 / CIKLUS_MS) % RIVER_W;
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

  root.NaSicuRekaScena = { napravi };
})(window);
