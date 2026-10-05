// Paradigm packs — the columns of an inflection table belong to the language, not the code.
//
// Source: IT_PACKS in the handoff's data.jsx (docs/design/activity-specs/
// 04_design_handoff_inflection_table/), ported field for field, plus what the platform needs
// that the prototype hard-coded elsewhere (plan 69 §3.7):
//
//   pos        the course dictionary's part of speech — the Prisma enum *name*, which is what
//              the dictionary endpoint returns (`prisma-mapped-enum-trap`);
//   lemma      how the row's lemma is spelt from a dictionary entry: `{a}` is the article the
//              entry's gender takes, `{w}` the dictionary word;
//   dict       per slot, how the suggested form is spelt from the entry: `{w}` the word,
//              `{p:<key>}` one of its `grammaticalProperties`. Suggestions, never a key
//              (DECISIONS §3);
//   stem       the stem the bank's distractors are built on (decision Q2-A): the lemma with
//              its article stripped, and for `drop-e` one final `e` dropped as well;
//   endings    per slot, plausible wrong forms — `{s}` is the stem, `{w}` the lemma without its
//              article. The prototype shipped a fixed Norwegian list of five words instead;
//   swaps      per slot, endings the standard lets stand for each other — a key ending in the
//              first is just as right ending in the second (`boka` / `boken`, `husene` / `husa`,
//              `levde` / `levet`). Never offered as a distractor: a learner who knows the
//              variant would be fined for it as a false positive;
//   elide      letters written once where the stem ends and the ending begins with them
//              (`eple` + `en` → `eplen`, not `epleen`);
//   implausible  spellings that are no word of the language (`søsterer`): a distractor the eye
//              rejects unread turns the bank into elimination, so it is not offered at all;
//   demo       the example pair and reason the builder shows in step 3, so no Norwegian
//              reaches the code (README «Language»).
//
// DECISIONS §1: the author picks a paradigm and may switch slots off; they cannot rename,
// reorder or add one. Slot order here is canonical, and `atom` is the pack's code for the rule
// a column practises — what it becomes on the platform is decision Q1-B of plan 69 (the
// shared targets panel), so it is shown, not resolved.
//
// **These live in the kernel rather than behind an endpoint** — plan 52 Q2, plan 68 §3.8.
// The letters that must never fold are not repeated here: they are the dictation pack's
// `fold` (plan 69, deviation 17), one table of letters per language.

export interface Slot {
  /** Stable — part of every cell key (`rowId:slotId`). */
  id: string;
  /** Column heading, in the target language. */
  label: string;
  /** Abbreviation for chips and the reader card. */
  short: string;
  /** The pack's code for the rule this column practises (DECISIONS §1). */
  atom: string;
  /** Suggested form from a dictionary entry; absent where the dictionary has nothing. */
  dict?: string;
  /**
   * Distractor patterns for the bank: `{s}` is the row's stem, `{w}` its lemma without the
   * article. Classic errors only — the wrong gender's ending, a regular ending on an irregular
   * word — never a variant the standard allows (see `swaps`).
   */
  endings: readonly string[];
  /** Interchangeable endings of this slot, `[from, to]`: a key ending in `from` is right in `to` too. */
  swaps?: readonly (readonly [string, string])[];
}

export interface Paradigm {
  id: string;
  label: string;
  /** Heading of the lemma column — «Ordbokform». */
  lemmaLabel: string;
  /** Placeholder of a typed lemma — «en jobb». */
  lemmaHint: string;
  /** `PartOfSpeech` enum name in the course dictionary. */
  pos: 'NOUN' | 'VERB' | 'ADJECTIVE';
  /** The row's lemma from a dictionary entry. */
  lemma: string;
  stem: 'lemma' | 'drop-e';
  slots: readonly Slot[];
}

export interface ParadigmPack {
  id: string;
  /** ISO 639-1 codes the pack serves. */
  langs: readonly string[];
  label: string;
  version: string;
  /** The standing instruction's placeholder in step 1. */
  instruction: string;
  /** Articles the dictionary's `gender` property takes, and what a lemma may start with. */
  articles: Readonly<Record<string, string>>;
  /** Words stripped from the front of a lemma before stemming: articles, the infinitive mark. */
  particles: readonly string[];
  /** Letters written once at the seam of stem and ending. */
  elide: readonly string[];
  /** Letter sequences no generated distractor may contain — they spell no word. */
  implausible: readonly string[];
  /** Step 3's placeholder reason and the warning's example pair (asked / written). */
  demo: { why: string; asked: string; wrote: string };
  paradigms: readonly Paradigm[];
}

