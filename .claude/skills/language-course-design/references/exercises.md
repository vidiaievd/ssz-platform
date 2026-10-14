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
7. How free-form tasks are checked (now and next)
8. Exercise header format

---

## 1. Owner's requirements (non-negotiable)

- **Every unit has graded speaking.** The learner records answers that go to a
  teacher (and, later, to an AI agent). An ungraded `speaking-prompt` does
  not count — it may stay as an extra task for a lesson with a teacher.
- **Every unit ends with a short essay on the unit's topic** — trains
  spelling and sentence building in free production. Checked by a teacher
  (later: AI pre-check + teacher).
- **Every free-form task carries a full key** (§6), even while only a
  teacher checks it: the AI agent will be added next and must find the
  material it needs in the seed, without rewriting the course.

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

- **Now:** teacher only, through the review queue. Free-form tasks must not
  gate progress while waiting for review (student without a teacher would be
  stuck).
- **Next (AI agent):** the models already carry the AI stage, switched off:
  `writing_task.settings.ai` (grammar, task, structure, lexis, draft) and
  `read_aloud.review.ai` (transcript, pronunciation, fluency, draft). Order
  of introduction: AI pre-check of essays (text in hand) → speech transcript
  shown to the teacher → AI draft for speech on the transcript → automatic
  verdict only for `read` and closed oral answers.
- **Speech recognition on L2 speech errs.** A transcript is evidence for the
  reviewer, never by itself a verdict on open answers. String comparison
  with a template works only for closed answers (`Принимается:`).

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
