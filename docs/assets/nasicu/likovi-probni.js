/*
 * Probna kolekcija. Svaki lik je samo podatak; crta ga nasicu-likovi.js.
 *  - glavni:      4 lika za izbor
 *  - dostavljaci: isti dostavljač u 4 boje termo-ranca
 */
(function (root) {
  const L = (typeof module !== 'undefined' && module.exports) ? require('./nasicu-likovi.js') : root.NaSicuLikovi;
  const { COLORS: C, SKIN, HAIR } = L;

  const studentkinja = {
    id: 'studentkinja-mtb',
    name: 'Studentkinja na MTB-u',
    opis: 'Brdski bicikl sa amortizerom, ranac, slušalice i duks',
    crankAngle: -40,
    bike: {
      type: 'mtb', color: '#2B3552', forkColor: '#2B3552', decal: C.sun,
      suspension: true, knobby: true,
    },
    rider: {
      build: 'odrasli', lean: 54, headLift: 22, skin: SKIN[4],
      hair: { style: 'duga', color: HAIR.black },
      headphones: C.coral,
      top: { color: C.sun, sleeve: 'long', hood: true, strings: C.white },
      bottom: { type: 'long', color: '#3D5A8A' },
      shoes: C.white, sole: '#C9D1DC',
      backpack: { type: 'ranac', color: C.blue },
    },
  };

  const baka = {
    id: 'baka-gradski',
    name: 'Baka na gradskom',
    opis: 'Holandski bicikl sa korpom, zvoncem i blatobranima',
    crankAngle: -40,
    bike: {
      type: 'gradski', color: '#7CC9EE', fenders: '#E6EBF2', rack: true,
      basket: true, bell: true, chainguard: '#E6EBF2', light: true,
    },
    rider: {
      build: 'odrasli', lean: 82, headLift: 10, age: 'stariji', skin: SKIN[0],
      hair: { style: 'punda', color: HAIR.grey },
      glasses: 'naocare',
      top: { color: C.coral, sleeve: 'long', scarf: C.sun, zip: false },
      bottom: { type: 'skirt', color: '#2B3552' }, stockings: '#E8C9B2',
      shoes: '#5B3A27', sole: '#3A2518',
    },
  };

  const drumas = {
    id: 'drumas',
    name: 'Drumaš',
    opis: 'Drumski bicikl, dres, sportske naočare, aero položaj',
    crankAngle: -25,
    bike: { type: 'drumski', color: C.coral, decal: C.white, bottle: true, rim: '#2B3552' },
    rider: {
      build: 'odrasli', lean: 34, headLift: 32, skin: SKIN[3],
      hair: { style: 'kratka', color: HAIR.brown },
      helmet: { type: 'drumska', color: C.navy, stripe: C.coral },
      glasses: 'sportske',
      top: { color: C.blue, sleeve: 'short', stripe: C.navy, stripeAt: 0.5, sleeveStripe: C.navy, collar: C.navy },
      bottom: { type: 'shorts', color: C.navy },
      socks: C.white, shoes: C.navy, sole: C.white, gloves: C.ink,
    },
  };

  const dete = {
    id: 'dete',
    name: 'Mala biciklistkinja',
    opis: 'Dečji bicikl sa zaštitom lanca, kaciga i rep',
    crankAngle: -35,
    bike: { type: 'decji', color: C.blue, chainguard: C.sun, bell: true, fenders: C.sun },
    rider: {
      build: 'dete', lean: 64, headLift: 14, skin: SKIN[1],
      hair: { style: 'rep', color: HAIR.red, tie: C.blue },
      helmet: { type: 'obicna', color: C.sun, stripe: C.coral },
      top: { color: C.mint, sleeve: 'short' },
      bottom: { type: 'shorts', color: C.coral },
      socks: C.white, shoes: C.blue, sole: C.white,
    },
  };

  // Dostavljač: ista osnova, menja se samo boja termo-ranca.
  function dostavljac(id, ime, boja) {
    return {
      id: `dostavljac-${id}`,
      name: `Dostavljač · ${ime}`,
      opis: `Trekking bicikl, ${ime.toLowerCase()} termo-ranac, kaciga i refleksna traka`,
      crankAngle: -30,
      bike: { type: 'trekking', color: '#2B3552', forkColor: '#2B3552', decal: C.blue, fenders: '#3A4560', light: true },
      rider: {
        build: 'odrasli', lean: 50, skin: SKIN[2],
        hair: { style: 'kratka', color: HAIR.black }, beard: true,
        helmet: { type: 'obicna', color: C.blue, stripe: C.white },
        top: { color: '#24304F', sleeve: 'long', stripe: '#D7F25A', stripeAt: 0.42, zip: true },
        bottom: { type: 'long', color: '#4B5470' },
        shoes: C.coral, sole: C.white,
        backpack: { type: 'termo', color: boja, size: 1.45 },
      },
    };
  }
  const dostavljaci = [
    dostavljac('svetloplava', 'Svetloplavi', '#5CCBFF'),
    dostavljac('zuta', 'Žuti', '#FFC23D'),
    dostavljac('crvena', 'Crveni', '#E5402F'),
    dostavljac('siva', 'Sivi', '#9AA3B2'),
  ];

  // Dostavljačice: iste 4 torbe, četiri različite žene.
  function dostavljacica(id, ime, boja, izgled) {
    return {
      id: `dostavljacica-${id}`,
      name: `Dostavljačica · ${ime}`,
      opis: `Trekking bicikl, ${ime.toLowerCase()} termo-ranac, kaciga i refleksna traka`,
      crankAngle: -30,
      bike: { type: 'trekking', color: '#2B3552', forkColor: '#2B3552', decal: C.blue, fenders: '#3A4560', light: true },
      rider: {
        build: 'zena', lean: 52, lashes: true, skin: izgled.skin,
        hair: izgled.hair,
        helmet: { type: 'obicna', color: izgled.helmet || C.blue, stripe: C.white },
        top: { color: '#24304F', sleeve: 'long', stripe: '#D7F25A', stripeAt: 0.42, zip: true },
        bottom: { type: 'long', color: izgled.pants },
        shoes: izgled.shoes, sole: C.white,
        backpack: { type: 'termo', color: boja, size: 1.45 },
      },
    };
  }
  const dostavljacice = [
    dostavljacica('svetloplava', 'Svetloplavi', '#5CCBFF',
      { skin: SKIN[0], hair: { style: 'rep', color: HAIR.red, tie: C.coral }, pants: '#1E2742', shoes: C.coral }),
    dostavljacica('zuta', 'Žuti', '#FFC23D',
      { skin: SKIN[4], hair: { style: 'duga', color: HAIR.black }, pants: '#3D5A8A', shoes: C.white, helmet: C.coral }),
    dostavljacica('crvena', 'Crveni', '#E5402F',
      { skin: SKIN[2], hair: { style: 'nisko', color: HAIR.brown }, pants: '#4B5470', shoes: C.blue }),
    dostavljacica('siva', 'Sivi', '#9AA3B2',
      { skin: SKIN[1], hair: { style: 'rep', color: HAIR.blond, tie: C.blue }, pants: '#1E2742', shoes: C.sun, helmet: C.coral }),
  ];

  /* ---------- Nova četvorka 1 ---------- */
  const poslovni = {
    id: 'poslovni-sklopivi', name: 'Poslovni čovek',
    opis: 'Sklopivi bicikl, sako i kravata, kožna torba preko ramena',
    crankAngle: -35,
    bike: { type: 'sklopivi', color: C.coral, decal: C.white },
    rider: {
      build: 'odrasli', lean: 64, headLift: 14, skin: SKIN[1],
      hair: { style: 'kratka', color: HAIR.brown }, glasses: 'naocare',
      top: { color: '#2B3552', sleeve: 'long', blazer: true, tie: C.blue, shirt: C.white },
      bottom: { type: 'long', color: '#3A4560' },
      shoes: '#5B3A27', sole: '#3A2518',
      messenger: { color: '#8A5A33' },
    },
  };

  const mama = {
    id: 'mama-sediste', name: 'Mama sa detetom',
    opis: 'Trekking bicikl sa dečjim sedištem pozadi, oboje sa kacigama',
    crankAngle: -40,
    bike: {
      type: 'trekking', color: '#8E7CF0', forkColor: '#8E7CF0', fenders: '#E6EBF2', rack: true, light: true,
      childSeat: { color: C.coral, skin: SKIN[3], hair: HAIR.black, helmet: C.sun, top: C.blue, pants: C.navy, shoes: C.white },
    },
    rider: {
      build: 'zena', lean: 62, headLift: 14, lashes: true, skin: SKIN[3],
      hair: { style: 'duga', color: HAIR.black },
      helmet: { type: 'obicna', color: C.mint, stripe: C.white },
      top: { color: C.mint, sleeve: 'long', zip: true },
      bottom: { type: 'long', color: '#1E2742' },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  const deka = {
    id: 'deka-elektricni', name: 'Deka na električnom',
    opis: 'Električni gradski bicikl sa baterijom, displejom i motorom u točku',
    crankAngle: -40,
    bike: {
      type: 'elektricni', color: '#3D5A8A', fenders: '#E6EBF2', rack: true, battery: true,
      hubMotor: true, display: true, chainguard: '#E6EBF2', light: true, bell: true,
    },
    rider: {
      build: 'odrasli', lean: 80, headLift: 8, age: 'stariji', skin: SKIN[0],
      hair: { style: 'kratka', color: HAIR.grey }, mustache: HAIR.grey,
      headwear: { type: 'kapa', color: '#8A7A64' },
      top: { color: '#C9B79C', sleeve: 'long', zip: true, collar: '#A8957A' },
      bottom: { type: 'long', color: '#5B6478' },
      shoes: '#3A2518', sole: '#1E1410',
    },
  };

  const bmx = {
    id: 'bmx-klinac', name: 'BMX klinac',
    opis: 'BMX sa kočićima na osovinama, kačket naopako, nisko sedište',
    crankAngle: -30,
    bike: { type: 'bmx', color: '#8E7CF0', pegs: true, saddleDrop: 18, rim: '#2B3552' },
    rider: {
      build: 'odrasli', lean: 52, headLift: 20, skin: SKIN[5],
      hair: { style: 'kratka', color: HAIR.black },
      headwear: { type: 'kacket', color: C.coral, backwards: true },
      top: { color: C.sun, sleeve: 'short' },
      bottom: { type: 'shorts', color: '#2B3552' },
      socks: C.white, shoes: '#E5402F', sole: C.white,
    },
  };

  /* ---------- Nova četvorka 2 ---------- */
  const tata = {
    id: 'tata-teretni', name: 'Tata sa teretnim',
    opis: 'Teretni bicikl sa drvenim sandukom – a u sanduku pas',
    crankAngle: -35,
    bike: { type: 'teretni', color: C.blue, boxColor: '#C8945A', dog: '#D9A25E', fenders: '#E6EBF2', bell: true },
    rider: {
      build: 'odrasli', lean: 76, headLift: 10, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.brown }, beard: true,
      headwear: { type: 'kacket', color: C.navy },
      top: { color: '#B5532E', sleeve: 'long', stripe: '#8E3E22', stripeAt: 0.3, zip: true },
      bottom: { type: 'long', color: '#3D5A8A' },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  const turista = {
    id: 'turista-ev6', name: 'Turista na EuroVelo 6',
    opis: 'Trekking bicikl sa bisagama napred i pozadi, šešir i naočare',
    crankAngle: -30,
    bike: {
      type: 'trekking', color: '#3E9B6B', forkColor: '#3E9B6B', fenders: '#2B3552', rack: true,
      panniers: C.coral, bottle: true, light: true,
    },
    rider: {
      build: 'odrasli', lean: 50, skin: SKIN[0],
      hair: { style: 'kratka', color: HAIR.blond }, beard: true, glasses: 'sportske',
      headwear: { type: 'sesir', color: C.sand, band: '#8A7A5C' },
      top: { color: '#7CC9EE', sleeve: 'short', collar: '#5AAFD9' },
      bottom: { type: 'shorts', color: '#8A7A5C' },
      socks: C.white, shoes: '#5B6478', sole: C.white,
    },
  };

  const sportistkinja = {
    id: 'sportistkinja-drumska', name: 'Sportistkinja',
    opis: 'Drumski bicikl, dres, pletenica ispod kacige, aero položaj',
    crankAngle: -25,
    bike: { type: 'drumski', color: '#8E7CF0', decal: C.sun, bottle: true, rim: '#2B3552' },
    rider: {
      build: 'zena', lean: 34, headLift: 32, lashes: true, skin: SKIN[4],
      hair: { style: 'pletenica', color: HAIR.black, tie: C.sun },
      helmet: { type: 'drumska', color: C.coral, stripe: C.white },
      glasses: 'sportske',
      top: { color: C.sun, sleeve: 'short', stripe: C.navy, stripeAt: 0.5, sleeveStripe: C.navy, collar: C.navy },
      bottom: { type: 'shorts', color: C.navy },
      socks: C.white, shoes: C.navy, sole: C.white, gloves: C.ink,
    },
  };

  const pijaca = {
    id: 'zena-pijaca', name: 'Sa pijace',
    opis: 'Gradski bicikl sa gajbom povrća na prtljažniku, marama',
    crankAngle: -40,
    bike: {
      type: 'gradski', color: C.coral, fenders: '#E6EBF2', rack: true, chainguard: '#E6EBF2',
      bell: true, light: true, crate: { color: C.blue },
    },
    rider: {
      build: 'zena', lean: 80, headLift: 10, lashes: true, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.black },
      headwear: { type: 'marama', color: '#3E9B6B' },
      top: { color: C.sand, sleeve: 'long' },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: '#5B3A27', sole: '#3A2518',
    },
  };

  /* ---------- Nova četvorka 3 ---------- */
  const uzbrdo = {
    id: 'uzbrdo-stojeci', name: 'Uzbrdo, iz stajanja',
    opis: 'MTB, vozi stojeći na pedalama – penjanje na Frušku goru',
    crankAngle: -20,
    bike: { type: 'mtb', color: C.sun, forkColor: '#2B3552', decal: C.navy, suspension: true, knobby: true },
    rider: {
      build: 'odrasli', stand: true, lean: 40, headLift: 34, skin: SKIN[3],
      hair: { style: 'kratka', color: HAIR.black },
      helmet: { type: 'obicna', color: '#2B3552', stripe: C.sun }, glasses: 'sportske',
      top: { color: C.coral, sleeve: 'short', stripe: C.navy, stripeAt: 0.55, collar: C.navy },
      bottom: { type: 'shorts', color: '#3A4560' },
      socks: C.white, shoes: '#2B3552', sole: C.sun, gloves: C.ink,
    },
  };

  const poruka = {
    id: 'kuca-poruku', name: 'Kuca poruku',
    opis: 'Sklopivi bicikl, jedna ruka na kormanu, druga na telefonu',
    crankAngle: -40,
    bike: { type: 'sklopivi', color: C.blue, decal: C.white },
    rider: {
      build: 'zena', lean: 70, headLift: 2, headTilt: 20, lashes: true, skin: SKIN[0],
      hair: { style: 'rep', color: HAIR.brown, tie: C.sun },
      phone: C.ink,
      top: { color: '#3E9B6B', sleeve: 'long', zip: true },
      bottom: { type: 'long', color: '#1E2742' },
      shoes: C.white, sole: '#C9D1DC',
      backpack: { type: 'ranac', color: C.sun },
    },
  };

  const ebajsPas = {
    id: 'ebajs-pas', name: 'E-bajs i kuca u korpi',
    opis: 'Električni bicikl sa baterijom i displejom, psić u prednjoj korpi',
    crankAngle: -35,
    bike: {
      type: 'elektricni', color: C.mint, fenders: '#E6EBF2', rack: true, battery: true, hubMotor: true,
      display: true, chainguard: '#E6EBF2', basket: 'pas', light: true,
    },
    rider: {
      build: 'zena', lean: 76, headLift: 10, lashes: true, skin: SKIN[4],
      hair: { style: 'nisko', color: HAIR.black },
      helmet: { type: 'obicna', color: C.coral, stripe: C.white },
      top: { color: C.blue, sleeve: 'long', collar: C.navy },
      bottom: { type: 'long', color: '#3A4560' },
      shoes: '#5B3A27', sole: '#3A2518',
    },
  };

  const zima = {
    id: 'zimska-oprema', name: 'Zimska oprema',
    opis: 'Trekking bicikl; kapa sa pomponom, šal, prošivena jakna i rukavice',
    crankAngle: -30,
    bike: { type: 'trekking', color: '#2B3552', forkColor: '#2B3552', fenders: '#3A4560', rack: true, light: true, decal: C.coral },
    rider: {
      build: 'odrasli', lean: 60, headLift: 18, skin: SKIN[1],
      hair: { style: 'kratka', color: HAIR.red }, beard: true,
      headwear: { type: 'zimska', color: C.coral, pom: C.white },
      top: { color: C.blue, sleeve: 'long', quilted: true, scarf: C.sun, zip: true },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: '#5B3A27', sole: '#3A2518', gloves: C.navy,
    },
  };

  /* ---------- Nova četvorka 4 ---------- */
  const tandem = {
    id: 'tandem', name: 'Par na tandemu',
    opis: 'Tandem: dvoje vozača, pedale povezane lancem, okreću zajedno',
    crankAngle: -35,
    bike: { type: 'tandem', color: '#3E9B6B', forkColor: '#3E9B6B', fenders: '#E6EBF2', decal: C.sun },
    rider: {
      build: 'odrasli', lean: 52, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.black },
      helmet: { type: 'obicna', color: C.blue, stripe: C.white },
      top: { color: C.sun, sleeve: 'short' },
      bottom: { type: 'shorts', color: C.navy },
      socks: C.white, shoes: C.white, sole: '#C9D1DC',
    },
    stoker: {
      build: 'zena', lean: 56, lashes: true, skin: SKIN[0],
      hair: { style: 'rep', color: HAIR.blond, tie: C.coral },
      helmet: { type: 'obicna', color: C.coral, stripe: C.white },
      top: { color: C.blue, sleeve: 'short' },
      bottom: { type: 'shorts', color: C.navy },
      socks: C.white, shoes: C.coral, sole: C.white,
    },
  };

  const pecaros = {
    id: 'pecaros', name: 'Pecaroš na putu do Dunava',
    opis: 'Trekking bicikl, štap za pecanje na leđima, kantica na prtljažniku',
    crankAngle: -35,
    bike: { type: 'trekking', color: '#5B6478', forkColor: '#5B6478', fenders: '#3A4560', rack: true, bucket: '#9AA3B2' },
    rider: {
      build: 'odrasli', lean: 70, headLift: 12, age: 'stariji', skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.grey }, mustache: HAIR.grey,
      headwear: { type: 'sesir', color: '#7A8A55', band: '#5A6840' },
      top: { color: '#7A8A55', sleeve: 'long', quilted: true, zip: true },
      bottom: { type: 'long', color: '#8A7A5C' },
      shoes: '#3E5A3A', sole: '#26381F',
      rod: { color: '#2B3552' },
    },
  };

  const kisa = {
    id: 'u-kabanici', name: 'U kabanici',
    opis: 'Gradski bicikl sa blatobranima, žuta kabanica sa kapuljačom',
    crankAngle: -40,
    bike: { type: 'gradski', color: '#2B3552', fenders: '#E6EBF2', rack: true, chainguard: '#E6EBF2', light: true, bell: true },
    rider: {
      build: 'odrasli', lean: 74, headLift: 8, skin: SKIN[4],
      hair: { style: 'kratka', color: HAIR.black },
      headwear: { type: 'kapuljaca', color: C.sun },
      top: { color: C.sun, sleeve: 'long', zip: true },
      poncho: C.sun,
      bottom: { type: 'long', color: '#3D5A8A' },
      shoes: '#2B3552', sole: C.white,
    },
  };

  const pozdrav = {
    id: 'pozdravlja', name: 'Pozdravlja komšiju',
    opis: 'Trekking bicikl sa korpom namirnica, maše dok vozi',
    crankAngle: -35,
    bike: { type: 'trekking', color: C.coral, forkColor: C.coral, fenders: '#E6EBF2', basket: 'namirnice', bell: true },
    rider: {
      build: 'zena', wave: true, lean: 70, headLift: 12, lashes: true, skin: SKIN[5],
      hair: { style: 'duga', color: HAIR.black },
      glasses: 'naocare',
      top: { color: C.mint, sleeve: 'short' },
      bottom: { type: 'skirt', color: '#2B3552' }, stockings: SKIN[5],
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  /* ---------- Tura 5: klasici i neobični bicikli ---------- */
  const visokiTocak = {
    id: 'visoki-tocak', name: 'Gospodin na visokom točku',
    opis: 'Penny-farthing: pedale na osovini velikog točka, bez lanca',
    crankAngle: -40,
    bike: { type: 'visokiTocak', color: '#2B3552', rim: '#C9D1DC' },
    rider: {
      build: 'odrasli', lean: 80, headLift: 8, skin: SKIN[1],
      hair: { style: 'kratka', color: HAIR.brown }, mustache: '#5B3A27',
      headwear: { type: 'cilindar', color: '#1E2742', band: C.coral },
      top: { color: '#7A4A2A', sleeve: 'long', blazer: true, tie: C.coral, shirt: C.white },
      bottom: { type: 'shorts', color: '#8A7A5C' }, socks: '#E8D2AE',
      shoes: '#3A2518', sole: '#1E1410',
    },
  };

  const kruzer = {
    id: 'kruzer-strand', name: 'Kruzerom na Štrand',
    opis: 'Kruzer: balon gume sa belim bokovima, visok korman, peškir',
    crankAngle: -35,
    bike: {
      type: 'kruzer', color: '#5FCBB4', fenders: '#F2E8D5', whitewall: true, rack: true,
      towel: [C.coral, C.white], bell: true,
    },
    rider: {
      build: 'zena', lean: 84, headLift: 8, lashes: true, skin: SKIN[3],
      hair: { style: 'duga', color: HAIR.brown },
      headwear: { type: 'sesir', color: '#E8C77A', band: C.coral }, glasses: 'sportske',
      top: { color: C.blue, sleeve: 'short', dots: C.white },
      bottom: { type: 'shorts', color: C.coral },
      shoes: C.sun, sole: '#C99A2E',
    },
  };

  const pekar = {
    id: 'pekar-tricikl', name: 'Pekar na triciklu',
    opis: 'Tricikl sa dva zadnja točka i velikom korpom punom peciva',
    crankAngle: -35,
    bike: { type: 'tricikl', color: '#7CC9EE', trike: true, breadBasket: true, chainguard: '#E6EBF2', bell: true, fenders: '#E6EBF2' },
    rider: {
      build: 'odrasli', lean: 80, headLift: 10, skin: SKIN[0],
      hair: { style: 'kratka', color: HAIR.black }, mustache: HAIR.black,
      headwear: { type: 'kuvarska', color: C.white },
      top: { color: '#3D5A8A', sleeve: 'short', apron: '#F7F9FC' },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: '#3A2518', sole: '#1E1410',
    },
  };

  const pomocni = {
    id: 'pomocni-tockici', name: 'Prvi bicikl',
    opis: 'Mali bicikl sa pomoćnim točkićima i trakicama na ručkama',
    crankAngle: -35,
    bike: { type: 'mali', color: C.coral, trainingWheels: true, streamers: [C.sun, C.blue, C.mint], bell: true },
    rider: {
      build: 'malo', lean: 66, headLift: 10, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.blond },
      helmet: { type: 'obicna', color: C.sun, stripe: C.blue },
      top: { color: C.blue, sleeve: 'short' },
      bottom: { type: 'shorts', color: C.navy },
      socks: C.white, shoes: C.coral, sole: C.white,
    },
  };

  /* ---------- Tura 6: brzi, moderni i avanturistički ---------- */
  const hronometar = {
    id: 'hronometar', name: 'Hronometar',
    opis: 'Aero bicikl: pun disk pozadi, točak sa tri žbice, aero kaciga',
    crankAngle: -25,
    bike: { type: 'hronometar', color: '#2B3552', decal: C.coral, discRear: true, triSpoke: true, discStripe: C.coral },
    rider: {
      build: 'odrasli', lean: 10, minLean: 6, headLift: 26, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.black },
      helmet: { type: 'aero', color: C.coral, stripe: C.white },
      top: { color: C.coral, sleeve: 'short', stripe: C.navy, stripeAt: 0.55, sleeveStripe: C.navy },
      bottom: { type: 'shorts', color: C.coral },
      socks: C.white, shoes: C.white, sole: C.navy,
    },
  };

  const lezeci = {
    id: 'lezeci', name: 'Ležeći bicikl',
    opis: 'Vozi se zavaljen, pedale su napred; visoka zastavica da ga vide',
    crankAngle: -10,
    bike: { type: 'lezeci', color: C.sun, forkColor: C.sun, flag: C.coral },
    rider: {
      build: 'odrasli', lean: 116, headLift: 0, kneeUp: true, skin: SKIN[1],
      hair: { style: 'kratka', color: HAIR.grey }, beard: true,
      helmet: { type: 'obicna', color: C.blue, stripe: C.white }, glasses: 'sportske',
      top: { color: '#3E9B6B', sleeve: 'short' },
      bottom: { type: 'shorts', color: '#8A7A5C' },
      socks: C.white, shoes: '#5B6478', sole: C.white,
    },
  };

  const fatbike = {
    id: 'fatbike', name: 'Fatbajk avanturista',
    opis: 'Gume od 10 cm za pesak i blato, torbe za višednevnu turu',
    crankAngle: -30,
    bike: { type: 'fatbike', color: C.coral, forkColor: C.coral, knobby: true, bags: { color: '#3A4560', saddle: C.sun, bar: '#7A8A55' } },
    rider: {
      build: 'odrasli', lean: 56, headLift: 18, skin: SKIN[4],
      hair: { style: 'kratka', color: HAIR.black }, beard: true,
      helmet: { type: 'obicna', color: '#2B3552', stripe: C.sun },
      top: { color: '#7A8A55', sleeve: 'long', zip: true },
      bottom: { type: 'long', color: '#3A4560' },
      shoes: '#5B3A27', sole: '#3A2518', gloves: C.ink,
    },
  };

  const prikolica = {
    id: 'prikolica', name: 'Mama sa prikolicom',
    opis: 'Trekking bicikl vuče dečju prikolicu sa zastavicom',
    crankAngle: -35,
    offsetX: 56,
    trailer: { color: C.coral, flag: C.sun, kid: { skin: SKIN[3], hair: HAIR.black, helmet: C.mint } },
    bike: { type: 'trekking', color: C.blue, forkColor: C.blue, fenders: '#E6EBF2', light: true },
    rider: {
      build: 'zena', lean: 58, headLift: 16, lashes: true, skin: SKIN[3],
      hair: { style: 'rep', color: HAIR.black, tie: C.coral },
      helmet: { type: 'obicna', color: C.mint, stripe: C.white },
      top: { color: C.sun, sleeve: 'long', zip: true },
      bottom: { type: 'long', color: C.navy },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  /* ---------- Tura 7: grad na dva točka ---------- */
  const fiksi = {
    id: 'fiksi', name: 'Fiksi',
    opis: 'Jednobrzinac: šareni duboki obruči i korman „rogovi”',
    crankAngle: -30,
    bike: { type: 'fiksi', color: '#1E2742', forkColor: '#1E2742', deepRim: C.coral, barTape: C.coral, decal: C.mint },
    rider: {
      build: 'odrasli', lean: 44, headLift: 24, skin: SKIN[1],
      hair: { style: 'kratka', color: HAIR.blond }, beard: true,
      headphones: C.mint,
      top: { color: '#2B3552', sleeve: 'short' },
      bottom: { type: 'long', color: '#3D5A8A' },
      shoes: C.white, sole: '#C9D1DC',
      messenger: { color: C.sun },
    },
  };

  const javni = {
    id: 'javni-bicikl', name: 'Turistkinja na javnom biciklu',
    opis: 'Bicikl iz sistema deljenja: korpa sa brojem, zatvoren lanac',
    crankAngle: -35,
    bike: {
      type: 'javni', color: '#D7262E', fenders: '#D7262E', chainguard: '#D7262E', rim: '#C9D1DC',
      basket: { type: 'tablica', number: '042' }, light: true, bell: true,
    },
    rider: {
      build: 'zena', lean: 78, headLift: 10, lashes: true, skin: SKIN[0],
      hair: { style: 'duga', color: HAIR.red }, glasses: 'sportske',
      top: { color: C.mint, sleeve: 'short', camera: true },
      bottom: { type: 'skirt', color: '#3D5A8A' }, stockings: SKIN[0],
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  const retro = {
    id: 'retro-sklopivi', name: 'Retro sklopivi',
    opis: 'Stari sklopivi bicikl: mali točkovi, hromirani blatobrani i prtljažnik',
    crankAngle: -35,
    bike: { type: 'retroSklopivi', color: '#D9822B', fenders: '#D3D9E2', rack: true, chainguard: '#D3D9E2', bell: true, whitewall: true },
    rider: {
      build: 'zena', lean: 78, headLift: 10, lashes: true, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.black }, glasses: 'sportske',
      top: { color: '#F2E8D5', sleeve: 'short', stripes: '#2B3552' },
      bottom: { type: 'skirt', color: C.coral }, stockings: SKIN[2],
      shoes: '#2B3552', sole: '#1E2742',
    },
  };

  const dvojeDece = {
    id: 'tata-dvoje-dece', name: 'Tata sa dvoje dece',
    opis: 'Gradski bicikl sa dečjim sedištem napred i pozadi',
    crankAngle: -35,
    bike: {
      type: 'gradski', color: '#3E9B6B', fenders: '#E6EBF2', rack: true, chainguard: '#E6EBF2', bell: true,
      childSeat: { color: C.coral, skin: SKIN[3], hair: HAIR.brown, helmet: C.sun, top: C.blue, pants: C.navy, shoes: C.white },
      childSeatFront: { color: C.sun, skin: SKIN[3], hair: HAIR.brown, helmet: C.mint, top: C.coral, pants: C.navy, shoes: C.sun },
    },
    rider: {
      build: 'odrasli', lean: 84, headLift: 8, skin: SKIN[3],
      hair: { style: 'kratka', color: HAIR.brown }, glasses: 'naocare',
      helmet: { type: 'obicna', color: C.blue, stripe: C.white },
      top: { color: '#E5402F', sleeve: 'long' },
      bottom: { type: 'long', color: '#3D5A8A' },
      shoes: '#5B3A27', sole: '#3A2518',
    },
  };

  /* ---------- Tura 8: rad, sport i ljubimci ---------- */
  const gravel = {
    id: 'gravel-nasip', name: 'Gravel po nasipu',
    opis: 'Drumski korman i deblje gume za makadam, torba u ramu',
    crankAngle: -30,
    bike: { type: 'gravel', color: '#B5532E', forkColor: '#B5532E', knobby: true, bottle: true, bags: { color: '#2B3552' } },
    rider: {
      build: 'zena', lean: 40, headLift: 28, lashes: true, skin: SKIN[3],
      hair: { style: 'rep', color: HAIR.brown, tie: C.sun },
      helmet: { type: 'obicna', color: C.mint, stripe: C.white }, glasses: 'sportske',
      top: { color: '#2B3552', sleeve: 'short', stripe: C.sun, stripeAt: 0.5, sleeveStripe: C.sun },
      bottom: { type: 'shorts', color: '#2B3552' },
      socks: C.sun, shoes: C.white, sole: '#C9D1DC', gloves: C.ink,
    },
  };

  const paketi = {
    id: 'dostava-paketa', name: 'Dostava paketa',
    opis: 'Električni teretni tricikl: dva prednja točka i sanduk pun paketa',
    crankAngle: -35,
    bike: {
      type: 'eTricikl', color: '#2B3552', forkColor: '#2B3552', boxColor: C.sun, boxStripe: C.blue, parcels: true,
      trikeFront: true, battery: 'ram', hubMotor: true, fenders: '#E6EBF2', bell: true,
    },
    rider: {
      build: 'odrasli', lean: 76, headLift: 10, skin: SKIN[4],
      hair: { style: 'kratka', color: HAIR.black },
      headwear: { type: 'kacket', color: C.blue },
      top: { color: C.blue, sleeve: 'short', stripe: C.sun, stripeAt: 0.4 },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: '#2B3552', sole: C.white,
    },
  };

  const patrola = {
    id: 'patrola', name: 'Biciklistička patrola',
    opis: 'MTB sa bisagama i svetlom, reflektujući prsluk i radio-stanica',
    crankAngle: -30,
    bike: { type: 'mtb', color: '#2B3552', forkColor: '#2B3552', suspension: true, knobby: true, panniers: '#2B3552', light: true, rack: true },
    rider: {
      build: 'odrasli', lean: 54, headLift: 20, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.brown },
      helmet: { type: 'obicna', color: '#2B3552', stripe: '#D7F25A' }, glasses: 'sportske',
      top: { color: '#1E2742', sleeve: 'long', vest: '#D7F25A' },
      bottom: { type: 'long', color: '#1E2742' },
      shoes: '#1E2742', sole: '#0B1630', gloves: C.ink,
    },
  };

  const sPsom = {
    id: 'pas-na-povocu', name: 'Sa psom na povocu',
    opis: 'Pas trči pored bicikla – mlatara repom i ušima',
    crankAngle: -35,
    offsetX: -52,
    dog: { color: '#2B2B30', chest: '#F2F2EE', leash: C.coral, dx: 66 },
    bike: { type: 'trekking', color: C.coral, forkColor: C.coral, fenders: '#E6EBF2', light: true },
    rider: {
      build: 'zena', lean: 62, headLift: 14, lashes: true, skin: SKIN[5],
      hair: { style: 'pletenica', color: HAIR.black, tie: C.coral },
      helmet: { type: 'obicna', color: C.sun, stripe: C.white },
      top: { color: C.mint, sleeve: 'long', hood: true, strings: C.white },
      bottom: { type: 'long', color: '#1E2742' },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  /* ---------- Tura 9: zanati i ulica ---------- */
  const postar = {
    id: 'postar', name: 'Poštar',
    opis: 'Gradski bicikl, korpa puna pisama, torba preko ramena',
    crankAngle: -35,
    bike: { type: 'gradski', color: C.sun, fenders: '#2B3552', rack: true, chainguard: '#2B3552', basket: 'pisma', bell: true },
    rider: {
      build: 'odrasli', lean: 80, headLift: 8, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.grey }, mustache: HAIR.grey, age: 'stariji',
      headwear: { type: 'kacket', color: '#2B3552' },
      top: { color: C.blue, sleeve: 'short', collar: '#0D86C8' },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: '#1E2742', sole: '#0B1630',
      messenger: { color: '#8A5A33' },
    },
  };

  const cvecarka = {
    id: 'cvecarka', name: 'Cvećarka',
    opis: 'Teretni bicikl sa sandukom punim buketa',
    crankAngle: -35,
    bike: { type: 'teretni', color: '#3E9B6B', boxColor: '#F2E8D5', boxFlowers: true, fenders: '#E6EBF2', bell: true },
    rider: {
      build: 'zena', lean: 78, headLift: 10, lashes: true, skin: SKIN[1],
      hair: { style: 'punda', color: HAIR.red },
      top: { color: '#F27EB4', sleeve: 'short', apron: '#FFFFFF' },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  const sladoled = {
    id: 'sladoledzija', name: 'Sladoledžija',
    opis: 'Električni tricikl sa hladnjakom za sladoled i prugastim suncobranom',
    crankAngle: -35,
    bike: {
      type: 'eTricikl', color: '#2B3552', forkColor: '#2B3552', boxColor: '#FFFFFF', boxStripe: '#F27EB4', boxIcon: 'sladoled',
      umbrella: ['#F27EB4', '#FFF2C2'], trikeFront: true, battery: 'ram', hubMotor: true, bell: true,
    },
    rider: {
      build: 'odrasli', lean: 80, headLift: 8, skin: SKIN[3],
      hair: { style: 'kratka', color: HAIR.black }, mustache: HAIR.black,
      headwear: { type: 'kacket', color: '#F27EB4' },
      top: { color: '#F27EB4', sleeve: 'short', stripes: '#FFFFFF', apron: '#FFFFFF' },
      bottom: { type: 'long', color: '#2B3552' },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  const muzicar = {
    id: 'muzicar', name: 'Muzičar sa gitarom',
    opis: 'Jednobrzinac, gitara u futroli na leđima, vunena kapa',
    crankAngle: -30,
    bike: { type: 'fiksi', color: C.mint, forkColor: C.mint, deepRim: C.sun, barTape: C.ink },
    rider: {
      build: 'odrasli', lean: 52, headLift: 22, skin: SKIN[4],
      hair: { style: 'duga', color: HAIR.black }, beard: true,
      headwear: { type: 'zimska', color: '#2B3552', pom: false },
      top: { color: '#B5532E', sleeve: 'long' },
      bottom: { type: 'long', color: '#1E2742' },
      shoes: '#5B3A27', sole: '#3A2518',
      guitar: { color: '#1E2742', accent: C.sun },
    },
  };

  /* ---------- Tura 10: doba dana, godišnja doba i posebni trenuci ---------- */
  const nocna = {
    id: 'sa-reflektorima', name: 'Sa reflektorima',
    opis: 'Trekking bicikl sa reflektorima na točkovima i refleksnom trakom',
    crankAngle: -30,
    bike: { type: 'trekking', color: C.blue, forkColor: C.blue, fenders: '#E6EBF2', light: true, reflectors: true },
    rider: {
      build: 'odrasli', lean: 54, headLift: 18, skin: SKIN[1],
      hair: { style: 'kratka', color: HAIR.blond },
      helmet: { type: 'obicna', color: C.sun, stripe: C.white },
      top: { color: C.coral, sleeve: 'long', stripe: '#E6EBF2', stripeAt: 0.4, zip: true },
      bottom: { type: 'long', color: '#3D5A8A' },
      shoes: C.white, sole: '#C9D1DC',
    },
  };

  const jesen = {
    id: 'na-fakultet', name: 'Na fakultet',
    opis: 'Kaput i šal, knjige u korpi',
    crankAngle: -35,
    bike: { type: 'trekking', color: '#2B3552', forkColor: '#2B3552', fenders: '#E6EBF2', basket: 'knjige', bell: true },
    rider: {
      build: 'odrasli', lean: 66, headLift: 14, skin: SKIN[0],
      hair: { style: 'kratka', color: HAIR.red }, glasses: 'naocare',
      top: { color: '#8A5A33', sleeve: 'long', scarf: C.coral, zip: true },
      bottom: { type: 'long', color: '#3A4560' },
      shoes: '#3A2518', sole: '#1E1410',
    },
  };

  const guralica = {
    id: 'guralica', name: 'Guralica',
    opis: 'Bicikl bez pedala: dete se odguruje nogama od zemlje',
    crankAngle: -35,
    bike: { type: 'guralica', color: C.sun, saddleDrop: 26 },
    rider: {
      build: 'malo', balance: true, lean: 70, headLift: 10, skin: SKIN[4],
      hair: { style: 'rep', color: HAIR.black, tie: C.coral },
      helmet: { type: 'obicna', color: C.coral, stripe: C.white },
      top: { color: C.mint, sleeve: 'short' },
      bottom: { type: 'shorts', color: C.blue },
      socks: C.white, shoes: C.coral, sole: C.white,
    },
  };

  const mladenci = {
    id: 'mladenci', name: 'Mladenci na tandemu',
    opis: 'Veo i venčić, cilindar i leptir-mašna, limenke zveckaju iza',
    crankAngle: -35,
    offsetX: 22,
    bike: { type: 'tandem', color: '#F2A7C8', forkColor: '#F2A7C8', cans: true, decal: '#FFFFFF', rim: '#C9D1DC' },
    rider: {
      build: 'odrasli', lean: 54, skin: SKIN[2],
      hair: { style: 'kratka', color: HAIR.black },
      headwear: { type: 'cilindar', color: '#1E2742', band: '#F27EB4' },
      top: { color: '#1E2742', sleeve: 'long', blazer: true, tie: '#F27EB4', shirt: C.white },
      bottom: { type: 'long', color: '#1E2742' },
      shoes: '#0B1630', sole: '#000000',
    },
    stoker: {
      build: 'zena', lean: 60, lashes: true, skin: SKIN[1],
      hair: { style: 'punda', color: HAIR.brown },
      headwear: { type: 'veo', color: '#FFFFFF' },
      top: { color: '#F4EAD8', sleeve: 'short' },
      bottom: { type: 'skirt', color: '#F4EAD8' }, stockings: '#F4EAD8',
      shoes: '#F4EAD8', sole: '#D5DCE6',
    },
  };

  const KOLEKCIJA = {
    glavni: [studentkinja, baka, drumas, dete], dostavljaci, dostavljacice,
    novi1: [poslovni, mama, deka, bmx],
    novi2: [tata, turista, sportistkinja, pijaca],
    novi3: [uzbrdo, poruka, ebajsPas, zima],
    novi4: [tandem, pecaros, kisa, pozdrav],
    novi5: [visokiTocak, kruzer, pekar, pomocni],
    novi6: [hronometar, lezeci, fatbike, prikolica],
    novi7: [fiksi, javni, retro, dvojeDece],
    novi8: [gravel, paketi, patrola, sPsom],
    novi9: [postar, cvecarka, sladoled, muzicar],
    novi10: [nocna, jesen, guralica, mladenci],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KOLEKCIJA;
  else root.NaSicuProbniLikovi = KOLEKCIJA;
})(typeof window !== 'undefined' ? window : this);
