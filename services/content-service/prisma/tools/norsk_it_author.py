#!/usr/bin/env python3
"""Authoring helpers for «Norsk på jobb — IT» seed data.

The seed data (`prisma/data/norsk-it/`) is the source of truth for the
exercises of every converted leksjon; the course Markdown
(`docs/courses/norsk_it/leksjon_NN/04_oppgaver.md`) is rendered from it by
the skill script `seed_to_md.py`.

This module holds the helpers that build exercise documents in the shape the
templates expect (`mc`, `rg`, `sa`, `gap`, `match`, `order`, `errors`,
`schema`, `speak`, `write`, `dictation`). The units themselves live in
`norsk_it_units.py`, which calls `build()`.

    python3 prisma/tools/norsk_it_units.py        # from services/content-service

Exercises that wait for audio (listening on the lesson narration, dictation)
are written to `exercises.pending.json` — same format, not read by the seed.
"""
import json, pathlib, re

SERVICE = pathlib.Path(__file__).resolve().parents[2]
DATA = SERVICE / 'prisma' / 'data' / 'norsk-it'
COURSE = SERVICE.parents[1] / 'docs' / 'courses' / 'norsk_it'


# ─── Lesson texts ────────────────────────────────────────────────────────────
def unit_dir(n):
    return COURSE / f'leksjon_{n:02d}'


def sync_lessons(n):
    """Copy the unit's texts and grammar from the course Markdown into the seed data."""
    text = (unit_dir(n) / '01_tekster.md').read_text()
    for m in re.finditer(r'^## (\d+[A-D]) — [^\n]*\n(.*?)(?=^---\s*$|^## \d+[A-D] — |\Z)', text, re.S | re.M):
        (DATA / 'lessons' / f'{m.group(1)}.md').write_text(m.group(2).strip() + '\n')
    (DATA / 'grammar' / f'{n}.md').write_text((unit_dir(n) / '03_grammatikk.md').read_text())


def lesson_text(sub):
    return (DATA / 'lessons' / f'{sub}.md').read_text()


def _flat(s):
    return re.sub(r'\s+', ' ', re.sub(r'[*>]', '', s)).strip()


def passage(sub, snippet):
    """The paragraph of the sub-lesson text that holds `snippet` (whitespace-insensitive)."""
    want = _flat(snippet)
    for para in re.split(r'\n\s*\n', lesson_text(sub)):
        if want in _flat(para):
            return _flat(para)
    raise SystemExit(f'{sub}: passage not found for «{snippet}»')


def quote(sub, snippet):
    """Assert that a quote is in the text as written (line wraps allowed) and return it."""
    if _flat(snippet) not in _flat(lesson_text(sub)):
        raise SystemExit(f'{sub}: quote not in text «{snippet}»')
    return snippet


# ─── Closed templates ────────────────────────────────────────────────────────
SA_SETTINGS = {'passRule': 'all', 'passN': 2, 'typos': True, 'caseless': True, 'minWords': 2,
               'showBreakdown': True, 'showModel': 'onClose', 'aiStage': False, 'aiGrammar': True,
               'teacherReview': 'flagged', 'progress': True}


def sa(key, sub, title, instr_ru, qs, instr_nb='Svar med egne ord, i hele setninger.'):
    """short_answer. qs: (prompt, [[anchors of element 1], …], model, why, snippet)."""
    questions, answers = [], {}
    for i, (prompt, elements, model, why, snip) in enumerate(qs, 1):
        qid = f'sa{i}'
        questions.append({'id': qid, 'kind': 'reading', 'prompt': prompt, 'passage': passage(sub, snip)})
        for anchors in elements:
            if not any(re.search(rf'(?<!\w){re.escape(a)}(?!\w)', model, re.I) for a in anchors):
                raise SystemExit(f'{key} {qid}: model does not hold any of {anchors}')
        answers[qid] = {
            'elements': [{'id': f'e{j}', 'label': a[0][:1].upper() + a[0][1:], 'anchors': a, 'required': True}
                         for j, a in enumerate(elements, 1)],
            'model': model, 'why': why}
    return {'key': key, 'template': 'short_answer', 'instruction': instr_ru,
            'content': {'title': title, 'instruction': instr_nb, 'questions': questions,
                        'settings': dict(SA_SETTINGS)},
            'expectedAnswers': {'questions': answers}}


