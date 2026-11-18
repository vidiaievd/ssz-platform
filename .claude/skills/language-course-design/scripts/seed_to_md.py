"""Render a converted unit's exercises file from the seed data (exercises.md §10).

Usage:
    python3 seed_to_md.py <data_dir> <course_dir> [--unit N] [--check]

<data_dir> holds exercises.json (seeded), exercises.pending.json (same format,
not seeded: tasks that wait for audio), vocab.json and grammar/<n>.md.
Writes <course_dir>/<unit>/<tasks file> for every unit present in the data,
in the header format task_audit.py reads. With --check nothing is written:
the exit code is 1 when a file on disk differs from the render (someone
edited the Markdown by hand, or forgot to render after a change).

The seed data is the source of truth for a converted unit — never edit its
exercises file by hand.
"""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from course_lib import load_config, units

data, root = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
only = int(sys.argv[sys.argv.index("--unit") + 1]) if "--unit" in sys.argv else None
check = "--check" in sys.argv
cfg = load_config(root)
BAR = "═" * 67
PUNCT = "«»\"'()[].,!?:;"


def load(name):
    p = data / name
    return json.loads(p.read_text()) if p.exists() else {}


seeded, pending, vocab = load("exercises.json"), load("exercises.pending.json"), load("vocab.json")
MODE_WORDS = {"read": "с на отрывок", "monologue": "с на высказывание", "dialogue": "с на реплику"}


def rubric_table(crit, levels):
    out = ["| Критерий | Вес | 0 | 1 | 2 | 3 |", "|---|:-:|---|---|---|---|"]
    for c in crit:
        lv = levels.get(c["id"], {}).get("levels", ["", "", "", ""])
        out.append(f"| {c['name']} | {c['weight']} | " + " | ".join(lv) + " |")
    return out


def quote_block(text):
    return ["> " + line if line else ">" for line in text.split("\n")]


def audio_fields(doc, is_pending):
    a = doc["content"].get("audio")
    out = []
    if a and a.get("enabled"):
        src = (f"озвучка текста {a['lessonKey']}" if a.get("lessonKey") else
               {"asset": "своя запись", "lesson": "озвучка урока", "link": "ссылка"}.get(a.get("source"), "запись"))
        plays = a.get("settings", {}).get("plays")
        out.append(f"- Аудио: {src}" + (f", прослушиваний: {plays}" if plays else ""))
    if is_pending:
        out.append("- Статус: ждёт аудио — написано, но не на платформе (exercises.pending.json)")
    return out


def authoring_fields(doc):
    a = doc.get("authoring", {})
    return [f"- Повтор: {a['repeat']}"] if a.get("repeat") else []


def r_short_answer(doc):
    c, k = doc["content"], doc["expectedAnswers"]["questions"]
    out = []
    for i, q in enumerate(c["questions"], 1):
        key = k[q["id"]]
        out.append(f"{i}. {q['prompt']}")
        out.append(f"   *Fasit: {key['model']}*")
        out.append("   - Ключ: " + " + ".join(" / ".join(e["anchors"]) for e in key["elements"]))
    return out


def r_mcg(doc):
    c, k = doc["content"], doc["expectedAnswers"]["rows"]
    label = {col["id"]: col["label"] for col in c["columns"]}
    return [f"{i}. {r['text']} — *{label[k[r['id']]['answer']]}* ({k[r['id']]['why']})"
            for i, r in enumerate(c["rows"], 1)]


def r_mc(doc):
    c, k = doc["content"], doc["expectedAnswers"]["questions"]
    out = []
    for i, q in enumerate(c["questions"], 1):
        key = k[q["id"]]
        opts = "  ".join(f"{o['id']}) {o['text']}" + (" ✔" if o["id"] == key["correctOptionId"] else "")
                         for o in q["options"])
        ctx = f"*({q['context']})* " if q.get("context") else ""
        out.append(f"{i}. {ctx}**{q['stem']}**: {opts}")
        out.append(f"   - Почему: {key['why']}")
    return out


def r_gap(doc):
    c, k = doc["content"], doc["expectedAnswers"]
    free = c["settings"].get("input") == "free"
    alts = k.get("alternatives", {})
    rows, bank = [], []
    for i, s in enumerate(c["sentences"], 1):
        tokens = s["text"].split()
        answers, extra = [], []
        for j in sorted(s["gaps"]):
            word = tokens[j].strip(PUNCT)
            answers.append(word)
            tokens[j] = tokens[j].replace(word, "_____")
            if alts.get(f"{s['id']}#{j}"):
                extra += alts[f"{s['id']}#{j}"]
        bank += answers
        line = f"{i}. {' '.join(tokens)}"
        if free and s.get("hint"):
            line += f" *({s['hint']})*"
        line += " → " + ", ".join(f"*{a}*" for a in answers)
        if extra:
            line += " (также: " + ", ".join(extra) + ")"
        rows.append(line)
    if free:
        head = ["- Ввод: свободный — банка слов нет, ученик пишет слово сам"]
    else:
        head = ["Bruk: *" + ", ".join(sorted(set(bank + c.get("distractors", [])), key=str.lower)) + "*."]
    return head + rows


