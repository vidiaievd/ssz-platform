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
- **Leksjon 1** — fully authored (texts 1A–1D, grammar 1, vocab 1A/1B/1C, 43 exercises
  across 1A/1B/1C + grammar pool). Validated against the live Ajv template schemas.
- **Leksjoner 2–10** — skeleton: real titles + placeholder text/grammar bodies, no
  vocab/exercises yet. Source drafts ready in `docs/ny_i_norge/B1/leksjon_02..10`.

Exercises use only the 8 existing templates. The `fill_in_blank` rationale-matrix
(B1_kursplan.md §1.1) is NOT seeded yet — G.1 is a plain fill_in_blank until that
feature ships.
