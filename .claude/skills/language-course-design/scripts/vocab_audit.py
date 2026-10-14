"""Vocabulary recycling audit for an MD course.

Usage:
    python3 vocab_audit.py <course_dir> [--json out.json]

Reads the per-unit word lists (Status column A/R/G), the optional known-words
file, the texts and the exercises; prints the summary and integrity checks;
with --json also writes every entry and every issue list (used by
make_report.py).
"""
import collections, json, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from course_lib import load_config, units, split_subs, entry_pattern

root = pathlib.Path(sys.argv[1])
out_json = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
cfg = load_config(root)
NEAR, FAR = cfg["near"], cfg["far"]

order, texts, tasks, entries = [], {}, {}, []
task_re = re.compile(rf"^##\s+{re.escape(cfg['task_header'])}\s+(\d+[A-D])\b", re.M)
for ud in units(root, cfg):
    for k, v in split_subs((ud / cfg["texts"]).read_text()).items():
        order.append(k); texts[k] = v
    tf = ud / cfg["tasks"]
    if tf.exists():
        tasks.update(split_subs(tf.read_text(), task_re))
    for k, v in split_subs((ud / cfg["words"]).read_text()).items():
        for head, tr, st in re.findall(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|(?:\s*([ARG])\s*\|)?", v, re.M):
            if set(head) <= set("-: ") or head.lower() in ("norsk", "english", "word", "ord"):
                continue
            entries.append({"sub": k, "head": head, "tr": tr, "status": st or "?"})

kf = root / cfg["known"]
if kf.exists():   # known words: tracked for recycling, never counted as new
    for head, tr, sub, st in re.findall(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+[A-D])\s*\|\s*([ARG])\s*\|", kf.read_text(), re.M):
        entries.append({"sub": sub, "head": head, "tr": tr, "status": st, "known": True})

idx = {k: i for i, k in enumerate(order)}
N = len(order)
rows = []
for e in entries:
    pat, norm = entry_pattern(e["head"], cfg)
    if pat is None or e["sub"] not in idx:
        continue
    i0 = idx[e["sub"]]
    lt = {k: n for k in order[i0 + 1:] if (n := len(pat.findall(texts[k])))}
    lk = {k: n for k in order[i0 + 1:] if k in tasks and (n := len(pat.findall(tasks[k])))}
    rows.append({**e, "norm": norm,
                 "own_text": len(pat.findall(texts[e["sub"]])),
                 "own_tasks": len(pat.findall(tasks.get(e["sub"], ""))),
                 "later_text": lt, "later_tasks": lk,
                 "earlier_text": [k for k in order[:i0] if pat.search(texts[k])]})

def check(e):
    i0 = idx[e["sub"]]; lt = e["later_text"]
    dist = sorted(idx[k] - i0 for k in lt)
    thirds = []
    for a, b in ((0, N // 3), (N // 3, 2 * N // 3), (2 * N // 3, N)):
        if b - 1 > i0 + FAR:
            thirds.append(any(a <= idx[k] < b and idx[k] > i0 + FAR for k in list(lt) + list(e["later_tasks"])))
    return {"rem": N - i0 - 1,
            "tot": e["own_text"] + e["own_tasks"] + sum(lt.values()) + sum(e["later_tasks"].values()),
            "own_task": e["own_tasks"] > 0,
            "near": bool(dist) and dist[0] <= NEAR,
            "far2": sum(1 for x in dist if x <= FAR) >= 2,
            "thirds": all(thirds) if thirds else None,
            "later_any": bool(lt or e["later_tasks"])}

new = [e for e in rows if not e.get("known")]
known = [e for e in rows if e.get("known")]
first, seen = [], set()
for e in new:
    if e["norm"] not in seen:
        seen.add(e["norm"]); first.append(e)

print("statuses (first listing):", dict(collections.Counter(e["status"] for e in first)))
A = [(e, check(e)) for e in first if e["status"] == "A"]
Ar = [(e, c) for e, c in A if c["rem"] >= FAR]
n = max(len(Ar), 1)
pct = lambda x: f"{x}/{len(Ar)} ({x * 100 // n}%)"
print(f"\nA-words with ≥{FAR} sub-lessons ahead: {len(Ar)} (of {len(A)})")
print(" in own sub-lesson tasks:          ", pct(sum(c["own_task"] for _, c in Ar)))
print(f" back in a text within {NEAR}:         ", pct(sum(c["near"] for _, c in Ar)))
print(f" twice in texts within {FAR}:          ", pct(sum(c["far2"] for _, c in Ar)))
print(" present in every later third:     ", pct(sum(1 for _, c in Ar if c["thirds"])))
print(" ≥6 encounters (texts+tasks):      ", pct(sum(c["tot"] >= 6 for _, c in Ar)))
print(" never seen again:                 ", pct(sum(not c["later_any"] for _, c in Ar)))
full = [e["head"] for e, c in Ar if c["own_task"] and c["near"] and c["far2"] and c["tot"] >= 6]
print(" meets the whole schedule:         ", pct(len(full)))

R = [(e, check(e)) for e in first if e["status"] == "R"]
R = [(e, c) for e, c in R if c["rem"] >= NEAR]
if R:
    ok = sum(1 for _, c in R if c["tot"] >= 3 and c["later_any"])
    print(f"\nR-words ≥3 encounters incl. a later one: {ok}/{len(R)} ({ok * 100 // len(R)}%)")
KA = [(e, check(e)) for e in known if e["status"] == "A"]
KA = [(e, c) for e, c in KA if c["rem"] >= FAR]
if KA:
    print(f"KNOWN A-words (≥{FAR} ahead): {len(KA)}; back ≤{NEAR}: {sum(c['near'] for _, c in KA)}; "
          f"≥6 encounters: {sum(c['tot'] >= 6 for _, c in KA)}; never again: {sum(not c['later_any'] for _, c in KA)}")

issues = {
    "relisted":   [(e["sub"], e["head"]) for e in new if e not in first],
    "used_early": [(e["sub"], e["head"], e["earlier_text"][0]) for e in first if e["earlier_text"]],
    "not_in_text": [(e["sub"], e["head"]) for e in new if e["own_text"] == 0],
    "A_no_task":  [(e["sub"], e["head"]) for e, c in A if not c["own_task"]],
    "A_never":    [(e["sub"], e["head"]) for e, c in Ar if not c["later_any"]],
}
print("\nINTEGRITY: " + ", ".join(f"{k} {len(v)}" for k, v in issues.items()))
dens = {k: (len(re.findall(r"\w+", texts[k])), sum(1 for e in first if e["sub"] == k)) for k in order}
print("text length / new words per sub-lesson:",
      " ".join(f"{k}:{w}/{c}" for k, (w, c) in dens.items()))
if out_json:
    json.dump({"order": order, "entries": rows, "issues": issues, "whole_schedule": full},
              open(out_json, "w"), ensure_ascii=False, indent=1)
