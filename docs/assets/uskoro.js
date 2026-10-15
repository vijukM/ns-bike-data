/* Strane u izradi: zaglavlje, „uskoro se otvara“ i SKICA kako će strana izgledati (raspored, vrste grafika),
   pa spisak onoga što će na strani biti. Brojevi na skicama su ilustrativni (seme je fiksno, pa se skica ne menja).
   Strana zadaje samo <body data-strana="…"> i prazan <main class="sadrzaj">. */
"use strict";

(() => {
  // ---------------------------------------------------------------- pomoćno
  function seme(a) {                                     // mulberry32: ista skica pri svakom učitavanju
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const SATI = Array.from({ length: 24 }, (_, h) => NS.dvaMesta(h));
  const zvono = (h, c, s) => Math.exp(-((h - c) ** 2) / (2 * s * s));
  const radniDan = (h) => 8 + 95 * zvono(h, 7.6, 1.1) + 70 * zvono(h, 16.3, 1.7) + 40 * zvono(h, 12, 3);
  const vikendDan = (h) => 6 + 70 * zvono(h, 13, 3.4);
  const kpi = ([ikona, naslov, vrednost, dole, boja]) => `<div class="kpi c-${boja}"><div class="vrh"><span class="kvadrat">${LJ.ik(ikona)}</span>
    <span class="naslov">${naslov}</span></div><div class="vrednost">${vrednost}</div><div class="dole">${dole}</div></div>`;
  const tt = (b) => ({ ...NS.osnova(b).tooltip });
  const legenda = (b) => ({ top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: b["ink-2"], fontSize: 12 } });
  const PRIORITET = { 1: ["Sledeće na redu", "z-uskoro"], 2: ["U planu", "z-delimicno"], 3: ["Posle odluke o modelu", "z-neispravan"] };

  // ---------------------------------------------------------------- strane
  const STRANE = {
    danas: {
      ik: "activity", prioritet: 1, naslov: "Danas <em>uživo</em>",
      uvod: "Koliko je biciklista izbrojano od ponoći do poslednjeg čitanja — za ceo grad i za svaki brojač, uz poređenje sa prosečnim istim danom.",
      kpi: [["activity", "Danas do 13 h", "23.480", "izbrojano na <b>45</b> brojača", "plava"],
        ["chart", "Prema prosečnom četvrtku", "+8<sup>%</sup>", "isti dan u nedelji, isti mesec", "zelena"],
        ["pin", "Najprometnija stanica", "34a", "<b>1.560</b> biciklista do sada", "ljubicasta"],
        ["clock", "Poslednje čitanje", "13:02", "osvežava se svakog sata", "teal"]],
      skice: [
        { sirina: "cela", eyebrow: "Danas · sat po sat", naslov: "Danas prema prosečnom istom danu", opcija: (b, r) => {
          const pros = SATI.map((_, h) => Math.round(radniDan(h) * 48));
          const danas = pros.map((v, h) => (h <= 12 ? Math.round(v * (0.9 + r() * 0.3)) : null));
          return { ...NS.osnova(b), tooltip: tt(b), legend: legenda(b), grid: { left: 50, right: 12, top: 36, bottom: 28 },
            xAxis: { type: "category", data: SATI, ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b) },
            series: [{ name: "danas", type: "bar", data: danas, barWidth: "58%", itemStyle: { color: b.bicikl, borderRadius: [5, 5, 0, 0] } },
              { name: "prosečan četvrtak", type: "line", data: pros, symbol: "none", smooth: true, lineStyle: { color: b["ink-3"], type: "dashed", width: 2 }, itemStyle: { color: b["ink-3"] } }] };
        } },
        { sirina: "pola", eyebrow: "Brojači", naslov: "Najviše danas", opcija: (b, r) => {
          const st = ["34a", "51b", "41", "36a", "34b", "23a", "31b", "30a"];
          const v = st.map((_, i) => Math.round(1600 * Math.pow(0.84, i) * (0.92 + r() * 0.1)));
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 40, right: 20, top: 6, bottom: 20 },
            xAxis: { type: "value", ...NS.osaY(b) }, yAxis: { type: "category", inverse: true, data: st, ...NS.osaX(b) },
            series: [{ type: "bar", data: v, barWidth: 14, itemStyle: { color: b.bicikl, borderRadius: 7 } }] };
        } },
        { sirina: "pola", eyebrow: "Dan do sada", naslov: "Koliko je „uobičajenog dana“ prošlo", opcija: (b) => ({
          ...NS.osnova(b),
          series: [{ type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100, progress: { show: true, width: 16, roundCap: true, itemStyle: { color: b.bicikl } },
            axisLine: { roundCap: true, lineStyle: { width: 16, color: [[1, b.mreza]] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
            axisLabel: { show: false }, title: { offsetCenter: [0, "32%"], color: b["ink-2"], fontSize: 12 },
            detail: { offsetCenter: [0, "-4%"], valueAnimation: true, formatter: "{value} %", color: b.ink, fontSize: 30, fontWeight: 700, fontFamily: "Inter Tight, Inter, sans-serif" },
            data: [{ value: 54, name: "od prosečnog dnevnog zbira" }] }] }) },
      ],
      plan: [["Brojevi uživo", "zbir od ponoći na svakom brojaču, osvežava se posle svakog satnog čitanja"],
        ["Danas prema proseku", "sat po sat, poređenje sa prosečnim istim danom u nedelji u istom mesecu"],
        ["Lista brojača", "koliko je koji brojač izbrojao danas i da li neki kasni sa podacima"],
        ["Mapa danas", "pinovi sa današnjim brojem iznad svake stanice"]],
      izvor: "satno čitanje brojača (isto koje već puni „danas do X h“ na mapi) + istorija za prosek",
    },

    toplotna: {
      ik: "flame", prioritet: 2, naslov: "Toplotna mapa <em>grada</em>",
      uvod: "Gde se u Novom Sadu najviše vozi — kao toplotni sloj preko mape, sat po sat, za radni dan i za vikend.",
      skice: [
        { sirina: "cela", eyebrow: "Mapa · 07–08 h · radni dan", naslov: "Gde je „najtoplije“", visina: 420, opcija: (b, r, s) => {
          const t = s.serije.filter((x) => x.lat).map((x) => [x.lon_mapa || x.lon, x.lat_mapa || x.lat, (x.prosek_12m || 300) * (0.7 + r() * 0.6), x.serija]);
          return { ...NS.osnova(b), tooltip: { trigger: "item", formatter: (p) => `${p.value[3]} · ${NS.broj(p.value[2])}` },
            grid: { left: 10, right: 10, top: 10, bottom: 10 },
            xAxis: { type: "value", scale: true, show: false }, yAxis: { type: "value", scale: true, show: false },
            series: [{ type: "scatter", data: t, symbolSize: (v) => 16 + Math.sqrt(v[2]) * 1.6,
              itemStyle: { color: b.temp, opacity: 0.32, shadowBlur: 40, shadowColor: b.temp } },
            { type: "effectScatter", data: t.filter((x) => x[2] > 1300), symbolSize: 10, rippleEffect: { scale: 3.2, brushType: "stroke" }, itemStyle: { color: b.warning } },
            { type: "scatter", data: t, symbolSize: 5, itemStyle: { color: b.ink } }] };
        },
        dodatak: `<div class="skica-klizac"><span class="eyebrow">Sat</span><div class="traka"><i style="left:31%"></i></div><span class="mono">07–08 h</span>
          <span class="dugme malo primarno" aria-hidden="true">${"▶"} pusti dan</span></div>` },
      ],
      plan: [["Toplotni sloj", "intenzitet po brojaču, razliven duž ulica i staza"],
        ["Klizač sata", "kako se „toplota“ seli kroz dan — ujutru ka centru i Limanu, popodne ka naseljima"],
        ["Radni dan i vikend", "dva ritma jedan pored drugog"], ["Animacija", "▶ pusti ceo dan za 20 sekundi"]],
      izvor: "satni prosek po brojaču iz istorije, koordinate brojača",
    },

    staze: {
      ik: "route", prioritet: 2, naslov: "Biciklističke <em>staze</em>",
      uvod: "Mreža biciklističkih staza i traka u Novom Sadu: koliko ih ima, kakve su, gde su brojači i gde staze nedostaju.",
      kpi: [["route", "Ukupno", "~120<sup>km</sup>", "staze i trake (procena)", "zelena"], ["layers", "Segmenata", "899", "iz OpenStreetMap-a", "plava"],
        ["pin", "Brojača na stazi", "38<sup>/46</sup>", "do 15 m od staze", "ljubicasta"], ["alert", "Prekida", "24", "mesta gde se staza prekida", "narandzasta"]],
      skice: [
        { sirina: "pola", eyebrow: "Vrsta", naslov: "Kakve su staze", opcija: (b) => ({
          ...NS.osnova(b), tooltip: { trigger: "item", formatter: (p) => `${p.name}: ${p.value} km` }, legend: { ...legenda(b), top: "bottom" },
          series: [{ type: "pie", radius: ["48%", "74%"], center: ["50%", "44%"], itemStyle: { borderColor: b.povrsina, borderWidth: 3, borderRadius: 6 }, label: { show: false },
            data: [{ name: "odvojena staza", value: 64, itemStyle: { color: "#4ade80" } }, { name: "traka na kolovozu", value: 31, itemStyle: { color: "#facc15" } },
              { name: "zajednička sa pešacima", value: 25, itemStyle: { color: "#86b6ef" } }] }] }) },
        { sirina: "pola", eyebrow: "Delovi grada", naslov: "Kilometara staza po delu grada", opcija: (b) => {
          const d = [["Liman", 22], ["Novo naselje", 19], ["Centar", 15], ["Detelinara", 14], ["Grbavica", 11], ["Podbara", 8], ["Petrovaradin", 7]];
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 92, right: 20, top: 6, bottom: 20 },
            xAxis: { type: "value", ...NS.osaY(b) }, yAxis: { type: "category", inverse: true, data: d.map((x) => x[0]), ...NS.osaX(b) },
            series: [{ type: "bar", data: d.map((x) => x[1]), barWidth: 14, itemStyle: { color: "#4ade80", borderRadius: 7 } }] };
        } },
      ],
      plan: [["Mapa staza po vrsti", "odvojene staze, trake i zajedničke površine, sa dužinama"],
        ["Brojači na stazama", "na kojoj stazi stoji koji brojač i koliko biciklista ta staza nosi"],
        ["Prekidi i nedostajuće veze", "gde se staza prekida ili delovi grada nisu povezani"], ["Izvor", "OpenStreetMap (Overpass), osvežava se jednom mesečno"]],
      izvor: "OpenStreetMap — isti sloj staza koji je već na mapi",
    },

    poredjenje: {
      ik: "compare", prioritet: 1, naslov: "Poređenje <em>stanica</em>",
      uvod: "Izaberi dve do četiri stanice i uporedi ih na istim graficima: po danu, po satu, po mesecima — i koliko se kreću zajedno.",
      kontrole: `<div class="kontrole"><span class="cip" aria-pressed="true" style="--boja:var(--g-tip-1)"><i></i>34a · Futoška (kod Nikole Tesle)</span>
        <span class="cip" aria-pressed="true" style="--boja:var(--g-tip-2)"><i></i>23a · Bulevar cara Lazara</span><span class="cip">+ dodaj stanicu</span></div>`,
      skice: [
        { sirina: "cela", eyebrow: "Po mesecima", naslov: "Prosečan dan u mesecu, dve stanice", opcija: (b, r) => {
          const x = [], a = [], c = [];
          for (let g = 2021; g <= 2026; g++) for (let m = 1; m <= 12; m++) {
            if (g === 2026 && m > 8) break;
            const sez = 0.55 + 0.45 * Math.sin(((m - 3.5) / 12) * 2 * Math.PI);
            x.push(`${NS.MESECI_KRATKO[m - 1]} ${g}`); a.push(Math.round(2600 * sez * (0.9 + r() * 0.2))); c.push(Math.round(1500 * sez * sez * (0.85 + r() * 0.3)));
          }
          return { ...NS.osnova(b), tooltip: tt(b), legend: legenda(b), grid: { left: 50, right: 12, top: 36, bottom: 28 },
            xAxis: { type: "category", data: x, ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b) },
            series: [{ name: "34a", type: "line", data: a, smooth: true, symbol: "none", lineStyle: { width: 2.5, color: b["tip-1"] }, itemStyle: { color: b["tip-1"] }, areaStyle: { color: b["tip-1"], opacity: 0.08 } },
              { name: "23a", type: "line", data: c, smooth: true, symbol: "none", lineStyle: { width: 2.5, color: b["tip-2"] }, itemStyle: { color: b["tip-2"] }, areaStyle: { color: b["tip-2"], opacity: 0.08 } }] };
        } },
        { sirina: "pola", eyebrow: "Satni profil", naslov: "Udeo dana po satu", opcija: (b) => ({
          ...NS.osnova(b), tooltip: tt(b), legend: legenda(b), grid: { left: 40, right: 12, top: 36, bottom: 28 },
          xAxis: { type: "category", data: SATI, ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) },
          series: [{ name: "34a", type: "line", smooth: true, symbol: "none", data: SATI.map((_, h) => +(radniDan(h) / 14).toFixed(1)), lineStyle: { color: b["tip-1"], width: 2.5 }, itemStyle: { color: b["tip-1"] } },
            { name: "23a", type: "line", smooth: true, symbol: "none", data: SATI.map((_, h) => +((vikendDan(h) + radniDan(h) * 0.4) / 9.5).toFixed(1)), lineStyle: { color: b["tip-2"], width: 2.5 }, itemStyle: { color: b["tip-2"] } }] }) },
        { sirina: "pola", eyebrow: "Karakter", naslov: "Kakva je koja stanica", opcija: (b) => {
          const ind = ["jutarnji vrh", "popodnevni vrh", "subota", "nedelja", "leto", "zima"].map((name) => ({ name, max: 100 }));
          return { ...NS.osnova(b), tooltip: { trigger: "item" }, legend: { ...legenda(b), top: "bottom" },
            radar: { indicator: ind, radius: "64%", center: ["50%", "46%"], axisName: { color: b["ink-2"], fontSize: 11 }, splitLine: { lineStyle: { color: b.mreza } }, splitArea: { show: false }, axisLine: { lineStyle: { color: b.mreza } } },
            series: [{ type: "radar", data: [{ name: "34a", value: [88, 80, 52, 40, 70, 45], itemStyle: { color: b["tip-1"] }, areaStyle: { opacity: 0.18 } },
              { name: "23a", value: [45, 60, 85, 92, 95, 25], itemStyle: { color: b["tip-2"] }, areaStyle: { opacity: 0.18 } }] }] };
        } },
      ],
      plan: [["Izbor 2–4 stanice", "iz liste ili klikom na mapi"], ["Isti grafici jedan preko drugog", "po danu, prosečan dan po satu, meseci po godinama"],
        ["Karakter stanice", "da li je „posao“ (jutarnji vrh) ili „rekreacija“ (vikend, leto)"], ["Koliko se kreću zajedno", "sličnost (korelacija) dnevnih brojeva"],
        ["Link koji se deli", "poređenje se pamti u adresi strane"]],
      izvor: "dnevni i satni podaci iz istorije, isti kao na strani stanice",
    },

    rekordi: {
      ik: "trophy", prioritet: 1, naslov: "Rekordi i <em>zanimljivosti</em>",
      uvod: "Najprometniji dani, sati i stanice, najduži nizovi, najveći padovi — i kratke zanimljivosti iz pet godina brojanja.",
      kpi: [["trophy", "Najprometniji dan", "66.562", "5. 9. 2025. · 45 brojača", "narandzasta"], ["bike", "Ukupno izbrojano", "56,0<sup>mil.</sup>", "2021–2026", "plava"],
        ["pin", "Najprometnija stanica", "34a", "<b>2.833</b> dnevno", "ljubicasta"], ["rain", "Kišni radni dan", "−29,5<sup>%</sup>", "prema suvom", "teal"]],
      skice: [
        { sirina: "cela", eyebrow: "Top 10", naslov: "Najprometniji dani svih vremena", opcija: (b, r) => {
          const d = Array.from({ length: 10 }, (_, i) => [`${5 + i}. 9. 2025.`, Math.round(66500 * Math.pow(0.985, i) * (0.99 + r() * 0.01))]);
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 92, right: 20, top: 6, bottom: 20 },
            xAxis: { type: "value", ...NS.osaY(b) }, yAxis: { type: "category", inverse: true, data: d.map((x) => x[0]), ...NS.osaX(b) },
            series: [{ type: "bar", data: d.map((x, i) => ({ value: x[1], itemStyle: { color: i ? b.bicikl : b.warning } })), barWidth: 14, itemStyle: { borderRadius: 7 } }] };
        } },
      ],
      plan: [["Kartice rekorda", "najprometniji dan, sat, nedelja i mesec — za grad i za svaku stanicu"], ["Top 10 dana", "sa vremenom i danom u nedelji"],
        ["Nizovi", "najduži niz dana iznad proseka, najduži rad bez prekida"], ["Zanimljivosti", "kratke činjenice: najranija „jutarnja špica“, najkišniji dan…"]],
      izvor: "istorija brojanja 2021–2026",
    },

    vreme: {
      ik: "rain", prioritet: 2, naslov: "Vreme i <em>biciklisti</em>",
      uvod: "Koliko kiša, hladnoća, vrućina i sneg menjaju broj biciklista — po danu i po satu.",
      skice: [
        { sirina: "pola", eyebrow: "Temperatura × padavine", naslov: "Prema prosečnom danu", opcija: (b) => {
          const tx = ["< 0", "0–5", "5–10", "10–15", "15–20", "20–25", "25–30", "> 30"], py = ["suvo", "< 1 mm", "1–5 mm", "> 5 mm"];
          const d = [];
          tx.forEach((_, i) => py.forEach((__, j) => d.push([i, j, Math.round(-55 + i * 13 - j * 14 - (i === 7 ? 18 : 0))])));
          return { ...NS.osnova(b), tooltip: { trigger: "item", formatter: (p) => `${tx[p.value[0]]} °C · ${py[p.value[1]]}: ${p.value[2]} %` },
            grid: { left: 64, right: 12, top: 8, bottom: 60 },
            xAxis: { type: "category", data: tx, ...NS.osaX(b), name: "°C" }, yAxis: { type: "category", data: py, ...NS.osaX(b) },
            visualMap: { min: -80, max: 40, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 140, textStyle: { color: b["ink-3"] },
              inRange: { color: [b.temp, b.povrsina, b.bicikl] } },
            series: [{ type: "heatmap", data: d, itemStyle: { borderColor: b.povrsina, borderWidth: 2, borderRadius: 4 } }] };
        } },
        { sirina: "pola", eyebrow: "Kiša u satu", naslov: "Pad broja dok pada kiša", opcija: (b) => ({
          ...NS.osnova(b), tooltip: tt(b), grid: { left: 48, right: 12, top: 10, bottom: 28 },
          xAxis: { type: "category", data: ["sat pre", "kiša 1. sat", "2. sat", "3. sat", "sat posle", "2 h posle"], ...NS.osaX(b) },
          yAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) },
          series: [{ type: "bar", data: [-2, -38, -46, -44, -18, -6], barWidth: "50%", itemStyle: { color: b.kisa, borderRadius: [0, 0, 5, 5] } }] }) },
      ],
      plan: [["Temperatura × padavine", "toplotna tabela: koliko je biciklista u odnosu na prosečan dan"], ["Kiša u satu", "koliko broj padne dok pada kiša i koliko se brzo vrati"],
        ["Sneg, vetar, vrućina", "posebni slučajevi i pragovi"], ["Najbolje vreme za vožnju", "temperatura i doba dana sa najviše biciklista"]],
      izvor: "istorija brojanja + Open-Meteo (satno, lokalno vreme)",
    },

    praznici: {
      ik: "star", prioritet: 2, naslov: "Praznici i <em>događaji</em>",
      uvod: "Kako praznici, školski raspust i veliki događaji u gradu menjaju broj biciklista u odnosu na običan isti dan.",
      skice: [
        { sirina: "cela", eyebrow: "Državni praznici", naslov: "Prema običnom istom danu u nedelji", opcija: (b) => {
          const d = [["Nova godina", -62], ["Božić", -48], ["Sretenje", -35], ["Praznik rada", -22], ["Uskrs", -30], ["Dan primirja", -27]];
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 48, right: 12, top: 10, bottom: 28 },
            xAxis: { type: "category", data: d.map((x) => x[0]), ...NS.osaX(b) },
            yAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) },
            series: [{ type: "bar", data: d.map((x) => x[1]), barWidth: "46%", itemStyle: { color: b["tip-3"], borderRadius: [0, 0, 6, 6] } }] };
        } },
        { sirina: "pola", eyebrow: "Raspust", naslov: "Školska godina i raspust", opcija: (b) => ({
          ...NS.osnova(b), tooltip: tt(b), legend: legenda(b), grid: { left: 40, right: 12, top: 36, bottom: 28 },
          xAxis: { type: "category", data: SATI, ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b) },
          series: [{ name: "školska godina", type: "line", smooth: true, symbol: "none", data: SATI.map((_, h) => Math.round(radniDan(h) * 10)), lineStyle: { color: b.bicikl, width: 2.5 }, itemStyle: { color: b.bicikl } },
            { name: "raspust", type: "line", smooth: true, symbol: "none", data: SATI.map((_, h) => Math.round(radniDan(h) * 7 + vikendDan(h) * 3)), lineStyle: { color: b.temp, width: 2.5 }, itemStyle: { color: b.temp } }] }) },
        { sirina: "pola", eyebrow: "Događaji", naslov: "Nedelja velikog događaja", opcija: (b) => ({
          ...NS.osnova(b), tooltip: tt(b), grid: { left: 48, right: 12, top: 10, bottom: 28 },
          xAxis: { type: "category", data: ["pon", "uto", "sre", "čet", "pet", "sub", "ned"], ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b) },
          series: [{ type: "bar", data: [100, 104, 99, 118, 142, 151, 96], barWidth: "50%", itemStyle: { color: b["tip-2"], borderRadius: [5, 5, 0, 0] },
            markLine: { symbol: "none", data: [{ yAxis: 100 }], lineStyle: { color: b["ink-3"], type: "dashed" }, label: { formatter: "obična nedelja", color: b["ink-3"] } } }] }) },
      ],
      plan: [["Državni i verski praznici", "svaki praznik prema običnom istom danu"], ["Školski raspust", "kako se menja jutarnja špica leti i zimi"],
        ["Događaji u gradu", "festivali, maraton, zatvorene ulice — sa datumima koje dodajemo ručno"], ["Kalendar događaja", "spisak sa linkom na „dan na mapi“"]],
      izvor: "istorija brojanja + kalendar praznika i događaja",
    },

    ritam: {
      ik: "pulse", prioritet: 1, naslov: "Ritam <em>grada</em>",
      uvod: "Kad Novi Sad sedne na bicikl: sat × dan u nedelji za ceo grad, jutarnja i popodnevna špica, i kako se ritam menja kroz godišnja doba.",
      skice: [
        { sirina: "pola", eyebrow: "Sat × dan", naslov: "Nedelja jednog grada", visina: 300, opcija: (b) => {
          const d = [];
          for (let w = 0; w < 7; w++) for (let h = 0; h < 24; h++) d.push([h, w, Math.round(w < 5 ? radniDan(h) : vikendDan(h))]);
          return { ...NS.osnova(b), tooltip: { trigger: "item" }, grid: { left: 40, right: 8, top: 8, bottom: 26 },
            xAxis: { type: "category", data: SATI, ...NS.osaX(b) }, yAxis: { type: "category", data: NS.DANI_KRATKO, inverse: true, ...NS.osaX(b) },
            visualMap: { show: false, min: 0, max: 110, inRange: { color: [b["top-0"], b["top-2"], b["top-3"], b["top-5"]] } },
            series: [{ type: "heatmap", data: d, itemStyle: { borderColor: b.povrsina, borderWidth: 1.5, borderRadius: 3 } }] };
        } },
        { sirina: "pola", eyebrow: "24 sata", naslov: "Sat kao brojčanik", visina: 300, opcija: (b) => ({
          ...NS.osnova(b), tooltip: { trigger: "item" },
          angleAxis: { type: "category", data: SATI, axisLine: { lineStyle: { color: b.osa } }, axisLabel: { color: b["ink-3"], fontSize: 10 }, startAngle: 90 },
          radiusAxis: { show: false }, polar: { radius: ["12%", "78%"] },
          series: [{ type: "bar", coordinateSystem: "polar", data: SATI.map((_, h) => Math.round(radniDan(h))), itemStyle: { color: b.bicikl, borderRadius: 3 } }] }) },
      ],
      plan: [["Sat × dan u nedelji", "toplotna tabela za ceo grad"], ["Brojčanik", "24 sata u krugu — radni dan i vikend"],
        ["Kad grad „ustaje“", "sat kada promet pređe pola dnevnog vrha, po godišnjem dobu"], ["Špice", "kako se jutarnja i popodnevna špica pomeraju kroz godinu"]],
      izvor: "satni profili svih brojača iz istorije",
    },

    kvalitet: {
      ik: "shield", prioritet: 2, naslov: "Kvalitet <em>podataka</em>",
      uvod: "Koliko su podaci potpuni po brojaču i mesecu, zašto nedostaju i šta je očišćeno — da se vidi koliko se kojem broju može verovati.",
      kpi: [["shield", "Validnih sati", "94,1<sup>%</sup>", "svi brojači, ceo period", "zelena"], ["calendar", "Kompletnih dana", "88<sup>%</sup>", "svih 24 h validno", "plava"],
        ["alert", "Najduži prekid", "143<sup>dana</sup>", "jedan brojač, 2024.", "narandzasta"], ["table", "Očišćeno", "1,2<sup>%</sup>", "sati sa sumnjivom vrednošću", "ljubicasta"]],
      skice: [
        { sirina: "cela", eyebrow: "Brojač × mesec", naslov: "Udeo kompletnih dana", visina: 360, opcija: (b, r, s) => {
          const st = s.serije.slice(0, 18).map((x) => x.serija), m = [];
          for (let g = 2021; g <= 2026; g++) for (let k = 1; k <= 12; k++) if (!(g === 2026 && k > 8)) m.push(`${NS.MESECI_KRATKO[k - 1]} ${String(g).slice(2)}`);
          const d = [];
          st.forEach((_, i) => m.forEach((__, j) => { const x = r(); d.push([j, i, x > 0.93 ? Math.round(r() * 60) : x > 0.85 ? 70 + Math.round(r() * 25) : 100]); }));
          return { ...NS.osnova(b), tooltip: { trigger: "item", formatter: (p) => `${st[p.value[1]]} · ${m[p.value[0]]}: ${p.value[2]} %` },
            grid: { left: 40, right: 8, top: 6, bottom: 26 },
            xAxis: { type: "category", data: m, ...NS.osaX(b) }, yAxis: { type: "category", data: st, inverse: true, ...NS.osaX(b) },
            visualMap: { show: false, min: 0, max: 100, inRange: { color: [b.temp, b.warning, b.kisa] } },
            series: [{ type: "heatmap", data: d, itemStyle: { borderColor: b.povrsina, borderWidth: 1 } }] };
        } },
        { sirina: "pola", eyebrow: "Razlozi", naslov: "Zašto podatak nedostaje", opcija: (b, r, s) => {
          const boje = [b.bicikl, b.temp, b.kisa, b["tip-3"], b.warning, b["tip-2"], b["ink-3"]];
          const raz = (s.razlozi || []).filter((x) => x.kod !== "ok").slice(0, 6);
          return { ...NS.osnova(b), tooltip: { trigger: "item" }, legend: { ...legenda(b), top: "bottom", type: "scroll" },
            series: [{ type: "pie", radius: ["46%", "72%"], center: ["50%", "42%"], label: { show: false }, itemStyle: { borderColor: b.povrsina, borderWidth: 3, borderRadius: 6 },
              data: raz.map((x, i) => ({ name: x.opis, value: Math.round(10 + r() * 60), itemStyle: { color: boje[i % boje.length] } })) }] };
        } },
        { sirina: "pola", eyebrow: "Godine", naslov: "Kompletnih dana po godini", opcija: (b) => ({
          ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 40, right: 12, top: 10, bottom: 28 },
          xAxis: { type: "category", data: ["2021", "2022", "2023", "2024", "2025", "2026"], ...NS.osaX(b) },
          yAxis: { type: "value", max: 100, ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) },
          series: [{ type: "bar", data: [93, 95, 90, 86, 82, 88], barWidth: "46%", itemStyle: { color: b.kisa, borderRadius: [6, 6, 0, 0] } }] }) },
      ],
      plan: [["Brojač × mesec", "toplotna tabela kompletnosti za svih 46 serija"], ["Razlozi", "koliko sati nedostaje iz kog razloga (šifre iz čišćenja)"],
        ["Prekidi", "najduži prekidi rada, sa datumima"], ["Šta je očišćeno", "sumnjive vrednosti i kako su tretirane"]],
      izvor: "šifre nedostajućih podataka iz čišćenja (master rad)",
    },

    prognoza: {
      ik: "cloud", prioritet: 3, eyebrow: "Prognoza · model E28", naslov: "Prognoza za <em>sutra</em>",
      uvod: "Svako jutro: satna prognoza broja biciklista za svaku stanicu, sa intervalom u kome se stvarna vrednost nalazi u 80 % slučajeva.",
      kpi: [["clock", "Horizont", "24<sup>h</sup>", "sutra, sat po sat", "plava"], ["chart", "Interval", "10–90<sup>%</sup>", "kvantili modela", "ljubicasta"],
        ["table", "Serija", "45", "bez neispravnog brojača 28", "zelena"], ["rain", "Ulaz", "Open<sup>-Meteo</sup>", "vremenska prognoza", "teal"]],
      skice: [
        { sirina: "cela", eyebrow: "Sutra · 34a", naslov: "Prognoza sa intervalom 10–90 %", opcija: (b) => {
          const sr = SATI.map((_, h) => Math.round(radniDan(h) * 1.6));
          const dole = sr.map((v) => Math.round(v * 0.75)), raspon = sr.map((v) => Math.round(v * 0.5));
          return { ...NS.osnova(b), tooltip: tt(b), legend: legenda(b), grid: { left: 50, right: 12, top: 36, bottom: 28 },
            xAxis: { type: "category", data: SATI, boundaryGap: false, ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b) },
            series: [{ name: "dole", type: "line", data: dole, stack: "i", symbol: "none", lineStyle: { opacity: 0 }, tooltip: { show: false } },
              { name: "interval 10–90 %", type: "line", data: raspon, stack: "i", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: b.bicikl, opacity: 0.18 }, itemStyle: { color: b["bicikl-blago"] } },
              { name: "prognoza (medijana)", type: "line", data: sr, smooth: true, symbol: "none", lineStyle: { width: 2.5, color: b.bicikl }, itemStyle: { color: b.bicikl } }] };
        } },
        { sirina: "pola", eyebrow: "Stanice", naslov: "Najviše sutra", opcija: (b, r) => {
          const st = ["34a", "51b", "41", "36a", "34b", "23a", "31b"];
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 40, right: 20, top: 6, bottom: 20 },
            xAxis: { type: "value", ...NS.osaY(b) }, yAxis: { type: "category", inverse: true, data: st, ...NS.osaX(b) },
            series: [{ type: "bar", data: st.map((_, i) => Math.round(2800 * Math.pow(0.86, i) * (0.95 + r() * 0.08))), barWidth: 14, itemStyle: { color: b.bicikl, borderRadius: 7 } }] };
        } },
        { sirina: "pola", eyebrow: "Vreme sutra", naslov: "Temperatura i padavine", opcija: (b) => ({
          ...NS.osnova(b), tooltip: tt(b), grid: { left: 40, right: 40, top: 10, bottom: 28 },
          xAxis: { type: "category", data: SATI, ...NS.osaX(b) },
          yAxis: [{ type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value}°" } }) }, { type: "value", ...NS.osaY(b, { splitLine: { show: false }, axisLabel: { color: b["ink-3"], formatter: "{value} mm" } }) }],
          series: [{ type: "line", smooth: true, symbol: "none", data: SATI.map((_, h) => +(12 + 7 * zvono(h, 15, 4)).toFixed(1)), lineStyle: { color: b.temp, width: 2.5 }, itemStyle: { color: b.temp } },
            { type: "bar", yAxisIndex: 1, data: SATI.map((_, h) => (h >= 17 && h <= 19 ? +(0.4 + (h - 17) * 0.6).toFixed(1) : 0)), itemStyle: { color: b.kisa, borderRadius: [3, 3, 0, 0] } }] }) },
      ],
      plan: [["Mapa sa prognozom", "pin svake stanice nosi očekivani broj za sutra"], ["Prognoza i interval", "satni grafik za svaku stanicu, na istim graficima kao istorija"],
        ["Vreme sutra", "temperatura i padavine koje model koristi"], ["Ocena posle", "sutradan: prognoza prema stvarno izbrojanom"]],
      izvor: "model E28 (kvantilni) + Open-Meteo prognoza",
    },

    tacnost: {
      ik: "target", prioritet: 3, naslov: "Tačnost <em>prognoze</em>",
      uvod: "Koliko je prognoza bila tačna: prognoza prema stvarno izbrojanom, greška po stanici i po satu, i da li interval 10–90 % zaista pokriva 80 % slučajeva.",
      kpi: [["target", "Prosečna greška", "±14<sup>%</sup>", "dnevni zbir, poslednjih 30 dana", "plava"], ["check", "Pokrivenost intervala", "78<sup>%</sup>", "cilj 80 %", "zelena"],
        ["trophy", "Najtačnija stanica", "51b", "±7 %", "ljubicasta"], ["alert", "Najveći promašaj", "−41<sup>%</sup>", "iznenadna kiša", "narandzasta"]],
      skice: [
        { sirina: "cela", eyebrow: "Poslednje 2 nedelje", naslov: "Prognoza prema stvarnom (grad, dnevno)", opcija: (b, r) => {
          const x = Array.from({ length: 14 }, (_, i) => `${i + 1}. 10.`), st = x.map((_, i) => Math.round((i % 7 > 4 ? 26000 : 41000) * (0.85 + r() * 0.3)));
          const pr = st.map((v) => Math.round(v * (0.88 + r() * 0.24)));
          return { ...NS.osnova(b), tooltip: tt(b), legend: legenda(b), grid: { left: 54, right: 12, top: 36, bottom: 28 },
            xAxis: { type: "category", data: x, ...NS.osaX(b) }, yAxis: { type: "value", ...NS.osaY(b) },
            series: [{ name: "stvarno", type: "bar", data: st, barWidth: "48%", itemStyle: { color: b.bicikl, borderRadius: [5, 5, 0, 0] } },
              { name: "prognoza", type: "line", data: pr, symbol: "circle", symbolSize: 7, lineStyle: { color: b.temp, width: 2.5 }, itemStyle: { color: b.temp } }] };
        } },
        { sirina: "pola", eyebrow: "Po stanici", naslov: "Prosečna greška", opcija: (b, r) => {
          const st = ["51b", "34a", "41", "23a", "36a", "30a", "15a", "47"];
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 40, right: 20, top: 6, bottom: 20 },
            xAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) }, yAxis: { type: "category", inverse: true, data: st, ...NS.osaX(b) },
            series: [{ type: "bar", data: st.map((_, i) => 7 + i * 2 + Math.round(r() * 2)), barWidth: 14, itemStyle: { color: b["tip-3"], borderRadius: 7 } }] };
        } },
        { sirina: "pola", eyebrow: "Interval", naslov: "Koliko puta je stvarno bilo u intervalu", opcija: (b) => ({
          ...NS.osnova(b),
          series: [{ type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100, progress: { show: true, width: 16, roundCap: true, itemStyle: { color: b.kisa } },
            axisLine: { roundCap: true, lineStyle: { width: 16, color: [[1, b.mreza]] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
            title: { offsetCenter: [0, "32%"], color: b["ink-2"], fontSize: 12 },
            detail: { offsetCenter: [0, "-4%"], formatter: "{value} %", color: b.ink, fontSize: 30, fontWeight: 700, fontFamily: "Inter Tight, Inter, sans-serif" },
            data: [{ value: 78, name: "cilj: 80 %" }] }] }) },
      ],
      plan: [["Prognoza prema stvarnom", "za grad i za svaku stanicu, dan po dan"], ["Greška po stanici i po satu", "gde i kada model najviše greši"],
        ["Pokrivenost intervala", "da li 10–90 % zaista hvata 80 % stvarnih vrednosti"], ["Najveći promašaji", "sa objašnjenjem (kiša, praznik, kvar brojača)"]],
      izvor: "sačuvane prognoze + kasnije izbrojano",
    },

    model: {
      ik: "cpu", prioritet: 3, naslov: "Model — <em>kako radi</em>",
      uvod: "Jednostavno objašnjenje kako model iz master rada pravi prognozu: šta ulazi, šta izlazi i na šta najviše pazi.",
      skice: [
        { sirina: "cela", eyebrow: "Tok", naslov: "Od podataka do prognoze", html: () => `<div class="tok">
          <div class="tok-kolona"><div class="tok-kutija">${LJ.ik("bike")}<b>Istorija brojanja</b><small>satno, 46 serija, 2021–2026</small></div>
            <div class="tok-kutija">${LJ.ik("rain")}<b>Vreme</b><small>temperatura, padavine (Open-Meteo)</small></div>
            <div class="tok-kutija">${LJ.ik("calendar")}<b>Kalendar</b><small>dan u nedelji, praznici, raspust</small></div></div>
          <span class="tok-strelica">${LJ.ik("arrow")}</span>
          <div class="tok-kutija istaknuta">${LJ.ik("layers")}<b>Priprema</b><small>lokalno vreme, rupe ostaju rupe, skaliranje po stanici</small></div>
          <span class="tok-strelica">${LJ.ik("arrow")}</span>
          <div class="tok-kutija istaknuta">${LJ.ik("cpu")}<b>Model E28</b><small>uči obrasce svih stanica zajedno</small></div>
          <span class="tok-strelica">${LJ.ik("arrow")}</span>
          <div class="tok-kutija">${LJ.ik("chart")}<b>Prognoza</b><small>24 sata unapred, kvantili 10 / 50 / 90 %</small></div></div>` },
        { sirina: "pola", eyebrow: "Ulazi", naslov: "Na šta model najviše pazi", opcija: (b) => {
          const d = [["sat u danu", 31], ["isti sat prošle nedelje", 22], ["dan u nedelji", 15], ["temperatura", 12], ["padavine", 10], ["praznik", 6], ["mesec", 4]];
          return { ...NS.osnova(b), tooltip: { ...tt(b), axisPointer: { type: "shadow" } }, grid: { left: 150, right: 20, top: 6, bottom: 20 },
            xAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) }, yAxis: { type: "category", inverse: true, data: d.map((x) => x[0]), ...NS.osaX(b) },
            series: [{ type: "bar", data: d.map((x) => x[1]), barWidth: 14, itemStyle: { color: b["tip-3"], borderRadius: 7 } }] };
        } },
        { sirina: "pola", eyebrow: "Horizont", naslov: "Greška po satu unapred", opcija: (b) => ({
          ...NS.osnova(b), tooltip: tt(b), grid: { left: 40, right: 12, top: 10, bottom: 28 },
          xAxis: { type: "category", data: SATI.map((_, h) => `+${h + 1}`), ...NS.osaX(b) },
          yAxis: { type: "value", ...NS.osaY(b, { axisLabel: { color: b["ink-3"], formatter: "{value} %" } }) },
          series: [{ type: "line", smooth: true, symbol: "none", data: SATI.map((_, h) => +(9 + 6 * Math.log1p(h)).toFixed(1)), lineStyle: { color: b["tip-3"], width: 2.5 }, itemStyle: { color: b["tip-3"] }, areaStyle: { color: b["tip-3"], opacity: 0.12 } }] }) },
      ],
      plan: [["Tok podataka", "od brojača i vremena do prognoze, bez formula"], ["Šta model „vidi“", "ulazi i koliko je koji važan"],
        ["Kvantili", "zašto prognoza ima interval, a ne jedan broj"], ["Poređenje modela", "jednostavni modeli prema izabranom (iz master rada)"]],
      izvor: "master rad — posle konačne odluke o modelu",
    },

    preuzimanje: {
      ik: "download", prioritet: 2, naslov: "Preuzimanje <em>podataka</em>",
      uvod: "Očišćeni podaci sa sajta za preuzimanje — za ceo period ili izabrane stanice i mesece, u CSV ili JSON obliku, uz opis kolona.",
      skice: [
        { sirina: "cela", eyebrow: "Paketi", naslov: "Šta se može preuzeti", html: () => `<div class="tabela-omot"><table class="tabela">
          <thead><tr><th>Skup</th><th>Opis</th><th>Format</th><th class="broj">Veličina</th><th></th></tr></thead><tbody>
          ${[["Stanice", "spisak 46 serija: naziv, smer, koordinate, stanje", "CSV · JSON", "20 kB"],
    ["Grad po danu", "zbir i broj brojača, vreme, praznici", "CSV · JSON", "90 kB"],
    ["Stanica po danu", "dnevni zbir za svaku stanicu (46 fajlova)", "CSV · JSON", "770 kB"],
    ["Satni podaci", "svaki sat svakog brojača, po mesecima, sa razlogom za rupu", "CSV · JSON", "5,7 MB"],
    ["Vreme po satu", "temperatura, padavine, sneg (lokalno vreme)", "CSV · JSON", "820 kB"],
    ["Biciklističke staze", "OpenStreetMap segmenti", "GeoJSON", "—"]].map(([a, o, f, v]) =>
    `<tr><td><b>${a}</b></td><td class="muted">${o}</td><td><span class="znacka">${f}</span></td><td class="broj mono">${v}</td>
            <td><span class="dugme malo" aria-disabled="true">${LJ.ik("lock")}Preuzmi</span></td></tr>`).join("")}</tbody></table></div>` },
      ],
      plan: [["Gotovi paketi", "CSV i JSON za ceo period"], ["Izbor stanica i perioda", "samo ono što ti treba, u jednom fajlu"],
        ["Opis kolona", "šta znači svaka kolona i šifra nedostajućeg podatka"], ["Kako citirati", "kako navesti izvor u radu ili članku"]],
      izvor: "isti fajlovi koje koristi sajt (data/istorija)",
    },

    recnik: {
      ik: "book", prioritet: 2, naslov: "Rečnik <em>pojmova</em>",
      uvod: "Kratka objašnjenja pojmova koji se koriste na sajtu — od „serije brojača“ do „kvantila“.",
      skice: [
        { sirina: "cela", eyebrow: "A–Ž", naslov: "Pojmovi", html: () => `<div class="recnik-slova">${"ABCČĆDĐEFGHIJKLMNOPRSŠTUVZŽ".split("").map((x, i) =>
          `<span class="${"BKPSI".includes(x) ? "ima" : ""}">${x}</span>`).join("")}</div>
          <div class="recnik-mreza">${[["Brojač i serija", "Jedno mesto (npr. 34) može imati dva brojača — po jedan za svaki smer (34a, 34b). Svaki brojač je jedna serija."],
    ["Kompletan dan", "Dan u kome su svih 24 (ili 23/25 pri promeni vremena) sata validni. Samo takvi dani ulaze u dnevne zbirove."],
    ["Stanje brojača", "Radi, delimično radi, ne radi ili neispravan — po broju kompletnih dana u poslednjih 30 dana istorije."],
    ["Interval 10–90 %", "Raspon u kome se, po modelu, stvarni broj nalazi u 80 % slučajeva."]].map(([t, o]) =>
    `<div class="recnik-pojam"><b>${t}</b><p class="muted">${o}</p></div>`).join("")}</div>` },
      ],
      plan: [["Pojmovi po abecedi", "sa pretragom"], ["Primeri", "uz svaki pojam mali primer sa sajta"], ["Linkovi", "info ikonice na sajtu vode na pojam u rečniku"]],
      izvor: "—",
    },
  };

  // ---------------------------------------------------------------- crtanje
  async function postavi() {
    const id = document.body.dataset.strana;
    const c = STRANE[id];
    const main = document.getElementById("sadrzaj");
    if (!c || !main) return;
    const grupa = (document.body.dataset.putanja || "").split("|")[0];
    const s = await NS.stanice().catch(() => ({ serije: [], razlozi: [] }));
    const [pTekst, pKlasa] = PRIORITET[c.prioritet] || PRIORITET[2];

    main.innerHTML = `
      <header class="zaglavlje-strane pojava">
        <div><span class="eyebrow">${c.eyebrow || grupa} · u izradi</span><h1>${c.naslov}</h1><p class="uvod">${c.uvod}</p></div>
        <div class="akcije"><span class="znacka z-uskoro uskoro-znacka">USKORO</span></div>
      </header>
      <section class="kartica pojava"><div class="uskoro">
        <span class="ikona-velika">${LJ.ik(c.ik)}</span>
        <div><h2 style="font-size:16px">Strana se uskoro otvara</h2>
          <p class="muted">Ispod je <b>skica</b> kako će izgledati. Brojevi na skici su ilustrativni — služe da se vidi raspored i vrsta grafika, ne pravi podaci.</p></div>
        <span class="znacka tacka ${pKlasa}" style="margin-left:auto">${pTekst}</span></div></section>
      <div class="skica pojava"><span class="skica-oznaka">${LJ.ik("eye")}Skica · ilustrativni podaci</span>
        ${c.kpi ? `<div class="kpi-mreza">${c.kpi.map(kpi).join("")}</div>` : ""}
        <div class="skica-mreza">${c.skice.map((k, i) => `<section class="kartica ${k.sirina === "cela" ? "cela" : ""}">
          <div class="kartica-glava"><div><span class="eyebrow">${k.eyebrow}</span><h2>${k.naslov}</h2></div>${i === 0 && c.kontrole ? c.kontrole : ""}</div>
          ${k.html ? k.html() : `<div class="grafik" id="skica-${i}" style="height:${k.visina || (k.sirina === "cela" ? 320 : 280)}px"></div>`}
          ${k.dodatak || ""}</section>`).join("")}</div>
      </div>
      <section class="kartica pojava">
        <div class="kartica-glava"><div><span class="eyebrow">Plan</span><h2>Šta će biti na strani</h2></div></div>
        <ol class="plan">${c.plan.map(([t, o]) => `<li><b>${t}</b><span class="muted">${o}</span></li>`).join("")}</ol>
        ${c.izvor && c.izvor !== "—" ? `<p class="sitno" style="margin-top:14px">Podaci: ${c.izvor}.</p>` : ""}
      </section>`;
    c.skice.forEach((k, i) => {
      if (k.html) return;
      NS.grafik(document.getElementById(`skica-${i}`), (b) => k.opcija(b, seme(17 + i * 31), s));
    });
    LJ.pojave(main);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", postavi); else postavi();
})();
