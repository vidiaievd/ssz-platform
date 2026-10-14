"""Rebuild <course>/AUDIT_recycling.md from a vocab_audit.py --json dump.

Keeps the hand-written part above '## Сводка' (decisions, what was done),
regenerates the summary and the issue lists below it.

Usage: python3 make_report.py <course_dir> <audit.json> <summary.txt>
    (summary.txt = captured stdout of vocab_audit.py)
"""
import json, sys, pathlib

course, data, summary = sys.argv[1:4]
p = pathlib.Path(course) / "AUDIT_recycling.md"
head = p.read_text().split("## Сводка")[0] if p.exists() else "# Аудит повторяемости лексики\n\n"
I = json.load(open(data))["issues"]

def lst(xs, fmt):
    return "\n".join("- " + fmt(x) for x in xs) or "- —"

sections = [
    ("used_early", "Заявлено новым, но встречается раньше — перенести в словник раннего под-урока или признать ложным срабатыванием",
     lambda x: f"{x[0]} · {x[1]} — впервые в {x[2]}"),
    ("relisted", "Заявлено новым повторно — удалить повторную запись", lambda x: f"{x[0]} · {x[1]}"),
    ("not_in_text", "Есть в словнике, нет в своём тексте — проверить вручную", lambda x: f"{x[0]} · {x[1]}"),
    ("A_no_task", "A-слова без упражнения в своём под-уроке", lambda x: f"{x[0]} · {x[1]}"),
    ("A_never", "A-слова, которые больше нигде не встречаются — кандидаты для вставок", lambda x: f"{x[0]} · {x[1]}"),
]
body = "## Сводка\n\n```\n" + open(summary).read() + "```\n"
for i, (key, title, fmt) in enumerate(sections, 1):
    body += f"\n## {i}. {title} ({len(I[key])})\n{lst(I[key], fmt)}\n"
p.write_text(head + body)
print("written", p)