RG_SETTINGS = {'numbering': True, 'shuffleRows': False, 'layout': 'auto', 'showText': True, 'retry': 'one',
               'lockCorrect': True, 'showWhy': 'wrong', 'revealKey': True, 'passThreshold': 70, 'progress': True}


def rg(key, sub, label, rows):
    """multiple_choice_group «Riktig eller galt». rows: (statement, True/False, why, quote from the text)."""
    return {'key': key, 'template': 'multiple_choice_group',
            'instruction': f'Верно или неверно? Отвечайте по тексту {sub}.',
            'content': {'title': f'Riktig eller galt — tekst {sub}',
                        'instruction': 'Er påstandene riktige eller gale? Svar ut fra teksten.',
                        'source': {'mode': 'inline', 'label': f'Tekst {sub} — {label}', 'text': lesson_text(sub)},
                        'columns': [{'id': 'c-riktig', 'label': 'Riktig', 'short': 'R'},
                                    {'id': 'c-galt', 'label': 'Galt', 'short': 'G'}],
                        'rows': [{'id': str(i), 'text': r[0]} for i, r in enumerate(rows, 1)],
                        'settings': dict(RG_SETTINGS)},
            'expectedAnswers': {'rows': {str(i): {'answer': 'c-riktig' if r[1] else 'c-galt', 'why': r[2],
                                                  'quote': quote(sub, r[3])}
                                         for i, r in enumerate(rows, 1)}}}


MC_SETTINGS = {'letters': True, 'layout': 'list', 'shuffle': True, 'shuffleQuestions': False, 'instant': False,
               'retry': 'one', 'eliminate': False, 'showWhyWrong': True, 'explainOnCorrect': True,
               'progress': True}


def mc(key, title, instr_ru, instr_nb, qs, kind='vocab', audio=None):
    """multiple_choice. qs: (context, stem, [options], index of the right one, why[, {index: rebuttal}])."""
    questions, answers = [], {}
    for i, q in enumerate(qs, 1):
        context, stem, opts, right, why = q[:5]
        rebut = q[5] if len(q) > 5 else {}
        ids = 'abcd'
        questions.append({'id': f'q{i}', 'kind': kind, 'context': context, 'stem': stem,
                          'options': [{'id': ids[j], 'text': o, 'fixed': False} for j, o in enumerate(opts)]})
        answers[f'q{i}'] = {'correctOptionId': ids[right], 'why': why,
                            'options': {ids[j]: t for j, t in rebut.items()}}
    content = {'title': title, 'instruction': instr_nb, 'questions': questions, 'settings': dict(MC_SETTINGS)}
    if audio:
        content['audio'] = audio
    return {'key': key, 'template': 'multiple_choice', 'instruction': instr_ru, 'content': content,
            'expectedAnswers': {'questions': answers}}


def gap(key, instr_ru, sentences, distractors=(), free=False, title=None, hint=None):
    """word_bank_gap_fill. sentences: ('Text with one [gap].', fallback[, why[, [alternatives][, hint]]]).

    `free=True` — no bank, the learner types the word (recall); `alternatives` and the
    per-sentence `hint` are honoured there.
    """
    sents, feedback, alts = [], {}, {}
    for i, s in enumerate(sentences, 1):
        text, fallback = s[0], s[1]
        why = s[2] if len(s) > 2 else ''
        tokens = text.split()
        gaps = [j for j, t in enumerate(tokens) if '[' in t]
        if not gaps:
            raise SystemExit(f'{key} s{i}: no gap in «{text}»')
        row = {'id': f's{i}', 'text': text.replace('[', '').replace(']', ''), 'gaps': gaps}
        if len(s) > 4 and s[4]:
            row['hint'] = s[4]
        sents.append(row)
        for j in gaps:
            feedback[f's{i}#{j}'] = {'fallback': fallback, 'why': why, 'pairs': {}}
            if len(s) > 3 and s[3]:
                alts[f's{i}#{j}'] = list(s[3])
    content = {'sentences': sents, 'distractors': list(distractors),
               'settings': {'shuffle': True, 'allowReuse': False, 'showBankCount': False,
                            'caseSensitive': False, 'input': 'free' if free else 'bank'}}
    if title:
        content['title'] = title
    doc = {'key': key, 'template': 'word_bank_gap_fill', 'instruction': instr_ru, 'content': content,
           'expectedAnswers': {'feedback': feedback}}
    if alts:
        doc['expectedAnswers']['alternatives'] = alts
    if hint:
        doc['hint'] = hint
    return doc


