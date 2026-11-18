# Exercises: coverage norm, speaking, essay, AI-ready keys

Read this before writing or auditing a unit's exercises file (`04_oppgaver.md`).
The checks here are run by `scripts/task_audit.py`.

## Contents
1. Owner's requirements (non-negotiable)
2. Coverage norm per unit
3. Platform templates and what each trains
4. Speaking — `read_aloud`
5. Essay — `writing_task`, mode `essay`
6. Keys that make a task AI-ready
7. How free-form tasks are checked
8. Exercise header format
9. Quality rules for closed tasks
10. From the unit to the platform (seed data is the source)

---

## 1. Owner's requirements (non-negotiable)

- **Every unit has graded speaking.** The learner records answers that go to a
  teacher and to the AI stage (§7). An ungraded `speaking-prompt` does
  not count — it may stay as an extra task for a lesson with a teacher.
- **Every unit ends with a short essay on the unit's topic** — trains
  spelling and sentence building in free production. Checked by a teacher,
  with the AI pre-check before it (§7).
- **Every free-form task carries a full key** (§6): the AI reviewers read it
  from the seed (model answer, points, rubric levels), and so does a second
  teacher.

## 2. Coverage norm per unit (4 sub-lessons)

| Axis / goal | Per sub-lesson | Per unit | Templates |
|---|---|---|---|
| Comprehension: details | 1 | — | short_answer, multiple_choice |
| Comprehension: meaning / structure | 1 | — | text_order, highlight_in_text, information_transfer, multiple_choice_group |
| Listening | 1 (audio of the same text or its dialogue) | + 1 dictation | multiple_choice / short_answer with audio, dictation |
| Vocabulary: recognition | 1 | — | multiple_choice, match_pairs, word_bank_gap_fill |
| Vocabulary: recall (no bank) | — | 1–2 | fill_in_blank without bank, translate_to_target |
| Vocabulary: earlier units | — | 1 | sort_into_buckets, match_pairs, word_bank_gap_fill |
| Grammar: own topic | — | 3 stages: choose → transform/build → correct errors | multiple_choice, fill_in_blank, sentence_schema, error_correction |
| Grammar: earlier topics | — | 1 mixed | error_correction, multiple_choice |
| Writing: genre | — | 1–2 | writing_task (letter / retell / picture) |
| **Writing: essay** | — | **exactly 1, last task of the unit** | writing_task, mode `essay` |
| **Speaking: production** | — | **≥ 1** | read_aloud, mode `dialogue` or `monologue` |
| **Speaking: reading aloud** | — | **≥ 1** | read_aloud, mode `read` |
| Speaking: oral comprehension | optional | — | read_aloud `dialogue`, partner = question about the text |

Put the speaking tasks where the unit's situation is spoken anyway (an
interview, a phone call, a stand-up, a demo) — not mechanically one per
sub-lesson. The essay goes last in the grammar module (`G.n`), after the
grammar topic it must use.

**Every row of the table is checked by `task_audit.py`** — a unit with
speaking and an essay but no listening, no recall and no error correction is
not finished. How the audit recognises a row:

| Row | Recognised by |
|---|---|
| Meaning / structure | `text_order`, `highlight_in_text`, `information_transfer`, `multiple_choice_group` or `match_pairs` in the sub-lesson |
| Listening | a task with the field `- Аудио:` in the sub-lesson; one `dictation` in the unit |
| Vocabulary recall | a gap task **without** a `Bruk:` bank — the learner types the word (`word_bank_gap_fill` with `input: free`, or `fill_in_blank`) — or `translate_to_target`, outside the grammar module |
| Earlier units | a task with the field `- Повтор:` (unit ≥ 2): one for vocabulary, one for grammar |
| Grammar stages | in the grammar module: choose (`multiple_choice`) → build (typed gaps without a bank, `sentence_schema`, `translate_to_target`) → `error_correction` |

**Free-form load.** At most **7** free-form tasks (`read_aloud` +
`writing_task`) per unit, and no two of them on the same situation in the
same skill (a negotiation letter *and* a second negotiation letter). Each one
costs a reviewer several minutes per learner; a self-study learner gets only
what the AI stage gives (§7).

**Audio that does not exist yet.** A listening task or a dictation is written
in full (questions, key, transcript) and marked `- Статус: ждёт аудио`; it
lives in `exercises.pending.json` and is not seeded until the lesson is
narrated (§10). The audit counts it as covered and lists it as pending —
say so in the report, do not present the unit as having listening.

## 3. Platform templates

20 types: short_answer, multiple_choice, multiple_choice_group, match_pairs,
fill_in_blank, word_bank_gap_fill, word_bank_fill, text_order,
highlight_in_text, information_transfer, sort_into_buckets, sentence_schema,
error_correction, translate_to_target / translate_*, inflection_table,
dictation, minimal_pairs, read_aloud, writing_task.
`speaking-prompt` is **not** a platform type (no grade, no progress trace).

