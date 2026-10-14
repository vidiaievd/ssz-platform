# Data — «Norsk på jobb — IT»

Content files consumed by `prisma/seed-norsk-it.ts`. The source course is
Markdown in `docs/courses/norsk_it/` (git-ignored); this directory holds the
seed-ready form, generated from it and validated against the live template
schemas and the shared-kernel `issues()` checks (0 blockers).

## Layout
Same as `../norsk-b1/`: `lessons/<key>.md`, `grammar/<num>.md`, `vocab.json`
(per text sub-lesson), `exercises.json` (text keys `1A`… and grammar keys `1`…).

## Status
Leksjon 1 only: 4 texts, 1 grammar lesson, 53 words, 28 exercises —
short_answer 6, multiple_choice 5, multiple_choice_group 3, match_pairs 2,
word_bank_gap_fill 4, writing_task 4 (free, letter ×2, essay), read_aloud 4
(dialogue ×3, read ×1). Leksjoner 2–14 are added to `levels` in the seed as
they are converted.
