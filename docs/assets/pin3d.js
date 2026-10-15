/* 3D pin izabrane stanice (Three.js, učitava se tek kad zatreba): telo „kapi“ sa debljinom i zaobljenom tamnoplavom
   ivicom, lice nacrtano kao ikonica izabrane stanice (svetloplavo, prsten, žuti disk, bicikl) sa obe strane,
   reljefni prsten oko diska i tri svetla. Rotira se oko svoje vertikalne ose; pokreće ga mapa kad se završi
   „odskakivanje“ pina. Ako WebGL nije dostupan ili korisnik ne želi animacije, ostaje obična slika. */
"use strict";

const PIN3D = (() => {
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js";
  const THREE_SRI = "sha384-Lwojr+0fOVR25P8bdL6E0T2dv0q0ZT4Yy2Ia1dGOz6b5jLSzWZkdqlw0cKTQYKzT";
  const TAMNA = "#0D47A1", SVETLA = "#90CAF9", ZUTA = "#FFC107";
  const OBRT = 3.2;                                  // sekundi za jedan krug
  const manjeKretanja = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let ucitavanje = null, scena = null, telo = null, aktivan = false, rad = null, ugao = 0, t0 = 0, poslednji = 0, senka = null;

  function ucitajThree() {
    if (window.THREE) return Promise.resolve(true);
    if (ucitavanje) return ucitavanje;
    ucitavanje = new Promise((ok) => {
      const sc = document.createElement("script");
      sc.src = THREE_URL; sc.integrity = THREE_SRI; sc.crossOrigin = "anonymous";
      sc.onload = () => ok(!!window.THREE);
      sc.onerror = () => { ucitavanje = null; ok(false); };
      document.head.appendChild(sc);
    });
    return ucitavanje;
  }

  // ---------------------------------------------------------------- oblik (jedinice: visina pina = 2, vrh dole u y = −1)
  const R = 0.75, CY = 0.25;                         // krug glave pina
  const DISK = { cy: 0.27, prsten: 0.585, zuto: 0.515 };
  function oblikPina(T) {
    const s = new T.Shape();
    const a = Math.acos(R / (CY + 1));               // tangente iz vrha na krug
    const desno = -Math.PI / 2 + a, levo = -Math.PI / 2 - a;
    const tx = R * Math.cos(desno), ty = CY + R * Math.sin(desno);
    // vrh je blago zaobljen
    const k = 0.09, vx = tx * k / (ty + 1), vy = -1 + k;
    s.moveTo(vx, vy);
    s.lineTo(tx, ty);
    s.absarc(0, CY, R, desno, levo + 2 * Math.PI, false);
    s.lineTo(-vx, vy);
    s.quadraticCurveTo(0, -1.0, vx, vy);
    return s;
  }

  /** Lice pina na platnu: isto kao ikonica izabrane stanice. Polje teksture pokriva x, y ∈ [−1.05, 1.05]. */
  function lice(T) {
    const S = 1024, P = 1.05, k = S / (2 * P);
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const X = (x) => S / 2 + x * k, Y = (y) => S / 2 - y * k;
    const a = Math.acos(R / (CY + 1)), desno = -Math.PI / 2 + a, levo = -Math.PI / 2 - a;
    const putanja = () => {
      g.beginPath();
      g.moveTo(X(0), Y(-1));
      g.lineTo(X(R * Math.cos(desno)), Y(CY + R * Math.sin(desno)));
      g.arc(X(0), Y(CY), R * k, -desno, -(levo + 2 * Math.PI), true);
      g.closePath();
    };
    // svetloplavo telo sa tamnim obodom (unutrašnja ivica)
    putanja();
    g.fillStyle = SVETLA; g.fill();
    g.save(); putanja(); g.clip();
    g.lineWidth = 0.13 * k; g.strokeStyle = TAMNA; putanja(); g.stroke();
    // blagi sjaj gore levo
    const sj = g.createRadialGradient(X(-0.35), Y(0.75), 0, X(-0.35), Y(0.75), 1.1 * k);
    sj.addColorStop(0, "rgba(255,255,255,0.35)"); sj.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sj; g.fillRect(0, 0, S, S);
    g.restore();
    // prsten i žuti disk
    g.beginPath(); g.arc(X(0), Y(DISK.cy), DISK.prsten * k, 0, 2 * Math.PI); g.fillStyle = TAMNA; g.fill();
    g.beginPath(); g.arc(X(0), Y(DISK.cy), DISK.zuto * k, 0, 2 * Math.PI);
    const zg = g.createRadialGradient(X(-0.15), Y(DISK.cy + 0.2), 0, X(0), Y(DISK.cy), DISK.zuto * k);
    zg.addColorStop(0, "#FFD54F"); zg.addColorStop(1, ZUTA);
    g.fillStyle = zg; g.fill();
    // bicikl (tamnoplave linije, zaobljeni krajevi)
    const b = (x, y) => [X(x), Y(DISK.cy + y)];
    g.strokeStyle = TAMNA; g.lineWidth = 0.058 * k; g.lineCap = "round"; g.lineJoin = "round";
    const linija = (...t) => { g.beginPath(); g.moveTo(...b(...t[0])); for (const p of t.slice(1)) g.lineTo(...b(...p)); g.stroke(); };
    for (const x of [-0.25, 0.25]) { g.beginPath(); g.arc(...b(x, -0.1), 0.13 * k, 0, 2 * Math.PI); g.stroke(); }
    const zadnji = [-0.25, -0.1], pedale = [0.0, -0.1], sediste = [-0.1, 0.13], volan = [0.16, 0.13], prednji = [0.25, -0.1];
    linija(zadnji, pedale, volan, sediste, zadnji);
    linija(sediste, pedale);
    linija(volan, prednji);
    linija([-0.2, 0.25], [-0.03, 0.25]);             // sedište
    linija([-0.115, 0.25], sediste);
    linija(volan, [0.19, 0.26]);                      // volan sa uvojem
    g.beginPath(); g.arc(...b(0.245, 0.215), 0.052 * k, Math.PI, Math.PI * 2.75, false); g.stroke();
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.repeat.set(1 / (2 * P), 1 / (2 * P));
    tex.offset.set(0.5, 0.5);
    return tex;
  }

  function napraviScenu(T) {
    const canvas = document.createElement("canvas");
    canvas.className = "pin-3d";
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true }); } catch (e) { return null; }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;           // boje ostaju kao na ikonici
    const sc = new T.Scene();
    const kamera = new T.PerspectiveCamera(22, 1, 0.1, 50);
    kamera.position.set(0, 0, 6.17);
    kamera.lookAt(0, 0, 0);
    sc.add(new T.HemisphereLight(0xffffff, 0x2a3b5c, 1.35));
    const kljuc = new T.DirectionalLight(0xffffff, 1.9); kljuc.position.set(2.5, 3, 4); sc.add(kljuc);
    const kontra = new T.DirectionalLight(0xbfdcff, 1.0); kontra.position.set(-3, 1.5, -3.5); sc.add(kontra);
    const dno = new T.DirectionalLight(0xffffff, 0.4); dno.position.set(0, -3, 2); sc.add(dno);

    const pin = new T.Group();
    const oblik = oblikPina(T);
    const DEB = 0.2, BEV = 0.055;
    const telo = new T.ExtrudeGeometry(oblik, { depth: DEB, bevelEnabled: true, bevelThickness: BEV, bevelSize: 0.05, bevelSegments: 6, curveSegments: 64 });
    telo.translate(0, 0, -DEB / 2);
    const ivica = new T.MeshStandardMaterial({ color: 0x1356c4, roughness: 0.3, metalness: 0.15 });
    pin.add(new T.Mesh(telo, ivica));
    const mapa = lice(T);
    const licem = new T.MeshStandardMaterial({ map: mapa, roughness: 0.42, metalness: 0.02,
      emissive: 0xffffff, emissiveMap: mapa, emissiveIntensity: 0.42 });   // boje lica ostaju kao na ikonici, svetla dodaju senčenje
    const z = DEB / 2 + BEV + 0.002;
    const prednje = new T.Mesh(new T.ShapeGeometry(oblik, 64), licem);
    prednje.position.z = z;
    const zadnje = new T.Mesh(new T.ShapeGeometry(oblik, 64), licem);
    zadnje.rotation.y = Math.PI; zadnje.position.z = -z;
    pin.add(prednje, zadnje);
    // reljefni prsten oko diska (sjaj na rotaciji) i blago ispupčen disk
    const prsten = new T.TorusGeometry((DISK.prsten + DISK.zuto) / 2, 0.034, 20, 96);
    for (const s of [1, -1]) {
      const m = new T.Mesh(prsten, ivica);
      m.position.set(0, DISK.cy, s * (z + 0.006));
      pin.add(m);
    }
    sc.add(pin);
    return { renderer, sc, kamera, pin, canvas };
  }

  function velicina(el) {
    const r = el.getBoundingClientRect();
    const px = Math.max(48, Math.round(Math.max(r.width, r.height) * (window.devicePixelRatio || 1) * 1.6));
    if (scena.canvas.width !== px) scena.renderer.setSize(px, px, false);
  }

  function petlja(t) {
    if (!aktivan || !scena) return;
    const dt = Math.min(0.05, (t - (poslednji || t)) / 1000);
    poslednji = t;
    const ubrzanje = Math.min(1, (t - t0) / 900);   // blag polazak
    ugao += dt * (2 * Math.PI / OBRT) * (ubrzanje * ubrzanje * (3 - 2 * ubrzanje));
    scena.pin.rotation.y = ugao;
    if (senka) senka.style.transform = `translateX(-50%) scaleX(${(0.45 + 0.55 * Math.abs(Math.cos(ugao))).toFixed(3)})`;
    scena.renderer.render(scena.sc, scena.kamera);
    rad = requestAnimationFrame(petlja);
  }

  function prikaci(el) {
    if (!aktivan || !scena || !el) return;
    telo = el;
    el.appendChild(scena.canvas);
    el.classList.add("u-3d");
    const pin = el.closest(".pin");
    if (pin) pin.classList.add("rotira");
    senka = pin ? pin.querySelector(".senka") : null;
    velicina(el);
  }

  /** Pokreće 3D pin u datom .telo elementu (posle odskakivanja). */
  async function pokreni(el) {
    if (manjeKretanja()) return;
    zaustavi();
    aktivan = true;
    const cilj = el;
    if (!(await ucitajThree()) || !aktivan) { aktivan = false; return; }
    if (!scena) scena = napraviScenu(window.THREE);
    if (!scena) { aktivan = false; return; }
    ugao = 0; t0 = performance.now(); poslednji = 0;
    prikaci(cilj.isConnected ? cilj : telo);
    scena.renderer.render(scena.sc, scena.kamera);
    rad = requestAnimationFrame(petlja);
  }
  function zaustavi() {
    aktivan = false;
    if (rad) cancelAnimationFrame(rad);
    rad = null;
    if (scena && scena.canvas.parentElement) scena.canvas.remove();
    if (telo) {
      telo.classList.remove("u-3d");
      const pin = telo.closest(".pin");
      if (pin) pin.classList.remove("rotira");
    }
    telo = null; senka = null;
  }
  return { pokreni, zaustavi, prikaci, aktivan: () => aktivan };
})();
