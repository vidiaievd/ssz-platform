"""Grammar rhythm audit: counts marker hits of each grammar topic per text.

Reads the grammar spine (course.json "spine", default grammatikk_ryggrad.md;
one '### Gn — title' section per topic with 'Введена: <unit>' and
'Маркеры: `<regex>`') and the unit texts.

Usage: python3 grammar_audit.py <course_dir> [--hits Gn]
  --hits Gn   print every matched snippet for topic Gn (to eyeball false hits)
"""
import re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from course_lib import load_config, units as unit_dirs

root = pathlib.Path(sys.argv[1])
cfg = load_config(root)
show = sys.argv[sys.argv.index("--hits") + 1] if "--hits" in sys.argv else None
SUB_RE = re.compile(r"^##\s+(\d+)([A-D])\b", re.M)

topics = []
spine = (root / cfg["spine"]).read_text()
for sec in re.split(r"^### ", spine, flags=re.M)[1:]:
    gid, title = re.match(r"(G\d+)\s+—\s+(.+)", sec).groups()
    unit = int(re.search(r"Введена:\s*(\d+)", sec).group(1))
    m = re.search(r"Маркеры:\s*`(.+)`", sec)
    topics.append({"id": gid, "title": title.strip(), "unit": unit,
                   # a literal space in a marker matches any whitespace (texts wrap lines)
                   "rx": re.compile(m.group(1).replace(" ", r"\s+"), re.I) if m else None})

texts = {}  # unit -> {sub: text}
for ld in unit_dirs(root, cfg):
    t = (ld / cfg["texts"]).read_text()
    marks = list(SUB_RE.finditer(t))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(t)
        texts.setdefault(int(m.group(1)), {})[m.group(1) + m.group(2)] = t[m.start():end]
units = sorted(texts)

def hits(rx, s):
    return len(rx.findall(s))

if show:
    tp = next(t for t in topics if t["id"] == show)
    for u in units:
        for k, s in texts[u].items():
            for m in tp["rx"].finditer(s):
                print(f"{k:4} …{s[max(0, m.start()-40):m.end()+25].replace(chr(10), ' ')}…")
    sys.exit()

print("Hits per unit (texts only). [*] = unit where the topic is introduced.\n")
print("topic  " + " ".join(f"{u:>4}" for u in units))
for tp in topics:
    if not tp["rx"]:
        print(f"{tp['id']:5}  (no markers — manual check)")
        continue
    row = []
    for u in units:
        n = sum(hits(tp["rx"], s) for s in texts[u].values())
        row.append(f"{n:>3}{'*' if u == tp['unit'] else ' '}")
    print(f"{tp['id']:5}  " + " ".join(row))

print("\nChecks against the rhythm norm:")
for tp in topics:
    if not tp["rx"]:
        continue
    u0 = tp["unit"]; probs = []
    own = {k: hits(tp["rx"], s) for k, s in texts[u0].items()}
    with_hit = sum(1 for n in own.values() if n)
    if with_hit < 3 or sum(own.values()) < 6:
        probs.append(f"ввод слабый: {sum(own.values())} употр., в {with_hit}/4 текстах "
                     f"({', '.join(f'{k}:{n}' for k, n in own.items())})")
    for u in (u0 + 1, u0 + 2):
        if u in texts:
            n = sum(hits(tp["rx"], s) for s in texts[u].values())
            if n < 2:
                probs.append(f"закрепление: юнит {u} — {n}")
    gaps = [u for u in units if u > u0 + 2 and not any(hits(tp["rx"], s) for s in texts[u].values())]
    if gaps:
        probs.append(f"поддержка: нет в юнитах {', '.join(map(str, gaps))}")
    print(f"- {tp['id']} {tp['title']}: " + ("OK" if not probs else "; ".join(probs)))
