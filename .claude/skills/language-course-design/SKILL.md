---
name: language-course-design
description: Create, review or extend foreign-language courses written as Markdown (texts, word lists, grammar, exercises per unit — e.g. docs/courses/norsk_it, norsk_drift, norsk_bygg, future English courses) so that new vocabulary and grammar are systematically recycled in later texts with a planned rhythm and match the CEFR level (A1–C1). Use this skill whenever the user asks to write a new course or unit, review/audit a course, check whether words or grammar "repeat", decide what is new vs already known, split or level a course, add or audit exercises (coverage per unit, graded speaking via read_aloud, a unit essay, AI-ready answer keys), or build a parallel course in another language — even if they don't say "recycling" or "audit".
---

# Language course design: recycling vocabulary and grammar

A course works when what was taught keeps coming back: new words reappear in
later texts at growing intervals, a grammar topic floods its own unit and
then returns in every later one, and texts stay inside the level's
budget of new material. This skill turns that into explicit data (word
statuses, known-words file, grammar spine), measures it with scripts, and
fixes gaps with small, natural edits — in batches the author reviews.
It also holds the exercise standard: every unit trains every skill, has
graded speaking and ends with an essay, and every free-form task carries a
key complete enough for the coming AI reviewer.

Read `references/formats.md` before touching course files and
`references/norms.md` before judging numbers; read
`references/exercises.md` before writing or auditing exercises. Scripts are in `scripts/`
(standard-library Python, nothing to install):

| Script | What it does |
|---|---|
| `vocab_audit.py <course> [--json out.json]` | recycling metrics for A/R/known words + integrity lists |
| `grammar_audit.py <course> [--hits Gn]` | grammar topic uses per unit vs the rhythm norm; `--hits` shows matches |
| `make_report.py <course> <out.json> <summary.txt>` | regenerates `AUDIT_recycling.md` below its hand-written header |
| `base_overlap.py <course> <base…>` | entries already present in lower-level courses (seed vocab JSON or MD course dirs) |
| `task_audit.py <course> [--unit N]` | exercises per template, graded speaking / reading aloud / essay per unit, missing AI-ready key fields |

## Working agreements with this user

- Work in small steps; after each step stop, report numbers and what to
  read, and wait for confirmation (project convention).
- `docs/` is git-ignored: **copy the course to the scratchpad before any
  bulk edit** — there is no other undo.
- Course text in the target language needs native review later; say which
  edits are most worth checking rather than claiming they are perfect.
- Reports and explanations to the user are in Russian; course content stays
  in its own language.
- **Speaking and an essay in every unit are required by the owner**, not
  optional extras (exercises.md §1). Free-form tasks are checked by a
  teacher today; an AI agent is the next stage of the app — write keys
  (model answers, points with keywords, concrete rubric levels) as if the
  model were already reading them.

## Mode A — review an existing course

1. **Read the course.** Plan file, one full unit, the grammar files'
   headings. Measure the texts (length, sentence length, subordination) and
   compare with the declared level (norms.md §4). A flat curve means the
   level claim is wrong — raise it with the user before anything else; the
   fix may be repositioning or a sequel course, not edits.
2. **Statuses.** Add the `Статус` column to every word list and classify
   A/R/G (formats.md §2). Criterion for A: *would the learner need to say
   or write this in the situations the course trains?* Domain-specific but
   rare-to-produce words are R; text-bound details are G. Duplicates inherit
   the status of the first listing. Ask the user to review the A list.
3. **Integrity cleanup.** Run `vocab_audit.py`. Remove re-listed entries;
   for "used early" entries open the context of the early occurrence and
   move the entry to that sub-lesson **only** if it is the same word in the
   same sense — the matcher confuses neighbours (lov/love, delta/delt,
   løse/løs), senses (modell: branching model vs ML model) and compounds.
   Record the false positives in the report header.
4. **Known words.** Run `base_overlap.py` against lower-level courses, then
   add an expert pass for general vocabulary of the lower level that the
   base courses happen not to contain. Move all of these to the known-words
   file, keeping status and first occurrence; keep words used in a **new
   meaning** as new. Mark expert picks as "оценка" for the user to confirm.
