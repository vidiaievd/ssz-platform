"""Exercise coverage audit for an MD course (references/exercises.md §2).

Usage:
    python3 task_audit.py <course_dir> [--unit N]

Reads every unit's exercises file and checks the whole coverage norm per unit:
meaning/structure and listening per sub-lesson, a dictation, vocabulary recall,
the three grammar stages, recycling of earlier units, graded speaking
(production and `read`), exactly one essay as the last task, the free-form
load, the AI-ready key fields, and the integrity of word banks.

It counts task kinds. It cannot tell whether a key is right — read every
closed item against exercises.md §9.
"""
import collections, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from course_lib import load_config, units

root = pathlib.Path(sys.argv[1])
only = int(sys.argv[sys.argv.index("--unit") + 1]) if "--unit" in sys.argv else None
cfg = load_config(root)

# '### 1C.6 — Title `read_aloud`' (also '### G.5 — …'); the template is the last backticked word
head_re = re.compile(r"^###\s+(\S+)\s+—\s+(.*?)`([a-z_-]+)`[^\n]*$", re.M)
# '## ØVELSER TIL 1A — …' / '## ØVELSER TIL GRAMMATIKK — …'
sect_re = re.compile(rf"^##\s+{re.escape(cfg['task_header'])}\s+(\S+)", re.M)

FREE = {"read_aloud", "writing_task"}
# Fields every free-form task must carry, by template (exercises.md §6)
NEED = {
    "read_aloud": ["Режим", "Объём", "Эталон", "Критерии"],
    "writing_task": ["Режим", "Объём", "Пункты", "Слова", "Грамматика", "Эталон", "Критерии"],
}
SPEAK_PROD = {"dialogue", "monologue"}
MEANING = {"text_order", "highlight_in_text", "information_transfer",
           "multiple_choice_group", "match_pairs"}
BUILD = {"fill_in_blank", "sentence_schema", "translate_to_target", "inflection_table"}
MAX_FREE = 7


def field(body, name):
    m = re.search(rf"^\s*[-*]?\s*\**{name}\**\s*:\s*(.*)$", body, re.M)
    return m.group(1).strip().lower() if m else None


def bank_of(body):
    m = re.search(r"^Bruk:\s*\*?(.+?)\*?\.?\s*$", body, re.M)
    return [w.strip(" *.").lower() for w in m.group(1).split(",")] if m else None


