# Data — «Norsk uttale» (pronunciation course, A1 → B1)

Seed-ready form of the course written in `docs/courses/norsk_uttale/` (git-ignored), plan 86 step 12.
**Generated, not edited:** `python3 -I docs/courses/norsk_uttale/tools/to_seed.py` rewrites every file
here from the lessons' Markdown and prints any line it did not understand (exit code 1). Fix the
lesson, not this directory.

## Layout

- `course.json` — the 31 lessons in course order: key `NN`, level (A1/A2/B1), title, sound atoms.
- `lessons/NN.ru.md`, `lessons/NN.uk.md` — the «Lytt» body per explanation language: the locale's
  articulation section of `03_artikulasjon.md`, then the lesson texts of `01_tekster.md` with that
  locale's translations as quotes. Author notes and `Повтор:` lines are not carried over.
- `exercises.json` — `{ "NN": [ExerciseDef] }`. `content` / `expectedAnswers` are the kernel's
  persisted shapes (`@ssz/shared-kernel/read-aloud`, `…/minimal-pairs`). Beside them, for the seed:
  - `targets` — sound atoms (`nb:kj` …) the exercise trains, from the lesson's «Цель:»; G12
    (phrase melody) has no atom, so its exercises have none;
  - `instruction` — the Norwegian instruction of the lesson (the course has no ru/uk instructions);
  - `referenceSource` (`read_aloud`) — where the model reading should come from, as the lesson says;
  - `clipSources`, `clipDialect`, `clipPolicyNote` (`minimal_pairs`) — per word id, the native
    recording id in `recordings/step9/sets/minimal_pairs.tsv` (empty: synthesis is acceptable).

## Status (07.11, step 12.3)

139 `read_aloud` (128 read, 11 dialogue; 625 prompts) and 16 `minimal_pairs`. Seeded by `prisma/seed-norsk-uttale.ts` (step 12.2).
`npx tsx prisma/tools/check-norsk-uttale.ts`: no blockers on `read_aloud`; the data's `minimal_pairs`
carry no clips by design. Clips are made per environment by `prisma/tools/clip-norsk-uttale.ts`
(piper, written into the seeded rows; the seed keeps them), after which a reseed places every set
the kernel finds ready. The four sets of `tts: 'no'` contrasts (`uttale-06-1`, `uttale-15-1` kj/sj;
`uttale-09-1`, `uttale-17-1` tone) wait for native recordings and stay out of their modules.
