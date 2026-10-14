# Norms: recycling, level, course type

These are **starting values**, not laws. They come from SLA research (below)
and from the norsk_it pilot (2026-10). Calibrate per course: if a norm can
only be met by stuffing texts, change the norm in `course.json`
(`near`/`far`) and write down why — don't damage the text.

## Contents
1. Why recycling (research basis)
2. Vocabulary schedule
3. Grammar rhythm
4. Level parameters (A1–C1)
5. Course type adjustments
6. Pilot calibration (norsk_it, B1→B1+, professional)
7. Level reference sources by language

---

## 1. Why recycling

- **Encounters.** Around 8–12 meetings for reliable recognition
  (Nation; Webb 2007); no magic number — the repetition effect is robust
  but depends on *how* the word is met (Uchihara et al. 2019 meta-analysis).
  Productive use needs more than recognition.
- **Varied encounters beat identical ones.** Different form, collocation,
  text type, skill (involvement load — Laufer & Hulstijn; desirable
  difficulties — Bjork). A return in another inflection or another
  situation counts for more than the same sentence again.
- **Expanding intervals.** Same sub-lesson → next ones → a few later →
  periodically to the end. The course gives the baseline rhythm; the
  platform's SRS personalises on top of it.
- **Coverage.** Comfortable reading needs 95–98 % known running words
  (Hu & Nation 2000), so a text can carry only ~2–5 % new words — and old
  words *must* fill the rest.
- **Grammar is not scheduled like words.** Declarative → proceduralised →
  automatic (DeKeyser); learners produce a structure only when ready for it
  (Pienemann, processability). Plan grammar by *sequence* (what it builds
  on) and by *input flood* after the explanation (Schmidt, noticing), and
  contrast it with the nearest older structure on return.
- **Four strands** (Nation): meaning-focused input, meaning-focused output,
  language-focused learning, fluency — fluency material (100 % known) is the
  most forgotten one and the cheapest recycling channel.

## 2. Vocabulary schedule

| Status | Requirement |
|---|---|
| A | in an exercise of its own sub-lesson; back in a text within `near` sub-lessons; twice within `far`; at least once in every later third of the course; ≥ 6 encounters (texts + exercises) |
| R | ≥ 3 encounters, ≥ 1 after its own sub-lesson |
| G | none |
| known A (kjente_ord) | same as A minus the own-exercise rule — they are targets for recycling, not teaching |

Count encounters in three channels: texts, exercises, SRS/training. Prefer
returns in texts (meaning-focused) over exercises.

## 3. Grammar rhythm

| Phase | Requirement |
|---|---|
| Introduction (own unit) | in ≥ 3 of 4 texts, ≥ 6 uses in total |
| Consolidation (next 2 units) | ≥ 2 uses in each |
| Maintenance (to the end) | ≥ 1 use in every later unit |
| Contrast | on return, place it next to the nearest older structure (preteritum vs perfektum, der vs hvor) |

Use before the introduction unit is not an error in courses above A2 —
most topics are familiar and deepened; for A1–A2 it is an error unless glossed.

## 4. Level parameters

| Level | Text length (words) | New words / 100 running words | A-words per sub-lesson (general course) | Avg sentence length | Typical text types |
|---|---|---|---|---|---|
| A1 | 80–150 | ≤ 8 (glossed) | 8–12 | 6–9 | dialogues, signs, short messages |
| A2 | 150–250 | ≤ 6 | 8–12 | 8–11 | dialogues, short narratives, emails |
| B1 | 250–400 | ≤ 5 | 6–10 | 11–15 | narratives, reports, instructions, discussions |
| B2 | 400–600 | ≤ 4 | 5–8 | 14–18 | argument, comparison of positions, abstract topics |
| C1 | 600–900 | ≤ 3 | 4–6 | 16–22 | long argument, implicit meaning, register shifts |

Level is a property of the texts, not of the vocabulary list: if the
measured sentence length, subordination and abstraction do not grow across
the course, the course does not progress a level, whatever its plan says
(the pilot planned B1→B2 and measured flat B1+, see §6).

## 5. Course type adjustments

- **Professional / LSP course** (IT, construction, healthcare): most of the
  domain lexicon is receptive. Expect 2–4 new A-words per sub-lesson and many
  R-words; recycling is easier inside the domain story (same characters,
  same project) than across topics like rights or traditions.
- **General course**: more A-words, more everyday collocations; recycle
  through recurring situations (shop, doctor, work) rather than one plot.
- **Spiral sequel courses** (IT B1+ → IT B2 → IT C1): the lower course's
  word lists become the known-words base of the higher one; repeat its
  topics at the higher level (longer texts, argument) instead of new topics
  only.

## 6. Pilot calibration — norsk_it (B1→B1+, professional, 14 units × 4 texts)

| Metric | Before | After the full procedure |
|---|---|---|
| New words in lists | 637 | 443 (+137 moved to known words, 57 duplicates removed) |
| A-words back in a text within 4 | 22 % | 52 % |
| A-words twice within 8 | 11 % | 34 % |
| A-words in every later third | 20 % | 37 % |
| A-words never seen again | 30 % | 0 % |
| Grammar topics with a weak introduction | 10 of 13 | 0 |

Text growth: +3–28 % per text (about 180 vocabulary + 75 grammar edits).
Lessons: "twice within 8" is hard to reach without stuffing in a
professional B1+ course — use `far: 12` for such courses. The heuristic
matcher misses compounds (`supporthenvendelser`) and irregular forms, so
real recycling is a little higher than reported.

## 7. Level reference sources

- **English:** English Vocabulary Profile and English Grammar Profile
  (Cambridge) — words and structures tagged by CEFR level; use them to
  decide "known at this level" and the grammar inventory of A1–C1 courses.
- **Norwegian:** no equivalent of EVP. Use the platform's own lower-level
  courses as the objective base (seed `services/content-service/prisma/data/<course>/vocab.json`
  and MD courses in `docs/courses/`), the competence goals of *Læreplan i
  norsk for voksne innvandrere*, frequency lists (Norsk ordbank, corpora),
  and mark everything else as "оценка" for the author to confirm.
- Other languages: look for a CEFR-tagged profile first (Profile Deutsch,
  Referentiel FLE…); otherwise follow the Norwegian approach.
