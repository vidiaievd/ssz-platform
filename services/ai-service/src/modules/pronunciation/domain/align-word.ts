import type { PronouncedPhoneme, PronouncedWord } from '../../providers/domain/speech-result.js';
import { parseNofabet, soundOf, type NofabetToken, type SoundFamily, type Stress } from './sound-inventory.js';

/** One transcription of the word from the pronunciation lexicon (plan 88, step 1). */
export interface LexiconVariant {
  /** Space-separated NoFAbet, stress digits on vowels: `KJ OEH1 K AX0 N`. */
  nofabet: string;
  pos?: string;
  /** The lexicon's features (`PLU|IND|NOM|MAS`); what part of speech alone cannot tell apart (step 4b). */
  feats?: string;
}

/** A word as Azure scored it, sound by sound. */
export interface AssessedWord {
  text: string;
  error: PronouncedWord['error'];
  phonemes: PronouncedPhoneme[];
}

/**
 * One of Azure's sounds with its name from the lexicon. `symbol` is null where the word's
 * variants of this length disagree at this position (*det*: `D AX0` / `D EE1`) — the sound is
 * then timed and scored but not named, and nothing is said about it.
 */
export interface AlignedSound {
  symbol: string | null;
  ipa: string | null;
  family: SoundFamily | null;
  /** NoFAbet stress of a vowel or a syllabic consonant; null on consonants and where variants disagree. */
  stress: Stress | null;
  /** The word's primary-stressed vowel — what a toneme is measured on. */
  primary: boolean;
  startMs: number;
  durationMs: number;
  accuracy: number;
}

export type UnalignedReason =
  /** Omitted or inserted against the passage: Azure scored no sounds of the word as read. */
  | 'not_scored'
  /** Azure gave no phonemes (asked without `Granularity: Phoneme`). */
  | 'no_phonemes'
  /** Not in the lexicon; plan 88 Q2 — the word is reviewed as a whole. */
  | 'not_in_lexicon'
  /** No variant has as many sounds as Azure heard; which sound is which would be a guess. */
  | 'count_mismatch'
  /** Every variant uses a symbol the inventory does not have. */
  | 'unknown_symbol';

export type WordAlignment =
  | {
      status: 'aligned';
      text: string;
      sounds: AlignedSound[];
      /** The primary-stressed sound, when the variants agree on it. */
      primaryIndex: number | null;
      /**
       * Toneme of the word, when it carries one: the variants agree on it and a syllable follows
       * the stressed one (a final stressed syllable shows no contrast). Null on homographs that
       * differ in toneme (*tømmer* noun 1 / verb 2) — the context, not the lexicon, decides those.
       */
      tone: 1 | 2 | null;
      /** The variants the sounds were named from. */
      variants: string[];
    }
  | { status: 'unaligned'; text: string; reason: UnalignedReason; azureCount: number; lexiconCounts: number[] };

/**
 * Names Azure's sounds of one word by the lexicon (plan 88, step 3, §1). Azure tells where each
 * sound is and how well it was said but not which sound it is; the lexicon tells which, if the
 * two count the same sounds. A word whose count matches no variant is left unaligned — a sound
 * is never named by guess. Pure: the caller looks the variants up.
 */
export function alignWord(word: AssessedWord, variants: LexiconVariant[]): WordAlignment {
  const azureCount = word.phonemes.length;
  const unaligned = (reason: UnalignedReason, lexiconCounts: number[] = []): WordAlignment => ({
    status: 'unaligned',
    text: word.text,
    reason,
    azureCount,
    lexiconCounts,
  });

  if (word.error === 'omission' || word.error === 'insertion') return unaligned('not_scored');
  if (azureCount === 0) return unaligned('no_phonemes');
  if (variants.length === 0) return unaligned('not_in_lexicon');

  const parsed = new Map<string, NofabetToken[]>();
  for (const v of variants) {
    const tokens = parseNofabet(v.nofabet);
    // A word boundary inside an entry («c/o») is no sound: Azure gives it no phoneme.
    if (tokens)
      parsed.set(
        v.nofabet,
        tokens.filter((t) => soundOf(t.symbol)?.kind !== 'boundary'),
      );
  }
  if (parsed.size === 0) return unaligned('unknown_symbol');

  const matching = [...parsed].filter(([, tokens]) => tokens.length === azureCount);
  if (matching.length === 0) {
    const counts = [...new Set([...parsed.values()].map((t) => t.length))].sort((a, b) => a - b);
    return unaligned('count_mismatch', counts);
  }

  const sounds: AlignedSound[] = word.phonemes.map((phoneme, i) => {
    const symbol = agreed(matching.map(([, tokens]) => tokens[i]!.symbol));
    const marks = matching.map(([, tokens]) => tokens[i]!.stress);
    const stress = agreed(marks);
    const entry = symbol === null ? null : soundOf(symbol);
    return {
      symbol,
      ipa: entry?.ipa ?? null,
      family: entry?.family ?? null,
      stress: stress ?? null,
      // Primary in every variant, whatever its toneme (*tømmer*: OEH1 / OEH2).
      primary: marks.every((m) => m === 1 || m === 2),
      startMs: phoneme.startMs,
      durationMs: phoneme.durationMs,
      accuracy: phoneme.accuracy,
    };
  });

  const primaries = sounds.flatMap((s, i) => (s.primary ? [i] : []));
  const primaryIndex = primaries.length === 1 ? primaries[0]! : null;
  const tones = new Set(matching.map(([, tokens]) => toneOf(tokens)));
  const tone = tones.size === 1 ? [...tones][0]! : null;

  return { status: 'aligned', text: word.text, sounds, primaryIndex, tone, variants: matching.map(([v]) => v) };
}

/** The toneme of one variant: of its single primary stress, if a syllable follows it. */
function toneOf(tokens: NofabetToken[]): 1 | 2 | null {
  const primaries = tokens.flatMap((t, i) => (t.stress === 1 || t.stress === 2 ? [i] : []));
  if (primaries.length !== 1) return null;
  const at = primaries[0]!;
  const syllableAfter = tokens.slice(at + 1).some((t) => t.stress !== null);
  return syllableAfter ? (tokens[at]!.stress as 1 | 2) : null;
}

/** The one value all variants have here, or null when they differ. */
function agreed<T>(values: T[]): T | null {
  return values.every((v) => v === values[0]) ? values[0]! : null;
}
