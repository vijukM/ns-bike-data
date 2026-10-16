set -x
D=istrazivanje; mkdir -p $D/ugzins $D/mymaps
curl -sS -m 60 -o $D/ugzins/listing.html http://stari.ugzins.rs/SAUS/; grep -oE '[0-9]+/[0-9]+/[0-9]+ +[0-9:]+ [AP]M +[0-9<>a-z]+ <A HREF="[^"]+"' $D/ugzins/listing.html | head -30
curl -sS -m 60 -D $D/ugzins/staticno.zaglavlja -o $D/ugzins/staticno.xml http://stari.ugzins.rs/SAUS/bicycles_georss_gps_sr.xml; cat $D/ugzins/staticno.zaglavlja; ls -la $D/ugzins/staticno.xml; head -c 1500 $D/ugzins/staticno.xml; echo
python -m scraper.preuzimanje --metod brza --izlaz $D/ugzins/sesija.xml; ls -la $D/ugzins/sesija.xml
python - <<'PY'
from scraper.parsiranje import parsiraj
import pathlib
a=pathlib.Path('istrazivanje/ugzins/staticno.xml').read_bytes(); b=pathlib.Path('istrazivanje/ugzins/sesija.xml').read_bytes()
ta,ua=parsiraj(a); tb,ub=parsiraj(b)
print("staticno:", ta, len(ua), " sesija:", tb, len(ub))
print("isti bajtovi:", a==b)
ka={(u.get('serija') or u.get('location_id'), str(u.get('vreme') or u.get('datum'))):u for u in ua}
kb={(u.get('serija') or u.get('location_id'), str(u.get('vreme') or u.get('datum'))):u for u in ub}
print("ključevi:", list(ua[0].keys()) if ua else None)
print("primer staticno:", ua[:2]); print("primer sesija:", ub[:2])
raz=[k for k in ka if k in kb and ka[k]!=kb[k]]
print("zajedničkih", len(set(ka)&set(kb)), "različitih vrednosti", len(raz), "samo staticno", len(set(ka)-set(kb)), "samo sesija", len(set(kb)-set(ka)))
PY
for k in 1 2 3; do sleep 100; curl -sS -m 60 -D - -o /dev/null http://stari.ugzins.rs/SAUS/bicycles_georss_gps_sr.xml | grep -i "last-modified\|content-length"; done
echo "=== mymaps"
curl -sSL -m 60 -A "Mozilla/5.0" -o $D/mymaps/mapa.kml "https://www.google.com/maps/d/kml?mid=1z5ScvGMDEaXjNNq8U4Jcg3FIKW0&forcekml=1"; ls -la $D/mymaps/mapa.kml; head -c 3000 $D/mymaps/mapa.kml; echo
grep -oE 'https://mymaps.usercontent.google.com/hostedimage/[^<"]+' $D/mymaps/mapa.kml | head -3 > $D/mymaps/u.txt; cat $D/mymaps/u.txt
U=$(head -1 $D/mymaps/u.txt | sed 's/&amp;/\&/g'); [ -n "$U" ] && curl -sS -m 60 -D - -o $D/mymaps/proba_slika "$U" | head -20 && file $D/mymaps/proba_slika && ls -la $D/mymaps/proba_slika