## 4. Speaking — `read_aloud`

One exercise = 1–6 prompts (`RA_MAX_PROMPTS`), 2–5 rubric criteria, up to 3
takes per prompt, no recording over 180 s. Three modes:

| Mode | What the learner does | Material per prompt | Default length (s) |
|---|---|---|---|
| `read` | reads a passage aloud | text ≤ 90 words + focus words (word + what to listen for) | 15–60, prep 20 |
| `monologue` | speaks on a topic | plan of ≤ 5 points (required / optional), optional picture | 40–120, prep 45 |
| `dialogue` | answers one partner line | situation (one line) + partner's line | 8–40, prep 10 |

Length by level (monologue): A2 30–60 · B1 60–90 · B2 90–120 · C1 120–180.

Writing rules:
- `read`: take the passage from the unit's own text (dialogue lines read
  best). Focus words = A-words of the unit and sounds the learner's L1
  gets wrong (tonelag, *kj/sj*, long/short vowel). A passage that is itself
  key material can later be auto-checked against the transcript.
- `dialogue`: the learner plays a course character in the unit's situation
  (Taras answering Silje at the interview). 3–5 turns that use the unit's
  grammar topic (polite forms, indirect speech…).
- Oral comprehension = `dialogue` whose partner line is a question about the
  text. Short factual answers only — they can later be compared with the key.
- Rubric (default 3–4 criteria, levels 0–3): task fulfilment, pronunciation /
  intelligibility, fluency, language (grammar + vocabulary of the unit).

## 5. Essay — `writing_task`, mode `essay`

| Level | Words | Paragraphs |
|---|---|---|
| A1 | none — use a short message (mode `free`, 30–50) | 1 |
| A2 | 60–100 | 2 |
| B1 | 120–180 | 3 |
| B2 | 180–250 | 3–4 |
| C1 | 250–350 | 4–5 |

The platform default for `essay` is 200–350 — set the range explicitly in
the task, the default fits B2+/C1 only.

- Topic = the unit's theme, personal angle (compare with your country,
  your experience, your opinion) so the essay is not a retelling of the text.
- 3–4 required points (the student's checklist), each with 2–3 keywords.
- Name **≥ 6 A-words** of the unit the learner should use (the rubric's
  lexis criterion reads them) and the unit's grammar topic (`G<n>` from
  the spine) with the form expected.
- Rubric 4 criteria, levels 0–3: Oppgaveløsning (points) · Struktur
  (paragraphs, connectors) · Språklig korrekthet (spelling, word order,
  inflection) · Ordforråd (A-words, register).
- Feedback must be inline (marked words and sentences), not only a score —
  otherwise the essay does not train spelling. Say so in the task's note for
  the reviewer.

## 6. Keys that make a task AI-ready

Every free-form task (read_aloud, writing_task, open short_answer) carries,
in the exercises file:

