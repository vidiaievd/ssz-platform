"""Find word-list entries that already exist in lower-level courses
(candidates for the known-words file).

Usage:
    python3 base_overlap.py <course_dir> <base> [<base> ...]

Each <base> is either a seed vocab JSON ({"<lesson>": {"words": [{"word": ...,
"translation": ...}]}}) or another MD course directory (its word lists are read
with that course's own course.json). Output: tab-separated
sub-lesson, status, headword, translation, where-in-base, base translation —
compare the two translations: a NEW MEANING stays a new word.
"""
import json, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from course_lib import load_config, units, split_subs, entry_pattern

def md_words(root):
    cfg = load_config(root); out = []
    for ud in units(root, cfg):
        for k, v in split_subs((ud / cfg["words"]).read_text()).items():
            for head, tr in re.findall(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", v, re.M):
                if not set(head) <= set("-: "):
                    out.append((head, tr, f"{root.name}:{k}"))
    return out, cfg

root = pathlib.Path(sys.argv[1])
course, cfg = md_words(root)
base = {}
for b in sys.argv[2:]:
    bp = pathlib.Path(b)
    if bp.is_dir():
        items, _ = md_words(bp)
    else:
        items = [(w["word"], w.get("translation", ""), f"{bp.parent.name}:{k.split(' ')[0]}")
                 for k, v in json.load(open(bp)).items() for w in v["words"]]
    for head, tr, where in items:
        _, norm = entry_pattern(head, cfg)
        base.setdefault(norm, (where, tr))

statuses = {}
for ud in units(root, cfg):
    for k, v in split_subs((ud / cfg["words"]).read_text()).items():
        for head, st in re.findall(r"^\|\s*([^|]+?)\s*\|[^|]+\|\s*([ARG])\s*\|", v, re.M):
            statuses[(k, head)] = st
n = 0
for head, tr, where in course:
    _, norm = entry_pattern(head, cfg)
    if norm in base:
        sub = where.split(":")[1]
        print(f"{sub}\t{statuses.get((sub, head), '?')}\t{head}\t{tr}\t{base[norm][0]}\t{base[norm][1]}")
        n += 1
print(f"# {n} overlaps", file=sys.stderr)