def match(key, instr_ru, pairs, variant='halves', distractors=()):
    """match_pairs. pairs: (left, right, default feedback)."""
    return {'key': key, 'template': 'match_pairs', 'instruction': instr_ru,
            'content': {'pairs': [{'id': f'p{i}', 'left': p[0], 'right': p[1], 'rightId': f'r{i}'}
                                  for i, p in enumerate(pairs, 1)],
                        'variant': variant,
                        'distractors': [{'id': f'x{i}', 'text': t} for i, t in enumerate(distractors, 1)],
                        'settings': {'distractors': bool(distractors), 'shuffle': True, 'showRemaining': True}},
            'expectedAnswers': {'feedback': {f'p{i}': {'def': p[2]} for i, p in enumerate(pairs, 1)}}}


def order(key, instr_ru, context, items, explanation):
    """text_order. items in the right order."""
    ids = 'abcdefghij'
    return {'key': key, 'template': 'text_order', 'instruction': instr_ru,
            'content': {'kind': 'sentences', 'context': context,
                        'items': [{'id': ids[i], 'text': t} for i, t in enumerate(items)]},
            'expectedAnswers': {'order': list(ids[:len(items)]), 'explanation': explanation}}


def errors(key, instr_ru, hint, note, items):
    """error_correction. items: (wrong sentence, right sentence, note). One contiguous error each."""
    content, answers = [], {}
    for i, (wrong, ref, why) in enumerate(items):
        w, r = wrong.split(), ref.split()
        a = 0
        while a < min(len(w), len(r)) and w[a] == r[a]:
            a += 1
        b = 0
        while b < min(len(w), len(r)) - a and w[-1 - b] == r[-1 - b]:
            b += 1
        fix = ' '.join(r[a:len(r) - b]).strip('.,?!')
        if wrong == ref:
            raise SystemExit(f'{key} s-{i}: wrong and right sentences are the same')
        content.append({'id': f's-{i}', 'wrong': wrong})
        answers[f's-{i}'] = {'ref': ref, 'meta': {f'{a}:{len(w) - b}:{fix}': {'note': why}}}
    return {'key': key, 'template': 'error_correction', 'instruction': instr_ru, 'hint': hint,
            'content': {'mode': 'sentences', 'note': note, 'items': content},
            'expectedAnswers': {'items': answers}}


SUB_SCHEMA = [
    {'id': 'subjunksjon', 'short': 'sub', 'label': 'Subjunksjon', 'hint': 'om eller spørreordet', 'optional': False},
    {'id': 'subjekt', 'short': 'n', 'label': 'Subjekt', 'hint': '', 'optional': False},
    {'id': 'adverbial', 'short': 'a', 'label': 'Adverbial', 'hint': 'ikke, alltid, ofte — foran verbet', 'optional': True},
    {'id': 'verbal', 'short': 'v', 'label': 'Verbal', 'hint': 'Finitt verb først, så infinitiv eller partisipp', 'optional': False},
    {'id': 'sluttfelt', 'short': 'N', 'label': 'Sluttfelt', 'hint': 'Objekt og andre utfyllinger', 'optional': True},
]


def schema(key, title, instr_ru, instr_nb, hint, rows):
    """sentence_schema, subordinate clause. rows: (source, [(chunk, field)], [extras], why, {chunk index: feedback})."""
    crows, answers = [], {}
    for i, (source, chunks, extras, why, fb) in enumerate(rows, 1):
        rid = f'r{i}'
        crows.append({'id': rid, 'clause': 'sub', 'source': source,
                      'chunks': [{'id': f'{rid}c{j}', 'text': c[0]} for j, c in enumerate(chunks, 1)],
                      'extras': [{'id': f'{rid}x{j}', 'text': e} for j, e in enumerate(extras, 1)]})
        answers[rid] = {'text': ' '.join(c[0] for c in chunks), 'why': why,
                        'fields': {f'{rid}c{j}': c[1] for j, c in enumerate(chunks, 1)},
                        'alt': {}, 'fb': {f'{rid}c{j}': t for j, t in fb.items()}}
    return {'key': key, 'template': 'sentence_schema', 'instruction': instr_ru, 'hint': hint,
            'content': {'title': title, 'instruction': instr_nb, 'presetId': 'blank', 'clauses': ['sub'],
                        'schema': {'sub': SUB_SCHEMA}, 'rows': crows,
                        'settings': {'labels': True, 'hints': True, 'counts': False, 'prefill': 'none',
                                     'markEmpty': False, 'perField': True, 'hintAfterMistake': True,
                                     'shuffle': True, 'extras': True, 'order': 'strict'}},
            'expectedAnswers': {'rows': answers}}


