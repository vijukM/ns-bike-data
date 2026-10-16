set -x
D=istrazivanje/nsbike
curl -sS -m 60 -o $D/main.js https://ns-bike.web.app/main.d11fd7bb198ab397.js
ls -la $D/main.js
grep -oE '"[^"]{0,80}\.(jpe?g|png|webp)"' $D/main.js | sort -u | head -80
grep -oE 'assets/[A-Za-z0-9_./-]+' $D/main.js | sort -u | head -80
grep -oE 'https?://[A-Za-z0-9_./?=&-]+' $D/main.js | sort -u | head -60
grep -oE '.{120}(slika|image|img|foto|photo).{120}' $D/main.js | head -20
echo "=== CORS ==="
curl -sS -m 30 -D - -o $D/stanje.json -H "Origin: https://vijukm.github.io" https://app.nsbike.rs/stanje | head -30
curl -sS -m 30 -X OPTIONS -D - -o /dev/null -H "Origin: https://vijukm.github.io" -H "Access-Control-Request-Method: GET" https://app.nsbike.rs/stanje | head -20
head -c 600 $D/stanje.json
