import { lexicalWords } from '../../../providers/domain/lexical.js';
import type { PronouncedWord } from '../../../providers/domain/speech-result.js';
import { tonemeOfVariants, type LexiconVariant } from '../../../pronunciation/domain/align-word.js';
import { hasSoundInventory } from '../../../pronunciation/domain/sound-inventory.js';
import type { TonemeMeasure } from '../../../pronunciation/domain/toneme-feature.js';

/**
 * The sentence a reference word is spoken in (plan 88, step 6b): in focus, not at the end, so
 * the synthesizer gives it a full accent and no final fall. Spoken alone, a word gets the
 * contour of a whole utterance, and the toneme drowns in it.
 */
const CARRIERS: Record<string, { before: string; after: string }> = {
  nb: { before: 'Nå sier jeg', after: 'igjen.' },
};

/** Below this Azure heard the synthesizer say another word (the lowest of 114 calibration clips: 66). */
export const MIN_WORD_ACCURACY = 60;

export interface Carrier {
  sentence: string;
  /** The word's place among the sentence's words. */
  wordIndex: number;
}

export function carrierOf(language: string, word: string): Carrier | null {
  const carrier = CARRIERS[language];
  if (!carrier) return null;
  return { sentence: `${carrier.before} ${word} ${carrier.after}`, wordIndex: lexicalWords(carrier.before).length };
}

/**
 * Azure's score of the sentence's `wordIndex`-th word. Azure lists the sentence in order, with an
 * inserted word between; null when it is missing, omitted or not the word asked for.
 */
export function wordAt(scored: readonly PronouncedWord[], wordIndex: number, word: string): PronouncedWord | null {
  const said = scored.filter((w) => w.error !== 'insertion')[wordIndex];
  return said && said.error !== 'omission' && said.text === word ? said : null;
}

/** A span of the clip, in ms from its start. */
export interface ClipSpan {
  startMs: number;
  endMs: number;
}

/** A kept reference: the clip and where the word and its stressed vowel are in it. */
export interface ReferenceClip {
  /** PCM 16-bit, 16 kHz, mono. */
  audio: Uint8Array;
  audioMs: number;
  voice: string;
  sentence: string;
  word: ClipSpan;
  /** Null when the word carries no toneme — nothing was measured on it. */
  stressedVowel: ClipSpan | null;
}

/**
 * One voice tried, and why its clip was or was not kept:
 * - `kept` — heard as the word, and (with a toneme) the toneme the lexicon has;
 * - `not_heard` — Azure did not hear the word, or heard it below `MIN_WORD_ACCURACY`;
 * - `not_aligned` — Azure's sounds of it could not be named by the lexicon;
 * - `not_measured` — no voiced onset or post-tonic vowel to read the toneme from;
 * - `tone_unsure` — the measure fell between the bounds;
 * - `tone_mismatch` — the measure says the other toneme.
 */
export interface ReferenceTry {
  voice: string;
  outcome: 'kept' | 'not_heard' | 'not_aligned' | 'not_measured' | 'tone_unsure' | 'tone_mismatch';
  /** Azure's 0–100 score of the word; null when it was not heard. */
  accuracy: number | null;
  measure: TonemeMeasure | null;
}

/**
 * Why no clip was asked for:
 * - `not_a_word` — empty, or more than one word;
 * - `language_not_supported` — no carrier sentence or no lexicon for the language;
 * - `not_in_lexicon` — nothing to check the clip against (plan 88 Q2);
 * - `tone_ambiguous` — the word's variants differ in toneme: only its meaning decides, and a
 *   synthesizer picks one at random (§0.5, *ånden*);
 * - `not_available` — synthesis or its check is switched off, or the model has no voice for the language.
 */
export type ReferenceRefusal =
  'not_a_word' | 'language_not_supported' | 'not_in_lexicon' | 'tone_ambiguous' | 'not_available';

/**
 * `tone` is the lexicon's toneme of the word; null when it carries none (a final stressed
 * syllable) — the clip is then kept unmeasured. `aiCallIds` are the ledger rows, synthesis and
 * check of every voice tried.
 */
export type ReferenceClipOutcome =
  | { status: 'ok'; clip: ReferenceClip; tone: 1 | 2 | null; tries: ReferenceTry[]; aiCallIds: string[] }
  /** Every voice was tried and none was kept. */
  | { status: 'rejected'; tone: 1 | 2 | null; tries: ReferenceTry[]; aiCallIds: string[] }
  | { status: 'refused'; reason: ReferenceRefusal }
  /** A model or the pitch tracker did not answer; nothing is known about the word. */
  | { status: 'failed'; errorCode: string; tries: ReferenceTry[]; aiCallIds: string[] };

/** What is refused before anything is synthesized: decided by the text and the lexicon alone. */
export type ReferenceWordRefusal = Exclude<ReferenceRefusal, 'not_available'>;

/**
 * The word a reference is made of, or why none can be: one lexical word, of a language with a
 * carrier sentence and a sound inventory. The first half of the check before synthesis.
 */
export function referenceWordOf(
  language: string,
  raw: string,
): { word: string; carrier: Carrier } | { refusal: 'not_a_word' | 'language_not_supported' } {
  const words = lexicalWords(raw);
  if (words.length !== 1) return { refusal: 'not_a_word' };
  const word = words[0]!;
  const carrier = carrierOf(language, word);
  if (!carrier || !hasSoundInventory(language)) return { refusal: 'language_not_supported' };
  return { word, carrier };
}

/**
 * The toneme a reference clip is checked against, or why it cannot be: no variant in the lexicon,
 * or variants that differ in toneme (a homograph — which one a voice says is chance). The second
 * half of the check; plan 86, step 13.2c, runs both for drill words without paying for anything.
 */
export function referenceToneOf(
  variants: readonly LexiconVariant[],
): { tone: 1 | 2 | null } | { refusal: 'not_in_lexicon' | 'tone_ambiguous' } {
  if (variants.length === 0) return { refusal: 'not_in_lexicon' };
  const tone = tonemeOfVariants(variants);
  return tone === 'ambiguous' ? { refusal: 'tone_ambiguous' } : { tone };
}

/** One word as the pre-synthesis check sees it (`POST internal/reference-clips/check`). */
export type ReferenceWordCheck =
  | { word: string; status: 'ok'; tone: 1 | 2 | null }
  | { word: string; status: 'refused'; reason: ReferenceWordRefusal };