| Field | read_aloud | writing_task | Why the AI agent needs it |
|---|---|---|---|
| `Режим:` | read / monologue / dialogue | letter / essay / picture / retell / free | picks the check |
| `Объём:` | seconds (min–max, prep) | words (min–max) | length check |
| `Эталон:` | per prompt — what a good answer sounds like (the model's `note`); for `read` — the passage itself | a model text at the target length | compare, show after grading |
| `Принимается:` | for short factual answers — 2–4 acceptable phrasings | — | ASR comparison of closed answers |
| `Пункты:` | plan points (monologue) | required points + 2–3 keywords each | task-fulfilment check |
| `Слова:` | focus words (read) / A-words expected | ≥ 6 A-words expected | lexis criterion |
| `Грамматика:` | spine topic id + expected form | same | language criterion |
| `Критерии:` | table: name · weight · levels 0–3 | same | rubric draft |

Write the descriptors of levels 0–3 concretely ("uses ≥ 2 polite forms
correctly", not "good grammar") — a vague descriptor cannot be applied by a
model or by a second teacher consistently.

## 7. How free-form tasks are checked

The AI reviewers exist (ai-service): `review_draft` drafts a verdict on a
hand-in for the teacher, `voice_review` transcribes and scores `read_aloud`
in mode `read`, and the pre-hand-in rehearsal «Проверить» (`practice`,
`practice_voice`) answers the learner before the hand-in. What a given
learner actually gets is decided by ai-service (payer policy, plan, school
setting) — the document only says what the author *allows*.

- **Seed every free-form task with the AI stage on**: `writing_task`
  `settings.aiStage: true` with `ai.draft: true`; `read_aloud`
  `review.aiStage: true` with `transcript`, `pronunciation`, `draft`. A
  document with the stage off gives a learner without a teacher nothing at all.
- **A teacher still closes open answers.** Free-form tasks must not gate
  progress while waiting for review.
- **Speech recognition on L2 speech errs.** A transcript is evidence for the
  reviewer, never by itself a verdict on open answers. String comparison
  with a template works only for closed answers (`Принимается:`).
- Keep `aiVisibility: 'teacher'` unless the owner decides the learner sees
  the draft before the teacher does.

## 8. Exercise header format

`task_audit.py` reads level-3 headers and the field lines below them:

```markdown
### 1C.6 — Intervjuet: svar Silje `read_aloud`
- Режим: dialogue
- Объём: 10–40 с, подготовка 10 с
- Грамматика: G1 — kunne/ville, «jeg lurte på om»
- Слова: tilbakemelding, code review, holdning
- Критерии:

| Критерий | Вес | 0 | 1 | 2 | 3 |
|---|:-:|---|---|---|---|
| Oppgaveløsning | 2 | svarer ikke på spørsmålet | … | … | svarer fullt, med eksempel |

1. *Situasjon:* Jobbintervju hos Nordly Tech. *Silje:* «Hvorfor søkte du på stillingen?»
   - Эталон: Jeg søkte fordi annonsen passet godt med erfaringen min …
```

Template name in backticks at the end of the header; field labels exactly as
in §6 (author-facing, Russian); content stays in the course language.

## 9. Quality rules for closed tasks

An auto-checked task tells the learner "wrong" with the platform's authority,
so a defect here is worse than a missing task. Read every closed item against
these before it goes to the seed:

1. **Exactly one acceptable option.** If a distractor is also correct
   Norwegian in that sentence («Kan du tenke deg å begynne i august?»), it is
   not a distractor. "More polite", "more natural" is a discussion for a
   teacher, not a key — put such contrasts in `match_pairs` / the grammar text,
   or make the wrong options really wrong.
2. **The module must not contradict itself.** A form marked wrong in one task
   may not be an accepted answer in another, or an example in the grammar text.
3. **The bank word fits the gap as written.** The bank holds the form the
   sentence needs (`kodebasen`, `relasjonsdatabaser`), never the dictionary
   form with a sentence that needs another one.
4. **A gap must not be guessable from what is left.** No gap that is half of a
   fixed pair (`flat [struktur]`, `code [review]`).
5. **Transformations are not `short_answer` with one anchor word.** One
   anchor («litt») passes wrong answers and fails right ones. Use
   `sentence_schema` (word order), `error_correction`, `fill_in_blank` with a
   listed set of accepted forms, or `translate_to_target` with `refs` +
   `require`.
6. **Don't ask for grammar the course has not taught.** A task may *contain* a
   later topic; it may not *require producing* it (indirect speech in unit 1
   when it is the topic of unit 6). Check against `grammatikk_ryggrad.md`.
7. **No sentence in more than two tasks of a module.** Five phrases rotated
   through four tasks train recognition of those five phrases.
8. **`short_answer` keys accept a correct paraphrase.** Anchors are the facts
   (number, name, key noun), with synonyms and inflected forms; run
   `check-short-answer.ts` — it also reports anchors that the question itself
   gives away.
9. **Pronunciation notes are claims about Norwegian** — stress and tone
   notes in `read_aloud` focus words are checked in NAOB before they are
   written, and flagged for the native reviewer.
10. **Facts agree with the story** (dates, sums, names) across the text, the
    prompts and the model answers.

## 10. From the unit to the platform (seed data is the source)

The rich key (why-notes per option, anchors, rubric levels, gap feedback) does
not fit the Markdown, so after a unit is converted **the seed data is the
source of truth for its exercises** and the Markdown is rendered from it:

```
services/content-service/prisma/data/<course>/
├── exercises.json           # seeded
├── exercises.pending.json   # same format, not seeded (waits for audio)
├── lessons/<1A>.md  grammar/<1>.md  vocab.json
services/content-service/prisma/tools/norsk_it_author.py   # authoring helpers + the units' definitions
```

1. Author or change exercises in the authoring script (helpers `mc`, `gap`,
   `sa`, `order`, `errors`, `schema`, `speak`, `write`, …) and run it — it
   rewrites the unit's keys in both JSON files.
2. `python3 scripts/seed_to_md.py <data_dir> <course_dir> [--unit N]`
   regenerates `04_oppgaver.md` in the header format of §8. **Never edit a
   converted unit's `04_oppgaver.md` by hand** — the next render drops the edit.
3. Run the kernel checks, 0 blockers and 0 leaks:
   `npx tsx prisma/tools/check-{short-answer,multiple-choice,multiple-choice-group,match-pairs,writing-task,sentence-schema}.ts --file <course>`.
4. `task_audit.py`, `vocab_audit.py`, `grammar_audit.py` on the course.
5. Seed (`npx tsx prisma/seed-<course>.ts`, stack up with `--env-file .env.dev`).
   A re-seed replaces what was edited in the web editor for this course — ask
   the owner first if anyone has edited it there.

A unit that is not converted yet keeps a hand-written `04_oppgaver.md`; it is
converted whole, not task by task.
