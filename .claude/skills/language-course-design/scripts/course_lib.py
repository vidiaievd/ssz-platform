"""Shared helpers: course layout config, language profiles, text splitting,
headword -> word-form regex.

Layout defaults match docs/courses/norsk_it. Override per course with an
optional <course>/course.json, e.g. for an English course:

    {"lang": "en", "unit_glob": "unit_*", "texts": "01_texts.md",
     "words": "02_wordlist.md", "tasks": "04_exercises.md",
     "task_header": "EXERCISES FOR", "known": "known_words.md",
     "spine": "grammar_spine.md"}
"""
import json, pathlib, re

DEFAULTS = {
    "lang": "nb",
    "unit_glob": "leksjon_*",
    "texts": "01_tekster.md",
    "words": "02_ordliste.md",
    "tasks": "04_oppgaver.md",
    "task_header": "ØVELSER TIL",     # '## ØVELSER TIL 1A — ...' in the tasks file
    "known": "kjente_ord.md",
    "spine": "grammatikk_ryggrad.md",
    "near": 4,                          # A-word: first text return within N sub-lessons
    "far": 8,                           # ...and a second one within M
}

# Word-form heuristics per language. No lemmatizer: a headword token becomes
# "stem alternatives + optional inflection suffix". Irregular forms
# (gå/gikk, go/went) are missed — the audit under-counts slightly.
LANGS = {
    "nb": {
        "letters": "æøå",
        "lead": ("en", "ei", "et", "å"),
        "drop": ("noe", "noen", "…", "..."),
        "refl": {"seg": r"(?:seg|meg|deg|oss|dere)"},
        "suf": r"(?:e|er|en|et|ene|a|ane|r|te|de|dde|tt|t|s|es|ere|est|este|ne|ers|ets|ens)?",
    },
    "en": {
        "letters": "",
        "lead": ("a", "an", "the", "to"),
        "drop": ("sth", "something", "someone", "sb", "…", "..."),
        "refl": {"oneself": r"(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves)",
                 "one's": r"(?:my|your|his|her|its|our|their)"},
        "suf": r"(?:s|es|ed|d|ing|er|ers|est|ies|ied|'s)?",
    },
}

SUB_RE = re.compile(r"^##\s+(\d+[A-D])\b", re.M)


def load_config(root):
    cfg = dict(DEFAULTS)
    f = pathlib.Path(root) / "course.json"
    if f.exists():
        cfg.update(json.loads(f.read_text()))
    cfg["L"] = LANGS[cfg["lang"]]
    return cfg


def units(root, cfg):
    def num(p):
        m = re.search(r"(\d+)", p.name)
        return int(m.group(1)) if m else 0
    return sorted(pathlib.Path(root).glob(cfg["unit_glob"]), key=num)


def split_subs(text, header_re=SUB_RE):
    """Split a file into {'1A': section_text, ...} by '## 1A — ...' headers."""
    marks = [(m.start(), m.group(1)) for m in header_re.finditer(text)]
    return {key: text[pos:(marks[i + 1][0] if i + 1 < len(marks) else len(text))]
            for i, (pos, key) in enumerate(marks)}


def _stem_alts(tok, lang):
    alts = {tok}
    if lang == "nb":
        if len(tok) >= 4 and tok.endswith("e"):
            alts.add(tok[:-1])                                  # håndtere -> håndter-er
        if re.search(r"[^aeiouyæøå]e[lr]$", tok):
            alts.add(tok[:-2] + tok[-1])                        # forespørsel -> forespørsl-er
        if tok.endswith("um"):
            alts.add(tok[:-2] + "i")                            # kriterium -> kriteri-er
        if re.search(r"[aeiouyæøå][bdfgklmnprst]$", tok):
            alts.add(tok + tok[-1])                             # møterom -> møteromm-et
    elif lang == "en":
        if len(tok) >= 4 and tok.endswith("e"):
            alts.add(tok[:-1])                                  # make -> mak-ing
        if re.search(r"[^aeiou]y$", tok):
            alts.add(tok[:-1])                                  # study -> stud-ies
        if re.search(r"[^aeiou][aeiou][bdgklmnprt]$", tok):
            alts.add(tok + tok[-1])                             # stop -> stopp-ed
    return alts


def entry_pattern(head, cfg):
    """Regex that finds a word-list headword (incl. multi-word items) in text."""
    L = cfg["L"]
    h = re.sub(r"\(.*?\)", " ", head)
    h = re.sub(r"[«»\"*]", "", h).split("/")[0]
    toks = [t.strip(".,;:!?") for t in h.lower().split()]
    while toks and toks[0] in L["lead"]:
        toks = toks[1:]
    toks = [t for t in toks if t and t not in L["drop"]]
    if not toks:
        return None, ""
    parts = []
    for t in toks:
        if t in L["refl"]:
            parts.append(L["refl"][t])
        else:
            alts = sorted(_stem_alts(t, cfg["lang"]), key=len, reverse=True)
            parts.append("(?:" + "|".join(map(re.escape, alts)) + ")" + L["suf"])
    w = r"\w" + L["letters"]
    # up to two words may stand between the parts of a multi-word item (lære deg opp)
    pat = rf"(?<![{w}-])" + r"[\s,]+(?:\w+\s+){0,2}".join(parts) + rf"(?![{w}])"
    return re.compile(pat, re.I), " ".join(toks)