rows, problems, pending = [], [], []
for ud in units(root, cfg):
    n = int(re.search(r"(\d+)", ud.name).group(1))
    if only and n != only:
        continue
    tf = ud / cfg["tasks"]
    if not tf.exists():
        problems.append(f"{ud.name}: нет файла упражнений")
        continue
    text = tf.read_text()
    sects = [(m.start(), m.group(1)) for m in sect_re.finditer(text)]

    def section_at(pos):
        cur = "?"
        for start, key in sects:
            if start <= pos:
                cur = key
        return cur

    marks = list(head_re.finditer(text))
    count = collections.Counter()
    per_sub = collections.defaultdict(lambda: collections.Counter())
    gram = collections.Counter()
    speak_prod = speak_read = essays = free = recall = dict_n = 0
    rep_vocab = rep_gram = 0
    last_tpl_mode = None
    for i, m in enumerate(marks):
        tid, tpl = m.group(1), m.group(3)
        body = text[m.end():(marks[i + 1].start() if i + 1 < len(marks) else len(text))]
        sub = section_at(m.start())
        is_gram = not re.match(r"\d+[A-D]$", sub)
        count[tpl] += 1
        mode = field(body, "Режим")
        last_tpl_mode = (tpl, mode)
        bank = bank_of(body)

        if field(body, "Статус") and "ждёт" in field(body, "Статус"):
            pending.append(f"{ud.name} {tid} `{tpl}`: {field(body, 'Статус')}")
        if tpl in MEANING:
            per_sub[sub]["meaning"] += 1
        if field(body, "Аудио") is not None or tpl == "dictation":
            per_sub[sub]["audio"] += 1
        if tpl == "dictation":
            dict_n += 1
        typed = tpl in {"fill_in_blank", "word_bank_gap_fill"} and bank is None   # the learner types the word
        if not is_gram and (typed or tpl == "translate_to_target"):
            recall += 1
        if field(body, "Повтор") is not None:
            if is_gram or tpl in {"error_correction", "sentence_schema"}:
                rep_gram += 1
            else:
                rep_vocab += 1
        if is_gram:
            if tpl == "multiple_choice":
                gram["choose"] += 1
            if tpl in BUILD or typed:
                gram["build"] += 1
            if tpl == "error_correction":
                gram["correct"] += 1

        if tpl == "read_aloud":
            if mode in SPEAK_PROD:
                speak_prod += 1
            elif mode == "read":
                speak_read += 1
        if tpl == "writing_task" and mode == "essay":
            essays += 1
        if tpl in FREE:
            free += 1
            miss = [f for f in NEED[tpl] if field(body, f) is None
                    and not (f == "Критерии" and "| Критерий" in body)]
            if miss:
                problems.append(f"{ud.name} {tid} `{tpl}`: нет полей {', '.join(miss)}")

        # Word-bank integrity: a bank belongs to word_bank_gap_fill, and every answer is in it
        if bank is not None:
            if tpl == "fill_in_blank":
                problems.append(f"{ud.name} {tid}: `fill_in_blank` с банком слов — это `word_bank_gap_fill`")
            answers = re.findall(r"→\s*\*([^*]+)\*", body)
            for a in answers:
                for part in a.split(","):
                    if part.strip().lower() not in bank:
                        problems.append(f"{ud.name} {tid}: ответ «{part.strip()}» не из банка слов")

    subs = sorted(k for _, k in sects if re.match(r"\d+[A-D]$", k))
    for s in subs:
        if not per_sub[s]["meaning"]:
            problems.append(f"{ud.name} {s}: нет задания на смысл/структуру текста "
                            "(text_order, highlight_in_text, information_transfer, multiple_choice_group, match_pairs)")
        if not per_sub[s]["audio"]:
            problems.append(f"{ud.name} {s}: нет аудирования (задание с полем «Аудио:»)")
    if not dict_n:
        problems.append(f"{ud.name}: нет диктанта (dictation)")
    if not recall:
        problems.append(f"{ud.name}: нет лексики на воспроизведение (пропуски без банка слов "
                        "или translate_to_target вне грамматического модуля)")
    for stage, name in (("choose", "выбор (multiple_choice)"),
                        ("build", "построение (пропуски без банка / sentence_schema / translate_to_target)"),
                        ("correct", "исправление ошибок (error_correction)")):
        if not gram[stage]:
            problems.append(f"{ud.name}: грамматика — нет стадии «{name}» в грамматическом модуле")
    if n >= 2:
        if not rep_vocab:
            problems.append(f"{ud.name}: нет повторения лексики прошлых юнитов (поле «Повтор:»)")
        if not rep_gram:
            problems.append(f"{ud.name}: нет повторения грамматики прошлых юнитов (поле «Повтор:»)")
    if not speak_prod:
        problems.append(f"{ud.name}: нет оцениваемой речи (read_aloud dialogue/monologue)")
    if not speak_read:
        problems.append(f"{ud.name}: нет чтения вслух (read_aloud read)")
    if essays != 1:
        problems.append(f"{ud.name}: эссе {essays}, нужно ровно 1 (writing_task, Режим: essay)")
    elif last_tpl_mode != ("writing_task", "essay"):
        problems.append(f"{ud.name}: эссе должно быть последним заданием юнита")
    if free > MAX_FREE:
        problems.append(f"{ud.name}: свободных заданий {free}, норма ≤ {MAX_FREE} (нагрузка на проверку)")
    if count["speaking-prompt"]:
        problems.append(f"{ud.name}: {count['speaking-prompt']} speaking-prompt без оценки — "
                        "оставить только как доп. задание к занятию")
    audio = sum(per_sub[s]["audio"] for s in per_sub)
    rows.append((ud.name, sum(count.values()), len(count), speak_prod, speak_read, essays,
                 count["writing_task"], audio, dict_n, recall, gram["correct"], free))

hdr = ("юнит", "всего", "типов", "речь", "чтение", "эссе", "письмо", "аудио", "дикт", "воспр", "испр", "своб")
print(f"{hdr[0]:<12}" + "".join(f"{h:>7}" for h in hdr[1:]))
for r in rows:
    print(f"{r[0]:<12}" + "".join(f"{v:>7}" for v in r[1:]))
print(f"\nПроблемы ({len(problems)}):")
for p in problems:
    print("- " + p)
if pending:
    print(f"\nЖдут аудио — написаны, но не на платформе ({len(pending)}):")
    for p in pending:
        print("- " + p)
