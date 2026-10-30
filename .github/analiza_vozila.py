"""Privremeno: analiza fajlova drumskog saobraćaja (ispis u log workflow-a)."""
import collections
import re
import sys
import xml.etree.ElementTree as ET

for put in sys.argv[1:]:
    data = open(put, "rb").read()
    print(f"\n===== {put}: {len(data)} B")
    print(data[:2500].decode("utf-8", "replace"))
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        print("NIJE XML:", e)
        continue
    ns = dict(re.findall(r'xmlns:?(\w*)="([^"]+)"', data[:3000].decode("utf-8", "replace")))
    print("namespaces:", ns)
    entries = [e for e in root.iter() if e.tag.endswith("entry") or e.tag.endswith("item")]
    print("entry/item:", len(entries))
    tagovi = collections.Counter()
    for e in entries:
        for x in e.iter():
            tagovi[re.sub(r"\{[^}]+\}", "", x.tag)] += 1
    print("tagovi u entry:", dict(tagovi))
    for e in entries[:3]:
        print("--- primer entry:")
        print(ET.tostring(e, encoding="unicode")[:2500])
    # vrednosti po tagu (raspon)
    vr = collections.defaultdict(list)
    for e in entries:
        for x in e.iter():
            t = re.sub(r"\{[^}]+\}", "", x.tag)
            if x.text and x.text.strip():
                vr[t].append(x.text.strip())
    for t, l in vr.items():
        print(f"{t}: {len(l)} vrednosti, jedinstvenih {len(set(l))}, primeri {sorted(set(l))[:6]}")