def r_match(doc):
    out = ["| Venstre | Høyre |", "|---|---|"]
    out += [f"| {p['left']} | {p['right']} |" for p in doc["content"]["pairs"]]
    return out + ["", "*Fasit: парами по строкам; ученик получает правый столбец перемешанным.*"]


def r_order(doc):
    c = doc["content"]
    text = {it["id"]: it["text"] for it in c["items"]}
    out = [f"*{c.get('context', '')}* Правильный порядок (ученик получает перемешанным):"]
    out += [f"{i}. {text[x]}" for i, x in enumerate(doc["expectedAnswers"]["order"], 1)]
    return out


def r_errors(doc):
    k = doc["expectedAnswers"]["items"]
    out = []
    for i, it in enumerate(doc["content"]["items"], 1):
        key = k[it["id"]]
        note = "; ".join(m.get("note", "") for m in key.get("meta", {}).values() if m.get("note"))
        out.append(f"{i}. ✗ {it['wrong']} → ✓ *{key['ref']}*" + (f" — {note}" if note else ""))
    return out


def r_schema(doc):
    k = doc["expectedAnswers"]["rows"]
    out = []
    for i, r in enumerate(doc["content"]["rows"], 1):
        key = k[r["id"]]
        fields = " · ".join(f"{ch['text']} [{key['fields'][ch['id']]}]" for ch in r["chunks"])
        out.append(f"{i}. {r['source']} → *{key['text']}*")
        out.append(f"   - Поля: {fields}")
        if r.get("extras"):
            out.append("   - Лишние: " + ", ".join(e["text"] for e in r["extras"]))
    return out


def r_dictation(doc):
    k = doc["expectedAnswers"]["segments"]
    out = []
    for i, s in enumerate(doc["content"]["segments"], 1):
        out.append(f"{i}. {k[s['id']]['text']}" + (f" — {k[s['id']]['why']}" if k[s["id"]].get("why") else ""))
    return out


def r_read_aloud(doc):
    c, k = doc["content"], doc["expectedAnswers"]
    lo = min(p["minSeconds"] for p in c["prompts"])
    hi = max(p["maxSeconds"] for p in c["prompts"])
    prep = max(p["prepSeconds"] for p in c["prompts"])
    ai = c.get("review", {})
    out = [f"- Режим: {c['mode']}",
           f"- Объём: {lo}–{hi} {MODE_WORDS[c['mode']]}, подготовка {prep} с; до {c['recording']['takes']} дублей",
           "- Проверка: учитель (очередь проверки)" + ("; ИИ-этап разрешён автором (расшифровка, черновик оценки)"
                                                         if ai.get("aiStage") else "; ИИ-этап выключен"),
           f"- Порог: {c['settings']['passScore']} баллов",
           f"- Инструкция: {c['instruction']}"]
    if doc.get("authoring", {}).get("grammar"):
        out.append(f"- Грамматика: {doc['authoring']['grammar']}")
    out += ["- Критерии:", ""] + rubric_table(c["rubric"], k["rubric"]) + [""]
    for i, p in enumerate(c["prompts"], 1):
        key = k["prompts"][p["id"]]
        if c["mode"] == "read":
            out.append(f"{i}. **{p['label']}** — «{p['text']}»")
        elif c["mode"] == "dialogue":
            out.append(f"{i}. *Situasjon:* {p['turn']['situation']} *Replikk:* «{p['turn']['partner']}»")
        else:
            out.append(f"{i}. **{p['label']}**")
            for pt in p["plan"]:
                out.append(f"   - План: {pt['text']}" + ("" if pt["required"] else " (по желанию)"))
        for f in key.get("focus", []):
            out.append(f"   - Фокус: *{f['word']}* — {f['note']}")
        out.append(f"   - Эталон: {key['note']}")
    return out


