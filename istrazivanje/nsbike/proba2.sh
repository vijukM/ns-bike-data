D=istrazivanje/nsbike; mkdir -p $D/slike3
curl -sSL -m 60 -A "Mozilla/5.0" -o $D/nsbike.html https://nsbike.rs/
echo "=== linkovi oko stanica"
python3 - <<'PY'
import re
s=open('istrazivanje/nsbike/nsbike.html',encoding='utf-8',errors='ignore').read()
i=s.find('ШТРАНД'); print(s[max(0,i-3000):i+6000])
PY
echo "=== css"
grep -oE 'https://nsbike.rs/[^"'"'"' ]+\.css[^"'"'"' ]*' $D/nsbike.html | sort -u > $D/css.txt; cat $D/css.txt
for c in $(cat $D/css.txt); do curl -sSL -m 30 "$c" ; done | grep -oE 'https?://[^)"'"'"' ]+\.(jpe?g|png|webp)' | sort -u > $D/css_slike.txt
grep -oE 'https?://nsbike.rs/wp-content/uploads/[^"'"'"' )]+' $D/nsbike.html | sort -u >> $D/css_slike.txt
sort -u $D/css_slike.txt; 
for i in $(sort -u $D/css_slike.txt | grep -viE 'logo|flag|150x150|-[0-9]+x[0-9]+\.' | head -40); do n=$(echo "$i" | sed 's#.*/##'); curl -sS -m 30 -o "$D/slike3/$n" "$i"; done
ls -la $D/slike3
