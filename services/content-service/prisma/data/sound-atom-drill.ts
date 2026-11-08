// Drill material of the scored `sound` atoms (plan 86, step 13.2) — data of seed-sound-atoms.ts,
// read by the pronunciation session of exercise-engine (step 13.4) through
// `GET internal/sound-atoms/drill`.
//
// Only the scored families: a session judges each take by ai-service's measurement, and the
// unscored ones (retroflex, schwa, r) are never measured. Per family:
//   - `words` — about fifteen common words holding the sound in a stressed syllable (Q29 C). Every
//     one is checked against the pronunciation lexicon by prisma/tools/sound-drill.ts: the word
//     is in it and its sounds include one the family is scored on in a single word (`symbols.word`).
//     The session says each in the carrier frame «Nå sier jeg … igjen.» of its reference clip.
//   - `pairs` — only `vowel_length` (long — short) and `tone` (toneme 1 — toneme 2): the contrast
//     is the point, so they are heard and said together. The short member of a length pair is not
//     scored by itself (Azure does not judge short vowels, plan 88 §0.5b); the check exempts it.
//   - `diagnostic` — the one word the cold start says for this family (§5.5a): one word per
//     family, said once, before any card exists. Chosen to hold no other scored family where
//     possible, so a weak result is not blamed on a neighbour.
// Phrases are not written here: they are the course's own short lines, picked by the same tool
// into sound-drill-phrases.json.
//
// `symbols` are the NoFAbet symbols ai-service scores for the family in each context — a copy of
// the thresholds in ai-service's `nb-sounds.data.ts`, kept equal by a test there
// (`sound-atom-catalog.consistency.spec.ts`). `fluent: []` = the family is not scored in running
// speech, so it gets no phrases (vowel length, §0.5b; the toneme is checked on words only).

export interface SoundAtomDrill {
  symbols: { word: string[]; fluent: string[] };
  words: string[];
  pairs: Array<[string, string]>;
  diagnostic: string;
}

/** Keyed by `soundAtomKey(language, family)`; exactly the scored atoms of sound-atoms.ts. */
export const SOUND_ATOM_DRILL: Readonly<Record<string, SoundAtomDrill>> = {
  'nb:kj': {
    symbols: { word: ['KJ'], fluent: ['KJ'] },
    words: [
      'kjøre',
      'kino',
      'kirke',
      'kjøkken',
      'kyss',
      'kjole',
      'kjenne',
      'kjæreste',
      'kjøpe',
      'kilo',
      'kylling',
      'kjøtt',
      'kjekk',
      'kinn',
      'kjenning',
    ],
    pairs: [],
    diagnostic: 'kjenne',
  },
  'nb:sj': {
    symbols: { word: ['SJ'], fluent: ['SJ'] },
    words: [
      'sju',
      'skjorte',
      'ski',
      'stasjon',
      'skje',
      'sjø',
      'sjef',
      'skjønn',
      'skjema',
      'sjokolade',
      'informasjon',
      'skjære',
      'sjelden',
      'sky',
      'skinke',
    ],
    pairs: [],
    diagnostic: 'skjorte',
  },
  'nb:y': {
    symbols: { word: ['YY', 'YH'], fluent: ['YY', 'YH'] },
    words: [
      'by',
      'lys',
      'syv',
      'ny',
      'fly',
      'lykke',
      'syk',
      'lyd',
      'dyr',
      'hytte',
      'lytte',
      'sykkel',
      'mye',
      'tynn',
      'flytte',
    ],
    pairs: [],
    diagnostic: 'lys',
  },
  'nb:uu': {
    symbols: { word: ['UU', 'UH'], fluent: ['UU', 'UH'] },
    words: [
      'hus',
      'ut',
      'mus',
      'bru',
      'hund',
      'buss',
      'sukker',
      'kul',
      'ku',
      'tur',
      'stue',
      'full',
      'jul',
      'tusen',
      'gutt',
    ],
    pairs: [],
    diagnostic: 'hus',
  },
  'nb:oe': {
    symbols: { word: ['OE', 'OEH'], fluent: ['OE', 'OEH'] },
    words: [
      'søt',
      'øl',
      'brød',
      'høst',
      'søster',
      'bønner',
      'rød',
      'dør',
      'grønn',
      'møte',
      'snø',
      'høre',
      'nøkkel',
      'kjøre',
      'først',
    ],
    pairs: [],
    diagnostic: 'søt',
  },
  'nb:ae': {
    symbols: { word: ['AE'], fluent: ['AE'] },
    words: [
      'være',
      'lærer',
      'her',
      'nær',
      'lære',
      'bære',
      'pære',
      'vær',
      'fjær',
      'ære',
      'svær',
      'tær',
      'skjære',
      'kjæreste',
      'trær',
    ],
    pairs: [],
    diagnostic: 'her',
  },
  'nb:vowel_length': {
    symbols: { word: ['AA', 'EE', 'II', 'OO', 'OA'], fluent: [] },
    words: [
      'tak',
      'fin',
      'hat',
      'pen',
      'mat',
      'vis',
      'tal',
      'stil',
      'dag',
      'bil',
      'is',
      'sol',
      'lese',
      'bok',
      'gate',
    ],
    pairs: [
      ['tak', 'takk'],
      ['fin', 'finn'],
      ['hat', 'hatt'],
      ['pen', 'penn'],
      ['mat', 'matt'],
      ['vis', 'viss'],
      ['tal', 'tall'],
      ['stil', 'still'],
    ],
    diagnostic: 'tak',
  },
  'nb:tone': {
    symbols: { word: [], fluent: [] },
    words: [
      'bønder',
      'bønner',
      'huset',
      'huske',
      'vinter',
      'sommer',
      'onkel',
      'tante',
      'gutten',
      'jente',
      'kino',
      'kirke',
      'sykkel',
      'lykke',
      'sola',
      'sove',
    ],
    // Toneme 1 first, toneme 2 second; the tool checks both against the lexicon.
    pairs: [
      ['bønder', 'bønner'],
      ['huset', 'huske'],
      ['vinter', 'sommer'],
      ['onkel', 'tante'],
      ['gutten', 'jente'],
      ['kino', 'kirke'],
      ['sykkel', 'lykke'],
      ['sola', 'sove'],
    ],
    diagnostic: 'jente',
  },
};

/** Phrases kept per family: enough for a week of sessions without the same line twice in a row. */
export const PHRASES_PER_ATOM = 20;

/** The longest line a single take holds (§5.5 Q29). */
export const PHRASE_MAX_WORDS = 8;
