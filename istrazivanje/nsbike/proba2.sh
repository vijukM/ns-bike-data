D=istrazivanje/nsbike; mkdir -p $D/slike2
for U in https://parkingns.rs/bicikl/ns-bike/ https://nsbike.rs/ https://www.nsbike.rs/stanice/ https://nsbike.rs/lokacije/; do
  echo "=== $U"; curl -sSL -m 60 -A "Mozilla/5.0" -o $D/s.html "$U" -w "%{http_code} %{size_download}\n" || continue
  grep -oE '<img[^>]+>' $D/s.html | head -80
  grep -oE '(https?:)?//[^"'"'"' )]+\.(jpe?g|png|webp)' $D/s.html | sort -u | head -80 > $D/slike_url.txt
  cat $D/slike_url.txt
  python3 - "$U" <<'PY'
import sys,re,html,pathlib,urllib.parse,subprocess
u=sys.argv[1]; s=open('istrazivanje/nsbike/s.html',encoding='utf-8',errors='ignore').read()
t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=html.unescape(re.sub(r'<[^>]+>','\n',t))
lines=[l.strip() for l in t.split('\n') if l.strip()]
k=[i for i,l in enumerate(lines) if 'NSB' in l or 'тaниц' in l or 'станиц' in l.lower() or 'stanic' in l.lower()]
for l in lines[max(0,(k[0] if k else 0)-3):][:120]: print(l)
PY
  for i in $(cat $D/slike_url.txt | grep -viE 'logo|icon|favicon' | head -60); do
    case $i in //*) i="https:$i";; esac
    n=$(echo "$i" | sed 's#.*/##' | cut -c1-80); curl -sS -m 30 -o "$D/slike2/$n" "$i"
  done
done
ls -la $D/slike2 | head -80
