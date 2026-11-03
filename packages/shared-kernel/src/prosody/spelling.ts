// Norwegian spelling, as far as the prosody layer needs it: which letters are vowels, where
// the stressed vowel of a marked syllable is, and where a stressed syllable begins.
//
// Used where no lexicon answers — a word an author marked in the notation, and the place the
// serializer writes `'2`. The lexicon (NB Uttale, ai-service) is the authority for words it
// knows; this is a fallback, deliberately small. Only `nb` for now; another language brings
// its own file.

import type { StressedVowel } from './model.js';

const VOWEL = /[aeiouyæøåéèêóòôàáâüäö]/;

/** Two vowel letters read as one nucleus. */
const DIPHTHONGS = new Set(['ai', 'au', 'ei', 'eu', 'oi', 'ui', 'øy', 'øi', 'ay', 'ey']);

/**
 * Consonant clusters a Norwegian syllable may begin with — the longest one in front of the
 * stressed vowel moves the mark back: `for'1stå`, not `fors'1tå`. Any single consonant
 * begins a syllable too.
 */
const ONSETS = new Set([
  'bl',
  'br',
  'dr',
  'fl',
  'fr',
  'gl',
  'gr',
  'kl',
  'kn',
  'kr',
  'kv',
  'pl',
  'pr',
  'tr',
  'tv',
  'sk',
  'sl',
  'sm',
  'sn',
  'sp',
  'st',
  'sv',
  'skr',
  'spl',
  'spr',
  'str',
  'gj',
  'hj',
  'hv',
  'kj',
  'sj',
  'tj',
  'skj',
  'gn',
]);

export function isVowelLetter(ch: string | undefined): boolean {
  return ch !== undefined && VOWEL.test(ch.toLowerCase());
}

const isLetter = (ch: string | undefined) => ch !== undefined && /\p{L}/u.test(ch);

/**
 * The stressed vowel of the syllable a mark at `from` stands before: the first vowel letter
 * at or after it, with the next letter when the two form a diphthong. `null` when the rest
 * of the word has no vowel. Length is unknown from spelling.
 */
export function stressedVowelFrom(word: string, from: number): StressedVowel | null {
  const lower = word.toLowerCase();
  for (let k = Math.max(0, from); k < lower.length; k++) {
    if (!isVowelLetter(lower[k])) continue;
    const e = DIPHTHONGS.has(lower.slice(k, k + 2)) ? k + 2 : k + 1;
    return { s: k, e, long: null };
  }
  return null;
}

/**
 * Where the syllable of the vowel at `vowelStart` begins — the place a stress mark is
 * written. Back over the consonants before the vowel: to the word start (or a hyphen) when
 * nothing but consonants precede, otherwise by the longest cluster that may begin a syllable.
 */
export function syllableStart(word: string, vowelStart: number): number {
  const lower = word.toLowerCase();
  let k = vowelStart;
  while (k > 0 && isLetter(lower[k - 1]) && !isVowelLetter(lower[k - 1])) k--;
  if (k === 0 || !isLetter(lower[k - 1])) return k;
  for (let from = k; from < vowelStart; from++) {
    const cluster = lower.slice(from, vowelStart);
    if (cluster.length === 1 || ONSETS.has(cluster)) return from;
  }
  return vowelStart;
}
