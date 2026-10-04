// Language packs for `dictation` — plan 68 §3.8, SPEC_data_model §3, AC-X8.
//
// Nothing Norwegian lives in code. The prototype hard-codes four things that belong to a
// language, and each is data here:
//
//   instruction — the standing instruction a new exercise starts with;
//   fold        — letters that are letters of the alphabet, not decorated ones, with the
//                 spelling a learner writes instead (`å` → `aa`). The diff never folds them
//                 when comparing; the classifier uses the table only to *name* the error
//                 «diacritic» and to keep it from ever counting as a slip (DECISIONS §2);
//   accepted    — spellings the language genuinely accepts for a letter. A pack declaring
//                 `æ: ['ae']` makes `vaere` equal `være` with no code change. Empty for `nb`;
//   sentenceEnd — the characters that end a sentence, for *Paste and split*;
//   demo        — rewrites that turn a correct sentence into a plausible wrong answer for
//                 the «Try a student answer» panel of step 3.
//
// The server needs the fold table to grade, so the pack is named by the document itself
// (`content.language`, decision Q2-A). **No pack for the language → nothing folds**, no
// instruction, a line break is the only sentence break: the dictation still grades, it only
// names fewer errors.
//
// The en/uk/ru instructions were written by a non-native speaker (plan 67 precedent).

export interface DemoRewrite {
  /** A regular-expression source, applied with the `gu` flags plus `i` when `ignoreCase`. */
  from: string;
  to: string;
  ignoreCase?: boolean;
}

export interface LanguagePack {
  /** ISO 639-1 codes this pack answers for. */
  langs: readonly string[];
  instruction: string;
  /** Lower-case letter → the lower-case spelling a learner writes for it instead. */
  fold: Readonly<Record<string, string>>;
  /** Lower-case letter → spellings accepted as that letter. */
  accepted: Readonly<Record<string, readonly string[]>>;
  sentenceEnd: string;
  demo: readonly DemoRewrite[];
}

export const PACKS: readonly LanguagePack[] = [
  {
    langs: ['nb', 'nn', 'no'],
    instruction: 'Hør på opptaket og skriv setningene slik du hører dem.',
    fold: { å: 'aa', ø: 'oe', æ: 'ae' },
    accepted: {},
    sentenceEnd: '.!?…',
    demo: [
      { from: 'kj', to: 'sj', ignoreCase: true },
      { from: 'å', to: 'aa' },
      { from: '([bdfglmnprstv])\\1', to: '$1', ignoreCase: true },
    ],
  },
  {
    langs: ['en'],
    instruction: 'Listen to the recording and write the sentences as you hear them.',
    fold: {},
    accepted: {},
    sentenceEnd: '.!?…',
    demo: [{ from: '([bdfglmnprstv])\\1', to: '$1', ignoreCase: true }],
  },
  {
    langs: ['uk'],
    instruction: 'Прослухайте запис і запишіть речення так, як ви їх чуєте.',
    fold: {},
    accepted: {},
    sentenceEnd: '.!?…',
    demo: [],
  },
  {
    langs: ['ru'],
    instruction: 'Прослушайте запись и запишите предложения так, как вы их слышите.',
    fold: {},
    accepted: {},
    sentenceEnd: '.!?…',
    demo: [],
  },
];

/** The pack for no language: nothing folds, nothing is accepted, a line break splits. */
export const EMPTY_PACK: LanguagePack = {
  langs: [],
  instruction: '',
  fold: {},
  accepted: {},
  sentenceEnd: '',
  demo: [],
};

export function packFor(lang: string | null | undefined): LanguagePack | null {
  const code = (lang ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return PACKS.find((p) => p.langs.includes(code)) ?? null;
}

/** The pack a document grades with — `EMPTY_PACK` where its language has none. */
export function packOf(lang: string | null | undefined): LanguagePack {
  return packFor(lang) ?? EMPTY_PACK;
}

export function instructionFor(lang: string | null | undefined): string {
  return packFor(lang)?.instruction ?? '';
}
