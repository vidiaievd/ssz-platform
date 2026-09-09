# Data — Norsk B1 course

Content files consumed by `prisma/seed-norsk-b1.ts`. Source drafts live in
`docs/ny_i_norge/B1/` (repo root); this directory holds the seed-ready form.

## Layout
- `lessons/<key>.md` — reading text body per sub-lesson (keys: `1A`,`1B`,`1C`,`1D` … `10D`).
- `grammar/<num>.md` — grammar lesson body per leksjon (keys: `1` … `10`).
- `vocab.json` — vocabulary lists keyed per text sub-lesson (`1A`,`1B`,`1C`, …).
- `exercises.json` — exercises keyed per practice section: text keys (`1A`,`1B`,`1C`, …)
  and grammar keys (`1` … `10`; grammar exercises are also wired into the grammar
  rule's practice pool).

## Content-driven sections (per leksjon)
The seed adds sections only for the data that exists, so leksjoner fill in
incrementally with no code change:
- `vocab.json[key]` present → module `key` gets a **Nye ord** section.
- `lessons/key.md` present → **Tekst** section (else a "Innhold kommer snart" placeholder).
- `exercises.json[key]` present → **Øvelser** section (text key on the sub-lesson,
  grammar number on the "Grammatikk og øvelser" module).
- `grammar/num.md` present → grammar body (else placeholder).

## Status
**All 10 leksjoner fully authored.** 40 lesson texts, 10 grammar lessons, 29 vocab
sections (462 words), 421 exercises — all validated against the live Ajv template
schemas extracted from `seed.ts` (0 invalid), no duplicate exercise keys.

Per-template breakdown: short_answer 138, fill_in_blank 128, multiple_choice 112,
match_pairs 12, writing_task 11, sentence_schema 7, word_bank_gap_fill 6,
translate_to_target 2, multiple_choice_group 2, text_order 1, error_correction 1,
translate_from_target 1.

The total is lower than the 442 this file used to claim because merges replaced runs
of single-blank drills with one block each (see below) — no exercise was lost.

Every `fill_in_blank` exercise carries exactly one blank (`___1___`), matching what
the web runner's `FillBody`/`FillSolver` support today (single-blank only, per
2026-07-19 decision — see B1_kursplan.md and memory norsk-b1-course-plan). The
rationale matrix (B1_kursplan.md §1.1) is authored per blank under
`expectedAnswers…blanks[].rationale`; so far only leksjon 1's grammar drill uses it,
and it can be added to any other blank incrementally.

### Block drills (`word_bank_fill`)

Leksjon 1's grammar drill on `at` / `om` / question words was seeded as ten separate
`b1-g1-fib-*` exercises — one printed workbook task cut into ten runner cards, each
checked on its own. It is now a single `b1-g1-wbf-01` block: shared bank, ten
sentences, one check, per-blank grading and per-blank rationale. Because the same
bank word answers several blanks there, its content sets `reusable_words: true`,
which turns off the player's "spent word" dimming.

1A's vocabulary drill (`b1-1a-wbf-02`, formerly `b1-1a-fib-01…05`) is the same merge
with the other presentation: its content sets `input_mode: "select"`, so each blank
is a dropdown holding the whole bank instead of a strip of tappable chips above the
sentences. Grading is identical — the flag only changes how a blank is answered.
Chips suit a long drill where the bank is worth reading as a set; a dropdown suits a
short one where hunting for the armed blank is busywork.

`prisma/tools/merge-fill-runs.ts` performs this conversion. It merges only runs of
neighbouring single-blank `fill_in_blank` exercises that agree on bank, instruction,
hint and explanation; run it without `--write` first to see what it would do. It
always emits chips mode — add `input_mode` by hand afterwards. 20 further runs across
the course are eligible (5–6 exercises each) but are still unconverted — convert a
group at a time so each can be checked in the player.

### Question blocks (`multiple_choice_group`)

The same argument applies to runs of `multiple_choice`: a printed Riktig/Galt table
is one task, not four. 1A's `b1-1a-rg1…4` are now `b1-1a-mcg-01` — the four
statements share one `content.options` pair, so the player lays them out as a table
with a radio pair per row and checks the block once. `b1-1a-mean1…3` are now
`b1-1a-mcg-02`, where each question carries its own `options` and the player stacks
them as cards. Both shapes are the same template; the layout follows from where the
options live. Per-question `expectedAnswers.items[].explanation` is shown next to
the question it belongs to once the answers are unlocked.

No conversion tool for these yet — the remaining `multiple_choice` runs in leksjoner
2–10 are still one exercise per question.

### Question sets (`multiple_choice`)

Leksjon 1's own two runs are no longer among them. Plan 53 rewrote `multiple_choice`
itself into a **set of questions answered one at a time**, and leksjon 1 is the reseeded
lesson: `b1-g4-mc1…mc5` are now the set `b1-g4-mc`, and `b1-1c-rg1…rg5` the set
`b1-1c-rg`. The five riktig/galt statements became one `multiple_choice` set rather than
a `multiple_choice_group`: they do not share a column, they merely share their two
options (plan 53 §3.7).

Both sets carry what the old form could not hold at all — a rule behind the right answer
on every question (`expectedAnswers.questions[].why`, required at publication) and a
rebuttal behind every wrong option (`…questions[].options[optionId]`), which is what the
student is shown when they pick it. The key is a question id → option id map in
`expectedAnswers`; the content column holds no trace of which option is right, so there
is nothing there for the student projection to forget to strip.

`prisma/tools/check-multiple-choice.ts` runs the kernel over these documents: it reports
undeliverable questions, keys pointing at options that do not exist, questions with no
rule, and anything of the key that reaches the student. It also prints the distractor
audit, which flags every riktig/galt question as a coin toss — correctly, and by
decision (plan 53 §8 Q6). This course's other 110 `multiple_choice` exercises stay on
the old single-question form and are counted and skipped.

Exercise key scheme: text sub-lessons use `b1-{leksjon}{letter}-{type}-{n}` (e.g.
`b1-3b-fib-02`); grammar-module exercises for leksjon 1 use `b1-g{subsection}-*`
(g1–g5, tied to the G.1–G.5 subsections in its source doc), while leksjoner 2–10 use
`b1-gr{leksjon}-*` (`gr`, not `g`) specifically to avoid colliding with leksjon 1's
scheme — keep using `gr{N}` for any future grammar exercises.

Vocab note: leksjon 10's "Nye ord" doc combines 10A+10B under one heading and
10C+Les-og-lytt under another; only `vocab['10A']` and `vocab['10C']` exist as a
result — module 10B has no Nye ord section (same pattern as the D-suffix "Les og
lytt" modules, which are text-only).

Module `10D`, `9D`, etc. ("Les og lytt") are text-only (no vocab/exercises section),
same as `1D`.