export const PACKS: readonly ParadigmPack[] = [
  {
    id: 'nb-core',
    langs: ['nb', 'no'],
    label: 'Norsk bokmål · kjernepakke',
    version: '2.4',
    instruction: 'Fyll ut bøyingen.',
    articles: { masculine: 'en', feminine: 'ei', neuter: 'et' },
    particles: ['en', 'ei', 'et', 'å'],
    elide: ['e'],
    // `søster` + `er`, `lærer` + `erne`: a nominal in -er does not take -er again. `kast` + `te`:
    // a stem in -st takes -et, and nobody writes three consonants there.
    implausible: ['erer', 'stt'],
    demo: { why: 'Hunkjønn i bokmål: ei bok → boka.', asked: 'bøkene', wrote: 'bøker' },
    paradigms: [
      {
        id: 'noun',
        label: 'Substantiv',
        lemmaLabel: 'Ordbokform',
        lemmaHint: 'en jobb',
        pos: 'NOUN',
        lemma: '{a} {w}',
        stem: 'lemma',
        slots: [
          {
            id: 'indefSg',
            label: 'Ubestemt entall',
            short: 'ub. ent.',
            atom: 'nb.noun.indef.sg',
            dict: '{w}',
            endings: [],
          },
          {
            id: 'defSg',
            label: 'Bestemt entall',
            short: 'best. ent.',
            atom: 'nb.noun.def.sg',
            dict: '{p:definite_singular}',
            // The wrong gender. `-a` is not offered: on a feminine it is the key or its variant,
            // on a masculine or neuter it reads as a plural or a preterite, not as an error here.
            endings: ['{s}en', '{s}et'],
            // Feminines take either in bokmål.
            swaps: [
              ['a', 'en'],
              ['en', 'a'],
            ],
          },
          {
            id: 'indefPl',
            label: 'Ubestemt flertall',
            short: 'ub. fl.',
            atom: 'nb.noun.indef.pl',
            dict: '{p:plural_form}',
            // A regular plural on a word that is not (`boker`, `huser`), and the bare stem.
            endings: ['{s}er', '{s}'],
          },
          {
            id: 'defPl',
            label: 'Bestemt flertall',
            short: 'best. fl.',
            atom: 'nb.noun.def.pl',
            dict: '{p:definite_plural}',
            endings: ['{s}ene', '{s}erne'],
            // Neuters take `-a` beside `-ene` (`husa`).
            swaps: [
              ['ene', 'a'],
              ['a', 'ene'],
            ],
          },
        ],
      },
      {
        id: 'verb',
        label: 'Verb',
        lemmaLabel: 'Infinitiv',
        lemmaHint: 'å søke',
        pos: 'VERB',
        lemma: 'å {w}',
        stem: 'drop-e',
        slots: [
          {
            id: 'inf',
            label: 'Infinitiv',
            short: 'inf.',
            atom: 'nb.verb.inf',
            dict: 'å {w}',
            endings: [],
          },
          {
            id: 'pres',
            label: 'Presens',
            short: 'pres.',
            atom: 'nb.verb.pres',
            dict: '{p:present_tense}',
            // The present is the lemma plus `-r` almost without exception; the one plausible slip
            // is `-er` on a short verb (`boer`). On an `-e` verb the seam folds it into the key.
            endings: ['{w}er'],
          },
          {
            id: 'pret',
            label: 'Preteritum',
            short: 'pret.',
            atom: 'nb.verb.pret',
            dict: '{p:past_tense}',
            // The other weak classes, and a weak ending on a strong verb (`skrivte`).
            endings: ['{s}et', '{s}te', '{s}de'],
            // `kastet` / `kasta`, `levde` / `levet`.
            swaps: [
              ['et', 'a'],
              ['a', 'et'],
              ['de', 'et'],
            ],
          },
          {
            id: 'perf',
            label: 'Presens perfektum',
            short: 'perf.',
            atom: 'nb.verb.perf',
            dict: 'har {p:perfect_tense}',
            // `har …d` is left out: on most stems it spells a cluster no learner writes.
            endings: ['har {s}et', 'har {s}t'],
            swaps: [
              ['et', 'a'],
              ['a', 'et'],
              ['d', 'et'],
            ],
          },
        ],
      },
      {
        id: 'adj',
        label: 'Adjektiv',
        lemmaLabel: 'Grunnform',
        lemmaHint: 'stor',
        pos: 'ADJECTIVE',
        lemma: '{w}',
        stem: 'lemma',
        slots: [
          // The course dictionary holds neuter and plural forms of adjectives, not the degrees:
          // a pulled adjective arrives with the positive only (plan 69 §8, item 4).
          {
            id: 'pos',
            label: 'Positiv',
            short: 'pos.',
            atom: 'nb.adj.pos',
            dict: '{w}',
            endings: [],
          },
          {
            id: 'comp',
            label: 'Komparativ',
            short: 'komp.',
            atom: 'nb.adj.comp',
            // A regular degree on an irregular adjective (`godere`) and the periphrastic one on a
            // short adjective (`mer fin`). `-are` is nynorsk, not an error a bokmål learner makes.
            endings: ['{s}ere', 'mer {s}'],
          },
          {
            id: 'sup',
            label: 'Superlativ',
            short: 'sup.',
            atom: 'nb.adj.sup',
            endings: ['{s}est', 'mest {s}'],
          },
        ],
      },
    ],
  },
];

/** The pack serving a course language, or `null` — and then nothing can be authored (Q5-A). */
export function packFor(lang: string | null | undefined): ParadigmPack | null {
  if (!lang) return null;
  const code = lang.toLowerCase().split(/[-_]/)[0] ?? '';
  return PACKS.find((p) => p.langs.includes(code)) ?? null;
}

/** A pack by its id — what a document records. */
export function packById(id: string | null | undefined): ParadigmPack | null {
  return PACKS.find((p) => p.id === id) ?? null;
}

/** The step 1 placeholder for a course language; empty where there is no pack. */
export function instructionFor(lang: string | null | undefined): string {
  return packFor(lang)?.instruction ?? '';
}
