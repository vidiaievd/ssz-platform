// The Norwegian (østnorsk) sound inventory in NB Uttale's NoFAbet (plan 88, step 2) — data,
// kept apart from the code that reads it (`sound-inventory.ts`).
//
// `assess` says whether Azure's score for the sound is trusted and from which score down it is a
// remark. Thresholds are the 10th percentile of native speakers' scores for that sound, measured
// 01.11.2026 (plan 88 §0.4–0.5a):
//   fluent — 12 tracks of «Stein på stein» read aloud, 1 742 aligned words;
//   word   — Ny i Norge CD2, «Ord og uttrykk» of leksjon 7, 8, 10, 11 and «Uttale», 1 498 words.
// Where a context had fewer than 20 samples of the sound, the threshold is of both pooled
// (KJ, OEH, YH). `null` in a context = the sound is not scored there: Azure does not tell the
// error from the right sound (retroflexes, schwa, short å — §0.2) or natives fail it too often
// (R, S, T, AX on fluent speech — §0.4). Vowel length is scored only on single words (§0.5b).
// A score below the threshold is a remark; the threshold itself is not.

/** What a weak sound is filed under — the `sound` atom of plan 86 Q5, a family, not a symbol. */
export type SoundFamily =
  | 'kj'
  | 'sj'
  | 'uu'
  | 'oe'
  | 'ae'
  | 'y'
  | 'vowel_length'
  | 'retroflex'
  | 'schwa'
  | 'r'
  | 'tone'
  | 'vowel'
  | 'diphthong'
  | 'consonant';

/** Where the sound was said: a passage read aloud, or a word (or pair) on its own. */
export type SpeechContext = 'fluent' | 'word';

export type SoundKind = 'vowel' | 'diphthong' | 'consonant' | 'boundary';

export interface SoundAssessment {
  /** The family a low score is filed under — for a long vowel of no quality family, its length. */
  family: SoundFamily;
  fluent: number | null;
  word: number | null;
}

export interface SoundEntry {
  ipa: string;
  kind: SoundKind;
  family: SoundFamily | null;
  /** Vowels only: long, and the symbol of the same quality with the other length. */
  long?: boolean;
  lengthPair?: string;
  /** Plain English, for the explanation the model writes (plan 86, step 9 grows it). */
  articulation: string;
  assess: SoundAssessment | null;
  /**
   * Syllabic consonants only: the sounds Azure hears in its place (plan 88, step 9.1) — it
   * splits the syllable as the word is spelled, schwa included (*hesten* `NX0` → ə n, *døren*
   * `RNX0` → r ə n). The syllable's stress mark goes to the `AX`. A leading `R` is dropped after
   * a retroflex consonant, which already holds the r (*konserten* `RT RNX0` → ʈ ə n).
   */
  split?: string[];
  /**
   * Word-final splits by the spelling's ending, where Azure hears a letter the lexicon does not
   * (*morgen* `RNX0` → r g ə n, three voices, 02.11).
   */
  splitSpelled?: Record<string, string[]>;
}

export interface FamilyEntry {
  title: string;
  /** Why the family is (or is not) scored — shown to no one, kept for whoever edits the data. */
  note: string;
}