5. **Recycling plan, in batches of ~3 units.** For each batch list the
   A-words (new and known) that have no return in the batch window, newest
   gaps first, then second returns of early words. Edit texts (see *Editing
   rules*), add exercise items for A-words without one, then re-run the
   audit and report before/after numbers. Typical density: 2–5 inserted
   phrases per text.
6. **Grammar spine.** Extract one topic per unit from the grammar files,
   write `grammatikk_ryggrad.md` with markers, validate markers with
   `--hits`, run `grammar_audit.py`. Fix weak introductions first (the own
   unit must show the structure in meaning), then consolidation and
   maintenance gaps — same batch discipline.
7. **Exercises.** Run `task_audit.py`, compare each unit with the coverage
   norm (exercises.md §2). Per unit, in this order: graded speaking
   (`read_aloud` in the unit's spoken situation + one `read`), the essay
   (last task of the grammar module), then missing axes. Rewrite existing
   free-form tasks into the field format (§8) instead of adding parallel
   ones. One unit per step — the author checks the Norwegian.
8. **Report.** Keep the hand-written "what was done" header of
   `AUDIT_recycling.md` current; regenerate the rest with `make_report.py`;
   save the grammar audit output to `AUDIT_grammatikk.md`.

## Mode B — create a new course (or a parallel one in another language)

Plan the recycling *before* writing texts — retrofitting cost the pilot
about 250 edits.

1. **Frame.** Level span, course type (general / professional / sequel),
   learner profile, number of units × texts. Pick the known-words base:
   lower courses on the platform, plus a CEFR profile when the language has
   one (English: English Vocabulary Profile / English Grammar Profile).
2. **Syllabus with explicit cores.** For every sub-lesson: topic, text
   genre, the A/R list (respect norms.md §4–5 counts), and for every unit
   one grammar topic with its prerequisites. Write the grammar spine and
   create the empty word lists with statuses now. Show the user the
   syllabus before writing texts.
3. **Write unit by unit with a budget.** Before each text, list (a) its own
   new words, (b) A-words due for return by the schedule, (c) grammar
   topics in introduction / consolidation / maintenance phase. Write the
   text to carry them naturally — inside the story, not as a word list.
4. **Audit after every unit** with all three scripts; fix before moving on.
   Write the exercises in the same pass: own-sub-lesson item for every
   A-word, the coverage norm of exercises.md §2 (speaking + essay
   included), keys in the field format of §6/§8.
5. **Parallel course in another language.** Reuse the syllabus structure and
   story, not translations: re-derive cores and grammar topics for the new
   language and level, set `lang` and file names in `course.json`, and use
   that language's level reference.

## Editing rules (learned the hard way)

- **One natural phrase, inside the story.** A recycled word enters as
  something a character would say or do there. If it can't, skip the word
  in this text — there are other texts. Keep text growth around ≤ 15 % per
  text and within the level's length range.
- **Never use a word before its introduction.** Check the batch's inserts
  against later word lists (the audit's `used_early` list catches it — rerun
  after every batch).
- **Exercise keys quote the text.** After changing a sentence, grep the
  exercises file for it; update the key, or leave the quoted sentence intact
  and add the new structure next to it.
- **Characters don't know they are in a textbook.** No "as in lesson 5",
  "the Git lesson" inside dialogue or narration.
- **Don't edit for the matcher.** A false positive (compound word, other
  sense) is explained in the report, not "fixed" in the text.
- **Grammar inserts change syntax** — they are more visible than word
  inserts. Prefer rephrasing an existing sentence into the target structure
  over adding a new one.
- **Free-form keys quote the unit.** An essay's `Слова:` are A-words of
  this unit, its `Грамматика:` is this unit's spine topic; a `dialogue`
  prompt reuses the unit's situation and characters.
- **Norms serve the text.** When a norm can only be met by stuffing, relax
  it in `course.json` and record the reason (norms.md §6).

## Report template (end of each step)

```
Шаг: <what was done, which units>
Цифры: <metric — before → after> (table)
Не по плану: <growth over budget, matcher artefacts, keys fixed>
Что прочитать: <links to the changed files / most visible edits>
Дальше: <next step, one recommendation>
```