# ─── Free-form templates ─────────────────────────────────────────────────────
# Rubric criteria shared by the speaking tasks: id → (name, description, levels 0–3)
CRIT = {
    'content_text': ('Innhold', 'Svarer riktig på spørsmålet, ut fra teksten.',
                     ['Svarer ikke, eller svaret stemmer ikke med teksten.',
                      'Svaret er delvis riktig; viktig informasjon mangler.',
                      'Riktig svar, men uklart eller med en liten feil i fakta.',
                      'Riktig og fullstendig svar i en hel setning.']),
    'content_self': ('Innhold', 'Svarer på spørsmålet med egne eksempler.',
                     ['Svarer ikke på spørsmålet.', 'Svarer kort, uten eksempler.',
                      'Svarer på spørsmålet med ett konkret eksempel.',
                      'Svarer fullt, med konkrete eksempler og en naturlig avslutning.']),
    'content_plan': ('Innhold', 'Dekker punktene i planen, i en rekkefølge som er lett å følge.',
                     ['Dekker ingen av punktene.', 'Dekker ett punkt, eller bare stikkord.',
                      'Dekker de obligatoriske punktene, men kort eller ujevnt.',
                      'Dekker alle punktene, konkret og i en tydelig rekkefølge.']),
    'pron': ('Uttale', 'Lyder, trykk og tonefall. Blir ordene forstått?',
             ['Vanskelig å forstå.', 'Forstås med anstrengelse; gjennomgående feil i kjente lyder.',
              'Forstås lett; enkelte lyder eller trykk sitter ikke.',
              'Tydelig og trygg uttale; trykk og tonefall stemmer.']),
    'flow': ('Flyt', 'Tempo, pauser, nøling og selvretting.',
             ['Stopper opp så ofte at innholdet forsvinner.', 'Mange pauser midt i setninger.',
              'Jevnt tempo med noen nølinger.', 'Naturlig tempo og pauser på riktig sted.']),
    'acc': ('Nøyaktighet', 'Leser det som står: ingen ord hoppet over, lagt til eller byttet.',
            ['Mange ord mangler eller er byttet ut.', 'Flere feil som endrer meningen.',
             'Én-to små feil som ikke endrer meningen.', 'Leser teksten nøyaktig som den står.']),
}


def speak(key, mode, title, instr_ru, instr_nb, prompts, rubric, pass_score):
    """read_aloud.

    prompts — dicts: label, note, and by mode: `text` + `focus` [(word, note)] (read),
    `plan` [(text, required)] (monologue), `situation` + `partner` (dialogue); seconds (min, max, prep).
    rubric — [(criterion id from CRIT or a (id, name, desc, levels) tuple, weight)].
    """
    cps, notes = [], {}
    for i, p in enumerate(prompts, 1):
        pid = f'p{i}'
        mn, mx, prep = p['seconds']
        cps.append({'id': pid, 'label': p['label'], 'text': p.get('text', ''),
                    'image': {'assetId': '', 'caption': '', 'alt': ''},
                    'plan': [{'id': f'{pid}-pl{j}', 'text': t, 'required': req}
                             for j, (t, req) in enumerate(p.get('plan', []), 1)],
                    'turn': {'situation': p.get('situation', ''), 'partner': p.get('partner', '')},
                    'minSeconds': mn, 'maxSeconds': mx, 'prepSeconds': prep})
        notes[pid] = {'note': p['note'],
                      'focus': [{'id': f'{pid}-f{j}', 'word': w, 'note': n}
                                for j, (w, n) in enumerate(p.get('focus', []), 1)]}
    crub, krub = [], {}
    for c, weight in rubric:
        cid, name, desc, levels = (c, *CRIT[c]) if isinstance(c, str) else c
        cid = cid.split('_')[0]
        crub.append({'id': cid, 'name': name, 'desc': desc, 'weight': weight, 'studentVisible': True})
        krub[cid] = {'levels': levels}
    return {'key': key, 'template': 'read_aloud', 'instruction': instr_ru,
            'content': {'title': title, 'instruction': instr_nb, 'language': 'nb', 'mode': mode, 'prompts': cps,
                        'rubric': crub,
                        'recording': {'takes': 3, 'chooseBest': True, 'listenBack': True, 'countdown': True,
                                      'micCheck': True, 'keepAllTakes': False},
                        'settings': {'passScore': pass_score, 'showRubric': 'afterGraded',
                                     'showModel': 'afterGraded', 'revision': 'return'},
                        'review': dict(READ_ALOUD_REVIEW)},
            'expectedAnswers': {'prompts': notes, 'rubric': krub}}


