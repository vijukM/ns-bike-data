/*
 * NaSicu – generator likova biciklista (SVG)
 * -------------------------------------------
 * Svaki lik je samo konfiguracija (JSON). Funkcija renderCyclist(cfg) iz nje
 * računa geometriju bicikla, pozu vozača (inverzna kinematika za noge i ruke)
 * i vraća gotov SVG string.
 *
 * Radi i u pregledaču (<script src="nasicu-likovi.js"> -> window.NaSicuLikovi)
 * i u Node-u (require('./nasicu-likovi.js')).
 *
 * Koordinate: kanvas 400x300, y raste nadole, svi likovi stoje na istoj
 * liniji tla (GROUND_Y) i gledaju udesno.
 */
(function (root) {
  'use strict';

  /* ======================= Paleta (usklađena sa NaSicu logom) ======================= */
  const COLORS = {
    navy: '#0B1630', ink: '#1E2742', blue: '#19B4FF', blueDeep: '#0D86C8',
    coral: '#FF5A3C', coralDeep: '#D8432A', sun: '#FFC23D', mint: '#8FDCC6',
    sky: '#BFE6FF', sand: '#E8D2AE', steel: '#8A93A6', light: '#E6EBF2', white: '#FFFFFF',
  };
  const SKIN = ['#F7D9C4', '#EEC2A2', '#DDA47E', '#C3845E', '#986241', '#6B432E'];
  const HAIR = {
    black: '#1F1B1A', brown: '#5B3A27', blond: '#D8A74C', red: '#B4542F',
    grey: '#C7CCD4', white: '#EEF1F4',
  };

  const CANVAS = { w: 400, h: 300 };
  let WIND = 1; // jačina vetra za kosu, veo, trakice (postavlja renderCyclist)
  const GROUND_Y = 272;

  /* ======================= Vektorska pomoćna matematika ======================= */
  const v = (x, y) => ({ x, y });
  const add = (a, b) => v(a.x + b.x, a.y + b.y);
  const sub = (a, b) => v(a.x - b.x, a.y - b.y);
  const mul = (a, s) => v(a.x * s, a.y * s);
  const len = (a) => Math.hypot(a.x, a.y);
  const norm = (a) => { const l = len(a) || 1; return v(a.x / l, a.y / l); };
  const lerp = (a, b, t) => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const rad = (d) => (d * Math.PI) / 180;
  // pravac pod uglom (matematički: 0° = desno, 90° = gore)
  const dir = (deg) => v(Math.cos(rad(deg)), -Math.sin(rad(deg)));
  const r1 = (n) => Math.round(n * 10) / 10;
  const P = (p) => `${r1(p.x)},${r1(p.y)}`;

  function shade(hex, k) { // k<1 tamnije, k>1 svetlije
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1))));
    r = f(r); g = f(g); b = f(b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Inverzna kinematika sa dve kosti (kuk-koleno-skočni zglob, rame-lakat-šaka).
   * Vraća položaj srednjeg zgloba. `pick` bira jedno od dva moguća rešenja.
   */
  function ik2(a, b, l1, l2, pick) {
    const d = sub(b, a);
    const dist = Math.min(len(d), (l1 + l2) * 0.999);
    const base = Math.atan2(d.y, d.x);
    const c = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const A = Math.acos(Math.max(-1, Math.min(1, c)));
    const j1 = add(a, v(Math.cos(base + A) * l1, Math.sin(base + A) * l1));
    const j2 = add(a, v(Math.cos(base - A) * l1, Math.sin(base - A) * l1));
    return pick(j1, j2);
  }

  /* ======================= Geometrija bicikala ======================= */
  // Sve mere su u lokalnom sistemu gde je zadnja osovina u (0,0).
  const BIKES = {
    trekking: {
      r: 46, tire: 6.5, wheelbase: 156, bb: v(66, 9), seatAngle: 73, seatTube: 64,
      headTop: v(136, -58), headBottom: v(144, -33), frame: 'diamond', bar: 'flat',
      steererTop: v(133, -68), grip: v(141, -71), crank: 18, chainring: 10,
    },
    gradski: {
      r: 46, tire: 7.5, wheelbase: 158, bb: v(68, 9), seatAngle: 70, seatTube: 56,
      headTop: v(133, -63), headBottom: v(143, -32), frame: 'stepThrough', bar: 'swept',
      steererTop: v(129, -80), grip: v(110, -87), crank: 18, chainring: 10,
    },
    drumski: {
      r: 46, tire: 4, wheelbase: 152, bb: v(64, 11), seatAngle: 74, seatTube: 62,
      headTop: v(135, -50), headBottom: v(141, -29), frame: 'diamond', bar: 'drop',
      steererTop: v(133, -57), grip: v(156, -59.5), crank: 18, chainring: 11,
    },
    mtb: {
      r: 46, tire: 9, wheelbase: 154, bb: v(64, 12), seatAngle: 73, seatTube: 52,
      headTop: v(132, -58), headBottom: v(139, -29), frame: 'sloping', bar: 'flat',
      steererTop: v(130, -69), grip: v(139, -73), crank: 18, chainring: 10,
    },
    // sklopivi: mali točkovi, dugačka sedišna šipka i lula kormana
    sklopivi: {
      r: 26, tire: 5.5, wheelbase: 108, bb: v(52, -4), seatAngle: 72, seatTube: 30,
      headTop: v(98, -36), headBottom: v(102, -18), frame: 'mono', bar: 'flat',
      steererTop: v(93, -86), grip: v(101, -88), crank: 17, chainring: 11, spokes: 12,
    },
    // električni gradski: niski ram, baterija na prtljažniku, motor u glavčini
    elektricni: {
      r: 46, tire: 7.5, wheelbase: 158, bb: v(68, 9), seatAngle: 70, seatTube: 56,
      headTop: v(133, -63), headBottom: v(143, -32), frame: 'stepThrough', bar: 'swept',
      steererTop: v(129, -80), grip: v(110, -87), crank: 18, chainring: 10,
    },
    bmx: {
      r: 33, tire: 9, wheelbase: 118, bb: v(52, -2), seatAngle: 70, seatTube: 28,
      headTop: v(102, -38), headBottom: v(106, -22), frame: 'diamond', bar: 'bmx',
      steererTop: v(101, -46), grip: v(96, -70), crank: 17, chainring: 12,
    },
    // teretni (long john): sanduk između vozača i manjeg prednjeg točka
    teretni: {
      r: 46, rFront: 30, tire: 6.5, wheelbase: 236, bb: v(66, 9), seatAngle: 72, seatTube: 60,
      headTop: v(124, -60), headBottom: v(130, -34), frame: 'cargo', bar: 'swept',
      steererTop: v(121, -74), grip: v(104, -84), crank: 18, chainring: 10, spokes: 18,
      forkTop: v(222, -16), box: { x0: 137, x1: 214, top: -34, bottom: 8 },
    },
    // visoki točak (penny-farthing): pedale su na osovini prednjeg točka, bez lanca
    visokiTocak: {
      r: 15, rFront: 60, tire: 4.5, wheelbase: 100, bb: v(100, -45), seatAngle: 78, seatTube: 70,
      headTop: v(102, -124), headBottom: v(100, -110), frame: 'penny', bar: 'mustache',
      steererTop: v(103, -130), grip: v(117, -124), crank: 15, chainring: 0, noChain: true, directDrive: true, spokes: 24,
    },
    kruzer: {
      r: 46, tire: 11, wheelbase: 170, bb: v(70, 12), seatAngle: 68, seatTube: 46,
      headTop: v(142, -56), headBottom: v(150, -30), frame: 'cruiser', bar: 'ape',
      steererTop: v(139, -64), grip: v(116, -96), crank: 18, chainring: 11,
    },
    tricikl: {
      r: 38, tire: 6, wheelbase: 150, bb: v(62, 9), seatAngle: 70, seatTube: 48,
      headTop: v(124, -58), headBottom: v(132, -30), frame: 'stepThrough', bar: 'swept',
      steererTop: v(120, -76), grip: v(102, -82), crank: 17, chainring: 10,
    },
    mali: {
      r: 24, tire: 6, wheelbase: 86, bb: v(38, 4), seatAngle: 70, seatTube: 22,
      headTop: v(74, -32), headBottom: v(78, -18), frame: 'sloping', bar: 'riser',
      steererTop: v(72, -40), grip: v(70, -47), crank: 10, chainring: 6.5, spokes: 12,
    },
    hronometar: {
      r: 46, tire: 4, wheelbase: 154, bb: v(66, 12), seatAngle: 78, seatTube: 58,
      headTop: v(140, -44), headBottom: v(146, -25), frame: 'diamond', bar: 'aero',
      steererTop: v(139, -48), grip: v(170, -54), crank: 18, chainring: 12,
    },
    lezeci: {
      r: 46, rFront: 30, tire: 5, wheelbase: 176, bb: v(168, -46), seatAngle: 60, seatTube: 20,
      seatPoint: v(84, -40), headTop: v(158, -32), headBottom: v(163, -16), frame: 'recumbent', bar: 'tiller',
      steererTop: v(148, -62), grip: v(124, -68), crank: 17, chainring: 11,
    },
    fatbike: {
      r: 42, tire: 15, wheelbase: 156, bb: v(64, 10), seatAngle: 73, seatTube: 54,
      headTop: v(134, -60), headBottom: v(141, -32), frame: 'sloping', bar: 'flat',
      steererTop: v(131, -71), grip: v(139, -74), crank: 18, chainring: 10,
    },
    fiksi: {
      r: 46, tire: 4, wheelbase: 150, bb: v(64, 11), seatAngle: 74, seatTube: 62,
      headTop: v(140, -52), headBottom: v(146, -30), frame: 'diamond', bar: 'bullhorn',
      steererTop: v(138, -57), grip: v(161, -64), crank: 18, chainring: 12,
    },
    javni: {
      r: 44, tire: 8, wheelbase: 160, bb: v(70, 9), seatAngle: 70, seatTube: 54,
      headTop: v(134, -62), headBottom: v(144, -32), frame: 'stepThrough', bar: 'swept',
      steererTop: v(130, -80), grip: v(112, -86), crank: 18, chainring: 10,
    },
    retroSklopivi: {
      r: 26, tire: 6, wheelbase: 108, bb: v(52, -4), seatAngle: 72, seatTube: 30,
      headTop: v(98, -36), headBottom: v(102, -18), frame: 'mono', bar: 'swept',
      steererTop: v(93, -84), grip: v(82, -88), crank: 17, chainring: 11, spokes: 12,
    },
    gravel: {
      r: 46, tire: 7, wheelbase: 158, bb: v(66, 12), seatAngle: 73, seatTube: 60,
      headTop: v(142, -52), headBottom: v(149, -29), frame: 'sloping', bar: 'drop',
      steererTop: v(140, -59), grip: v(163, -61.5), crank: 18, chainring: 11,
    },
    eTricikl: {
      r: 40, rFront: 26, tire: 6, wheelbase: 196, bb: v(62, 9), seatAngle: 72, seatTube: 54,
      headTop: v(122, -60), headBottom: v(130, -34), frame: 'cargo', bar: 'swept',
      steererTop: v(119, -76), grip: v(102, -82), crank: 18, chainring: 10,
      forkTop: v(196, -10), box: { x0: 146, x1: 230, top: -50, bottom: -10 },
    },
    guralica: {
      r: 22, tire: 6, wheelbase: 82, bb: v(36, 0), seatAngle: 72, seatTube: 14,
      headTop: v(70, -32), headBottom: v(74, -18), frame: 'sloping', bar: 'riser',
      steererTop: v(68, -40), grip: v(66, -46), crank: 0, chainring: 0, noChain: true, noCrank: true, spokes: 12,
    },
    tandem: {
      r: 46, tire: 6, wheelbase: 252, bb: v(64, 9), bbFront: v(160, 9), seatAngle: 72, seatTube: 58,
      headTop: v(232, -58), headBottom: v(240, -32), frame: 'tandem', bar: 'flat',
      steererTop: v(229, -68), grip: v(237, -71), crank: 18, chainring: 10,
    },
    decji: {
      r: 30, tire: 6, wheelbase: 104, bb: v(44, 6), seatAngle: 70, seatTube: 34,
      headTop: v(88, -40), headBottom: v(93, -23), frame: 'sloping', bar: 'riser',
      steererTop: v(86, -49), grip: v(84, -57), crank: 12, chainring: 7.5,
    },
  };

  /* ======================= Proporcije tela ======================= */
  const BODY = {
    zena: { thigh: 53, shin: 51, torso: 57, upperArm: 39, forearm: 37, headR: 13.2, neck: 5.5,
      w: { thigh: 15.5, shin: 11.5, upperArm: 10.5, forearm: 8.8, torsoHip: 11, torsoChest: 11.8 } },
    odrasli: { thigh: 54, shin: 52, torso: 60, upperArm: 41, forearm: 39, headR: 13.5, neck: 5,
      w: { thigh: 16, shin: 12.5, upperArm: 11.5, forearm: 9.5, torsoHip: 11, torsoChest: 13 } },
    malo: { thigh: 26, shin: 25, torso: 32, upperArm: 20, forearm: 19, headR: 11.5, neck: 2.5,
      w: { thigh: 10, shin: 8.5, upperArm: 7.5, forearm: 6.5, torsoHip: 7.5, torsoChest: 8.5 } },
    dete: { thigh: 34, shin: 33, torso: 40, upperArm: 26, forearm: 24, headR: 12, neck: 3,
      w: { thigh: 11.5, shin: 9.5, upperArm: 8.5, forearm: 7.5, torsoHip: 8, torsoChest: 9.5 } },
  };

  /* ======================= Glavni proračun poze ======================= */
  /** Visina sica iz dužine nogu: noga u donjoj tački pedale je skoro ispružena. */
  function fitSaddle(bb, seatDir, body, crank, drop) {
    const legTarget = 0.95 * (body.thigh + body.shin) - crank;
    const hipOff = v(-1.5, -4.5);
    let lo = 0, hi = 200;
    for (let i = 0; i < 40; i++) {
      const k = (lo + hi) / 2;
      const hip = add(add(bb, mul(seatDir, k)), hipOff);
      if (len(sub(hip, bb)) > legTarget) hi = k; else lo = k;
    }
    return add(bb, mul(seatDir, lo - (drop || 0)));
  }

  const rotV = (p, deg) => { const a = rad(deg), c = Math.cos(a), s = Math.sin(a); return v(p.x * c - p.y * s, p.x * s + p.y * c); };

  /** Poza jednog vozača: kuk, noge (IK), trup, ruke (IK), glava. */
  function riderPose(bike, bb, saddle, grip, rider, crankDeg, phase) {
    const body = BODY[rider.build || 'odrasli'];
    let hip = add(saddle, v(-1.5, -4.5));
    if (rider.stand) {
      // vožnja iz stajanja: kuk iznad srednje osovine, blago gore-dole u ritmu pedala
      const L = 0.97 * (body.thigh + body.shin), fx = 16;
      const h = Math.sqrt(L * L - fx * fx) - bike.crank;
      hip = add(bb, v(fx, -h + 3 * Math.cos(rad(2 * crankDeg))));
    }
    let pedalNear = add(bb, mul(dir(crankDeg), bike.crank));
    let pedalFar = add(bb, mul(dir(crankDeg + 180), bike.crank));
    if (rider.balance) {
      // guralica: nema pedala, stopala se odguruju od tla i podižu dok idu napred
      const foot = (deg) => {
        const a = rad(deg);
        return v(hip.x + 12 + 15 * Math.cos(a), GROUND_Y - 2.5 - 8 * Math.max(0, Math.sin(a)));
      };
      pedalNear = foot(crankDeg);
      pedalFar = foot(crankDeg + 180);
    }
    const legPick = rider.kneeUp ? (a, b) => (a.y < b.y ? a : b) : (a, b) => (a.x > b.x ? a : b); // koleno napred (ili gore kod ležećeg)
    const legs = [pedalNear, pedalFar].map((pedal) => {
      const ankle = add(pedal, v(-4.5, -6.5));
      return { pedal, ankle, knee: ik2(hip, ankle, body.thigh, body.shin, legPick) };
    });

    // Trup: kreni od željenog nagiba pa se naginji dok (dalja) ruka ne dohvati korman.
    const reach = (body.upperArm + body.forearm) * 0.95;
    let angle = rider.lean == null ? 50 : rider.lean;
    let shoulder;
    for (let i = 0; i < 80; i++) {
      shoulder = add(hip, mul(dir(angle), body.torso));
      if (len(sub(grip, shoulder)) <= reach || angle <= (rider.minLean == null ? 18 : rider.minLean)) break;
      angle -= 1;
    }
    const u = norm(sub(shoulder, hip));
    const neckAngle = Math.min(84, angle + (rider.headLift || 26));
    const headC = add(add(shoulder, mul(u, 4)), mul(dir(neckAngle), body.neck + body.headR));

    const lowElbow = (a, b) => (a.y > b.y ? a : b);
    let handNear = grip, nearPick = lowElbow;
    if (rider.phone) { // telefon u bližoj ruci, ispred lica
      handNear = add(shoulder, v(body.upperArm * 0.62, body.upperArm * 0.22));
    } else if (rider.wave) { // mahanje: ruka gore, njiše se levo-desno
      handNear = add(shoulder, rotV(v(body.upperArm * 0.92, -body.upperArm * 0.85), 12 * Math.sin(phase * Math.PI * 4)));
    }
    const handFar = add(grip, v(3, -2.5));
    const arms = [
      { hand: handNear, elbow: ik2(shoulder, handNear, body.upperArm, body.forearm, nearPick) },
      { hand: handFar, elbow: ik2(shoulder, handFar, body.upperArm, body.forearm, lowElbow) },
    ];
    return { body, hip, shoulder, u, angle, legs, arms, headC, crankDeg, pedalNear, pedalFar, crankBB: bb };
  }

  function solvePose(cfg, phase = 0) {
    const bike = BIKES[cfg.bike.type];

    // Postavi bicikl tako da je centriran i da gume dodiruju liniju tla.
    const axleY = GROUND_Y - bike.r - bike.tire / 2;
    const frontX = bike.wheelbase;
    const rF = bike.rFront || bike.r;
    const span = (frontX + rF) - (-bike.r);
    const ox = (CANVAS.w - span) / 2 + bike.r + (cfg.offsetX || 0);
    const T = (p) => v(p.x + ox, p.y + axleY);

    const g = {
      rear: T(v(0, 0)), front: T(v(frontX, bike.r - rF)), bb: T(bike.bb), rFront: rF,
      headTop: T(bike.headTop), headBottom: T(bike.headBottom),
      steererTop: T(bike.steererTop), grip: T(bike.grip),
    };
    const seatDir = dir(180 - bike.seatAngle); // uz sedišnu cev, nagore-unazad
    g.seatCluster = add(g.bb, mul(seatDir, bike.seatTube));
    g.forkTop = bike.forkTop ? T(bike.forkTop) : g.headBottom;
    if (bike.box) g.box = { x0: bike.box.x0 + ox, x1: bike.box.x1 + ox, top: bike.box.top + axleY, bottom: bike.box.bottom + axleY };

    const crankDeg = cfg.crankAngle == null ? -35 : cfg.crankAngle; // ugao bliže pedale
    const body = BODY[cfg.rider.build || 'odrasli'];
    let main;
    if (bike.bbFront) {
      // tandem: kapiten napred, saputnik pozadi; pedale su povezane lancem pa idu zajedno
      g.bbF = T(bike.bbFront);
      g.seatClusterF = add(g.bbF, mul(seatDir, bike.seatTube));
      g.saddleF = fitSaddle(g.bbF, seatDir, body, bike.crank, 0);
      main = riderPose(bike, g.bbF, g.saddleF, g.grip, cfg.rider, crankDeg, phase);
      const sb = BODY[cfg.stoker.build || 'odrasli'];
      g.saddle = fitSaddle(g.bb, seatDir, sb, bike.crank, 0);
      g.gripS = add(lerp(g.seatClusterF, g.saddleF, 0.55), v(-16, 2));
      const st = riderPose(bike, g.bb, g.saddle, g.gripS, cfg.stoker, crankDeg, phase);
      main.stoker = { bike, g, ...st };
    } else {
      g.saddle = bike.seatPoint ? T(bike.seatPoint) : fitSaddle(g.bb, seatDir, body, bike.crank, cfg.bike.saddleDrop);
      main = riderPose(bike, g.bb, g.saddle, g.grip, cfg.rider, crankDeg, phase);
    }
    return { bike, g, ...main };
  }

  /* ======================= Crtanje: pomoćne funkcije ======================= */
  const seg = (a, b, w, color, extra = '') =>
    `<line x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}" stroke="${color}" stroke-width="${w}" ${extra.includes('stroke-linecap') ? '' : 'stroke-linecap="round"'} ${extra}/>`;
  const circ = (c, r, fill, extra = '') => `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="${r1(r)}" fill="${fill}" ${extra}/>`;
  const pathEl = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const arcPoint = (c, R, deg) => add(c, mul(dir(deg), R));

  /* ---------- Točak ---------- */
  function drawWheel(c, bike, cfg, rot = 0, radius, which = 'rear') {
    const R = radius || bike.r;
    const rim = R - bike.tire / 2 - 1.2;
    let s = '';
    if (which === 'rear' && cfg.bike.discRear) { // pun disk točak (hronometar)
      s += circ(c, R, 'none', `stroke="${COLORS.ink}" stroke-width="${bike.tire}"`);
      s += circ(c, rim + 0.6, cfg.bike.discColor || '#2B3552');
      s += circ(c, rim * 0.62, 'none', `stroke="${shade(cfg.bike.discColor || '#2B3552', 1.25)}" stroke-width="1.2" opacity="0.6"`);
      s += `<g transform="rotate(${r1(rot)} ${P(c)})"><path d="M${P(arcPoint(c, rim * 0.8, 120))}A${r1(rim * 0.8)} ${r1(rim * 0.8)} 0 0 1 ${P(arcPoint(c, rim * 0.8, 60))}" stroke="${cfg.bike.discStripe || COLORS.coral}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      s += circ(add(c, v(0, -rim + 3)), 1.4, '#9AA3B2') + '</g>';
      s += circ(c, 4.2, '#9AA3B2') + circ(c, 1.8, '#E6EBF2');
      return `<g class="tocak disk">${s}</g>`;
    }
    if (which === 'front' && cfg.bike.triSpoke) { // aero točak sa tri široke žbice
      s += circ(c, R, 'none', `stroke="${COLORS.ink}" stroke-width="${bike.tire}"`);
      s += circ(c, rim - 3, 'none', `stroke="#2B3552" stroke-width="7"`);
      let sp = '';
      for (let i = 0; i < 3; i++) sp += seg(c, arcPoint(c, rim - 4, 90 + i * 120), 6, '#2B3552');
      s += `<g transform="rotate(${r1(rot)} ${P(c)})">${sp}${circ(add(c, v(0, -rim + 3)), 1.4, '#9AA3B2')}</g>`;
      s += circ(c, 4.6, '#9AA3B2') + circ(c, 1.8, '#E6EBF2');
      return `<g class="tocak aero">${s}</g>`;
    }
    const n = bike.spokes || (cfg.bike.type === 'decji' ? 12 : 18);
    let spokes = '';
    for (let i = 0; i < n; i++) {
      const a = (i * 360) / n + 7;
      spokes += `M${P(c)}L${P(arcPoint(c, rim - 1, a))}`;
    }
    s += `<g class="tocak">`;
    s += circ(c, R, 'none', `stroke="${COLORS.ink}" stroke-width="${bike.tire}"`);
    s += circ(c, R - bike.tire / 2 - 0.6, 'none', `stroke="${shade(COLORS.ink, 1.35)}" stroke-width="0.8" opacity="0.6"`);
    if (cfg.bike.deepRim) s += circ(c, rim - 2.2, 'none', `stroke="${cfg.bike.deepRim}" stroke-width="6.5"`);
    else s += circ(c, rim, 'none', `stroke="${cfg.bike.rim || '#C9D1DC'}" stroke-width="2.2"`);
    // žbice i ventil se okreću (rot u stepenima, u smeru kazaljke na satu = vožnja napred)
    s += `<g transform="rotate(${r1(rot)} ${P(c)})"><path d="${spokes}" stroke="#B7C0CD" stroke-width="0.7" fill="none"/>`;
    s += circ(add(c, v(0, -rim)), 1.6, '#5B6478');
    if (cfg.bike.knobby) { // kramponi na MTB gumi (deblji na fatbajku)
      const fat = bike.tire > 12;
      s += circ(c, R + bike.tire / 2 - 0.2, 'none', `stroke="${COLORS.ink}" stroke-width="${fat ? 4 : 2.6}" stroke-dasharray="${fat ? '3.4 3' : '2.2 2.6'}"`);
    }
    s += '</g>';
    if (cfg.bike.whitewall) s += circ(c, R - bike.tire * 0.18, 'none', `stroke="#F7F3EA" stroke-width="${r1(bike.tire * 0.32)}"`);
    s += circ(c, R < 30 ? 3.4 : 4.2, '#9AA3B2');
    s += circ(c, 1.8, '#E6EBF2');
    s += `</g>`;
    return s;
  }

  function drawMiniWheel(c, R, rot) { // pomoćni točkić / točak prikolice
    let sp = '';
    for (let i = 0; i < 8; i++) sp += `M${P(c)}L${P(arcPoint(c, R - 2.5, i * 45))}`;
    return circ(c, R, 'none', `stroke="${COLORS.ink}" stroke-width="3.6"`) + circ(c, R - 2.4, 'none', `stroke="#C9D1DC" stroke-width="1.4"`)
      + `<g transform="rotate(${r1(rot)} ${P(c)})"><path d="${sp}" stroke="#B7C0CD" stroke-width="0.7"/>${circ(add(c, v(0, -R + 2.5)), 1.1, '#5B6478')}</g>` + circ(c, 2.2, '#9AA3B2');
  }

  /* ---------- Blatobran ---------- */
  function fender(c, R, from, to, color) {
    const a = arcPoint(c, R, from), b = arcPoint(c, R, to);
    return `<path d="M${P(a)}A${R} ${R} 0 0 1 ${P(b)}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`;
  }

  /* ---------- Ram, viljuška, korman, sic ---------- */
  function drawFrame(pose, cfg) {
    const { g, bike } = pose;
    const col = cfg.bike.color;
    const tw = { javni: 7.5, fiksi: 5, retroSklopivi: 5, drumski: 5, decji: 5, bmx: 7, sklopivi: 5.5, fatbike: 8.5, mali: 4.5, visokiTocak: 5, hronometar: 6.5 }[cfg.bike.type] || 6;
    let s = '<g class="ram">';

    if (bike.frame === 'penny') {
      // zakrivljena kičma od glave do malog zadnjeg točka
      const top = add(g.headBottom, v(-2, -4));
      s += `<path d="M${P(top)}C${P(add(top, v(-34, -2)))} ${P(add(g.rear, v(36, -66)))} ${P(add(g.rear, v(2, -3)))}" fill="none" stroke="${col}" stroke-width="${tw + 1}" stroke-linecap="round"/>`;
      s += seg(add(g.rear, v(18, -38)), add(g.rear, v(24, -36)), 3.4, '#9AA3B2'); // stepenik
      s += seg(g.headTop, g.headBottom, tw + 3, shade(col, 0.82));
      s += `<path d="M${P(g.headBottom)}Q${P(add(lerp(g.headBottom, g.front, 0.5), v(-3, 0)))} ${P(g.front)}" fill="none" stroke="${col}" stroke-width="${tw}" stroke-linecap="round"/>`;
      s += seg(g.saddle, add(g.saddle, v(2, 8)), 3, '#9AA3B2');
      return s + '</g>';
    }
    if (bike.frame === 'recumbent') {
      const seat = g.saddle;
      const p1 = add(seat, v(-4, 20));
      s += seg(g.rear, p1, tw - 1, col);
      s += seg(p1, g.headBottom, tw + 1, col);
      s += seg(g.headTop, g.bb, tw, col); // nosač pedala (boom)
      s += seg(add(seat, v(-20, -18)), g.rear, tw - 2, col); // potpora naslona
      s += seg(g.headTop, g.headBottom, tw + 2.5, shade(col, 0.82));
      const fc = add(lerp(g.headBottom, g.front, 0.6), v(-3, 0));
      s += `<path d="M${P(g.headBottom)}Q${P(fc)} ${P(g.front)}" fill="none" stroke="${col}" stroke-width="${tw - 1}" stroke-linecap="round"/>`;
      return s + '</g>';
    }

    // zadnji trougao
    s += seg(g.bb, g.rear, tw - 1.5, col);
    s += seg(g.seatCluster, g.rear, tw - 1.8, col);

    // sedišna cev
    s += seg(g.bb, g.seatCluster, tw, col);

    if (bike.frame === 'diamond') {
      s += seg(g.seatCluster, g.headTop, tw, col);
      s += seg(g.bb, g.headBottom, tw + 0.8, col);
    } else if (bike.frame === 'sloping') {
      const tt = lerp(g.seatCluster, g.headTop, 0);
      s += seg(add(tt, v(2, 4)), g.headTop, tw, col);
      s += seg(g.bb, g.headBottom, tw + 0.5, col);
    } else if (bike.frame === 'cruiser') {
      // kruzer: zaobljene duple cevi i lučne potpore do zadnje osovine
      s += `<path d="M${P(g.headTop)}C${P(add(g.headTop, v(-40, 6)))} ${P(add(g.bb, v(34, -46)))} ${P(add(g.bb, v(3, -3)))}" fill="none" stroke="${col}" stroke-width="${tw + 1}" stroke-linecap="round"/>`;
      s += `<path d="M${P(g.headBottom)}C${P(add(g.headBottom, v(-24, 22)))} ${P(add(g.bb, v(24, 6)))} ${P(g.bb)}" fill="none" stroke="${col}" stroke-width="${tw}" stroke-linecap="round"/>`;
      const hm = lerp(g.headTop, g.headBottom, 0.3);
      s += `<path d="M${P(hm)}C${P(add(hm, v(-60, 6)))} ${P(add(g.rear, v(52, -62)))} ${P(g.rear)}" fill="none" stroke="${col}" stroke-width="${tw - 2}" stroke-linecap="round"/>`;
    } else if (bike.frame === 'tandem') {
      s += seg(g.seatCluster, g.seatClusterF, tw, col);          // gornja zadnja
      s += seg(g.bb, g.bbF, tw, col);                            // donja
      s += seg(g.seatCluster, g.bbF, tw - 1, col);               // dijagonala
      s += seg(g.bbF, g.seatClusterF, tw, col);                  // sedišna cev kapitena
      s += seg(g.seatClusterF, g.headTop, tw, col);
      s += seg(g.bbF, g.headBottom, tw + 0.8, col);
    } else if (bike.frame === 'mono') {
      // sklopivi: jedna debela cev sa šarkom
      const a = lerp(g.headTop, g.headBottom, 0.55), b = lerp(g.bb, g.seatCluster, 0.25);
      s += seg(a, b, tw + 2.5, col);
      s += circ(lerp(a, b, 0.45), 4.2, shade(col, 0.75));
      s += circ(lerp(a, b, 0.45), 1.6, '#C9D1DC');
    } else if (bike.frame === 'cargo') {
      // teretni: gornja cev, kosa cev do donje grede, duga niska greda ispod sanduka
      const low = v(g.box.x0 + 2, g.box.bottom + 5);
      s += seg(g.seatCluster, g.headTop, tw, col);
      s += seg(g.bb, low, tw + 1, col);
      s += seg(g.headBottom, low, tw, col);
      s += seg(low, add(g.forkTop, v(-1, 8)), tw + 1, col);
      s += seg(add(g.forkTop, v(-3, -4)), add(g.forkTop, v(1, 8)), tw + 2.5, shade(col, 0.82));
      s += seg(add(low, v(0, -3)), add(g.forkTop, v(-2, 4)), 1.4, '#9AA3B2'); // šipka volana
    } else if (bike.frame === 'stepThrough') {
      // nisko zakrivljena „ženska” cev + tanja paralelna
      const c1 = add(g.headBottom, v(-46, 30));
      const end = add(g.bb, v(4, -3));
      s += `<path d="M${P(g.headBottom)}Q${P(c1)} ${P(end)}" fill="none" stroke="${col}" stroke-width="${tw + 1}" stroke-linecap="round"/>`;
      const h2 = lerp(g.headTop, g.headBottom, 0.35);
      const st2 = lerp(g.bb, g.seatCluster, 0.55);
      const c2 = add(h2, v(-40, 34));
      s += `<path d="M${P(h2)}Q${P(c2)} ${P(st2)}" fill="none" stroke="${col}" stroke-width="${tw - 2}" stroke-linecap="round"/>`;
    }

    // glava rama (head tube)
    s += seg(g.headTop, g.headBottom, tw + 2.5, shade(col, 0.82));

    // viljuška
    const forkCol = cfg.bike.forkColor || col;
    if (cfg.bike.suspension) { // amortizer: srebrne cevi gore, deblje noge dole
      const mid = lerp(g.headBottom, g.front, 0.42);
      s += seg(g.headBottom, add(mid, v(0, 2)), tw - 0.5, '#C9D1DC');
      s += seg(mid, g.front, tw + 2, forkCol);
      s += seg(add(mid, v(-1, 1)), add(mid, v(2.5, 1)), tw + 3.5, shade(forkCol, 0.8));
    } else {
      const fc = add(lerp(g.forkTop, g.front, 0.6), v(-3, 0));
      s += `<path d="M${P(g.forkTop)}Q${P(fc)} ${P(g.front)}" fill="none" stroke="${forkCol}" stroke-width="${tw - 1}" stroke-linecap="round"/>`;
    }

    s += '</g>';
    return s;
  }

  function drawBars(pose, cfg) {
    const { g, bike } = pose;
    const metal = '#3A4560';
    let s = '<g class="korman">';
    s += seg(g.headTop, g.steererTop, 4.5, metal);
    if (bike.bar === 'flat') {
      s += seg(g.steererTop, g.grip, 4, metal);
      s += seg(add(g.grip, v(-1, 0)), add(g.grip, v(5, -1)), 6.5, COLORS.ink);
    } else if (bike.bar === 'swept') {
      const stemEnd = add(g.steererTop, v(6, -2));
      s += seg(g.steererTop, stemEnd, 4.5, metal);
      s += `<path d="M${P(stemEnd)}C${P(add(stemEnd, v(2, -10)))} ${P(add(g.grip, v(14, -6)))} ${P(g.grip)}" fill="none" stroke="#C6CDD8" stroke-width="3.6" stroke-linecap="round"/>`;
      s += seg(g.grip, add(g.grip, v(-9, 2)), 6.5, '#7A4A2A');
    } else if (bike.bar === 'drop') {
      const stemEnd = add(g.steererTop, v(12, -1.5));
      s += seg(g.steererTop, stemEnd, 4.5, metal);
      const a = stemEnd, b = add(stemEnd, v(9, 0));
      s += `<path d="M${P(a)}L${P(b)}C${P(add(b, v(10, 0)))} ${P(add(b, v(12, 15)))} ${P(add(b, v(2, 18)))}L${P(add(b, v(-5, 17)))}" fill="none" stroke="${COLORS.ink}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      // ručica kočnice (hood)
      s += `<path d="M${P(add(b, v(-1, -1.5)))}q4,-3 7,1 l-1,6 q-3,1 -5,-1z" fill="${COLORS.ink}"/>`;
    } else if (bike.bar === 'bullhorn') { // „rogovi”: ravno napred pa nagore
      const stemEnd = add(g.steererTop, v(8, -1));
      s += seg(g.steererTop, stemEnd, 4.5, metal);
      s += `<path d="M${P(stemEnd)}L${P(add(stemEnd, v(9, 0)))}Q${P(v(g.grip.x, stemEnd.y))} ${P(g.grip)}" fill="none" stroke="${cfg.bike.barTape || COLORS.ink}" stroke-width="3.8" stroke-linecap="round"/>`;
    } else if (bike.bar === 'mustache') { // brkovi-korman visokog točka
      s += `<path d="M${P(g.steererTop)}C${P(add(g.steererTop, v(6, -6)))} ${P(add(g.grip, v(-2, -6)))} ${P(g.grip)}" fill="none" stroke="#C6CDD8" stroke-width="3" stroke-linecap="round"/>`;
      s += seg(g.grip, add(g.grip, v(3, 4)), 5.5, '#7A4A2A');
    } else if (bike.bar === 'ape') { // visoki „majmunski” korman
      const stemEnd = add(g.steererTop, v(5, -1));
      s += seg(g.steererTop, stemEnd, 4.5, metal);
      s += `<path d="M${P(stemEnd)}C${P(add(stemEnd, v(5, -30)))} ${P(add(g.grip, v(14, 2)))} ${P(g.grip)}" fill="none" stroke="#D3D9E2" stroke-width="3.4" stroke-linecap="round"/>`;
      s += seg(g.grip, add(g.grip, v(-8, 1)), 6.5, '#F7F3EA');
    } else if (bike.bar === 'aero') { // osnovni korman + aero nastavci sa jastučićima
      const stemEnd = add(g.steererTop, v(9, -1));
      s += seg(g.steererTop, stemEnd, 4.5, COLORS.ink);
      s += `<path d="M${P(stemEnd)}L${P(add(stemEnd, v(10, 0)))}Q${P(add(stemEnd, v(17, 0)))} ${P(add(stemEnd, v(18, 7)))}" fill="none" stroke="${COLORS.ink}" stroke-width="3.6" stroke-linecap="round"/>`;
      s += seg(add(stemEnd, v(0, -4)), g.grip, 2.6, '#3A4560');
      s += `<rect x="${r1(stemEnd.x)}" y="${r1(stemEnd.y - 8)}" width="12" height="4" rx="2" fill="${COLORS.ink}"/>`;
    } else if (bike.bar === 'tiller') { // ležeći: volan ispred grudi
      s += seg(g.steererTop, g.grip, 3.6, '#C6CDD8');
      s += seg(g.grip, add(g.grip, v(-3, -5)), 6, COLORS.ink);
    } else if (bike.bar === 'bmx') {
      const stemEnd = add(g.steererTop, v(5, -1));
      s += seg(g.steererTop, stemEnd, 5, COLORS.ink);
      s += seg(stemEnd, g.grip, 3.6, '#C6CDD8');
      const m = lerp(stemEnd, g.grip, 0.5);
      s += seg(add(m, v(-4, 0)), add(m, v(4, 0)), 2.6, '#C6CDD8');
      s += seg(g.grip, add(g.grip, v(-2.5, -3.5)), 6, COLORS.ink);
    } else if (bike.bar === 'riser') {
      const stemEnd = add(g.steererTop, v(4, -2));
      s += seg(g.steererTop, stemEnd, 4, metal);
      s += `<path d="M${P(stemEnd)}Q${P(add(stemEnd, v(0, -7)))} ${P(g.grip)}" fill="none" stroke="#C6CDD8" stroke-width="3.2" stroke-linecap="round"/>`;
      s += seg(g.grip, add(g.grip, v(-5, 1)), 5.5, COLORS.coral);
    }
    s += '</g>';
    return s;
  }

  function drawSaddle(pose, cfg, cluster, saddlePt) {
    const { g, bike } = pose;
    if (bike.frame === 'recumbent') { // sedište sa naslonom, prati nagib leđa
      const { hip, u, body } = pose;
      const nb = v(u.y, -u.x);
      const a = add(add(hip, mul(nb, body.w.torsoHip + 3)), mul(u, -4));
      const b = add(add(hip, mul(u, body.torso * 0.75)), mul(nb, body.w.torsoChest + 3));
      return `<g class="sic">${seg(a, b, 7, COLORS.ink)}${seg(add(hip, v(-12, 9)), add(hip, v(18, 9)), 6, COLORS.ink)}${seg(add(hip, v(2, 10)), add(g.saddle, v(-4, 20)), 3, '#9AA3B2')}</g>`;
    }
    const post = saddlePt || g.saddle;
    const from = cluster || g.seatCluster;
    const kid = cfg.bike.type === 'decji';
    let s = seg(from, add(post, v(0, 2)), kid ? 3 : 3.8, '#9AA3B2');
    const k = kid ? 0.7 : 1;
    const road = cfg.bike.type === 'drumski';
    const city = ['gradski', 'elektricni', 'teretni', 'javni', 'retroSklopivi', 'eTricikl'].includes(cfg.bike.type);
    const L = (road ? 15 : 13) * k, back = (city ? 12 : 10) * k;
    const h = (city ? 6 : 4.5) * k;
    const x0 = post.x - back, x1 = post.x + L, y = post.y;
    s += `<path d="M${r1(x0)},${r1(y - h + 1)}Q${r1(x0 - 1)},${r1(y + 1.5)} ${r1(x0 + 4)},${r1(y + 1.5)}L${r1(x1 - 3)},${r1(y + 0.5)}Q${r1(x1 + 1.5)},${r1(y)} ${r1(x1)},${r1(y - 2)}Q${r1(x1 - 6)},${r1(y - h)} ${r1(post.x - 2)},${r1(y - h)}Z" fill="${COLORS.ink}"/>`;
    if (city) { // opruge na gradskom sicu
      s += `<path d="M${r1(x0 + 3)},${r1(y + 1.5)}l0,3 m3,-3 l0,3" stroke="#9AA3B2" stroke-width="1.2"/>`;
    }
    return `<g class="sic">${s}</g>`;
  }

  function drawDrivetrain(pose, cfg, side) {
    const { g, bike, pedalNear, pedalFar } = pose;
    let s = '';
    if (side === 'chain' && bike.noChain) return '';
    if (side !== 'chain' && bike.noCrank) return '';
    if (side === 'chain') {
      const cr = bike.chainring, cog = cr * 0.42;
      s += `<path d="M${P(add(g.bb, v(0, -cr)))}L${P(add(g.rear, v(0, -cog)))}M${P(add(g.bb, v(0, cr)))}L${P(add(g.rear, v(0, cog)))}" stroke="#5B6478" stroke-width="1.5" fill="none"/>`;
      s += circ(g.rear, cog, 'none', `stroke="#5B6478" stroke-width="1.6"`);
      s += `<g transform="rotate(${r1(-pose.crankDeg)} ${P(g.bb)})">` + circ(g.bb, cr, 'none', `stroke="#7D879A" stroke-width="2.6" stroke-dasharray="1.6 1.2"`) + '</g>';
      s += circ(g.bb, cr - 2.4, 'none', `stroke="#B9C1CD" stroke-width="1.4"`);
      if (g.bbF) { // tandem: lanac koji povezuje dve srednje osovine
        s += `<path d="M${P(add(g.bb, v(0, -cr)))}L${P(add(g.bbF, v(0, -cr)))}M${P(add(g.bb, v(0, cr)))}L${P(add(g.bbF, v(0, cr)))}" stroke="#5B6478" stroke-width="1.5" fill="none"/>`;
        s += `<g transform="rotate(${r1(-pose.crankDeg)} ${P(g.bbF)})">` + circ(g.bbF, cr, 'none', `stroke="#7D879A" stroke-width="2.6" stroke-dasharray="1.6 1.2"`) + '</g>';
        s += circ(g.bbF, cr - 2.4, 'none', `stroke="#B9C1CD" stroke-width="1.4"`);
      }
      if (cfg.bike.chainguard) {
        const R = cr + 2.5;
        const gc = cfg.bike.chainguard;
        s += `<path d="M${P(add(g.bb, v(R, 2)))}A${R} ${R} 0 0 0 ${P(add(g.bb, v(-R * 0.6, -R * 0.8)))}" fill="none" stroke="${gc}" stroke-width="4.5" stroke-linecap="round"/>`;
        s += seg(add(g.bb, v(-2, -R)), add(g.rear, v(9, -cog - 2.5)), 4.5, gc);
        s += seg(add(g.bb, v(-2, -R + 1.6)), add(g.rear, v(9, -cog - 1)), 1, shade(gc, 0.8), 'opacity="0.6"');
      }
    } else {
      const pedal = side === 'near' ? pedalNear : pedalFar;
      const cb = pose.crankBB || g.bb;
      const col = side === 'near' ? '#4A546C' : '#2C3449';
      s += seg(cb, pedal, bike.crank > 14 ? 4 : 3, col);
      s += seg(add(pedal, v(-4.5, 0)), add(pedal, v(4.5, 0)), 3.5, side === 'near' ? COLORS.ink : '#141A2C');
      if (side === 'near') s += circ(cb, 2.2, '#C9D1DC');
    }
    return s;
  }

  /* ---------- Oprema na biciklu ---------- */
  function drawRack(pose, cfg) {
    const { g, bike } = pose;
    const y = g.rear.y - bike.r - bike.tire / 2 - 5;
    const x0 = g.seatCluster.x - 2, x1 = g.rear.x - bike.r * 0.42;
    const c = '#6B7489';
    let s = seg(v(x0, y), v(x1, y), 3, c);
    s += seg(v(x1 + 6, y), add(g.rear, v(-1, -3)), 2, c);
    s += seg(v(x1 + 24, y), add(g.rear, v(1, -3)), 2, c);
    s += seg(v(x0, y), add(g.seatCluster, v(-2, 6)), 2, c);
    return `<g class="prtljaznik">${s}</g>`;
  }

  function rackGeom(pose) {
    const { g, bike } = pose;
    return { y: g.rear.y - bike.r - bike.tire / 2 - 5, x0: g.seatCluster.x - 2, x1: g.rear.x - bike.r * 0.42 };
  }

  function drawBattery(pose, where) { // baterija e-bicikla na prtljažniku ili na ramu
    if (where === 'ram') {
      const { g } = pose;
      const a = lerp(g.bb, g.headBottom, 0.2), ang = (Math.atan2(g.headBottom.y - g.bb.y, g.headBottom.x - g.bb.x) * 180) / Math.PI;
      return `<g class="baterija" transform="translate(${P(a)}) rotate(${r1(ang)})"><rect x="0" y="-11" width="34" height="9" rx="3.5" fill="${COLORS.ink}"/><rect x="4" y="-8" width="14" height="3" rx="1" fill="#3A4560"/><circle cx="29" cy="-6.5" r="1.4" fill="#5BE37D"/></g>`;
    }
    const k = rackGeom(pose);
    const x = k.x1 + 2, w = k.x0 - k.x1 - 6, y = k.y - 8;
    return `<g class="baterija"><rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="7.5" rx="3" fill="${COLORS.ink}"/>`
      + `<rect x="${r1(x + 3)}" y="${r1(y + 2.5)}" width="${r1(w * 0.45)}" height="2.5" rx="1" fill="#3A4560"/>`
      + `<circle cx="${r1(x + w - 5)}" cy="${r1(y + 3.75)}" r="1.4" fill="#5BE37D"/></g>`;
  }

  function drawHubMotor(pose) {
    return `<g class="motor">${circ(pose.g.rear, 8.5, '#3A4560')}${circ(pose.g.rear, 5, '#5B6478')}${circ(pose.g.rear, 1.8, '#E6EBF2')}</g>`;
  }

  function drawDisplay(pose) {
    const p = add(pose.g.steererTop, v(-2, -6));
    return `<g class="displej"><rect x="${r1(p.x - 4)}" y="${r1(p.y - 3)}" width="9" height="6" rx="1.5" fill="${COLORS.ink}"/><rect x="${r1(p.x - 2.6)}" y="${r1(p.y - 1.8)}" width="6" height="3.6" rx="0.8" fill="#7FE3FF"/></g>`;
  }

  function drawPegs(pose) {
    const { g } = pose;
    return [g.rear, g.front].map((c) => `<rect x="${r1(c.x - 5)}" y="${r1(c.y - 2.5)}" width="10" height="5" rx="2" fill="#C9D1DC" stroke="#8A93A6" stroke-width="0.6"/>`).join('');
  }

  function drawCrate(pose, crate) { // gajba sa pijace na prtljažniku
    const k = rackGeom(pose);
    const w = Math.min(34, k.x0 - k.x1), x = (k.x0 + k.x1) / 2 - w / 2, h = 17, y = k.y - h - 1.5;
    const col = crate.color || COLORS.sun;
    let s = '';
    // povrće iznad ivice
    s += `<path d="M${r1(x + 6)},${r1(y + 2)}l-3,-14 M${r1(x + 8)},${r1(y + 2)}l1,-15 M${r1(x + 10)},${r1(y + 2)}l4,-12" stroke="#4E9A5E" stroke-width="2.2" stroke-linecap="round"/>`;
    s += circ(v(x + 17, y + 0.5), 4.6, '#E5402F') + circ(v(x + 16, y - 3.6), 1.2, '#4E9A5E');
    s += circ(v(x + 25, y + 1), 4.2, '#E5402F') + circ(v(x + 24.5, y - 2.8), 1.1, '#4E9A5E');
    s += `<ellipse cx="${r1(x + 29)}" cy="${r1(y - 1)}" rx="4" ry="5.5" fill="#8E5BB5"/>`;
    // gajba
    s += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${h}" rx="2" fill="${col}"/>`;
    for (let i = 0; i < 4; i++) s += `<rect x="${r1(x + 3 + i * (w - 6) / 4)}" y="${r1(y + 4)}" width="${r1((w - 6) / 4 - 2)}" height="4" rx="1.5" fill="${shade(col, 0.78)}"/>`;
    s += seg(v(x, y + 1), v(x + w, y + 1), 2.4, shade(col, 0.85));
    return `<g class="gajba">${s}</g>`;
  }

  function drawBucket(pose, color) { // kantica na prtljažniku (pecaroš)
    const k = rackGeom(pose);
    const cx = (k.x0 + k.x1) / 2, y = k.y - 1.5;
    let s = `<path d="M${r1(cx - 11)},${r1(y - 20)}L${r1(cx + 11)},${r1(y - 20)}L${r1(cx + 8.5)},${r1(y)}L${r1(cx - 8.5)},${r1(y)}Z" fill="${color}"/>`;
    s += seg(v(cx - 11.5, y - 20), v(cx + 11.5, y - 20), 2.4, shade(color, 0.8));
    s += `<path d="M${r1(cx - 10)},${r1(y - 20)}Q${r1(cx)},${r1(y - 33)} ${r1(cx + 10)},${r1(y - 20)}" stroke="#5B6478" stroke-width="1.2" fill="none"/>`;
    s += seg(v(cx - 7, y - 11), v(cx + 7, y - 11), 1, shade(color, 0.85), 'opacity="0.7"');
    return `<g class="kantica">${s}</g>`;
  }

  function drawTowel(pose, colors) { // smotan peškir na prtljažniku
    const k = rackGeom(pose);
    const cx = (k.x0 + k.x1) / 2, y = k.y - 6.5;
    let s = `<rect x="${r1(cx - 15)}" y="${r1(y - 5.5)}" width="30" height="11" rx="5.5" fill="${colors[0]}"/>`;
    for (let i = -10; i <= 10; i += 6.6) s += `<rect x="${r1(cx + i - 1.6)}" y="${r1(y - 5.5)}" width="3.2" height="11" fill="${colors[1]}"/>`;
    s += `<ellipse cx="${r1(cx + 15)}" cy="${r1(y)}" rx="2.6" ry="5.5" fill="${shade(colors[0], 0.8)}"/>`;
    s += seg(v(cx - 6, y - 6), v(cx - 6, y + 6), 1.2, '#3A4560');
    return `<g class="peskir">${s}</g>`;
  }

  function drawBreadBasket(pose) { // velika žičana korpa sa pecivom (tricikl)
    const { g, bike } = pose;
    const x0 = g.rear.x - 36, x1 = g.rear.x + 26, y1 = g.rear.y - 2, y0 = g.rear.y - bike.r - 4;
    let s = '';
    // pecivo iznad ivice
    s += `<path d="M${r1(x0 + 6)},${r1(y0 + 2)}q4,-15 16,-15 q8,1 6,8 q-6,6 -22,7z" fill="#D9A25E"/>`;
    s += `<path d="M${r1(x0 + 12)},${r1(y0 - 6)}l4,-4 M${r1(x0 + 17)},${r1(y0 - 5)}l4,-4" stroke="#B57E3F" stroke-width="1.2"/>`;
    s += `<path d="M${r1(x0 + 30)},${r1(y0 + 1)}q6,-12 14,-5 q2,4 -3,6z" fill="#E3B26A"/>`;
    s += `<path d="M${r1(x0 + 42)},${r1(y0 + 1)}q5,-10 12,-3 q1,3 -3,4z" fill="#C88B47"/>`;
    s += circ(v(x0 + 52, y0 - 1), 4.5, '#E3B26A');
    // korpa
    s += `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="3" fill="#E6EBF2" fill-opacity="0.35" stroke="#8A93A6" stroke-width="2"/>`;
    let w = '';
    for (let x = x0 + 8; x < x1; x += 8) w += `M${r1(x)},${r1(y0)}L${r1(x)},${r1(y1)}`;
    for (let y = y0 + 9; y < y1; y += 9) w += `M${r1(x0)},${r1(y)}L${r1(x1)},${r1(y)}`;
    s += `<path d="${w}" stroke="#8A93A6" stroke-width="0.9" opacity="0.8"/>`;
    return `<g class="korpa-pecivo">${s}</g>`;
  }

  function drawBikepacking(pose, bags) { // torbe za bikepacking: u ramu, iza sica, na kormanu
    const { g } = pose;
    const c = bags.color || '#3A4560', d = shade(c, 0.78);
    let s = '';
    const a = lerp(g.seatCluster, g.headTop, 0.12), b = lerp(g.seatCluster, g.headTop, 0.85), e = lerp(g.bb, g.headBottom, 0.35);
    s += `<path d="M${P(add(a, v(2, 6)))}L${P(add(b, v(-2, 6)))}L${P(add(e, v(4, -6)))}Z" fill="${c}" stroke="${d}" stroke-width="1.2" stroke-linejoin="round"/>`;
    s += seg(add(a, v(6, 9)), add(b, v(-8, 9)), 1, shade(c, 1.35), 'stroke-dasharray="2 2"');
    const sp = add(g.saddle, v(-10, 2));
    if (bags.saddle) s += `<path d="M${P(sp)}L${P(add(sp, v(-30, -10)))}Q${P(add(sp, v(-36, -4)))} ${P(add(sp, v(-30, 2)))}L${P(add(sp, v(-2, 10)))}Z" fill="${bags.saddle || COLORS.sun}"/>`;
    if (bags.saddle) s += seg(add(sp, v(-12, -2)), add(sp, v(-14, 6)), 1.6, d);
    const bp = add(g.steererTop, v(8, 6));
    if (bags.bar) s += `<rect x="${r1(bp.x - 6)}" y="${r1(bp.y - 9)}" width="16" height="18" rx="7" fill="${bags.bar || COLORS.coral}"/>`;
    if (bags.bar) s += seg(add(bp, v(2, -9)), add(bp, v(2, 9)), 1.6, shade(bags.bar, 0.75));
    return `<g class="bikepacking">${s}</g>`;
  }

  function drawStreamers(pose, colors, phase) { // trakice koje vijore sa ručki
    const { g } = pose;
    let s = '';
    colors.forEach((c, i) => {
      const sw = 4 * WIND * Math.sin(phase * Math.PI * 4 + i);
      const a = add(g.grip, v(-3, 1 + i));
      s += `<path d="M${P(a)}Q${P(add(a, v(-7, 3 + sw)))} ${P(add(a, v(-15, 2 + sw * 1.6 + i * 2)))}" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    });
    return `<g class="trakice">${s}</g>`;
  }

  function drawFlag(base, height, color, phase) { // zastavica na šipki
    const top = add(base, v(-4, -height));
    const sw = 3 * WIND * Math.sin(phase * Math.PI * 4);
    return `<g class="zastavica">${seg(base, top, 1.4, '#5B6478')}<path d="M${P(top)}Q${P(add(top, v(-9, 3 + sw)))} ${P(add(top, v(-20, 6 + sw)))}L${P(add(top, v(0, 13)))}Z" fill="${color}"/></g>`;
  }

  function drawTrailer(pose, tr, phase, wheelRot) { // dečja prikolica iza bicikla
    const { g, bike } = pose;
    const wr = 18;
    const wc = v(g.rear.x - 98, GROUND_Y - wr - 1.8);
    const x0 = g.rear.x - 140, x1 = g.rear.x - 60, top = GROUND_Y - 78, bot = GROUND_Y - 16;
    const col = tr.color || COLORS.coral;
    let s = '';
    s += `<ellipse cx="${r1(wc.x)}" cy="${GROUND_Y + 1.5}" rx="40" ry="3" fill="${COLORS.navy}" opacity="0.10"/>`;
    s += drawFlag(v(x0 + 6, top + 4), 52, tr.flag || COLORS.sun, phase);
    s += `<path d="M${r1(x0)},${r1(bot)}L${r1(x0)},${r1(top + 16)}Q${r1(x0)},${r1(top)} ${r1(x0 + 16)},${r1(top)}L${r1(x1 - 20)},${r1(top)}Q${r1(x1)},${r1(top + 6)} ${r1(x1)},${r1(top + 34)}L${r1(x1)},${r1(bot)}Z" fill="${col}"/>`;
    s += `<path d="M${r1(x0 + 26)},${r1(top + 8)}L${r1(x1 - 18)},${r1(top + 8)}Q${r1(x1 - 6)},${r1(top + 14)} ${r1(x1 - 6)},${r1(top + 34)}L${r1(x0 + 26)},${r1(top + 34)}Z" fill="#E6F4FF"/>`;
    if (tr.kid) {
      const hc = v(x0 + 50, top + 24);
      s += drawHead({ headC: hc, body: { headR: 8.5, w: { forearm: 5 } }, shoulder: add(hc, v(-2, 14)), u: v(0, -1) },
        { skin: tr.kid.skin, hair: { style: 'kratka', color: tr.kid.hair || HAIR.brown }, helmet: { type: 'obicna', color: tr.kid.helmet || COLORS.sun } }, phase);
    }
    let mesh = '';
    for (let x = x0 + 30; x < x1 - 8; x += 5) mesh += `M${r1(x)},${r1(top + 8)}L${r1(x)},${r1(top + 34)}`;
    s += `<path d="${mesh}" stroke="#9FC9E6" stroke-width="0.5" opacity="0.7"/>`;
    s += seg(v(x0, bot - 4), v(x1, bot - 4), 3, shade(col, 0.75));
    s += `<path d="M${r1(x1 - 4)},${r1(bot - 8)}Q${r1(g.rear.x - 30)},${r1(bot - 2)} ${P(add(g.rear, v(-6, 6)))}" stroke="#3A4560" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    s += drawMiniWheel(wc, wr, wheelRot * (bike.r / wr));
    return `<g class="prikolica">${s}</g>`;
  }

  function drawPanniers(pose, color) { // bisage: zadnja preko točka, prednja kod prednje osovine
    const { g } = pose;
    const k = rackGeom(pose);
    const dark = shade(color, 0.78);
    let s = '';
    const rx = g.rear.x - 2, ry = k.y + 1;
    s += `<rect x="${r1(rx - 15)}" y="${r1(ry)}" width="30" height="42" rx="7" fill="${color}"/>`;
    s += `<path d="M${r1(rx - 15)},${r1(ry + 6)}Q${r1(rx - 15)},${r1(ry)} ${r1(rx - 9)},${r1(ry)}L${r1(rx + 9)},${r1(ry)}Q${r1(rx + 15)},${r1(ry)} ${r1(rx + 15)},${r1(ry + 6)}L${r1(rx + 15)},${r1(ry + 12)}L${r1(rx - 15)},${r1(ry + 12)}Z" fill="${dark}"/>`;
    s += `<rect x="${r1(rx - 2)}" y="${r1(ry + 10)}" width="4" height="9" rx="1" fill="${COLORS.ink}"/>`;
    s += `<rect x="${r1(rx - 11)}" y="${r1(ry + 30)}" width="22" height="2.4" rx="1" fill="#F2F5F9" opacity="0.8"/>`;
    // prednja
    const f = g.front;
    s += seg(add(g.forkTop, v(4, 4)), add(f, v(-6, -26)), 1.8, '#6B7489');
    s += `<rect x="${r1(f.x - 10)}" y="${r1(f.y - 25)}" width="20" height="23" rx="5" fill="${color}"/>`;
    s += `<rect x="${r1(f.x - 10)}" y="${r1(f.y - 25)}" width="20" height="8" rx="4" fill="${dark}"/>`;
    s += `<rect x="${r1(f.x - 1.5)}" y="${r1(f.y - 19)}" width="3" height="6" rx="1" fill="${COLORS.ink}"/>`;
    return `<g class="bisage">${s}</g>`;
  }

  function drawCargoBox(pose, cfg, phase) { // sanduk teretnog bicikla, sa psom
    const { g } = pose;
    const b = g.box, w = b.x1 - b.x0, h = b.bottom - b.top;
    const col = cfg.bike.boxColor || '#C8945A', dark = shade(col, 0.78);
    let s = '';
    const dog = cfg.bike.dog;
    const hc = v(b.x0 + w * 0.6, b.top - 15);
    if (dog) {
      s += `<ellipse cx="${r1(hc.x - 13)}" cy="${r1(b.top - 3)}" rx="19" ry="11" fill="${dog}"/>`;
    }
    s += `<rect x="${r1(b.x0)}" y="${r1(b.top)}" width="${r1(w)}" height="${r1(h)}" rx="3" fill="${col}"/>`;
    if (cfg.bike.parcels) { // paketi vire iz sanduka
      s = `<rect x="${r1(b.x0 + 8)}" y="${r1(b.top - 14)}" width="24" height="18" rx="1.5" fill="#C8945A"/>`
        + `<rect x="${r1(b.x0 + 34)}" y="${r1(b.top - 20)}" width="20" height="24" rx="1.5" fill="#B5824A"/>`
        + `<rect x="${r1(b.x0 + 56)}" y="${r1(b.top - 10)}" width="18" height="14" rx="1.5" fill="#D9A86A"/>`
        + `<path d="M${r1(b.x0 + 20)},${r1(b.top - 14)}l0,18M${r1(b.x0 + 44)},${r1(b.top - 20)}l0,24M${r1(b.x0 + 65)},${r1(b.top - 10)}l0,14" stroke="#E8D2AE" stroke-width="2.2"/>` + s;
    }
    if (cfg.bike.boxFlowers) { // buketi cveća iz sanduka
      let f = '';
      const cols = [COLORS.coral, COLORS.sun, '#F27EB4', '#8E7CF0', COLORS.white, COLORS.coral, COLORS.sun];
      for (let i = 0; i < 7; i++) {
        const fx = b.x0 + 8 + i * (w - 16) / 6, fy = b.top - 12 - (i % 2) * 8;
        f += seg(v(fx, b.top + 2), v(fx + (i % 3 - 1) * 2, fy), 1.4, '#4E9A5E');
        f += `<path d="M${r1(fx - 2)},${r1(b.top - 2)}q-5,-3 -4,-7q4,1 4,7z" fill="#5FB86E"/>`;
        for (let k = 0; k < 5; k++) f += circ(add(v(fx + (i % 3 - 1) * 2, fy), mul(dir(k * 72 + 18), 3)), 2.3, cols[i]);
        f += circ(v(fx + (i % 3 - 1) * 2, fy), 1.6, i % 2 ? COLORS.sun : '#B5532E');
      }
      s = f + s;
    }
    if (cfg.bike.boxIcon === 'sladoled') { // kornet nacrtan na sanduku
      const cx = b.x0 + w * 0.5, cy = b.top + h * 0.55;
      s += `<path d="M${r1(cx - 7)},${r1(cy - 2)}L${r1(cx + 7)},${r1(cy - 2)}L${r1(cx)},${r1(cy + 14)}Z" fill="#D9A25E"/>`;
      s += circ(v(cx - 3.5, cy - 6), 5.5, '#F27EB4') + circ(v(cx + 3.5, cy - 6), 5.5, '#FFF2C2') + circ(v(cx, cy - 11), 5, '#8A5A33');
    }
    if (cfg.bike.boxStripe) s += `<rect x="${r1(b.x0)}" y="${r1(b.top + h * 0.42)}" width="${r1(w)}" height="${r1(h * 0.22)}" fill="${cfg.bike.boxStripe}"/>`;
    else for (let i = 1; i < 3; i++) s += seg(v(b.x0 + 3, b.top + (h * i) / 3), v(b.x1 - 3, b.top + (h * i) / 3), 1, dark, 'opacity="0.7"');
    s += seg(v(b.x0 - 1, b.top + 1), v(b.x1 + 1, b.top + 1), 3.2, dark);
    s += seg(v(b.x0 + 3, b.top + 2), v(b.x0 + 3, b.bottom - 2), 3, dark);
    s += seg(v(b.x1 - 3, b.top + 2), v(b.x1 - 3, b.bottom - 2), 3, dark);
    if (dog) {
      s += circ(v(hc.x + 4, b.top), 3.6, dog) + circ(v(hc.x + 11, b.top), 3.6, dog);
      s += drawDog(hc, 1.3, dog, phase);
    }
    if (cfg.bike.umbrella) { // suncobran iznad sanduka
      const [c1, c2] = cfg.bike.umbrella;
      const pb = v(b.x0 + w * 0.62, b.top), pt = v(pb.x, b.top - 92);
      let u = seg(pb, pt, 2.4, '#8A93A6');
      const R = 46, segs = 6, yb = pt.y + 18, apex = add(pt, v(0, -6));
      u += `<path d="M${r1(pt.x - R)},${r1(yb)}Q${r1(pt.x - R * 0.6)},${r1(apex.y)} ${P(apex)}Q${r1(pt.x + R * 0.6)},${r1(apex.y)} ${r1(pt.x + R)},${r1(yb)}Z" fill="${c1}"/>`;
      for (let i = 0; i < segs; i++) {
        const x0 = pt.x - R + (2 * R * i) / segs, x1 = pt.x - R + (2 * R * (i + 1)) / segs;
        if (i % 2) u += `<path d="M${P(apex)}L${r1(x0)},${r1(yb)}Q${r1((x0 + x1) / 2)},${r1(yb + 6)} ${r1(x1)},${r1(yb)}Z" fill="${c2}"/>`;
        else u += `<path d="M${r1(x0)},${r1(yb)}Q${r1((x0 + x1) / 2)},${r1(yb + 6)} ${r1(x1)},${r1(yb)}Z" fill="${c1}"/>`;
      }
      u += circ(pt, 2.6, '#8A93A6');
      s += `<g class="suncobran">${u}</g>`;
    }
    return `<g class="sanduk">${s}</g>`;
  }

  function drawChildSeatFront(pose, cs, phase) { // malo sedište napred, dete između ruku roditelja
    const { g } = pose;
    const B = add(lerp(g.seatCluster, g.headTop, 0.7), v(0, -5));
    const col = cs.color || COLORS.sun;
    let s = '';
    const hip = add(B, v(-2, -5)), sh = add(hip, v(3, -18)), knee = add(B, v(9, -2)), foot = add(B, v(11, 9));
    s += `<path d="M${P(add(B, v(-9, 2)))}L${P(add(B, v(7, 2)))}L${P(add(B, v(6, -5)))}L${P(add(B, v(-6, -5)))}L${P(add(B, v(-9, -22)))}Q${P(add(B, v(-12, -25)))} ${P(add(B, v(-13, -20)))}Z" fill="${shade(col, 0.8)}"/>`;
    s += seg(hip, knee, 6.5, cs.pants || COLORS.navy) + seg(knee, foot, 5.2, cs.pants || COLORS.navy);
    s += `<ellipse cx="${r1(foot.x + 2)}" cy="${r1(foot.y + 1.5)}" rx="3.8" ry="2.3" fill="${cs.shoes || COLORS.white}"/>`;
    s += seg(hip, sh, 9.5, cs.top || COLORS.coral);
    s += drawHead({ headC: add(sh, v(3, -11)), body: { headR: 8, w: { forearm: 5 } }, shoulder: sh, u: norm(sub(sh, hip)) },
      { skin: cs.skin, hair: { style: cs.hairStyle || 'kratka', color: cs.hair || HAIR.brown, tie: cs.tie }, helmet: { type: 'obicna', color: cs.helmet || COLORS.blue } }, phase);
    s += seg(sh, add(sh, v(7, 8)), 4.5, cs.top || COLORS.coral) + seg(add(sh, v(7, 8)), add(sh, v(12, 4)), 4, cs.top || COLORS.coral) + circ(add(sh, v(13, 3.5)), 2.3, cs.skin);
    s += `<path d="M${P(add(B, v(-9, 2)))}L${P(add(B, v(6, 2)))}L${P(add(B, v(5, -4)))}L${P(add(B, v(-8, -4)))}Z" fill="${col}"/>`;
    s += seg(add(B, v(2, -4)), g.headTop, 2, '#6B7489');
    return `<g class="sediste-napred">${s}</g>`;
  }

  function drawRunningDog(pose, dog, phase) { // pas trči pored bicikla, na povocu
    const { g } = pose;
    const col = dog.color || '#2B2B30', far = shade(col, 0.7), light = dog.chest || '#F2F2EE';
    const bob = 1.6 * Math.sin(phase * Math.PI * 4);
    const bc = v(g.front.x + (dog.dx || 50), GROUND_Y - 24 + bob);
    const legs = (sign, colr) => {
      let s = '';
      [[-11, 0], [11, Math.PI]].forEach(([dx, off]) => {
        const a = 32 * Math.sin(phase * Math.PI * 4 + off + (sign > 0 ? 0 : Math.PI / 2));
        const top = add(bc, v(dx, 5));
        const knee = add(top, rotV(v(0, 9), a));
        const paw = add(knee, rotV(v(0, 8.5), a * 0.4));
        s += seg(top, knee, 4.2, colr) + seg(knee, paw, 3.4, colr);
      });
      return s;
    };
    let s = legs(-1, far);
    const tw = 18 * Math.sin(phase * Math.PI * 8);
    s += `<g transform="rotate(${r1(tw)} ${P(add(bc, v(-16, -3)))})"><path d="M${P(add(bc, v(-16, -3)))}q-9,-4 -12,-14" stroke="${col}" stroke-width="3.6" fill="none" stroke-linecap="round"/></g>`;
    s += `<ellipse cx="${r1(bc.x)}" cy="${r1(bc.y)}" rx="18" ry="9" fill="${col}"/>`;
    s += `<ellipse cx="${r1(bc.x + 8)}" cy="${r1(bc.y + 3)}" rx="8" ry="5" fill="${light}"/>`;
    s += legs(1, col);
    const hc = add(bc, v(19, -10));
    s += seg(add(bc, v(10, -4)), hc, 9, col);
    s += drawDog(hc, 0.85, col, phase).replace(`fill="${shade(col, 1.3)}"`, `fill="${light}"`);
    // povodac od ogrlice do ruke vozača (pas je uvećan oko tačke na tlu)
    const k = dog.scale || 1.35;
    const c0 = add(hc, v(-5, 5));
    s += circ(c0, 2, dog.leash || COLORS.coral);
    const collar = v(bc.x + (c0.x - bc.x) * k, GROUND_Y + (c0.y - GROUND_Y) * k);
    const hand = pose.arms[0].hand;
    const leash = `<path d="M${P(collar)}Q${P(v((collar.x + hand.x) / 2, Math.max(collar.y, hand.y) + 14 + bob))} ${P(hand)}" stroke="${dog.leash || COLORS.coral}" stroke-width="1.4" fill="none"/>`;
    return `<g class="pas-trci"><g transform="translate(${r1(bc.x)},${GROUND_Y}) scale(${k}) translate(${r1(-bc.x)},${-GROUND_Y})">${s}</g>${leash}</g>`;
  }

  function drawChildSeat(pose, cs, phase) { // sedište za dete na prtljažniku, sa detetom
    const k = rackGeom(pose);
    const B = v((k.x0 + k.x1) / 2 - 2, k.y);
    const col = cs.color || COLORS.coral, dark = shade(col, 0.78);
    let s = '';
    // školjka sedišta
    s += `<path d="M${r1(B.x - 14)},${r1(B.y)}L${r1(B.x + 13)},${r1(B.y)}L${r1(B.x + 14)},${r1(B.y - 8)}L${r1(B.x - 4)},${r1(B.y - 8)}L${r1(B.x - 6)},${r1(B.y - 40)}Q${r1(B.x - 10)},${r1(B.y - 46)} ${r1(B.x - 15)},${r1(B.y - 40)}Z" fill="${dark}"/>`;
    // dete
    const hip = v(B.x - 1, B.y - 9), sh = v(B.x + 2, B.y - 30), knee = v(B.x + 13, B.y - 8), foot = v(B.x + 14, B.y + 6);
    s += seg(hip, knee, 7.5, cs.pants || COLORS.navy) + seg(knee, foot, 6, cs.pants || COLORS.navy);
    s += `<ellipse cx="${r1(foot.x + 2)}" cy="${r1(foot.y + 1.5)}" rx="4.4" ry="2.6" fill="${cs.shoes || COLORS.white}"/>`;
    s += seg(hip, sh, 11, cs.top || COLORS.blue);
    const kidPose = { headC: v(B.x + 5, B.y - 42), body: { headR: 9, w: { forearm: 5.5 } }, shoulder: sh, u: norm(sub(sh, hip)) };
    s += drawHead(kidPose, { skin: cs.skin, hair: { style: 'kratka', color: cs.hair || HAIR.brown }, helmet: { type: 'obicna', color: cs.helmet || COLORS.sun } }, phase);
    s += seg(sh, v(B.x + 9, B.y - 20), 5, cs.top || COLORS.blue) + seg(v(B.x + 9, B.y - 20), v(B.x + 15, B.y - 22), 4.5, cs.top || COLORS.blue);
    s += circ(v(B.x + 16, B.y - 22), 2.6, cs.skin);
    // bok sedišta preko deteta + kaiš
    s += `<path d="M${r1(B.x - 14)},${r1(B.y)}L${r1(B.x + 12)},${r1(B.y)}L${r1(B.x + 10)},${r1(B.y - 7)}L${r1(B.x - 13)},${r1(B.y - 7)}Z" fill="${col}"/>`;
    s += seg(v(B.x - 2, B.y - 27), v(B.x + 4, B.y - 12), 1.4, COLORS.ink);
    return `<g class="decje-sediste">${s}</g>`;
  }

  /** Glava psa (gleda udesno); koristi se u sanduku i u korpi. */
  function drawDog(hc, scale, dog, phase) {
    const dd = shade(dog, 0.75);
    const ear = 8 * Math.sin(phase * Math.PI * 4);
    return `<g class="pas" transform="translate(${P(hc)}) scale(${scale})">`
      + `<circle r="9.5" fill="${dog}"/>`
      + `<ellipse cx="8.5" cy="2.5" rx="7" ry="4.6" fill="${shade(dog, 1.3)}"/>`
      + `<circle cx="14.6" cy="1" r="2" fill="${COLORS.ink}"/>`
      + `<circle cx="4.2" cy="-3" r="1.3" fill="${COLORS.ink}"/>`
      + `<path d="M9,6.4q2,4.6 4.4,0.4" fill="#F27E8C"/>`
      + `<g transform="rotate(${r1(ear)} -3 -6)"><path d="M-3,-7C-9,-8 -11,-1 -9,5C-7,4 -4.6,0 -3.4,-3Z" fill="${dd}"/></g>`
      + `</g>`;
  }

  function drawBasket(pose, content, phase = 0) {
    const { g } = pose;
    const x = g.headTop.x + 5, y = g.headTop.y - 12, w = 30, h = 22;
    const col = '#C8945A', dark = '#9C6C3B';
    const what = typeof content === 'string' ? content : (content && content.type) || 'cvece';
    let s = '';
    if (what === 'pisma' || what === 'knjige') {
      if (what === 'pisma') {
        [[3, -10, -8], [10, -13, 4], [17, -9, -3], [22, -12, 9]].forEach(([dx, dy, rot]) => {
          s += `<g transform="translate(${x + dx},${y + dy}) rotate(${rot})"><rect width="12" height="15" rx="1" fill="#FFFFFF" stroke="#C9D1DC" stroke-width="0.8"/><path d="M0,0L6,6L12,0" stroke="#C9D1DC" stroke-width="0.8" fill="none"/><rect x="8" y="10" width="3" height="3.5" fill="${COLORS.coral}"/></g>`;
        });
      } else {
        [['#3E9B6B', 0, 26], [COLORS.coral, -5, 24], [COLORS.blue, -10, 27], [COLORS.sun, -15, 22]].forEach(([c, dy, w], i) => {
          s += `<rect x="${x + 2 + i}" y="${y + dy - 1}" width="${w}" height="5" rx="1" fill="${c}"/><rect x="${x + 4 + i}" y="${y + dy}" width="${w - 6}" height="1.2" fill="#FFFFFF" opacity="0.7"/>`;
        });
      }
    }
    if (what === 'tablica') { // javni bicikl: prazna korpa sa brojem
      const wire = '#3A4560';
      let w = '';
      for (let i = 1; i < 6; i++) w += `M${x + (30 * i) / 6},${y}L${x + (30 * i) / 6},${y + 22}`;
      for (let i = 1; i < 4; i++) w += `M${x},${y + 5.5 * i}L${x + 30},${y + 5.5 * i}`;
      return `<g class="korpa">${seg(v(x + 2, y + 13), v(g.headBottom.x + 1, g.headBottom.y - 4), 2, '#6B7489')}<rect x="${x}" y="${y}" width="30" height="22" rx="2" fill="none" stroke="${wire}" stroke-width="2"/><path d="${w}" stroke="${wire}" stroke-width="0.8"/>`
        + `<rect x="${x + 6}" y="${y + 6}" width="18" height="10" rx="1.5" fill="#FFFFFF" stroke="${wire}" stroke-width="0.8"/><text x="${x + 15}" y="${y + 14}" font-size="7" font-weight="700" text-anchor="middle" fill="${COLORS.navy}" font-family="Inter, DejaVu Sans, sans-serif">${content.number || '042'}</text></g>`;
    }
    if (what === 'pas') { // mali pas viri iz korpe
      s += drawDog(v(x + 12, y - 6), 1, '#8A5A33', phase);
    } else if (what === 'namirnice') { // vekna, mleko, jabuka
      s += `<path d="M${x + 4},${y + 2}q1,-16 9,-19 q4,1 2,6 q-4,7 -5,13z" fill="#D9A25E"/>`;
      s += `<rect x="${x + 15}" y="${y - 11}" width="8" height="13" rx="1" fill="#FFFFFF" stroke="#C9D1DC" stroke-width="0.8"/>`;
      s += `<rect x="${x + 15}" y="${y - 5}" width="8" height="4" fill="${COLORS.blue}"/>`;
      s += `<path d="M${x + 15},${y - 11}l4,-3 l4,3z" fill="#E6EBF2"/>`;
      s += circ(v(x + 26, y - 1), 3.8, '#E5402F') + seg(v(x + 26, y - 4.5), v(x + 27, y - 7), 1, '#5B3A27');
    } else if (what === 'cvece') {
      // hleb i cveće iz korpe
      s += `<path d="M${x + 6},${y + 2}q2,-14 10,-17 q4,1 2,6 q-4,6 -6,12z" fill="#D9A25E"/>`;
      s += `<path d="M${x + 9},${y - 4}l5,-4 M${x + 11},${y - 1}l5,-4" stroke="#B57E3F" stroke-width="1.2"/>`;
      s += seg(v(x + 21, y + 2), v(x + 24, y - 10), 1.4, '#4E9A5E');
      s += circ(v(x + 24, y - 12), 3.2, COLORS.coral);
      s += circ(v(x + 24, y - 12), 1.3, COLORS.sun);
      s += seg(v(x + 17, y + 2), v(x + 16, y - 7), 1.3, '#4E9A5E');
      s += circ(v(x + 16, y - 9), 2.6, COLORS.sun);
    }
    // korpa
    s += `<path d="M${x},${y}L${x + w},${y}L${x + w - 3},${y + h}L${x + 3},${y + h}Z" fill="${col}"/>`;
    let weave = '';
    for (let i = 1; i < 4; i++) weave += `M${x + 1},${y + (h * i) / 4}L${x + w - 1},${y + (h * i) / 4}`;
    for (let i = 1; i < 6; i++) weave += `M${x + (w * i) / 6},${y}L${x + (w * i) / 6 + (i < 3 ? 0.5 : -0.5)},${y + h}`;
    s += `<path d="${weave}" stroke="${dark}" stroke-width="0.9" opacity="0.7"/>`;
    s += seg(v(x - 1, y), v(x + w + 1, y), 3, dark);
    s += seg(v(x + 2, y + h * 0.6), v(g.headBottom.x + 1, g.headBottom.y - 4), 2, '#6B7489');
    return `<g class="korpa">${s}</g>`;
  }

  function drawBottle(pose) {
    const { g } = pose;
    const a = lerp(g.bb, g.headBottom, 0.42);
    const ang = (Math.atan2(g.headBottom.y - g.bb.y, g.headBottom.x - g.bb.x) * 180) / Math.PI;
    return `<g class="flasica" transform="translate(${P(a)}) rotate(${r1(ang)})"><rect x="-11" y="-9.5" width="22" height="7.5" rx="3" fill="${COLORS.blue}"/><rect x="11" y="-8" width="3" height="4.5" rx="1" fill="${COLORS.ink}"/><rect x="-5" y="-9.5" width="7" height="7.5" fill="${COLORS.white}" opacity="0.55"/></g>`;
  }

  function drawBell(pose) {
    const { g } = pose;
    const p = add(lerp(g.steererTop, g.grip, 0.35), v(5, -1));
    return `<g class="zvonce">${circ(p, 3.2, COLORS.sun)}${circ(add(p, v(-1, -1)), 1, '#FFF2C2')}</g>`;
  }

  function drawLight(pose) {
    const { g } = pose;
    const p = add(lerp(g.headTop, g.headBottom, 0.55), v(6, 0));
    return `<g class="svetlo"><rect x="${r1(p.x - 2)}" y="${r1(p.y - 3)}" width="7" height="6" rx="2" fill="${COLORS.ink}"/><circle cx="${r1(p.x + 5)}" cy="${r1(p.y)}" r="2.2" fill="#FFF6C9"/></g>`;
  }

  function drawDecal(pose, cfg) {
    // tanka linija/natpis na kosoj cevi, daje ramu „brend” izgled bez stvarnog brenda
    const { g } = pose;
    const bb = g.bbF || g.bb;
    const a = lerp(bb, g.headBottom, 0.58), b = lerp(bb, g.headBottom, 0.82);
    return seg(a, b, 1.6, cfg.bike.decal, 'opacity="0.9"');
  }

  /* ======================= Telo ======================= */
  function drawTorso(pose, rider, colorOverride) {
    const { hip: H, shoulder: S, u, body } = pose;
    const nb = v(u.y, -u.x), nf = v(-u.y, u.x);
    const wh = body.w.torsoHip, wc = body.w.torsoChest;
    const hb = add(H, mul(nb, wh)), hf = add(H, mul(nf, wh * 0.92));
    const chest = lerp(H, S, 0.72);
    const cb = add(chest, mul(nb, wc)), cf = add(chest, mul(nf, wc * 0.95));
    const top = add(S, mul(u, wc * 0.62));
    const d = `M${P(hf)}C${P(add(add(hf, mul(u, wc * 1.4)), mul(nf, 1.5)))} ${P(sub(cf, mul(u, wc * 0.55)))} ${P(cf)}`
      + `Q${P(add(add(S, mul(nf, wc * 0.95)), mul(u, wc * 0.45)))} ${P(top)}`
      + `Q${P(add(add(S, mul(nb, wc * 0.98)), mul(u, wc * 0.38)))} ${P(add(S, mul(nb, wc * 0.75)))}`
      + `C${P(add(cb, mul(u, wc * 0.4)))} ${P(add(add(hb, mul(u, wc * 1.2)), mul(nb, 1.5)))} ${P(hb)}`
      + `Q${P(sub(H, mul(u, wc * 0.75)))} ${P(hf)}Z`;
    return pathEl(d, colorOverride || rider.top.color);
  }

  function torsoDetails(pose, rider) {
    const { hip: H, shoulder: S, u, body } = pose;
    const nb = v(u.y, -u.x), nf = v(-u.y, u.x);
    const wc = body.w.torsoChest;
    let s = '';
    const t = rider.top;
    if (t.stripe) { // poprečna traka (refleksna / dres)
      const a = lerp(H, S, t.stripeAt || 0.48), b = lerp(H, S, (t.stripeAt || 0.48) + 0.12);
      const d = `M${P(add(a, mul(nb, wc * 0.95)))}L${P(add(a, mul(nf, wc * 0.9)))}L${P(add(b, mul(nf, wc * 0.95)))}L${P(add(b, mul(nb, wc)))}Z`;
      s += pathEl(d, t.stripe);
    }
    if (t.zip) { // rajsferšlus / porub napred
      s += seg(add(lerp(H, S, 0.15), mul(nf, wc * 0.8)), add(lerp(H, S, 0.9), mul(nf, wc * 0.7)), 1, shade(t.color, 0.75), 'opacity="0.8"');
    }
    if (t.collar) { // kragna
      const c = add(S, mul(u, wc * 0.45));
      s += `<path d="M${P(add(c, mul(nb, 4)))}Q${P(add(c, mul(u, 3)))} ${P(add(c, mul(nf, 5)))}" stroke="${t.collar}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
    if (t.vest) { // reflektujući prsluk preko uniforme
      s += drawTorso(pose, rider, t.vest);
      for (const f of [0.3, 0.62]) {
        const c = lerp(H, S, f);
        s += `<path d="M${P(add(c, mul(nb, wc * 0.95)))}L${P(add(c, mul(nf, wc * 0.9)))}" stroke="#E6EBF2" stroke-width="2.6"/>`;
      }
      s += `<rect x="-3" y="-4" width="6" height="8" rx="1.5" fill="${COLORS.ink}" transform="translate(${P(add(lerp(H, S, 0.8), mul(nf, wc * 0.55)))})"/>`;
    }
    if (t.stripes) { // mornarske pruge
      for (let f = 0.12; f < 0.9; f += 0.13) {
        const c = lerp(H, S, f);
        s += `<path d="M${P(add(c, mul(nb, wc * 0.95)))}L${P(add(c, mul(nf, wc * 0.9)))}" stroke="${t.stripes}" stroke-width="2.2"/>`;
      }
    }
    if (t.camera) { // fotoaparat oko vrata
      const c = add(lerp(H, S, 0.62), mul(nf, wc * 0.85));
      s += `<path d="M${P(add(S, mul(nb, 3)))}Q${P(add(lerp(H, S, 0.75), mul(nf, wc * 0.2)))} ${P(c)}" stroke="${COLORS.ink}" stroke-width="1" fill="none"/>`;
      s += `<rect x="${r1(c.x - 5)}" y="${r1(c.y - 4)}" width="11" height="8" rx="2" fill="${COLORS.ink}"/>` + circ(add(c, v(2, 0)), 2.6, '#5B6478') + circ(add(c, v(2, 0)), 1.2, '#9FD8FF');
    }
    if (t.dots) { // tufne / havajska košulja
      const pts = [[0.2, 0.4], [0.35, -0.5], [0.5, 0.2], [0.62, -0.3], [0.78, 0.45], [0.85, -0.55], [0.4, 0.75], [0.66, 0.8]];
      for (const [f, k] of pts) s += circ(add(lerp(H, S, f), mul(nf, wc * k)), 1.7, t.dots);
    }
    if (t.apron) { // kecelja preko grudi
      const fe = (f, k) => add(lerp(H, S, f), mul(nf, wc * k));
      s += pathEl(`M${P(fe(0.82, 0.95))}L${P(fe(0.82, 0.1))}L${P(fe(0, -0.1))}L${P(fe(0, 1))}Z`, t.apron);
      s += seg(fe(0.82, 0.3), add(fe(0.98, 0.1), mul(nb, wc * 0.5)), 1.4, shade(t.apron, 0.8));
    }
    if (t.quilted) { // jakna sa prošivenim poljima
      for (const f of [0.28, 0.5, 0.72]) {
        const c = lerp(H, S, f);
        s += `<path d="M${P(add(c, mul(nb, wc * 0.95)))}Q${P(add(c, mul(u, 2)))} ${P(add(c, mul(nf, wc * 0.9)))}" stroke="${shade(t.color, 0.8)}" stroke-width="1.1" fill="none"/>`;
      }
    }
    if (t.blazer) { // sako: bela košulja u „V” + kravata + revers
      const fe = (f, k = 0.92) => add(lerp(H, S, f), mul(nf, wc * k));
      const inner = add(lerp(H, S, 0.94), mul(nf, wc * 0.25));
      s += pathEl(`M${P(fe(0.98, 0.85))}L${P(fe(0.55))}L${P(inner)}Z`, t.shirt || COLORS.white);
      if (t.tie) s += `<path d="M${P(add(fe(0.9, 0.7), mul(nb, 1)))}L${P(fe(0.6, 0.9))}L${P(fe(0.52, 0.86))}L${P(add(fe(0.62, 0.7), mul(nb, 1.4)))}Z" fill="${t.tie}"/>`;
      s += seg(inner, fe(0.55), 1.2, shade(t.color, 0.7));
      s += circ(fe(0.38, 0.75), 1.1, shade(t.color, 0.6));
    }
    if (t.hood) { // kapuljača na leđima ispod vrata
      const c = add(add(S, mul(nb, wc * 0.55)), mul(u, wc * 0.35));
      const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
      s += `<ellipse cx="${r1(c.x)}" cy="${r1(c.y)}" rx="${r1(wc * 0.62)}" ry="${r1(wc * 0.82)}" transform="rotate(${r1(ang)} ${P(c)})" fill="${shade(t.color, 0.86)}"/>`;
    }
    if (t.strings) { // vezice duksa
      const a = add(add(S, mul(nf, wc * 0.55)), mul(u, wc * 0.2));
      s += seg(a, add(a, add(mul(u, -9), mul(nf, 1))), 1, t.strings);
      s += seg(add(a, mul(nf, -2.5)), add(add(a, mul(nf, -2)), mul(u, -11)), 1, t.strings);
    }
    if (t.scarf) { // šal
      const c = add(S, mul(u, wc * 0.4));
      s += `<path d="M${P(add(c, mul(nb, 6)))}Q${P(add(c, mul(u, 4)))} ${P(add(c, mul(nf, 6)))}" stroke="${t.scarf}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      const tail = add(add(c, mul(nf, 6)), mul(u, -1));
      s += `<path d="M${P(tail)}q3,4 1,11 l3,1 q2,-7 -1,-12z" fill="${shade(t.scarf, 0.9)}"/>`;
    }
    return s;
  }

  function drawLeg(pose, leg, rider, far) {
    const { hip, body } = pose;
    const k = far ? 0.72 : 1;
    const pants = shade(rider.bottom.color, k);
    const skin = shade(rider.skin, far ? 0.82 : 1);
    const sock = rider.socks ? shade(rider.socks, k) : null;
    const W = body.w;
    let s = '';
    const type = rider.bottom.type;
    // butina
    if (type === 'shorts') {
      const mid = lerp(hip, leg.knee, 0.62);
      s += seg(mid, leg.knee, W.thigh * 0.82, skin);
      s += seg(hip, mid, W.thigh, pants);
    } else {
      s += seg(hip, leg.knee, W.thigh, pants);
    }
    // potkolenica
    const legSkin = type === 'long' ? pants : (rider.stockings ? shade(rider.stockings, k) : skin);
    s += seg(leg.knee, leg.ankle, W.shin, legSkin);
    if (type === 'long') {
      // porub nogavice
      s += seg(lerp(leg.knee, leg.ankle, 0.93), leg.ankle, W.shin + 1.5, shade(rider.bottom.color, k * 0.85));
    }
    if (sock) s += seg(lerp(leg.knee, leg.ankle, 0.82), leg.ankle, W.shin * 0.9, sock);
    if (type === 'shorts' || type === 'long') s += circ(leg.knee, W.thigh * (type === 'shorts' ? 0.41 : 0.48), type === 'shorts' ? skin : pants);
    // cipela
    s += drawShoe(leg, rider, far, pose);
    return `<g class="noga ${far ? 'dalja' : 'bliza'}">${s}</g>`;
  }

  function drawShoe(leg, rider, far, pose) {
    const kid = pose.body === BODY.dete;
    const sc = kid ? 0.72 : 1;
    const col = shade(rider.shoes, far ? 0.72 : 1);
    const sole = far ? '#2A3045' : (rider.sole || COLORS.white);
    const p = add(leg.pedal, v(-3 * sc, -1.5 * sc));
    return `<g transform="translate(${P(p)}) rotate(6) scale(${sc})">`
      + `<path d="M-8,1 L10,1 Q13,1 12,-2 Q9.5,-6 2,-6.5 L-5,-7.5 Q-9.5,-7.5 -9,-3 Z" fill="${col}"/>`
      + `<path d="M-8.5,0.3 L11.5,0.3" stroke="${sole}" stroke-width="2" stroke-linecap="round"/>`
      + `</g>`;
  }

  function drawArm(pose, arm, rider, far) {
    const { shoulder, body } = pose;
    const k = far ? 0.72 : 1;
    const top = shade(rider.top.color, k);
    const skin = shade(rider.skin, far ? 0.82 : 1);
    const W = body.w;
    const sleeve = rider.top.sleeve || 'long';
    let s = '';
    if (sleeve === 'long') {
      s += seg(shoulder, arm.elbow, W.upperArm, top);
      s += seg(arm.elbow, arm.hand, W.forearm, top);
      s += circ(arm.elbow, W.upperArm * 0.47, top);
      s += seg(lerp(arm.elbow, arm.hand, 0.86), lerp(arm.elbow, arm.hand, 0.9), W.forearm + 1.4, shade(rider.top.color, k * 0.85)); // manžetna
    } else {
      s += seg(shoulder, arm.elbow, W.upperArm * 0.9, skin);
      s += seg(arm.elbow, arm.hand, W.forearm, skin);
      s += seg(shoulder, lerp(shoulder, arm.elbow, 0.5), W.upperArm + 1, top);
      if (rider.top.sleeveStripe) s += seg(lerp(shoulder, arm.elbow, 0.42), lerp(shoulder, arm.elbow, 0.55), W.upperArm + 0.6, shade(rider.top.sleeveStripe, k), 'stroke-linecap="butt"');
    }
    if (rider.wave && !far) s += `<ellipse cx="${r1(arm.hand.x)}" cy="${r1(arm.hand.y - 1.5)}" rx="${r1(W.forearm * 0.55)}" ry="${r1(W.forearm * 0.75)}" fill="${skin}"/>`;
    if (rider.gloves) s += circ(arm.hand, W.forearm * 0.5, shade(rider.gloves, k));
    else s += circ(arm.hand, W.forearm * 0.5, skin);
    return `<g class="ruka ${far ? 'dalja' : 'bliza'}">${s}</g>`;
  }

  function drawSkirt(pose, rider) {
    // suknja: deblji sloj preko butine + porub koji visi ispod kolena
    const { hip, legs, body } = pose;
    const knee = legs[0].knee;
    const col = rider.bottom.color;
    const kd = norm(sub(knee, hip));
    const end = add(knee, mul(kd, 5));
    let s = seg(hip, end, body.w.thigh + 3, col, 'stroke-linecap="butt"');
    s += circ(hip, (body.w.thigh + 3) / 2, col);
    const n = v(-kd.y, kd.x); // normala nadole
    const a = add(end, mul(n, (body.w.thigh + 3) / 2));
    const b = add(lerp(hip, end, 0.5), mul(n, (body.w.thigh + 3) / 2));
    s += `<path d="M${P(b)}L${P(a)}Q${P(add(a, v(0, 6)))} ${P(add(a, v(-5, 7.5)))}Q${P(add(b, v(6, 6)))} ${P(b)}Z" fill="${col}"/>`;
    s += `<path d="M${P(add(lerp(hip, end, 0.7), mul(n, 3)))}L${P(add(a, v(-4, 6)))}" stroke="${shade(col, 1.25)}" stroke-width="0.9" opacity="0.6"/>`;
    return `<g class="suknja">${s}</g>`;
  }

  function drawBackpack(pose, rider) {
    const { hip: H, shoulder: S, u, body } = pose;
    const nb = v(u.y, -u.x), nf = v(-u.y, u.x);
    const bp = rider.backpack;
    const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    let s = '';
    if (bp.type === 'termo') {
      // size: 1 = osnovna kutija; 1.45 ≈ dvostruko veća površina
      const sz = bp.size || 1;
      const c = add(lerp(H, S, 0.5 + 0.08 * sz), mul(nb, body.w.torsoChest + 14 * sz - 3));
      s += `<g class="termo-ranac" transform="translate(${P(c)}) rotate(${r1(ang)}) scale(${sz})">`
        + `<rect x="-19" y="-14" width="38" height="28" rx="4" fill="${bp.color}"/>`
        + `<rect x="14" y="-14" width="5" height="28" rx="2" fill="${shade(bp.color, 0.8)}"/>`
        + `<rect x="-19" y="-14" width="38" height="4.5" rx="2" fill="${shade(bp.color, 1.25)}"/>`
        + `<rect x="-8" y="-5" width="14" height="10" rx="2" fill="${shade(bp.color, 0.88)}"/>`
        + `<path d="M-14,11 L12,11" stroke="${shade(bp.color, 0.75)}" stroke-width="1.2" stroke-dasharray="2 2"/>`
        + `</g>`;
    } else {
      const c = add(lerp(H, S, 0.55), mul(nb, body.w.torsoChest + 5));
      s += `<g class="ranac" transform="translate(${P(c)}) rotate(${r1(ang)})">`
        + `<rect x="-17" y="-9" width="34" height="18" rx="7" fill="${bp.color}"/>`
        + `<rect x="-12" y="-12.5" width="20" height="8" rx="4" fill="${shade(bp.color, 0.82)}"/>`
        + `<path d="M-14,0 L13,0" stroke="${shade(bp.color, 0.7)}" stroke-width="1" stroke-dasharray="2 1.6"/>`
        + `<rect x="14" y="-4" width="4" height="7" rx="1.5" fill="${shade(bp.color, 0.7)}"/>`
        + `</g>`;
    }
    return s;
  }

  function drawPhone(pose, color) { // telefon u ruci, ekran svetli
    const h = pose.arms[0].hand;
    return `<g class="telefon" transform="translate(${P(add(h, v(2, -3.5)))}) rotate(-28)">`
      + `<rect x="-3.4" y="-7" width="6.8" height="12" rx="1.6" fill="${color}"/>`
      + `<rect x="-2.4" y="-6" width="4.8" height="9.6" rx="0.8" fill="#BFF0FF"/>`
      + `<path d="M-1.4,-4L1.4,-4M-1.4,-2.4L0.8,-2.4M-1.4,-0.8L1.6,-0.8" stroke="#5B8AA8" stroke-width="0.5"/>`
      + `</g>` + circ(add(h, v(0.5, 0.5)), pose.body.w.forearm * 0.5, '#00000000');
  }

  function drawRod(pose, rod, phase) { // štap za pecanje uz leđa
    const { hip: H, u, body } = pose;
    const nb = v(u.y, -u.x);
    const base = add(add(H, mul(nb, body.w.torsoHip + 3)), mul(u, -4));
    const d = dir(104);
    const mid = add(base, mul(d, 50)), tip = add(base, mul(d, 118));
    let s = seg(base, mid, 2.8, rod.color || '#3A4560') + seg(mid, tip, 1.5, rod.color || '#3A4560');
    const reel = add(base, mul(d, 16));
    s += circ(reel, 4, '#9AA3B2') + circ(reel, 1.6, '#5B6478') + seg(reel, add(reel, v(5, 2)), 1.2, '#5B6478');
    const sw = 5 * Math.sin(phase * Math.PI * 2);
    const end = add(tip, v(-8 + sw, 30));
    s += `<path d="M${P(tip)}Q${P(add(tip, v(-6 + sw * 0.5, 12)))} ${P(end)}" stroke="#8A93A6" stroke-width="0.6" fill="none"/>`;
    s += circ(add(end, v(0, 3)), 2.6, '#E5402F') + `<path d="M${P(add(end, v(-2.6, 3)))}a2.6 2.6 0 0 0 5.2 0z" fill="#FFFFFF"/>`;
    return `<g class="stap">${s}</g>`;
  }

  function drawGuitar(pose, g) { // gitara u futroli na leđima
    const { hip: H, shoulder: S, u, body } = pose;
    const nb = v(u.y, -u.x);
    const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    const c = add(lerp(H, S, 0.28), mul(nb, body.w.torsoChest + 6));
    const col = g.color || '#2B3552', d = shade(col, 0.75);
    return `<g class="gitara" transform="translate(${P(c)}) rotate(${r1(ang - 28)}) scale(0.78)">`
      + `<rect x="34" y="-4" width="40" height="8" rx="3" fill="${col}"/>`
      + `<rect x="70" y="-5.5" width="12" height="11" rx="3" fill="${d}"/>`
      + `<ellipse cx="0" cy="0" rx="20" ry="14" fill="${col}"/>`
      + `<ellipse cx="26" cy="0" rx="14" ry="11" fill="${col}"/>`
      + `<path d="M-14,-6Q10,-10 38,-3" stroke="${d}" stroke-width="1.2" fill="none"/>`
      + `<rect x="-4" y="9" width="10" height="3" rx="1.5" fill="${g.accent || COLORS.sun}"/>`
      + `</g>`;
  }

  function drawMessenger(pose, rider) { // torba preko ramena, na leđnom boku
    const { hip: H, shoulder: S, u, body } = pose;
    const nb = v(u.y, -u.x);
    const m = rider.messenger;
    const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    const c = add(lerp(H, S, 0.2), mul(nb, body.w.torsoHip + 4));
    let s = `<path d="M${P(add(S, mul(u, 3)))}L${P(add(lerp(H, S, 0.22), mul(nb, body.w.torsoHip)))}" stroke="${shade(m.color, 0.7)}" stroke-width="3.2" stroke-linecap="round"/>`;
    s += `<g class="torba" transform="translate(${P(c)}) rotate(${r1(ang + 90)})">`
      + `<rect x="-11" y="-8" width="22" height="16" rx="3" fill="${m.color}"/>`
      + `<path d="M-11,-8L11,-8L11,0Q0,3 -11,0Z" fill="${shade(m.color, 0.8)}"/>`
      + `<rect x="-2" y="-1" width="4" height="4" rx="1" fill="#D9B36A"/></g>`;
    return s;
  }

  function drawStrap(pose, rider) {
    const { hip: H, shoulder: S, u, body } = pose;
    const nb = v(u.y, -u.x), nf = v(-u.y, u.x);
    const a = add(add(S, mul(nb, 4)), mul(u, body.w.torsoChest * 0.5));
    const b = add(lerp(H, S, 0.42), mul(nf, body.w.torsoChest * 0.7));
    const ctrl = add(add(S, mul(nf, body.w.torsoChest * 1.0)), mul(u, 2));
    return `<path d="M${P(a)}Q${P(ctrl)} ${P(b)}" stroke="${shade(rider.backpack.color, 0.62)}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  }

  /* ---------- Glava (lokalne koordinate: poluprečnik 10, gleda udesno) ---------- */
  const HAIR_SHAPES = {
    pletenica: 'M9.4,-3.4C9,-10.4 3.2,-12.8 -2.2,-12.4C-8.6,-11.8 -11.8,-6 -11,0.4C-10.6,3.4 -9.4,6 -8,7.6L-4.6,6C-5.4,3 -5,0 -3.4,-1.6C-0.6,-4.2 4.4,-2.6 9.4,-3.4Z',
    duga: 'M9.4,-3.4C9,-10.4 3.2,-12.8 -2.2,-12.4C-8.6,-11.8 -11.8,-6 -11,0.4C-10.6,3.4 -9.4,6 -8,7.6L-4.6,6C-5.4,3 -5,0 -3.4,-1.6C-0.6,-4.2 4.4,-2.6 9.4,-3.4Z',
    kratka: 'M9.6,-3.6C9.2,-10.2 3.4,-12.8 -2,-12.3C-8.2,-11.7 -11.6,-6.2 -10.6,-0.2C-10.2,2.8 -8.8,5.4 -7.4,6.8L-4.6,5.6C-5.4,2.8 -5,-0.2 -3.4,-1.6C-1,-3.8 4,-2.8 9.6,-3.6Z',
    punda: 'M9.2,-3.8C8.4,-10.6 2.4,-12.4 -3,-11.8C-9,-11.2 -11.6,-5.4 -10.9,0C-10.5,3 -9.2,5.2 -7.8,6.6L-4.8,5C-5.2,2 -4.7,-1 -3,-2.6C0,-4.8 5,-3.6 9.2,-3.8Z',
    nisko: 'M9.2,-3.8C8.4,-10.6 2.4,-12.4 -3,-11.8C-9,-11.2 -11.6,-5.4 -10.9,0C-10.5,3 -9.2,5.2 -7.8,6.6L-4.8,5C-5.2,2 -4.7,-1 -3,-2.6C0,-4.8 5,-3.6 9.2,-3.8Z',
    rep: 'M9.4,-3.6C9,-10.4 3,-12.6 -2.4,-12.2C-8.6,-11.6 -11.6,-6 -10.8,-0.4C-10.4,2.6 -9,5 -7.6,6.4L-4.8,5.4C-5.4,2.6 -5,-0.4 -3.4,-1.8C-0.8,-4 4.2,-3 9.4,-3.6Z',
  };

  function drawHead(pose, rider, phase = 0) {
    const { headC, body, shoulder, u } = pose;
    const R = body.headR;
    const sc = R / 10;
    const skin = rider.skin;
    const skinDark = shade(skin, 0.86);
    const hair = rider.hair.color;
    let s = '';
    // vrat
    s += seg(add(shoulder, mul(u, 3)), add(headC, v(-1.5 * sc, 6 * sc)), body.w.forearm * 0.85, skinDark);

    let h = '';
    // rep / punđa iza glave (crtaju se pre lobanje)
    if (rider.hair.style === 'rep') {
      // rep blago leprša: phase (0..1) dolazi iz animacije
      const sway = 7 * WIND * Math.sin(phase * Math.PI * 4);
      h += `<g transform="rotate(${r1(sway)} -9 -5.6)"><path d="M-8.5,-6.5C-14,-6 -18.5,-1 -19,5.5C-17,3.5 -15,2.8 -13.5,3.2C-15.2,6 -15,9 -13.6,11.2C-12.4,7 -10.4,3 -7.6,0.5Z" fill="${hair}"/></g>`;
      h += `<circle cx="-9" cy="-5.6" r="1.8" fill="${rider.hair.tie || COLORS.coral}"/>`;
    }
    if (rider.hair.style === 'duga') {
      const sway = 5 * WIND * Math.sin(phase * Math.PI * 4);
      h += `<g transform="rotate(${r1(sway)} -6 -4)"><path d="M-6,-10C-12,-8 -13.5,-1 -13.6,6C-13.7,12 -15,17 -18,21C-12,21 -7.5,17 -6,11C-5,7 -4.5,3 -4,-1Z" fill="${hair}"/></g>`;
    }
    if (rider.headwear && rider.headwear.type === 'veo') { // veo leprša iza glave
      const sw = 6 * WIND * Math.sin(phase * Math.PI * 4);
      h += `<g transform="rotate(${r1(sw)} -6 -10)"><path d="M-4,-12C-14,-12 -22,-4 -30,14C-24,18 -16,20 -8,18C-10,8 -8,-2 -2,-8Z" fill="#FFFFFF" fill-opacity="0.85" stroke="#D5DCE6" stroke-width="0.6"/></g>`;
    }
    if (rider.hair.style === 'pletenica') { // pletenica koja se njiše
      const sway = 6 * WIND * Math.sin(phase * Math.PI * 4);
      let br = '';
      for (let i = 0; i < 6; i++) br += `<ellipse cx="${r1(-10.5 - i * 0.9)}" cy="${r1(-1 + i * 3.3)}" rx="2.6" ry="2.1" fill="${i % 2 ? shade(hair, 0.85) : hair}"/>`;
      br += `<circle cx="-16" cy="19" r="1.6" fill="${rider.hair.tie || COLORS.coral}"/>`;
      h += `<g transform="rotate(${r1(sway)} -10 -2)">${br}</g>`;
    }
    if (rider.hair.style === 'nisko') { // niska punđa na potiljku (stane ispod kacige)
      h += `<circle cx="-10.6" cy="0.4" r="4.4" fill="${hair}"/>`;
      h += `<path d="M-13.6,-0.6q3,-2.2 6,-0.2" stroke="${shade(hair, 0.8)}" stroke-width="0.8" fill="none"/>`;
    }
    if (rider.hair.style === 'punda') {
      h += `<circle cx="-9.4" cy="-8.4" r="4.8" fill="${hair}"/>`;
      h += `<path d="M-12.4,-9.8q3,-2.4 6,0" stroke="${shade(hair, 0.85)}" stroke-width="0.8" fill="none"/>`;
    }
    // lobanja + vilica + nos
    h += `<circle r="10" fill="${skin}"/>`;
    h += `<ellipse cx="2.6" cy="3.4" rx="7.4" ry="6.6" fill="${skin}"/>`;
    h += `<circle cx="9.7" cy="1.2" r="1.9" fill="${skin}"/>`;
    const scarf = rider.headwear && (rider.headwear.type === 'marama' || rider.headwear.type === 'kapuljaca');
    // kosa
    if (!scarf && HAIR_SHAPES[rider.hair.style]) h += `<path d="${HAIR_SHAPES[rider.hair.style]}" fill="${hair}"/>`;
    if (rider.hair.style === 'punda') {
      h += `<path d="M-6.5,-9.5Q-1,-11.5 5,-8.5" stroke="${shade(hair, 0.82)}" stroke-width="0.7" fill="none"/>`;
    }
    if (rider.beard) {
      h += `<path d="M-3.4,3.6C-3,7.8 0.4,10.6 4.6,10.6C7.6,10.6 9.6,9.2 10.2,7.2C9,7.6 7.8,7.6 6.6,7C5.6,6.6 4.4,6.8 3.6,6.2C1.6,5.2 0.4,3.6 -0.2,1.8Z" fill="${hair}"/>`;
      h += `<path d="M5.6,6.6Q7.6,6 9.4,6.6" stroke="${hair}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    }
    if (scarf) { // marama: pokriva kosu, uši i vrat, lice ostaje otkriveno
      const mc = rider.headwear.color, md = shade(mc, 0.8);
      h += `<path d="M9.6,-5.2C8.6,-12.2 -1,-14.6 -7,-11.6C-12,-8.6 -12.8,0 -11.8,6C-11,10.4 -9.4,15 -6.4,18.4Q0,21.8 6.8,17.4C8.8,15.2 10.4,12.4 10.2,9.8C7.6,11 4.6,11 2.4,9.6C1,6.2 0.8,0.6 1.8,-3C4,-4.6 6.8,-5 9.6,-5.2Z" fill="${mc}"/>`;
      if (rider.headwear.type === 'kapuljaca') h += `<path d="M9.4,-5.4C10.8,-6.6 12.8,-6.6 13.2,-5.2C11.8,-3.6 10.6,-3 9.2,-3.2Z" fill="${md}"/>`;
      h += `<path d="M1.2,-3.4C0.2,2 0.4,6.6 1.8,10.2M-6,-9.6C-9.4,-4 -9.4,4 -6.4,12" stroke="${md}" stroke-width="0.8" fill="none"/>`;
    }
    // uvo
    if (!scarf) h += `<ellipse cx="-1.2" cy="1.2" rx="1.9" ry="2.6" fill="${skinDark}"/>`;
    if (!scarf) h += `<path d="M-1.4,0.2q1,0.8 0,2" stroke="${shade(skin, 0.7)}" stroke-width="0.5" fill="none"/>`;
    if (rider.mustache) h += `<path d="M5.4,3.6Q7.6,2.6 10,3.8Q9.2,5.2 7.6,4.6Q6.4,5.2 5.4,3.6Z" fill="${rider.mustache}"/>`;
    // lice
    h += `<path d="M4.4,-3.5Q6,-4.3 7.7,-3.7" stroke="${shade(hair, 0.9)}" stroke-width="0.9" fill="none" stroke-linecap="round"/>`;
    h += `<ellipse cx="6.1" cy="-0.7" rx="0.95" ry="1.25" fill="${COLORS.ink}"/>`;
    if (rider.lashes) h += `<path d="M6.5,-1.7L8,-2.6M6.9,-1.2L8.4,-1.7" stroke="${COLORS.ink}" stroke-width="0.55" stroke-linecap="round"/>`;
    h += `<circle cx="5.3" cy="3" r="1.8" fill="${COLORS.coral}" opacity="0.22"/>`;
    h += `<path d="M6.3,4.7Q7.7,5.8 9,4.6" stroke="#8A3F2E" stroke-width="0.75" fill="none" stroke-linecap="round"/>`;
    if (rider.age === 'stariji') {
      h += `<path d="M7.6,1Q8.3,1.6 7.9,2.4M3.2,4.6Q3.6,5.8 4.6,6.6" stroke="${shade(skin, 0.78)}" stroke-width="0.5" fill="none"/>`;
    }
    // naočare
    if (rider.glasses === 'naocare') {
      h += `<path d="M-0.6,-1.4L4.2,-1.2" stroke="${COLORS.ink}" stroke-width="0.7"/>`;
      h += `<circle cx="6.5" cy="-0.8" r="2.2" fill="#FFFFFF" fill-opacity="0.25" stroke="${COLORS.ink}" stroke-width="0.75"/>`;
    } else if (rider.glasses === 'sportske') {
      h += `<path d="M-0.6,-1.8L4,-2.2" stroke="${COLORS.ink}" stroke-width="0.9"/>`;
      h += `<path d="M3.6,-3L10.4,-3.4Q10.8,-0.4 8.8,0.5L5,0.8Q3.4,0.3 3.6,-3Z" fill="${COLORS.ink}"/>`;
      h += `<path d="M5,-2.2L9.2,-2.5" stroke="${COLORS.blue}" stroke-width="0.7" opacity="0.9"/>`;
    }
    // slušalice
    if (rider.headphones) {
      h += `<path d="M-1.6,-1.6C-3,-9 0,-13.8 5.5,-11.4" stroke="${COLORS.ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      h += `<rect x="-4.4" y="-2.6" width="6" height="7.6" rx="2.6" fill="${COLORS.ink}"/>`;
      h += `<rect x="-3.4" y="-1.6" width="4" height="5.6" rx="1.8" fill="${rider.headphones}"/>`;
    }
    // kape i šeširi
    if (rider.headwear && !scarf) h += drawHeadwear(rider.headwear);
    // kaciga
    if (rider.helmet) h += drawHelmet(rider.helmet);

    s += `<g class="glava" transform="translate(${P(headC)}) rotate(${rider.headTilt || 0}) scale(${r1(sc * 100) / 100})">${h}</g>`;
    return s;
  }

  function drawHeadwear(hw) {
    const c = hw.color, dark = shade(c, 0.78);
    let s = '';
    if (hw.type === 'cilindar') { // cilindar
      s += `<path d="M-6.8,-6.5L-7.4,-19.8Q0,-21.4 7.4,-19.8L6.8,-6.5Z" fill="${c}"/>`;
      s += `<path d="M-7,-9.4L7,-9.4L6.9,-7L-6.9,-7Z" fill="${hw.band || COLORS.coral}"/>`;
      s += `<path d="M-12,-5.6Q0,-8.6 12,-5.6Q12.6,-3.6 10.4,-3.8Q0,-5.6 -10.4,-3.6Q-12.6,-3.6 -12,-5.6Z" fill="${dark}"/>`;
    } else if (hw.type === 'kuvarska') { // pekarska kapa
      s += `<path d="M-9,-4.6L-9.6,-11C-13,-13 -11.8,-19.6 -6.6,-18.2C-4.8,-22.6 2.6,-22.6 4,-18.4C9,-20 11.6,-13.4 8.6,-11L8.4,-4.6Z" fill="${c}" stroke="#D5DCE6" stroke-width="0.6"/>`;
      s += `<path d="M-9.4,-6.6L8.8,-6.6" stroke="#D5DCE6" stroke-width="0.8"/>`;
    } else if (hw.type === 'kacket') { // bejzbol kačket, štitnik napred ili nazad
      s += `<path d="M9.6,-3.2C9.8,-10.2 4,-13 -2,-12.8C-8,-12.5 -11.2,-8.2 -11,-3.2Z" fill="${c}"/>`;
      s += `<path d="M-1,-12.8C-1.6,-9 -1.4,-6 -0.8,-3.2" stroke="${dark}" stroke-width="0.7" fill="none"/>`;
      s += circ(v(-1, -12.8), 1.2, dark);
      if (hw.backwards) s += `<path d="M-9.4,-3.8L-16.6,-2.6Q-17.2,-0.8 -15,-0.6L-9.8,-1.6Z" fill="${dark}"/>`;
      else s += `<path d="M8,-3.8L16.4,-3Q16.6,-1.4 14.4,-1.2L8,-1.8Z" fill="${dark}"/>`;
    } else if (hw.type === 'kapa') { // ravna kapa (kačket starog kroja)
      s += `<path d="M10.4,-4.2C9.6,-11.4 2,-13.4 -4.4,-12.2C-9.4,-11.2 -11.4,-7 -10.8,-3.4Z" fill="${c}"/>`;
      s += `<path d="M9.6,-4.6L14,-3.6Q13.6,-2.2 11.4,-2.4L8.8,-2.8Z" fill="${dark}"/>`;
      s += `<path d="M-8,-9.4L7,-7.4M-9.4,-6.4L8,-5" stroke="${dark}" stroke-width="0.6" opacity="0.7"/>`;
    } else if (hw.type === 'veo') { // venčić od cveća
      [[-8, -9], [-4, -12], [1, -13], [5.5, -11.6]].forEach(([x, y], i) => { s += circ(v(x, y), 2.1, i % 2 ? '#F27EB4' : '#FFFFFF'); });
      s += circ(v(-1.5, -12.6), 1, COLORS.sun);
    } else if (hw.type === 'zimska') { // vunena kapa sa pomponom
      s += `<path d="M10.2,-3.2C10.4,-11 4.4,-14.4 -1.8,-14.2C-8,-13.8 -11.6,-9 -11.2,-2.8Z" fill="${c}"/>`;
      s += `<path d="M-11.4,-2.2L10.6,-2.8L10.4,-6.2L-11.2,-5.6Z" fill="${dark}"/>`;
      s += `<path d="M-6,-12.4L-5.6,-6.4M-1.4,-13.6L-1.2,-6.6M3.4,-13L3.2,-6.8" stroke="${dark}" stroke-width="0.7" opacity="0.8"/>`;
      if (hw.pom !== false) s += circ(v(-2.6, -15.4), 3.6, hw.pom || COLORS.white);
    } else if (hw.type === 'sesir') { // šešir protiv sunca
      s += `<path d="M7.8,-4C7.4,-12.6 -7.4,-13.2 -8.6,-4Z" fill="${c}"/>`;
      s += `<path d="M-8.4,-5.4L7.8,-5.2" stroke="${hw.band || dark}" stroke-width="1.8"/>`;
      s += `<path d="M-13,-2.6Q0,-6.6 13.4,-3.6Q14,-1.4 11.6,-1.4Q0,-4 -11.4,-0.8Q-13.6,-0.8 -13,-2.6Z" fill="${dark}"/>`;
    }
    return s;
  }

  function drawHelmet(hm) {
    const c = hm.color, dark = shade(c, 0.75);
    let s = '';
    if (hm.type === 'aero') { // aero kaciga sa dugačkim repom i vizirom
      s += `<path d="M11.4,-1.6C11.8,-9.6 5,-14.4 -4,-14C-12,-13.4 -20,-9 -27,-3.2C-18,-2.4 -10.6,-1.2 -6,-0.8C-2,-2.4 4,-2.6 11.4,-1.6Z" fill="${c}"/>`;
      if (hm.stripe) s += `<path d="M-24,-4.6C-14,-10.4 0,-13 9,-8.6" stroke="${hm.stripe}" stroke-width="1.6" fill="none"/>`;
      s += `<path d="M7.6,-3.4L12.4,-3.2Q13.4,0.4 10.4,1.6L7,1.2Z" fill="#7FD3FF" fill-opacity="0.75" stroke="${dark}" stroke-width="0.5"/>`;
      s += `<path d="M-3.2,-0.8Q-1.6,5.6 2.6,9.6" stroke="${dark}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`;
      return s;
    }
    if (hm.type === 'drumska') {
      s += `<path d="M11,-2C11.6,-9.4 5,-14.8 -3,-14.2C-9,-13.8 -13.6,-10 -15.6,-4.6C-14,-4 -12,-3.2 -10,-1.8L-6,-1.2C-2,-2.8 4,-3 11,-2Z" fill="${c}"/>`;
      s += `<path d="M-1,-13.6C-3,-10.6 -4,-7.4 -4.4,-2.6M4.4,-12.6C3,-10 2.2,-7 2,-2.9" stroke="${dark}" stroke-width="1.3" fill="none"/>`;
      if (hm.stripe) s += `<path d="M-12.6,-7.6C-8,-12 2,-13.6 8.6,-9.2" stroke="${hm.stripe}" stroke-width="1.6" fill="none"/>`;
    } else {
      s += `<path d="M11,-1.6C11.6,-9.4 5,-14.6 -2.6,-14.2C-9.4,-13.8 -12.8,-8.4 -12.2,-2.4C-12,0 -10.6,1 -9,0.6L-6,-1C-2,-2.6 4,-2.8 11,-1.6Z" fill="${c}"/>`;
      s += `<path d="M-8,-10.6L-5.6,-12.4M-3,-12.4L-0.4,-13.4M2.4,-12.8L4.8,-12.8" stroke="${dark}" stroke-width="1.6" stroke-linecap="round"/>`;
      s += `<path d="M9.2,-3.4L13.8,-3.6L12.2,-1.2Z" fill="${dark}"/>`;
      if (hm.stripe) s += `<path d="M-11.8,-3.4C-6,-3.6 2,-4.2 10.8,-2.6" stroke="${hm.stripe}" stroke-width="1.5" fill="none"/>`;
    }
    s += `<path d="M-3.2,-0.8Q-1.6,5.6 2.6,9.6" stroke="${dark}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`;
    return s;
  }

  /* ======================= Sklapanje lika (redosled slojeva) ======================= */
  function drawWeather(kind, phase) {
    // kiša / sneg iza lika; pomeraj po krugu je ceo period šare, pa nema skoka u petlji
    let s = '';
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    if (kind === 'kisa') {
      for (let i = 0; i < 46; i++) {
        const x = rnd() * 420, y0 = rnd() * 300;
        const y = (y0 + phase * 300) % 300;
        s += seg(v(x - (y / 300) * 18, y), v(x - (y / 300) * 18 - 2.6, y + 9), 1.3, '#7CC9EE', 'opacity="0.75"');
      }
    } else if (kind === 'noc') { // noćno nebo sa mesecom i zvezdama
      s += `<rect x="0" y="0" width="400" height="${GROUND_Y + 1}" rx="14" fill="#14204A"/>`;
      s += circ(v(330, 52), 16, '#FFF2C2') + circ(v(337, 47), 14, '#14204A');
      for (let i = 0; i < 26; i++) {
        const x = rnd() * 400, y = rnd() * (GROUND_Y - 120), tw = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 * 2 + i);
        s += circ(v(x, y), 0.8 + rnd() * 1.2, '#FFFFFF', `opacity="${r1(0.35 + 0.6 * tw)}"`);
      }
    } else if (kind === 'lisce') { // jesenje lišće pada i okreće se
      const cols = ['#E5862B', '#D9502A', '#E8B23A', '#B5532E'];
      for (let i = 0; i < 16; i++) {
        const x = rnd() * 400, y0 = rnd() * 100, c = cols[i % 4], r0 = rnd() * 360;
        for (let k = 0; k < 3; k++) {
          const y = (y0 + k * 100 + phase * 100) % 300;
          const xx = x + 10 * Math.sin(y / 25 + i);
          s += `<path d="M0,-5Q4,0 0,5Q-4,0 0,-5Z" fill="${c}" transform="translate(${r1(xx)},${r1(y)}) rotate(${r1(r0 + y * 2)})"/>`;
        }
      }
    } else if (kind === 'sneg') {
      for (let i = 0; i < 30; i++) {
        const x = rnd() * 400, y0 = rnd() * 100, r = 1.4 + rnd() * 1.6;
        for (let k = 0; k < 3; k++) {
          const y = (y0 + k * 100 + phase * 100) % 300;
          s += circ(v(x + 4 * Math.sin((y / 30) + i), y), r, '#C9DDF0', 'opacity="0.95"');
        }
      }
    }
    return `<g class="vreme">${s}</g>`;
  }

  /** Delovi vozača sa dalje strane (crtaju se pre bicikla). */
  function riderFar(p, rider, cfg) {
    return drawArm(p, p.arms[1], rider, true) + drawDrivetrain(p, cfg, 'far') + drawLeg(p, p.legs[1], rider, true);
  }

  /** Telo vozača sa bliže strane. */
  function riderBody(p, rider, cfg, phase, isMain) {
    const out = [];
    if (rider.rod) out.push(drawRod(p, rider.rod, phase));
    if (rider.guitar) out.push(drawGuitar(p, rider.guitar));
    if (rider.backpack) out.push(drawBackpack(p, rider));
    out.push(circ(p.hip, p.body.w.thigh * 0.55, rider.bottom.color));
    out.push(`<g class="trup">${drawTorso(p, rider)}${torsoDetails(p, rider)}</g>`);
    out.push(drawLeg(p, p.legs[0], rider, false));
    if (rider.bottom.type === 'skirt') out.push(drawSkirt(p, rider));
    if (rider.poncho) out.push(drawSkirt(p, { bottom: { color: rider.poncho } }));
    if (rider.top.apron) out.push(drawSkirt(p, { bottom: { color: rider.top.apron } }));
    if (rider.backpack) out.push(drawStrap(p, rider));
    if (rider.messenger) out.push(drawMessenger(p, rider));
    if (rider.guitar) { // kaiš futrole preko grudi
      const nb = v(p.u.y, -p.u.x), nf = v(-p.u.y, p.u.x);
      out.push(`<path d="M${P(add(p.shoulder, mul(nb, 4)))}Q${P(add(lerp(p.hip, p.shoulder, 0.6), mul(nf, p.body.w.torsoChest * 1.1)))} ${P(add(lerp(p.hip, p.shoulder, 0.15), mul(nf, p.body.w.torsoHip * 0.6)))}" stroke="${shade(rider.guitar.color || '#2B3552', 0.7)}" stroke-width="3" fill="none"/>`);
    }
    if (cfg.bike.childSeatFront && isMain) out.push(drawChildSeatFront(p, cfg.bike.childSeatFront, phase));
    out.push(drawArm(p, p.arms[0], rider, false));
    if (rider.phone) out.push(drawPhone(p, rider.phone));
    out.push(drawHead(p, rider, phase));
    return out.join('\n');
  }

  function renderCyclist(cfg, opts = {}) {
    const phase = opts.phase || 0;
    WIND = opts.wind || 1;
    const pose = solvePose(cfg, phase);
    const { g, bike } = pose;
    const rider = cfg.rider;
    const out = [];

    if (cfg.weather) out.push(drawWeather(cfg.weather, phase));
    out.push(`<ellipse cx="${r1((g.rear.x + g.front.x) / 2)}" cy="${GROUND_Y + 1.5}" rx="${r1((g.front.x - g.rear.x) / 2 + (bike.r + g.rFront) / 2 * 0.95)}" ry="4" fill="${COLORS.navy}" opacity="0.10"/>`);

    // 1) dalja strana: ruka, noga, pedala (saputnik na tandemu prvi)
    if (pose.stoker) out.push(riderFar(pose.stoker, cfg.stoker, cfg));
    out.push(riderFar(pose, rider, cfg));

    // 2) točkovi i blatobrani
    // wheelAngle je ugao pogonskog točka; kod visokog točka pogon je prednji (pedale na osovini)
    const drive = opts.wheelAngle || 0;
    const rearRot = bike.directDrive ? drive * (g.rFront / bike.r) : drive;
    const frontRot = bike.directDrive ? drive : drive * (bike.r / g.rFront);
    if (cfg.trailer) out.push(drawTrailer(pose, cfg.trailer, phase, rearRot));
    if (cfg.bike.trike) out.push(`<g opacity="0.55">${drawWheel(add(g.rear, v(9, -4)), bike, cfg, rearRot + 20)}</g>`);
    out.push(drawWheel(g.rear, bike, cfg, rearRot, null, 'rear'));
    out.push(drawWheel(g.front, bike, cfg, frontRot + 11, g.rFront, 'front'));
    if (cfg.bike.trikeFront) out.push(`<g opacity="0.55">${drawWheel(add(g.front, v(10, -4)), bike, cfg, frontRot + 30, g.rFront, 'front')}</g>`);
    if (cfg.bike.trainingWheels) {
      const tc = v(g.rear.x + 4, GROUND_Y - 9.8);
      out.push(seg(g.rear, tc, 2.4, '#8A93A6') + drawMiniWheel(tc, 8, rearRot * (bike.r / 8)));
    }
    if (cfg.bike.hubMotor) out.push(drawHubMotor(pose));
    if (cfg.bike.pegs) out.push(drawPegs(pose));
    if (cfg.bike.fenders) {
      const R = bike.r + bike.tire / 2 + 2.5;
      out.push(fender(g.rear, R, 168, 40, cfg.bike.fenders));
      out.push(fender(g.front, g.rFront + bike.tire / 2 + 2.5, 150, -8, cfg.bike.fenders));
    }

    // 3) bicikl
    if (cfg.bike.rack) out.push(drawRack(pose, cfg));
    if (cfg.bike.battery && cfg.bike.battery !== 'ram') out.push(drawBattery(pose));
    out.push(drawDrivetrain(pose, cfg, 'chain'));
    out.push(drawFrame(pose, cfg));
    if (cfg.bike.decal) out.push(drawDecal(pose, cfg));
    if (cfg.bike.bottle) out.push(drawBottle(pose));
    if (cfg.bike.light) out.push(drawLight(pose));
    if (cfg.bike.reflectors) { // narandžasti reflektori na žbicama (okreću se sa točkom)
      const rr = (c, R, rot) => `<g transform="rotate(${r1(rot)} ${P(c)})"><rect x="${r1(c.x - 2)}" y="${r1(c.y - R * 0.62)}" width="4" height="9" rx="1.5" fill="#FF9A2E"/></g>`;
      out.push(rr(g.rear, bike.r, opts.wheelAngle || 0) + rr(g.front, g.rFront, (opts.wheelAngle || 0) + 180));
    }
    out.push(drawBars(pose, cfg));
    if (g.gripS) { // ručke saputnika, pričvršćene za sedišnu šipku kapitena
      const a = lerp(g.seatClusterF, g.saddleF, 0.55);
      out.push(seg(a, g.gripS, 3.6, '#3A4560') + seg(g.gripS, add(g.gripS, v(-1, -5)), 6, COLORS.ink));
    }
    if (cfg.bike.bell) out.push(drawBell(pose));
    out.push(drawSaddle(pose, cfg));
    if (g.saddleF) out.push(drawSaddle(pose, cfg, g.seatClusterF, g.saddleF));
    if (pose.stoker) out.push(drawDrivetrain(pose.stoker, cfg, 'near'));
    out.push(drawDrivetrain(pose, cfg, 'near'));
    if (cfg.bike.display) out.push(drawDisplay(pose));
    if (cfg.bike.panniers) out.push(drawPanniers(pose, cfg.bike.panniers));
    if (cfg.bike.crate) out.push(drawCrate(pose, cfg.bike.crate));
    if (cfg.bike.bucket) out.push(drawBucket(pose, cfg.bike.bucket));
    if (cfg.bike.childSeat) out.push(drawChildSeat(pose, cfg.bike.childSeat, phase));
    if (cfg.bike.towel) out.push(drawTowel(pose, cfg.bike.towel));
    if (cfg.bike.battery === 'ram') out.push(drawBattery(pose, 'ram'));
    if (cfg.bike.kickstand) out.push(seg(add(g.bb, v(-6, 2)), v(g.bb.x - 22, GROUND_Y - 1), 2.6, '#5B6478'));
    if (cfg.bike.breadBasket) out.push(drawBreadBasket(pose));
    if (cfg.bike.bags) out.push(drawBikepacking(pose, cfg.bike.bags));
    if (cfg.bike.flag) out.push(drawFlag(add(g.saddle, v(-22, -14)), 112, cfg.bike.flag, phase));
    if (cfg.bike.streamers) out.push(drawStreamers(pose, cfg.bike.streamers, phase));
    if (g.box) out.push(drawCargoBox(pose, cfg, phase));

    // 4) vozači
    if (pose.stoker) out.push(riderBody(pose.stoker, cfg.stoker, cfg, phase));
    if (cfg.bike.basket) out.push(drawBasket(pose, cfg.bike.basket, phase));
    out.push(riderBody(pose, rider, cfg, phase, true));
    if (cfg.weather === 'noc') { // snop prednjeg svetla i zadnje crveno svetlo
      const L0 = add(lerp(g.headTop, g.headBottom, 0.55), v(11, 0));
      out.push(`<path d="M${P(L0)}L${r1(L0.x + 120)},${r1(GROUND_Y - 2)}L${r1(L0.x + 30)},${r1(GROUND_Y - 2)}Z" fill="#FFF2A8" opacity="0.28"/>`);
      const T0 = add(g.seatCluster, v(-8, 6));
      out.push(circ(T0, 7, '#FF3B30', 'opacity="0.25"') + circ(T0, 3, '#FF3B30'));
    }
    if (cfg.bike.cans) { // limenke za mladence vuku se iza
      const bob = (i) => 2.5 * Math.abs(Math.sin(phase * Math.PI * 4 + i * 1.7));
      [[-34, '#C9D1DC'], [-52, '#9AA3B2'], [-70, '#D3D9E2']].forEach(([dx, c], i) => {
        const cp = v(g.rear.x + dx, GROUND_Y - 6 - bob(i));
        out.push(`<path d="M${P(add(g.rear, v(-4, -2)))}Q${P(v(cp.x + 10, cp.y - 10))} ${P(add(cp, v(5, -2)))}" stroke="#8A93A6" stroke-width="0.8" fill="none"/>`
          + `<rect x="${r1(cp.x - 5)}" y="${r1(cp.y - 5)}" width="10" height="11" rx="1.5" fill="${c}" transform="rotate(${r1(-12 + i * 8)} ${P(cp)})"/>`);
      });
    }
    if (cfg.dog) out.push(drawRunningDog(pose, cfg.dog, phase));

    if (opts.skeleton) out.push(drawSkeleton(pose));

    const body = out.join('\n');
    if (opts.inner) return body;
    const title = cfg.name ? `<title>${cfg.name}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${opts.width || CANVAS.w}" height="${opts.height || CANVAS.h}">${title}\n${body}\n</svg>`;
  }

  /* ---------- Konstrukcioni prikaz (kostur + zglobovi) ---------- */
  function drawSkeleton(pose) {
    const { g, hip, shoulder, legs, arms, headC } = pose;
    const C = '#E8173A', B = '#0D86C8';
    let s = '<g class="kostur" font-family="Inter, DejaVu Sans, sans-serif" font-size="7">';
    const bone = (a, b) => seg(a, b, 1.6, C, 'opacity="0.95"');
    const joint = (p, label, dx = 4, dy = -4) => circ(p, 2.8, '#fff', `stroke="${C}" stroke-width="1.4"`) + (label ? `<text x="${r1(p.x + dx)}" y="${r1(p.y + dy)}" fill="${C}" font-weight="600">${label}</text>` : '');
    const bjoint = (p, label, dx = 4, dy = -4) => circ(p, 2.4, '#fff', `stroke="${B}" stroke-width="1.3"`) + (label ? `<text x="${r1(p.x + dx)}" y="${r1(p.y + dy)}" fill="${B}" font-weight="600">${label}</text>` : '');
    s += circ(g.bb, pose.bike.crank, 'none', `stroke="${B}" stroke-width="1" stroke-dasharray="2 2"`);
    s += bone(hip, legs[0].knee) + bone(legs[0].knee, legs[0].ankle) + bone(legs[0].ankle, legs[0].pedal);
    s += bone(hip, shoulder) + bone(shoulder, arms[0].elbow) + bone(arms[0].elbow, arms[0].hand);
    s += seg(shoulder, headC, 1.6, C, 'stroke-dasharray="3 2"');
    s += circ(headC, pose.body.headR, 'none', `stroke="${C}" stroke-width="1.2" stroke-dasharray="3 2"`);
    s += bjoint(g.rear, 'zadnja osovina', -20, 16) + bjoint(g.front, 'prednja osovina', -22, 16);
    s += bjoint(g.bb, 'srednja osovina', -26, 30) + bjoint(g.saddle, 'sic', 5, 11) + bjoint(g.grip, 'ručka', 6, -6);
    s += bjoint(g.headTop, '') + bjoint(g.headBottom, '') + bjoint(g.seatCluster, '');
    s += joint(hip, 'kuk', -22, -2) + joint(legs[0].knee, 'koleno', 6, -2) + joint(legs[0].ankle, 'skočni', -36, -3);
    s += joint(shoulder, 'rame', -24, -2) + joint(arms[0].elbow, 'lakat', -8, 14) + joint(headC, 'glava', 16, -10);
    s += joint(legs[0].pedal, 'pedala', 6, 12);
    s += '</g>';
    return s;
  }

  /**
   * Jedan kadar vožnje. t ide od 0 do 1 za jedan pun krug pedala.
   * Točak se okrene `wheelTurns` puta po krugu pedala (prenos), pa se
   * animacija zatvara bez skoka kada t pređe sa 1 na 0.
   */
  function renderFrame(cfg, t, opts = {}) {
    const wheelTurns = opts.wheelTurns || 1;
    const base = cfg.crankAngle == null ? -35 : cfg.crankAngle;
    return renderCyclist({ ...cfg, crankAngle: base - 360 * t },
      { ...opts, wheelAngle: 360 * wheelTurns * t, phase: t });
  }

  const api = { renderCyclist, renderFrame, solvePose, COLORS, SKIN, HAIR, BIKES, BODY, CANVAS, GROUND_Y };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NaSicuLikovi = api;
})(typeof window !== 'undefined' ? window : this);
