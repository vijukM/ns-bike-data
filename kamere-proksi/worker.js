/* Proksi za HLS prenose kamera (Cloudflare Worker).
 *
 * Zašto: server prenosa (srbija-nadlanu.ott.solutions) pušta samo svoje sajtove — proverava Referer i vraća 403
 * zahtevima sa nasicu.rs. Pregledač ne da JavaScript-u da lažira Referer, pa prenos provlačimo kroz ovaj proksi
 * koji server-side šalje dozvoljeni Referer i dodaje CORS. Primljeni m3u8 se prepiše tako da i segmenti (.ts/.m4s,
 * ključevi) idu kroz proksi.
 *
 * Granica: proksi radi SAMO za UPSTREAM host (nije otvoreni proksi). Ovo je privremeno, za demo iza admin lozinke;
 * za javni/produkcijski rad treba dozvola ili licenca vlasnika prenosa.
 *
 * Postavljanje: vidi README.md. Posle postavljanja, adresu Worker-a upiši u docs/data/kamere.json → "proksi".
 */

const UPSTREAM = "https://srbija-nadlanu.ott.solutions/";   // jedini dozvoljeni izvor
const REFERER = "https://kamere.24sedam.rs/";               // Referer koji server prenosa prihvata
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const cilj = new URL(req.url).searchParams.get("u");
    if (!cilj || !cilj.startsWith(UPSTREAM)) {
      return new Response(`Dozvoljen je samo ${UPSTREAM}`, { status: 400, headers: CORS });
    }

    let gore;
    try {
      gore = await fetch(cilj, {
        headers: {
          "Referer": REFERER,
          "Origin": REFERER.replace(/\/$/, ""),
          "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
          "Accept": "*/*",
        },
        cf: { cacheTtl: 0 },
      });
    } catch (e) {
      return new Response(`Greška ka serveru prenosa: ${e}`, { status: 502, headers: CORS });
    }

    const ct = gore.headers.get("content-type") || "";
    const baza = new URL(req.url);
    const prefiks = `${baza.origin}${baza.pathname}?u=`;

    // m3u8 plejlista: prepiši svaku adresu (relativnu i apsolutnu) da ide kroz proksi
    if (/mpegurl|m3u8/i.test(ct) || cilj.endsWith(".m3u8")) {
      const tekst = await gore.text();
      const nova = tekst.split("\n").map((red) => {
        const r = red.trim();
        if (!r || r.startsWith("#")) {
          // i #EXT-X-KEY:...URI="..." i #EXT-X-MAP:...URI="..." nose adrese
          return red.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${prefiks}${encodeURIComponent(new URL(u, cilj).href)}"`);
        }
        return prefiks + encodeURIComponent(new URL(r, cilj).href);
      }).join("\n");
      return new Response(nova, {
        status: gore.status,
        headers: { ...CORS, "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
      });
    }

    // segmenti/ključevi: propusti bajtove
    const h = new Headers(CORS);
    h.set("content-type", ct || "application/octet-stream");
    h.set("cache-control", "no-store");
    return new Response(gore.body, { status: gore.status, headers: h });
  },
};
