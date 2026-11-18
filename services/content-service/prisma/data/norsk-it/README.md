# Data — «Norsk på jobb — IT»

Content files consumed by `prisma/seed-norsk-it.ts`.

## Layout
Same as `../norsk-b1/`: `lessons/<key>.md`, `grammar/<num>.md`, `vocab.json`
(per text sub-lesson), `exercises.json` (text keys `1A`… and grammar keys `1`…).

`exercises.pending.json` has the same format and is **not seeded**: listening
tasks on the lesson narration (`content.audio.lessonKey`) and dictations
(`content.audio.assetId` empty). They move to `exercises.json` when the
leksjon is narrated and the clips exist.

## Source of truth
- Texts, grammar: the Markdown course in `docs/courses/norsk_it/` (git-ignored);
  `prisma/tools/norsk_it_units.py` copies them here.
- Exercises and word forms: **this directory**, written by
  `prisma/tools/norsk_it_units.py` (helpers in `norsk_it_author.py`). The
  course's `leksjon_NN/04_oppgaver.md` is rendered from here by the skill
  script `seed_to_md.py` — do not edit it by hand.

```
python3 prisma/tools/norsk_it_units.py
python3 ../../.claude/skills/language-course-design/scripts/seed_to_md.py prisma/data/norsk-it ../../docs/courses/norsk_it
for t in short-answer multiple-choice multiple-choice-group match-pairs writing-task sentence-schema; do
  npx tsx prisma/tools/check-$t.ts --file norsk-it; done        # 0 blockers, 0 leaks
npx tsx prisma/seed-norsk-it.ts
```

## Status
Leksjon 1–3: 12 texts, 3 grammar lessons, 80 exercises seeded, 15 waiting for
audio (12 listening + 3 dictations). Leksjoner 4–14 are added to `levels` in
the seed as they are converted.