export const NB_FAMILIES: Record<SoundFamily, FamilyEntry> = {
  kj: {
    title: 'kj-sound [ç]',
    note: 'Scored: Azure catches kj → k (score 0–18), §0.2.',
  },
  sj: {
    title: 'sj / skj-sound [ʃ]',
    note: 'Scored: Azure catches sj → s, skj → sk, §0.2.',
  },
  uu: {
    title: 'Norwegian u [ʉ]',
    note: 'Scored: ʉ → u gets ~40 (spread onto the neighbour consonant).',
  },
  oe: { title: 'ø [ø, œ]', note: 'Scored: ø → o gets ~40.' },
  ae: {
    title: 'æ [æ]',
    note: 'Long æ scored (æ → e gets ~40); short æ not — natives fail it 40 % of the time.',
  },
  y: {
    title: 'y [y, ʏ]',
    note: 'Scored by the native threshold; Azure is shaky on y even for synthetic speech (§0.2).',
  },
  vowel_length: {
    title: 'Long and short vowels',
    note: 'Single words only: a short-said long vowel gets ~40.',
  },
  retroflex: {
    title: 'Retroflexes (rs, rt, rn, rd, rl)',
    note: 'Not scored: r+s instead of [ʂ] scores 100.',
  },
  schwa: { title: 'Unstressed e [ə]', note: 'Not scored: ə → e scores 100.' },
  r: { title: 'r', note: 'Not scored: natives below 60 in a third of cases.' },
  tone: {
    title: 'Tonemes 1 and 2',
    note: 'Not a symbol: measured by F0 on the stressed vowel (phase 3).',
  },
  vowel: {
    title: 'Other vowels',
    note: 'Quality not scored; long ones carry vowel_length.',
  },
  diphthong: {
    title: 'Diphthongs',
    note: 'Not scored yet: too few native samples.',
  },
  consonant: { title: 'Other consonants', note: 'Not scored.' },
};

