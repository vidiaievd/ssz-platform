import type { LexiconVariant } from './align-word.js';
import { parseNofabet, soundOf } from './sound-inventory.js';

/**
 * A word's stress as the prosody layer draws it (plan 86, step 5b): the toneme and the stressed
 * vowel in the word as written. The shape of the kernel's `WordStress` without its anchor —
 * content-service anchors it to its own tokens.
 */
export interface LexiconStress {
  /** Null on a monosyllable (by the lexicon's syllables), drawn as a dot. */
  toneme: 1 | 2 | null;
  /** Character offsets in the written word, `e` exclusive. */
  vowel: { s: number; e: number; long: boolean | null };
}

/** Same letters as the kernel's `prosody/spelling.ts`: one fallback, kept in step. */
const VOWEL = /[aeiouyæøåéèêóòôàáâüäö]/;
const DIPHTHONGS = new Set(['ai', 'au', 'ei', 'eu', 'oi', 'ui', 'øy', 'øi', 'ay', 'ey']);

/**
 * NB Uttale's parts of speech of words that carry no mark (§4a, decision 1): prepositions,
 * conjunctions, subjunctions, pronouns, determiners, the infinitive marker.
 */
const FUNCTION_POS: ReadonlySet<string> = new Set(['PP', 'KN', 'SN', 'PN', 'DT', 'IE']);

/** UD parts of speech of the same words, when the tagger read the text; `AUX` is *er, har, skal*. */
const FUNCTION_UPOS: ReadonlySet<string> = new Set(['ADP', 'CCONJ', 'SCONJ', 'PRON', 'DET', 'AUX', 'PART']);

/** The written vowel nuclei of a word: a vowel letter, or two read as one diphthong. */
export function writtenNuclei(word: string): Array<{ s: number; e: number }> {
  const lower = word.toLowerCase();
  const out: Array<{ s: number; e: number }> = [];
  for (let k = 0; k < lower.length; k++) {
    if (!VOWEL.test(lower[k]!)) continue;
    const e = DIPHTHONGS.has(lower.slice(k, k + 2)) ? k + 2 : k + 1;
    out.push({ s: k, e });
    k = e - 1;
  }
  return out;
}

/**
 * The written nucleus of the lexicon's `k`-th of `count`. Same counts: the same place (97.7 % of
 * the words of the dev lessons, 03.11). Different counts — only where the difference cannot sit
 * before the stressed nucleus:
 *   · a monosyllable spelled with adjacent vowel letters (*team*, *peer*, *grieg*): all of them;
 *   · a stressed last syllable, counted from the end (*interessert*, *zoolog*, *usa*);
 *   · a stressed first syllable (a lost schwa, *en* `EE1 AX0 N`; `-eren` as one sound,
 *     *læreren* `AX0 RN`), unless a second vowel letter follows the first at once — a glide or
 *     a digraph (*york* `J OA1 R K`).
 * A stress inside a word of differing counts would be a guess (*journalister*, *amerikaneren*).
 */
function placeOf(
  written: ReadonlyArray<{ s: number; e: number }>,
  count: number,
  k: number,
): { s: number; e: number } | null {
  if (written.length === count) return written[k]!;
  if (written.length === 0) return null;
  const first = written[0]!;
  if (count === 1) {
    const last = written[written.length - 1]!;
    const letters = written.reduce((n, x) => n + x.e - x.s, 0);
    return last.e - first.s === letters ? { s: first.s, e: last.e } : null;
  }
  if (k === count - 1) return written[written.length - 1]!;
  if (k === 0 && written[1]?.s !== first.e) return first;
  return null;
}

/**
 * The stress of one transcription in the word as written, or null when it cannot be placed
 * without a guess. The lexicon's nuclei are its sounds with a stress digit (vowels, diphthongs,
 * syllabic consonants); the primary one (1 or 2) is matched to the written nucleus of the same
 * place (`placeOf`). Multi-word transcriptions (acronyms, `_`) are not placed.
 */
export function stressOfVariant(word: string, nofabet: string): LexiconStress | null {
  const tokens = parseNofabet(nofabet);
  if (!tokens || tokens.some((t) => t.symbol === '_')) return null;
  const nuclei = tokens.filter((t) => t.stress !== null);
  const k = nuclei.findIndex((t) => t.stress === 1 || t.stress === 2);
  if (k < 0) return null;

  const written = writtenNuclei(word);
  const place = placeOf(written, nuclei.length, k);
  if (!place) return null;
  const primary = nuclei[k]!;
  const sound = soundOf(primary.symbol);
  const long = sound?.kind === 'diphthong' ? true : (sound?.long ?? null);
  return {
    toneme: nuclei.length > 1 ? (primary.stress as 1 | 2) : null,
    vowel: { s: place.s, e: place.e, long },
  };
}

/**
 * The stress of a word in its context: the variants left after narrowing by part of speech
 * (`narrowVariants`), all of which must agree on the vowel and the toneme — a homograph the
 * context did not settle gets no mark (*kommer* noun 2 / verb 1 untagged). Length is kept only
 * where they agree too. A function word gets none: by its tag when the text was tagged, by the
 * lexicon when every variant is a function word.
 */
export function stressOfWord(
  word: string,
  variants: readonly LexiconVariant[],
  upos: string | null,
): LexiconStress | null {
  if (variants.length === 0) return null;
  if (upos !== null ? FUNCTION_UPOS.has(upos) : variants.every((v) => FUNCTION_POS.has((v.pos ?? '').split('|')[0]!))) {
    return null;
  }
  const placed = variants.map((v) => stressOfVariant(word, v.nofabet));
  const first = placed[0];
  if (!first) return null;
  for (const p of placed) {
    if (!p || p.toneme !== first.toneme || p.vowel.s !== first.vowel.s || p.vowel.e !== first.vowel.e) return null;
  }
  const long = placed.every((p) => p!.vowel.long === first.vowel.long) ? first.vowel.long : null;
  return { toneme: first.toneme, vowel: { ...first.vowel, long } };
}
