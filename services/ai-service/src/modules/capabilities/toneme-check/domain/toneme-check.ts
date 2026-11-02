import type { TonemeComparison } from '../../../pronunciation/domain/toneme-comparison.js';

/**
 * Why no word was heard, on purpose:
 * - `not_a_word` — empty, or more than one word;
 * - `language_not_supported` — no carrier sentence or no lexicon for the language;
 * - `not_in_lexicon` — no toneme to compare against (plan 88 Q2);
 * - `tone_ambiguous` — the word's variants differ in toneme: only its meaning decides;
 * - `no_toneme` — the word carries none (a final stressed syllable), or its reference was kept unmeasured;
 * - `not_a_reference` — the reference asset is not a reference clip, or not one of this word;
 * - `not_available` — the agent is switched off, or the payer may not use it (policy, tariff);
 * - `pool_empty` — the payer's `ai.practice` credits for the period are spent.
 */
export type TonemeCheckRefusal =
  | 'not_a_word'
  | 'language_not_supported'
  | 'not_in_lexicon'
  | 'tone_ambiguous'
  | 'no_toneme'
  | 'not_a_reference'
  | 'not_available'
  | 'pool_empty';

/**
 * The word was heard, but its toneme cannot be read off the take:
 * - `word_not_heard` — Azure did not hear the word where the carrier puts it;
 * - `sounds_not_aligned` — its sounds are not the lexicon's variant with the toneme (another word said);
 * - `no_toneme_window` — no single stressed vowel with a syllable after it.
 */
export type TonemeUnheard = 'word_not_heard' | 'sounds_not_aligned' | 'no_toneme_window';

/** The two melodies, each from its stressed vowel to the word's end: what «yours / reference» draws. */
export interface TonemeMelody {
  stepMs: number;
  /** Semitones from each recording's own median F0; null where unvoiced. */
  learner: Array<number | null>;
  reference: Array<number | null>;
}

/**
 * `atomRef` is the `sound` atom of the toneme (`nb:tone`) only on `other_tone`; the caller marks it
 * after several such takes, not after one (Q4). `aiCallIds` are the ledger rows of the take.
 */
export type TonemeCheckOutcome =
  | {
      status: 'ok';
      word: string;
      sentence: string;
      /** Azure's 0–100 score of the word. */
      accuracy: number;
      comparison: TonemeComparison;
      melody: TonemeMelody;
      atomRef: { atomType: 'sound'; atomId: string } | null;
      aiCallIds: string[];
    }
  | { status: 'unheard'; reason: TonemeUnheard; accuracy: number | null; aiCallIds: string[] }
  | { status: 'refused'; reason: TonemeCheckRefusal }
  /**
   * Nothing usable came back: the provider's code, `gate_unavailable` / `unavailable`,
   * `lexicon_unavailable`, `pitch_unavailable`, or before any call `recording_missing` /
   * `recording_not_ready` / `recording_unreadable` / `recording_inaudible` and the same for `reference_*`.
   */
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };
