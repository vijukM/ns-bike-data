/* Brojanje vozila sa kamere (Admin → Kamere uživo), u pregledaču.
 *
 * Detekcija: TensorFlow.js + COCO-SSD (Apache-2.0), model ssdlite_mobilenet_v2 u docs/assets/modeli/coco-ssd/.
 * Biblioteka se učita sa jsdelivr (SRI), model iz repozitorijuma (radi i offline, jednom se skine ~18 MB).
 * Sve se dešava na uređaju gledaoca — ništa se ne šalje nikuda, ništa se ne čuva.
 *
 * Zašto „pločice“ (tiling): SSD kadar interno smanji na ~300 px, pa sitna/daleka vozila nestanu. Zato kadar delimo
 * na PLOCICE.x × PLOCICE.y delova, svaki zasebno detektujemo i spojimo (NMS). Više pločica = bolje na sitnim
 * vozilima, ali sporije. Ovo je „koliko se trenutno vidi“ (bez praćenja i linije); protok preko linije dolazi kasnije.
 *
 * Granica: radi kroz hls.js (MSE), gde se slike sa videa mogu čitati. Na iOS nativnom HLS-u čitanje piksela može
 * biti blokirano (tada brojanje ne radi, prikaz da). Ovo je prototip; za „zvanične“ brojke treba linija + praćenje
 * i poređenje sa zvaničnim brojačima (ns-trafic-data), a za javni rad dozvola/licenca vlasnika prenosa.
 *
 * Podešavanja su na vrhu (PLOCICE, PRAG, INTERVAL_MS…), kao SCENA u profil.js. */
"use strict";

window.BROJAC = (() => {
  const LIBOVI = [
    ["tf", "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
      "sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre"],
    ["cocoSsd", "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js",
      "sha384-7qLdgfEQyO9ZQi9ArRHigK+IBto4XPk468jAqc+fnsXaZIcMAhQeLwzggRK7aESl"],
  ];
  const MODEL = { put: "assets/modeli/coco-ssd/model.json", baza: "lite_mobilenet_v2" };
  const PLOCICE = { x: 3, y: 2, preklop: 40 };   // podela kadra; veći brojevi = bolje na sitnim vozilima, sporije
  const PRAG = 0.25;                              // najmanja pouzdanost detekcije
  const INTERVAL_MS = 220;                        // razmak između detekcija (~4–5 u sekundi)
  const IOU = 0.45;                               // spajanje duplih kutija iz susednih pločica
  const KLASE = { car: "auto", truck: "kamion", bus: "autobus", motorcycle: "motor" };   // šta je „vozilo“
  const BOJE = { car: "#38BDF8", truck: "#F59E0B", bus: "#A78BFA", motorcycle: "#34D399" };

  // ------------------------------------------------------------ učitavanje biblioteke i modela (jednom)
  let libP = null, modelP = null, model = null;
  const ucitajLib = (url, sri) => new Promise((ok, ne) => {
    const s = document.createElement("script");
    s.src = url; s.integrity = sri; s.crossOrigin = "anonymous";
    s.onload = ok; s.onerror = () => ne(new Error(`nije učitano: ${url}`));
    document.head.appendChild(s);
  });
  function spremiLib() {
    return (libP ||= (async () => {
      for (const [glob, url, sri] of LIBOVI) if (!window[glob]) await ucitajLib(url, sri);
      try { await tf.setBackend("webgl"); } catch (e) { /* ostaje podrazumevani (cpu/wasm) */ }
      await tf.ready();
    })());
  }
  function spremiModel() {
    return (modelP ||= (async () => {
      await spremiLib();
      model = await cocoSsd.load({ base: MODEL.baza, modelUrl: MODEL.put });
      return model;
    })());
  }

  // ------------------------------------------------------------ pomoćno: spajanje kutija (NMS)
  const iou = (a, b) => {
    const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return i / (a[2] * a[3] + b[2] * b[3] - i + 1e-6);
  };
  const nms = (ds) => {
    ds.sort((p, q) => q.s - p.s);
    const r = [];
    for (const d of ds) if (r.every((k) => iou(k.b, d.b) < IOU)) r.push(d);
    return r;
  };

  // ------------------------------------------------------------ jedna kamera: petlja detekcije + crtanje
  function napravi(video, platno, naBroj) {
    const ctx = platno.getContext("2d");
    const off = document.createElement("canvas"), octx = off.getContext("2d");
    let radi = true, zadnje = [];

    async function detektuj() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const { x: nx, y: ny, preklop: ov } = PLOCICE;
      const tw = Math.ceil(vw / nx), th = Math.ceil(vh / ny);
      const sve = [];
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        const sx = Math.max(0, ix * tw - ov), sy = Math.max(0, iy * th - ov);
        const ex = Math.min(vw, (ix + 1) * tw + ov), ey = Math.min(vh, (iy + 1) * th + ov);
        const sw = ex - sx, sh = ey - sy;
        off.width = sw; off.height = sh;
        octx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
        let pred;
        try { pred = await model.detect(off, 20, PRAG); } catch (e) { return; }
        for (const d of pred) if (d.class in KLASE) {
          const [bx, by, bw, bh] = d.bbox;
          sve.push({ k: d.class, s: d.score, b: [bx + sx, by + sy, bw, bh] });
        }
      }
      zadnje = nms(sve);
      crtaj(vw, vh);
      const po = {}; zadnje.forEach((d) => (po[d.k] = (po[d.k] || 0) + 1));
      naBroj(zadnje.length, po);
    }

    function crtaj(vw, vh) {
      const w = video.clientWidth || vw, h = video.clientHeight || vh;
      if (platno.width !== w || platno.height !== h) { platno.width = w; platno.height = h; }
      ctx.clearRect(0, 0, w, h);
      const sk = Math.min(w / vw, h / vh), dx = (w - vw * sk) / 2, dy = (h - vh * sk) / 2;   // video je object-fit: contain
      const lw = Math.max(1.5, (w / 640) * 2);
      ctx.lineWidth = lw; ctx.font = `600 ${Math.max(10, (w / 640) * 12)}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "bottom";
      for (const d of zadnje) {
        const x = dx + d.b[0] * sk, y = dy + d.b[1] * sk, ww = d.b[2] * sk, hh = d.b[3] * sk;
        const c = BOJE[d.k] || "#38BDF8";
        ctx.strokeStyle = c; ctx.strokeRect(x, y, ww, hh);
      }
    }

    async function petlja() {
      while (radi) {
        const t = performance.now();
        if (!video.paused && !document.hidden && video.readyState >= 2) {
          try { await detektuj(); } catch (e) { /* preskoči kadar */ }
        }
        const dt = performance.now() - t;
        await new Promise((r) => setTimeout(r, Math.max(0, INTERVAL_MS - dt)));
      }
    }
    petlja();
    return { stop() { radi = false; try { ctx.clearRect(0, 0, platno.width, platno.height); } catch (e) {} } };
  }

  async function ukljuci(video, platno, naBroj) { await spremiModel(); return napravi(video, platno, naBroj); }

  return { ukljuci, spremiModel, KLASE };
})();
