// A word's sounds laid under its letters (plan 86, step 6d, §4i.1–§4i.2) — the data of the
// «Sounds» and «As it sounds» lenses.
//
// Derived, never authored and never stored: ai-service aligns the lexicon's transcription
// (NB Uttale, NoFAbet) with the word as written; content-service hands the result to the
// student beside the layer. A word the lexicon does not know, or whose letters cannot be
// aligned with its sounds without a guess, has no `WordSounds` and is drawn plainly — the
// same rule as a word without a stress.
//
// Only shapes and the respelling are here. The alignment itself needs the lexicon's inventory
// and lives in ai-service (`align-letters.ts`).

import type { ProsodyAnchor } from './model.js';

/** `vowel` and `consonant` are heard; `silent` is written and not said (*d* in *godt*). */
export type SoundSegKind = 'vowel' | 'consonant' | 'silent';

/** NoFAbet stress digit: 0 unstressed, 1 / 2 primary with toneme 1 / 2, 3 secondary. */
export type SoundStress = 0 | 1 | 2 | 3;

/**
 * Some letters of the word and what is heard for them. The segments of a word lie in order and
 * cover it with no gap — except a sound the spelling does not write (a schwa), which is a
 * segment of no letters (`s === e`).
 */
export interface SoundSeg {
  /** Character offsets of the letters in the word as written, `e` exclusive. */
  s: number;
  e: number;
  kind: SoundSegKind;
  /** NoFAbet symbols of what is heard, without stress digits; empty on `silent`. */
  sounds: string[];
  /** On a vowel or a syllabic consonant; null elsewhere. */
  stress: SoundStress | null;
  /** On a vowel: long vowel or diphthong. Null on other segments. */
  long: boolean | null;
  /** Several letters read as one sound (*kj*, *sj*, *ng*, *rt*): drawn with a bracket over them. */
  tie: boolean;
}

export interface WordSounds extends ProsodyAnchor {
  segs: SoundSeg[];
}

/** Whether the segments lie in order over exactly the letters of a word of this length. */
export function segsCoverWord(segs: readonly SoundSeg[], length: number): boolean {
  let at = 0;
  for (const seg of segs) {
    if (seg.s !== at || seg.e < seg.s) return false;
    at = seg.e;
  }
  return at === length && segs.length > 0;
}

/**
 * NoFAbet symbols written the way a teacher writes how a word sounds: Norwegian letters read
 * their usual way (§4i.2, Q-i10) — `OO/OH` are o, `OA/OAH` å, `UU/UH` u, a schwa is e. Only
 * **ŋ** and **ː** are not letters of the alphabet. `kj`, `sj` and the retroflexes stay as
 * letters: in østnorsk they read the same way every time. One map, so a teacher's own signs
 * are a change here and nowhere else.
 */
const RESPELLING: Readonly<Record<string, string>> = {
  AA: 'a',
  AH: 'a',
  EE: 'e',
  EH: 'e',
  II: 'i',
  IH: 'i',
  OO: 'o',
  OH: 'o',
  OA: 'å',
  OAH: 'å',
  UU: 'u',
  UH: 'u',
  YY: 'y',
  YH: 'y',
  OE: 'ø',
  OEH: 'ø',
  AE: 'æ',
  AEH: 'æ',
  AX: 'e',
  AEJ: 'æi',
  AJ: 'ai',
  OAJ: 'åy',
  OEJ: 'øy',
  AEW: 'æu',
  OU: 'ou',
  KJ: 'kj',
  SJ: 'sj',
  NG: 'ŋ',
  RT: 'rt',
  RD: 'rd',
  RN: 'rn',
  RL: 'rl',
  RS: 'rs',
  NX: 'n',
  RNX: 'rn',
  LX: 'l',
  RLX: 'rl',
};

/** Length mark of a long stressed vowel: a stressed *e* is *eː*, the letter a diphthong already holds. */
export const LENGTH_MARK = 'ː';

/** One sound in the teacher's letters; a symbol the map does not know is lower-cased (*B* → *b*). */
export function respellSound(symbol: string): string {
  return RESPELLING[symbol] ?? symbol.toLowerCase();
}

/**
 * The word as it sounds, in the teacher's letters: silent letters gone, a long stressed vowel
 * followed by `ː` (a diphthong is long by itself and takes none). *tunge* → *toŋe*,
 * *gjerne* → *jæːrne*.
 */
export function respell(segs: readonly SoundSeg[]): string {
  let out = '';
  let afterRetroflex = false;
  for (const seg of segs) {
    if (seg.kind === 'silent') continue;
    const marked =
      seg.kind === 'vowel' && seg.long === true && seg.stress !== null && seg.stress >= 1 && seg.sounds.length === 1;
    for (const sound of seg.sounds) {
      const written = respellSound(sound);
      // The r of a retroflex is already in the one before it: *bokholderens* → *bokhålerns*.
      out += afterRetroflex && RETROFLEX.has(sound) ? written.slice(1) : written;
      afterRetroflex = RETROFLEX.has(sound);
    }
    if (marked && isMonophthong(seg.sounds[0]!)) out += LENGTH_MARK;
  }
  return out;
}

const RETROFLEX = new Set(['RT', 'RD', 'RN', 'RL', 'RS', 'RNX', 'RLX']);

const DIPHTHONG_SYMBOLS = new Set(['AEJ', 'AJ', 'OAJ', 'OEJ', 'AEW', 'OU']);

function isMonophthong(symbol: string): boolean {
  return !DIPHTHONG_SYMBOLS.has(symbol);
}