# The author allows the AI stage; ai-service decides what a given payer gets (exercises.md §7).
READ_ALOUD_REVIEW = {'aiStage': True, 'ai': {'transcript': True, 'pronunciation': True, 'fluency': False,
                                             'draft': True}, 'aiVisibility': 'teacher'}
WRITING_AI = {'aiStage': True, 'ai': {'grammar': True, 'task': True, 'structure': True, 'lexis': True,
                                      'draft': True}, 'aiVisibility': 'teacher', 'aiSelfLimit': 0}

W_STRUCT = ['Ingen struktur.', 'Løse setninger uten sammenheng.', 'Forståelig rekkefølge, få bindeord.',
            'Tydelig struktur og gode bindeord.']
W_LEXIS = ['Svært begrenset ordforråd, mange skrivefeil.', 'Enkelt ordforråd, flere skrivefeil.',
           'Passende ordforråd, enkelte skrivefeil.', 'Presist ordforråd fra leksjonen, nesten ingen skrivefeil.']


def write(key, mode, instr_ru, instr_nb, prompt, points, phrases, rubric, words, pass_score, model,
          recipient='', register='formal'):
    """writing_task. points: (text, [keywords]); rubric: (name, desc, weight, metric, levels 0–3) × 4."""
    lo, hi = words
    return {'key': key, 'template': 'writing_task', 'instruction': instr_ru,
            'content': {'mode': mode, 'instruction': instr_nb, 'prompt': prompt, 'source': '',
                        'image': {'caption': '', 'alt': ''},
                        'letter': {'register': register, 'recipient': recipient},
                        'points': [{'id': f'p{i}', 'text': p[0], 'required': True} for i, p in enumerate(points, 1)],
                        'phrases': list(phrases),
                        'rubric': [{'id': f'c{i}', 'name': r[0], 'desc': r[1], 'weight': r[2], 'metric': r[3]}
                                   for i, r in enumerate(rubric, 1)],
                        'settings': {'minWords': lo, 'maxWords': hi, 'timer': 0, 'blockPaste': True,
                                     'autosave': True, 'showWordCount': True, 'showPlan': True,
                                     'showPhrases': True, 'showRubric': 'afterGraded',
                                     'showModel': 'afterGraded', 'passScore': pass_score,
                                     **json.loads(json.dumps(WRITING_AI)), 'revision': 'return'}},
            'expectedAnswers': {'points': {f'p{i}': {'keywords': p[1]} for i, p in enumerate(points, 1)},
                                'rubric': {f'c{i}': {'levels': r[4]} for i, r in enumerate(rubric, 1)},
                                'model': model}}


# ─── Tasks that wait for audio (written to exercises.pending.json) ───────────
def lesson_audio(sub, title):
    """Listening layer that borrows the lesson narration; `lessonKey` is resolved to a
    `lessonRef` when the leksjon is narrated and the task moves to exercises.json."""
    return {'enabled': True, 'source': 'lesson', 'lessonKey': sub, 'title': title,
            'settings': {'layout': 'gate', 'plays': 2, 'seek': False, 'speed': True, 'gate': 'first',
                         'transcriptWhen': 'after'}}


def listen(key, sub, title, qs):
    """Listening comprehension on the narration of the sub-lesson text: the text is hidden, the clip plays twice."""
    return mc(key, title, f'Послушайте текст {sub} (без опоры на текст) и ответьте на вопросы.',
              'Lytt til teksten uten å lese, og svar på spørsmålene.', qs, kind='listening',
              audio=lesson_audio(sub, title))


