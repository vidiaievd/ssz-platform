// Starter bucket sets and the refusal label, by course language — plan 66 §3.6.
//
// The handoff: "Nothing Norwegian-specific is hard-coded — bucket label sets come from the
// course language pack; the builder offers starter bucket sets by course language" (AC-X7).
// The precedent is plan 52 §3.5 (`sentence_schema` packs in the kernel, chosen by the
// course language) and plan 53 §3.6 (`emptyContent` seeds no Norwegian).
//
// A set is a starting point the author edits, offered as a named card rather than written
// into the document unasked. **No pack for the language → no starter sets** and an empty
// refusal label the author writes themselves; guessing Norwegian for a Ukrainian course is
// the failure this file exists to avoid.

export interface BucketPreset {
  /** Stable, for the builder's i18n key of the card title. */
  id: string;
  buckets: ReadonlyArray<readonly [label: string, rule: string]>;
}

export interface LanguagePack {
  /** ISO 639-1 codes this pack answers for. */
  langs: readonly string[];
  /** «None of these», in the course language. */
  noneLabel: string;
  presets: readonly BucketPreset[];
}

export const PACKS: readonly LanguagePack[] = [
  {
    langs: ['nb', 'nn', 'no'],
    noneLabel: 'Ingen av delene',
    presets: [
      {
        id: 'gender',
        buckets: [
          ['en', 'Hankjønn: en bil, bilen'],
          ['ei', 'Hunkjønn: ei bok, boka'],
          ['et', 'Intetkjønn: et hus, huset'],
        ],
      },
      {
        id: 'verb_class',
        buckets: [
          ['Sterke verb', 'Skifter vokal i preteritum: drikke – drakk'],
          ['Svake verb', 'Får endelse i preteritum: -et, -te, -de, -dde'],
        ],
      },
      {
        id: 'at_aa',
        buckets: [
          ['at', 'Innleder en leddsetning: Jeg vet at han kommer'],
          ['å', 'Står foran infinitiv: Jeg liker å lese'],
        ],
      },
      {
        id: 'register',
        buckets: [
          ['Formell', 'Brukes i brev, på jobb og med fremmede'],
          ['Uformell', 'Brukes med venner og familie'],
        ],
      },
    ],
  },
  {
    langs: ['en'],
    noneLabel: 'None of these',
    presets: [
      {
        id: 'article',
        buckets: [
          ['a', 'Before a consonant sound: a car, a university'],
          ['an', 'Before a vowel sound: an apple, an hour'],
        ],
      },
      {
        id: 'verb_class',
        buckets: [
          ['Regular', 'Past tense ends in -ed: walk – walked'],
          ['Irregular', 'Past tense changes the word: go – went'],
        ],
      },
      {
        id: 'countability',
        buckets: [
          ['Countable', 'Has a plural: one chair, two chairs'],
          ['Uncountable', 'No plural: water, advice'],
        ],
      },
    ],
  },
  {
    langs: ['uk'],
    noneLabel: 'Жодне з цих',
    presets: [
      {
        id: 'gender',
        buckets: [
          ['чоловічий рід', 'Він — мій: стіл, день'],
          ['жіночий рід', 'Вона — моя: книга, ніч'],
          ['середній рід', 'Воно — моє: вікно, море'],
        ],
      },
      {
        id: 'aspect',
        buckets: [
          ['недоконаний вид', 'Що робити? писати, читати'],
          ['доконаний вид', 'Що зробити? написати, прочитати'],
        ],
      },
    ],
  },
  {
    langs: ['ru'],
    noneLabel: 'Ничего из этого',
    presets: [
      {
        id: 'gender',
        buckets: [
          ['мужской род', 'Он — мой: стол, день'],
          ['женский род', 'Она — моя: книга, ночь'],
          ['средний род', 'Оно — моё: окно, море'],
        ],
      },
      {
        id: 'aspect',
        buckets: [
          ['несовершенный вид', 'Что делать? писать, читать'],
          ['совершенный вид', 'Что сделать? написать, прочитать'],
        ],
      },
    ],
  },
];

/** The pack for a course language, or `null` — no starter sets, no refusal label. */
export function packFor(language: string | undefined): LanguagePack | null {
  if (language === undefined) return null;
  const code = language.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return PACKS.find((pack) => pack.langs.includes(code)) ?? null;
}

export function presetsFor(language: string | undefined): readonly BucketPreset[] {
  return packFor(language)?.presets ?? [];
}

export function noneLabelFor(language: string | undefined): string {
  return packFor(language)?.noneLabel ?? '';
}
