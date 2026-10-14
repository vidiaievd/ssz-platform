"""Exercise coverage audit for an MD course (references/exercises.md).

Usage:
    python3 task_audit.py <course_dir> [--unit N]

Reads every unit's exercises file, counts tasks per template and checks the
owner's requirements per unit: graded speaking (read_aloud, production and
`read` mode), exactly one essay (writing_task, `Режим: essay`), and the
AI-ready key fields of every free-form task. Prints a per-unit table and a
list of problems.
"""
import collections, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from course_lib import load_config, units

root = pathlib.Path(sys.argv[1])
only = int(sys.argv[sys.argv.index("--unit") + 1]) if "--unit" in sys.argv else None
cfg = load_config(root)

# '### 1C.6 — Title `read_aloud`' (also '### G.5 — …'); the template is the last backticked word
head_re = re.compile(r"^###\s+(\S+)\s+—\s+(.*?)`([a-z_-]+)`[^\n]*$", re.M)
FREE = {"read_aloud", "writing_task"}
# Fields every free-form task must carry, by template (exercises.md §6)
NEED = {
    "read_aloud": ["Режим", "Объём", "Эталон", "Критерии"],
    "writing_task": ["Режим", "Объём", "Пункты", "Слова", "Грамматика", "Эталон", "Критерии"],
}
SPEAK_PROD = {"dialogue", "monologue"}


def field(body, name):
    m = re.search(rf"^\s*[-*]?\s*\**{name}\**\s*:\s*(.*)$", body, re.M)
    return m.group(1).strip().lower() if m else None


rows, problems = [], []
for ud in units(root, cfg):
    n = int(re.search(r"(\d+)", ud.name).group(1))
    if only and n != only:
        continue
    tf = ud / cfg["tasks"]
    if not tf.exists():
        problems.append(f"{ud.name}: нет файла упражнений")
        continue
    text = tf.read_text()
    marks = list(head_re.finditer(text))
    count = collections.Counter()
    speak_prod = speak_read = essays = 0
    for i, m in enumerate(marks):
        tid, tpl = m.group(1), m.group(3)
        body = text[m.end():(marks[i + 1].start() if i + 1 < len(marks) else len(text))]
        count[tpl] += 1
        mode = field(body, "Режим")
        if tpl == "read_aloud":
            if mode in SPEAK_PROD:
                speak_prod += 1
            elif mode == "read":
                speak_read += 1
        if tpl == "writing_task" and mode == "essay":
            essays += 1
        if tpl in FREE:
            miss = [f for f in NEED[tpl] if field(body, f) is None
                    and not (f == "Критерии" and "| Критерий" in body)]
            if miss:
                problems.append(f"{ud.name} {tid} `{tpl}`: нет полей {', '.join(miss)}")
    if not speak_prod:
        problems.append(f"{ud.name}: нет оцениваемой речи (read_aloud dialogue/monologue)")
    if not speak_read:
        problems.append(f"{ud.name}: нет чтения вслух (read_aloud read)")
    if essays != 1:
        problems.append(f"{ud.name}: эссе {essays}, нужно ровно 1 (writing_task, Режим: essay)")
    if count["speaking-prompt"]:
        problems.append(f"{ud.name}: {count['speaking-prompt']} speaking-prompt без оценки — "
                        "оставить только как доп. задание к занятию")
    rows.append((ud.name, sum(count.values()), len(count), speak_prod, speak_read, essays,
                 count["writing_task"], count["speaking-prompt"]))

print(f"{'юнит':<12}{'всего':>6}{'типов':>6}{'речь':>6}{'чтение':>8}{'эссе':>6}{'письмо':>8}{'sp-prompt':>10}")
for r in rows:
    print(f"{r[0]:<12}{r[1]:>6}{r[2]:>6}{r[3]:>6}{r[4]:>8}{r[5]:>6}{r[6]:>8}{r[7]:>10}")
print(f"\nПроблемы ({len(problems)}):")
for p in problems:
    print("- " + p)