def dictation(key, title, instr_ru, sentences):
    """dictation. sentences: (text, why, [focus words])."""
    segs, key_segs = [], {}
    for i, (text, why, focus) in enumerate(sentences, 1):
        sid = f'd{i}'
        segs.append({'id': sid})
        tokens = [t.strip('.,;:!?«»') for t in text.split()]
        key_segs[sid] = {'text': text, 'why': why,
                         'focus': [{'id': f'{sid}-f{j}', 'wordIndex': tokens.index(w), 'why': ''}
                                   for j, w in enumerate(focus, 1)]}
    return {'key': key, 'template': 'dictation', 'instruction': instr_ru,
            'content': {'audio': {'enabled': True, 'source': 'asset', 'assetId': '', 'title': title},
                        'title': title, 'instruction': 'Lytt og skriv det du hører, setning for setning.',
                        'mode': 'segments', 'language': 'nb', 'segments': segs,
                        'marking': {'caseSensitive': False, 'punctuation': False, 'near': 'flag', 'extraCost': 1},
                        'settings': {'attempts': 3, 'threshold': 80, 'showWordCount': False, 'revealKey': True,
                                     'hints': True}},
            'expectedAnswers': {'segments': key_segs, 'orphans': []}}


# ─── Vocabulary ──────────────────────────────────────────────────────────────
def noun(word, gender, tr, definite, plural=None, def_plural=None):
    g = {'m': 'masculine', 'f': 'feminine', 'n': 'neuter'}[gender]
    props = {'gender': g, 'definite_singular': definite}
    if plural:
        props.update(plural_form=plural, definite_plural=def_plural)
    return {'word': word, 'partOfSpeech': 'NOUN', 'translation': tr, 'grammaticalProperties': props}


def verb(word, tr, present, past, perfect):
    return {'word': word, 'partOfSpeech': 'VERB', 'translation': tr,
            'grammaticalProperties': {'present_tense': present, 'past_tense': past, 'perfect_tense': perfect}}


def adj(word, tr, neuter=None, plural=None):
    w = {'word': word, 'partOfSpeech': 'ADJECTIVE', 'translation': tr}
    if neuter:
        w['grammaticalProperties'] = {'neuter_form': neuter, 'plural_form': plural}
    return w


def other(word, tr, pos='PHRASE'):
    return {'word': word, 'partOfSpeech': pos, 'translation': tr}


# ─── Writing the data files ──────────────────────────────────────────────────
def _load(name):
    p = DATA / name
    return json.loads(p.read_text()) if p.exists() else {}


def _dump(name, data):
    (DATA / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def build(units, patches=()):
    """units: {n: {'vocab': {sub: (title, [words])}, 'exercises': {key: [docs]}, 'pending': {key: [docs]}}}.

    Replaces the unit's keys in exercises.json / exercises.pending.json / vocab.json.
    `patches` are functions (exercises, pending) → None for units whose JSON is edited in place.
    """
    ex, pend, vocab = _load('exercises.json'), _load('exercises.pending.json'), _load('vocab.json')
    for n, unit in units.items():
        for sub, (title, words) in unit.get('vocab', {}).items():
            vocab[sub] = {'title': title, 'words': words}
        for k, docs in unit['exercises'].items():
            ex[k] = docs
        for k, docs in unit.get('pending', {}).items():
            pend[k] = docs
    for patch in patches:
        patch(ex, pend)
    keys = [d['key'] for docs in list(ex.values()) + list(pend.values()) for d in docs]
    dup = {k for k in keys if keys.count(k) > 1}
    if dup:
        raise SystemExit(f'duplicate exercise keys: {sorted(dup)}')

    def by_unit(k):
        m = re.match(r'(\d+)([A-D]?)', k)
        return (int(m.group(1)), m.group(2) or 'Z')
    _dump('exercises.json', {k: ex[k] for k in sorted(ex, key=by_unit)})
    _dump('exercises.pending.json', {k: pend[k] for k in sorted(pend, key=by_unit)})
    _dump('vocab.json', {k: vocab[k] for k in sorted(vocab, key=by_unit)})
    print(f'exercises: {sum(len(v) for v in ex.values())} seeded, '
          f'{sum(len(v) for v in pend.values())} waiting for audio; vocab sections: {len(vocab)}')