export const NB_SOUNDS: Record<string, SoundEntry> = {
  // ── Vowels ────────────────────────────────────────────────────────────────
  AA: {
    ipa: 'ɑː',
    kind: 'vowel',
    family: 'vowel',
    long: true,
    lengthPair: 'AH',
    articulation: 'Long open back a, mouth wide open, tongue low and back (as in «tak»).',
    assess: { family: 'vowel_length', fluent: null, word: 64 },
  },
  AH: {
    ipa: 'ɑ',
    kind: 'vowel',
    family: 'vowel',
    long: false,
    lengthPair: 'AA',
    articulation: 'Short open back a, clipped before a double consonant (as in «takk»).',
    assess: null,
  },
  EE: {
    ipa: 'eː',
    kind: 'vowel',
    family: 'vowel',
    long: true,
    lengthPair: 'EH',
    articulation: 'Long close e, lips spread, tongue high and front, held without gliding (as in «se»).',
    assess: { family: 'vowel_length', fluent: null, word: 76 },
  },
  EH: {
    ipa: 'ɛ',
    kind: 'vowel',
    family: 'vowel',
    long: false,
    lengthPair: 'EE',
    articulation: 'Short open e (as in «penn»).',
    assess: null,
  },
  II: {
    ipa: 'iː',
    kind: 'vowel',
    family: 'vowel',
    long: true,
    lengthPair: 'IH',
    articulation: 'Long i, lips spread, tongue high and front (as in «fin»).',
    assess: { family: 'vowel_length', fluent: null, word: 64 },
  },
  IH: {
    ipa: 'ɪ',
    kind: 'vowel',
    family: 'vowel',
    long: false,
    lengthPair: 'II',
    articulation: 'Short i (as in «finn»).',
    assess: null,
  },
  OO: {
    ipa: 'uː',
    kind: 'vowel',
    family: 'vowel',
    long: true,
    lengthPair: 'OH',
    articulation: 'Long o said as a tight u: lips strongly rounded and pushed forward (as in «bok»).',
    assess: { family: 'vowel_length', fluent: null, word: 78 },
  },
  OH: {
    ipa: 'ʊ',
    kind: 'vowel',
    family: 'vowel',
    long: false,
    lengthPair: 'OO',
    articulation: 'Short rounded u-like o (as in «ost»).',
    assess: null,
  },
  OA: {
    ipa: 'oː',
    kind: 'vowel',
    family: 'vowel',
    long: true,
    lengthPair: 'OAH',
    articulation: 'Long å, a rounded close o (as in «gå»).',
    assess: { family: 'vowel_length', fluent: null, word: 49 },
  },
  OAH: {
    ipa: 'ɔ',
    kind: 'vowel',
    family: 'vowel',
    long: false,
    lengthPair: 'OA',
    articulation: 'Short open o (as in «godt», «komme»).',
    assess: null,
  },
  UU: {
    ipa: 'ʉː',
    kind: 'vowel',
    family: 'uu',
    long: true,
    lengthPair: 'UH',
    articulation:
      'Long Norwegian u: tongue in the middle of the mouth, not back; lips rounded and close together, not pushed out (as in «hus»).',
    assess: { family: 'uu', fluent: 78, word: 77 },
  },
  UH: {
    ipa: 'ʉ',
    kind: 'vowel',
    family: 'uu',
    long: false,
    lengthPair: 'UU',
    articulation: 'Short Norwegian u, the same central rounded vowel, clipped (as in «hund»).',
    assess: { family: 'uu', fluent: 49, word: 66 },
  },
  YY: {
    ipa: 'yː',
    kind: 'vowel',
    family: 'y',
    long: true,
    lengthPair: 'YH',
    articulation: 'Long y: tongue as for i, lips tightly rounded (as in «lys»).',
    assess: { family: 'y', fluent: 97, word: 90 },
  },
  YH: {
    ipa: 'ʏ',
    kind: 'vowel',
    family: 'y',
    long: false,
    lengthPair: 'YY',
    articulation: 'Short y, the same rounded front vowel, clipped (as in «lykke»).',
    assess: { family: 'y', fluent: 70, word: 62 },
  },
  OE: {
    ipa: 'øː',
    kind: 'vowel',
    family: 'oe',
    long: true,
    lengthPair: 'OEH',
    articulation: 'Long ø: tongue as for e, lips rounded (as in «søt»).',
    assess: { family: 'oe', fluent: 80, word: 84 },
  },
  OEH: {
    ipa: 'œ',
    kind: 'vowel',
    family: 'oe',
    long: false,
    lengthPair: 'OE',
    articulation: 'Short open ø, tongue as for open e, lips rounded (as in «søtt», «bønner»).',
    assess: { family: 'oe', fluent: 88, word: 86 },
  },
  AE: {
    ipa: 'æː',
    kind: 'vowel',
    family: 'ae',
    long: true,
    lengthPair: 'AEH',
    articulation: 'Long æ, more open than e, jaw lowered (as in «være»).',
    assess: { family: 'ae', fluent: 80, word: 80 },
  },
  AEH: {
    ipa: 'æ',
    kind: 'vowel',
    family: 'ae',
    long: false,
    lengthPair: 'AE',
    articulation: 'Short æ (as in «hvert», «sterk»).',
    assess: null,
  },
  AX: {
    ipa: 'ə',
    kind: 'vowel',
    family: 'schwa',
    articulation: 'Weak unstressed e, a neutral relaxed vowel — never a full e (as in «jente»).',
    assess: null,
  },
  // ── Diphthongs ────────────────────────────────────────────────────────────
  AEJ: {
    ipa: 'æɪ',
    kind: 'diphthong',
    family: 'diphthong',
    articulation: 'ei: from æ glide to i (as in «nei»).',
    assess: null,
  },
  AJ: {
    ipa: 'ɑɪ',
    kind: 'diphthong',
    family: 'diphthong',
    articulation: 'ai: from back a glide to i (as in «hai»).',
    assess: null,
  },
  OAJ: {
    ipa: 'ɔʏ',
    kind: 'diphthong',
    family: 'diphthong',
    articulation: 'oi: from open o glide to rounded y (as in «boi»).',
    assess: null,
  },
  OEJ: {
    ipa: 'œʏ',
    kind: 'diphthong',
    family: 'diphthong',
    articulation: 'øy: from open ø glide to rounded y (as in «øy»).',
    assess: null,
  },
  AEW: {
    ipa: 'æʉ',
    kind: 'diphthong',
    family: 'diphthong',
    articulation: 'au: from æ glide to Norwegian u (as in «sau»).',
    assess: null,
  },
  OU: {
    ipa: 'oʊ',
    kind: 'diphthong',
    family: 'diphthong',
    articulation: 'English-like ou, loanwords only (as in «coach»).',
    assess: null,
  },
  // ── Consonants ────────────────────────────────────────────────────────────
  KJ: {
    ipa: 'ç',
    kind: 'consonant',
    family: 'kj',
    articulation:
      'kj-sound: air hissing between the middle of the tongue and the hard palate, like a soft German «ich»; no k, no sh (as in «kjøkken», «kino»).',
    assess: { family: 'kj', fluent: 53, word: 53 },
  },
  SJ: {
    ipa: 'ʃ',
    kind: 'consonant',
    family: 'sj',
    articulation:
      'sj-sound: a hushing sh, lips slightly rounded; written sj, skj, and sk before i, y, øy (as in «sju», «skjorte», «ski»).',
    assess: { family: 'sj', fluent: 54, word: 86 },
  },
  R: {
    ipa: 'r',
    kind: 'consonant',
    family: 'r',
    articulation: 'Tapped or rolled tongue-tip r (østnorsk).',
    assess: null,
  },
  RS: {
    ipa: 'ʂ',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'rs said as one sound: a sh with the tongue tip curled back; no separate r (as in «norsk»).',
    assess: null,
  },
  RT: {
    ipa: 'ʈ',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'rt said as one t with the tongue tip curled back (as in «kart»).',
    assess: null,
  },
  RD: {
    ipa: 'ɖ',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'rd said as one d with the tongue tip curled back (as in «fordi»).',
    assess: null,
  },
  RN: {
    ipa: 'ɳ',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'rn said as one n with the tongue tip curled back (as in «barn»).',
    assess: null,
  },
  RNX: {
    ipa: 'ɳ̩',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'Syllabic retroflex n, the unstressed -ern said as one curled n (as in «abboren»).',
    assess: null,
    split: ['R', 'AX', 'N'],
    splitSpelled: { rgen: ['R', 'G', 'AX', 'N'] },
  },
  RL: {
    ipa: 'ɭ',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'rl said as one l with the tongue tip curled back (as in «dårlig»).',
    assess: null,
  },
  RLX: {
    ipa: 'ɭ̩',
    kind: 'consonant',
    family: 'retroflex',
    articulation: 'Syllabic retroflex l (as in «barsel»).',
    assess: null,
  },
  B: {
    ipa: 'b',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'b.',
    assess: null,
  },
  D: {
    ipa: 'd',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'd.',
    assess: null,
  },
  F: {
    ipa: 'f',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'f.',
    assess: null,
  },
  G: {
    ipa: 'g',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'g.',
    assess: null,
  },
  H: {
    ipa: 'h',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'h, a light breath, not a throat sound.',
    assess: null,
  },
  J: {
    ipa: 'j',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'j as in «ja»; also written g, gj, hj, lj before vowels.',
    assess: null,
  },
  K: {
    ipa: 'k',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'k, aspirated at the start of a stressed syllable.',
    assess: null,
  },
  L: {
    ipa: 'l',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'Clear l, tongue tip on the ridge behind the teeth.',
    assess: null,
  },
  LX: {
    ipa: 'l̩',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'Syllabic l, the unstressed -el (as in «adel»).',
    assess: null,
  },
  M: {
    ipa: 'm',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'm.',
    assess: null,
  },
  N: {
    ipa: 'n',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'n.',
    assess: null,
  },
  NX: {
    ipa: 'n̩',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'Syllabic n, the unstressed -en (as in «aften»).',
    assess: null,
    split: ['AX', 'N'],
  },
  NG: {
    ipa: 'ŋ',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'ng as one sound, no g after it (as in «ting»).',
    assess: null,
  },
  P: {
    ipa: 'p',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'p, aspirated at the start of a stressed syllable.',
    assess: null,
  },
  S: {
    ipa: 's',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'Voiceless s; Norwegian has no z.',
    assess: null,
  },
  T: {
    ipa: 't',
    kind: 'consonant',
    family: 'consonant',
    articulation: 't, aspirated at the start of a stressed syllable.',
    assess: null,
  },
  V: {
    ipa: 'ʋ',
    kind: 'consonant',
    family: 'consonant',
    articulation: 'Soft v, lower lip barely touching the upper teeth.',
    assess: null,
  },
  // ── Not a sound ───────────────────────────────────────────────────────────
  _: {
    ipa: '',
    kind: 'boundary',
    family: null,
    articulation: 'Word boundary inside a lexicon entry («c/o», «ok»); Azure gives it no phoneme.',
    assess: null,
  },
};