def r_writing(doc):
    c, k = doc["content"], doc["expectedAnswers"]
    s, a = c["settings"], doc.get("authoring", {})
    total = 3 * sum(r["weight"] for r in c["rubric"])
    out = [f"- Режим: {c['mode']}",
           f"- Объём: {s['minWords']}–{s['maxWords']} слов",
           "- Проверка: учитель (очередь проверки)" + ("; ИИ-этап разрешён автором (предпроверка, черновик оценки)"
                                                         if s.get("aiStage") else "; ИИ-этап выключен"),
           f"- Порог: {s['passScore']} баллов из {total}",
           f"- Задание: {c['prompt']}",
           "- Пункты:"]
    for p in c["points"]:
        out.append(f"  - {p['text']} — ключевые слова: {', '.join(k['points'][p['id']]['keywords'])}")
    out.append(f"- Слова: {', '.join(a['words']) if a.get('words') else '—'}")
    out.append(f"- Грамматика: {a.get('grammar') or '—'}")
    if c.get("phrases"):
        out.append("- Фразы-подсказки: " + " · ".join(c["phrases"]))
    out += ["- Критерии:", ""] + rubric_table(c["rubric"], k["rubric"]) + ["", "- Эталон:", ""] + quote_block(k["model"])
    return out


RENDER = {"short_answer": r_short_answer, "multiple_choice_group": r_mcg, "multiple_choice": r_mc,
          "word_bank_gap_fill": r_gap, "match_pairs": r_match, "text_order": r_order,
          "error_correction": r_errors, "sentence_schema": r_schema, "dictation": r_dictation,
          "read_aloud": r_read_aloud, "writing_task": r_writing}
TITLES = {"short_answer": "Husker du teksten?", "multiple_choice_group": "Riktig eller galt?",
          "multiple_choice": "Velg riktig alternativ", "word_bank_gap_fill": "Fyll inn riktig ord",
          "match_pairs": "Hva hører sammen?", "text_order": "Sett i riktig rekkefølge",
          "error_correction": "Finn og rett feilen", "sentence_schema": "Bygg setningen",
          "dictation": "Diktat", "read_aloud": "Snakk", "writing_task": "Skriv"}


def title_of(doc):
    c = doc["content"]
    if c.get("title"):
        return re.sub(r"\s+—\s+(?:tekst\s+)?\d+[A-D]$", "", c["title"])
    if doc["template"] == "word_bank_gap_fill" and c["settings"].get("input") == "free":
        return "Skriv ordet selv"
    if doc["template"] == "writing_task":
        return {"essay": "Essay", "letter": "Skriv en e-post", "free": "Skriv en kort tekst"}.get(c["mode"], "Skriv")
    return TITLES.get(doc["template"], doc["template"])


def render_unit(n):
    subs = [f"{n}{x}" for x in "ABCD"] + [str(n)]
    if not any(s in seeded for s in subs):
        return None
    out = [f"# Leksjon {n} — Oppgaver (упражнения)", "",
           f"> Сгенерировано из `{data.name}/exercises.json` и `exercises.pending.json` скриптом `seed_to_md.py`.",
           "> Источник правды — данные сида; этот файл руками не правится (exercises.md §10).", ""]
    for sub in subs:
        docs = [(d, False) for d in seeded.get(sub, [])] + [(d, True) for d in pending.get(sub, [])]
        if not docs:
            continue
        if sub == str(n):
            gfile = data / "grammar" / f"{n}.md"
            first = gfile.read_text().splitlines()[0] if gfile.exists() else ""
            name, prefix = "GRAMMATIKK — " + re.sub(r"^#\s*GRAMMATIKK\s*—\s*", "", first), "G"
        else:
            name = vocab.get(sub, {}).get("title", sub)
            prefix = sub
        out += [BAR, f"## {cfg['task_header']} {name}", BAR, ""]
        for i, (doc, is_pending) in enumerate(docs, 1):
            out.append(f"### {prefix}.{i} — {title_of(doc)} `{doc['template']}`")
            out.append(f"- Ключ сида: `{doc['key']}`")
            out.append(f"- Ученику: {doc['instruction']}")
            if doc.get("hint"):
                out.append(f"- Подсказка: {doc['hint']}")
            out += audio_fields(doc, is_pending) + authoring_fields(doc)
            body = RENDER[doc["template"]](doc)
            # A blank line between the field list and a numbered list or a table
            if body and not body[0].startswith("- "):
                out.append("")
            out += body + [""]
    return "\n".join(out).rstrip() + "\n"


stale = 0
for ud in units(root, cfg):
    n = int(re.search(r"(\d+)", ud.name).group(1))
    if only and n != only:
        continue
    text = render_unit(n)
    if text is None:
        continue
    target = ud / cfg["tasks"]
    if check:
        same = target.exists() and target.read_text() == text
        print(f"{ud.name}: {'совпадает с данными сида' if same else 'ОТЛИЧАЕТСЯ от данных сида'}")
        stale += not same
    else:
        target.write_text(text)
        print(f"{ud.name}: {len(re.findall(r'^### ', text, re.M))} упражнений → {target}")
sys.exit(1 if stale else 0)
