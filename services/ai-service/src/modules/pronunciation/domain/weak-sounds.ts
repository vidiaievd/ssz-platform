import type { LexiconVariant, WordAlignment } from './align-word.js';
import { assessmentOf, soundOf, type SoundFamily, type SpeechContext } from './sound-inventory.js';

/** A sound of one word Azure scored below the native threshold of that sound (plan 88, step 5). */
export interface WeakSound {
  /** Position among the word's aligned sounds. */
  soundIndex: number;
  /** What the remark is filed under — the `sound` atom (plan 86 Q5). */
  family: SoundFamily;
  /** The lexicon's symbols here: one when named, two of one family when the variants differ (*uten*). */
  symbols: string[];
  /** IPA of the named sound; null when the variants differ in it. */
  ipa: string | null;
  accuracy: number;
  /** The score below which it is a remark; the softer one where the variants differ (§0.8 (6)). */
  threshold: number;
  startMs: number;
  durationMs: number;
}

/** UD parts of speech of function words — a full and a reduced form, both right (§0.8 (5)). */
const FUNCTION_UPOS: ReadonlySet<string> = new Set(['ADP', 'AUX', 'CCONJ', 'SCONJ', 'DET', 'PRON', 'PART']);
/** The same in NB Uttale's tags, for a word the tagger left untagged. */
const FUNCTION_LEXICON_POS: ReadonlySet<string> = new Set(['PN', 'DT', 'PP', 'KN', 'SN', 'IE']);

/**
 * Whether the word is a function word: by its tag where the tagger gave one, else when every
 * lexicon reading of it is one. *er* untagged stays a content word — its readings differ in
 * the vowel anyway, which is then not named.
 */
export function isFunctionWord(upos: string | null, variants: readonly LexiconVariant[]): boolean {
  if (upos) return FUNCTION_UPOS.has(upos);
  return variants.length > 0 && variants.every((v) => FUNCTION_LEXICON_POS.has((v.pos ?? '').split('|')[0]!));
}

/**
 * The sounds of an aligned word worth a remark (plan 88 §1, Q3): of a family scored in this
 * context, below that sound's native threshold. Where the variants differ in the symbol but not
 * the family, the softer threshold of the two counts; where they differ in family, or one of
 * them is not scored here, nothing is said. In fluent speech a function word's vowel is not
 * scored at all (§0.8 (5)): its reduced form is right, and the full one would make it a mistake.
 * Pure.
 */
export function weakSounds(alignment: WordAlignment, context: SpeechContext, functionWord: boolean): WeakSound[] {
  if (alignment.status !== 'aligned') return [];
  const out: WeakSound[] = [];
  alignment.sounds.forEach((sound, soundIndex) => {
    if (sound.symbols.length === 0) return;
    if (functionWord && context === 'fluent' && sound.symbols.some((s) => soundOf(s)!.kind !== 'consonant')) return;
    const assessments = sound.symbols.map((s) => assessmentOf(s, context));
    const family = assessments[0]?.family;
    if (!family || assessments.some((a) => a === null || a.family !== family)) return;
    const threshold = Math.min(...assessments.map((a) => a!.threshold));
    if (sound.accuracy >= threshold) return;
    out.push({
      soundIndex,
      family,
      symbols: sound.symbols,
      ipa: sound.ipa,
      accuracy: sound.accuracy,
      threshold,
      startMs: sound.startMs,
      durationMs: sound.durationMs,
    });
  });
  return out;
}
