import {
  NB_FAMILIES,
  NB_SOUNDS,
  type FamilyEntry,
  type SoundEntry,
  type SoundFamily,
  type SpeechContext,
} from './nb-sounds.data.js';

export type { FamilyEntry, SoundEntry, SoundFamily, SpeechContext } from './nb-sounds.data.js';

/** NoFAbet stress mark on a vowel: 0 unstressed, 1 / 2 primary with toneme 1 / 2, 3 secondary. */
export type Stress = 0 | 1 | 2 | 3;

export interface NofabetToken {
  symbol: string;
  /** Null on consonants, which carry no mark. */
  stress: Stress | null;
}

/** One token of a lexicon transcription (`OEH1`, `KJ`) split into the symbol and its stress mark. */
export function parseNofabetToken(token: string): NofabetToken {
  const mark = /^(.+?)([0-3])$/.exec(token);
  return mark ? { symbol: mark[1], stress: Number(mark[2]) as Stress } : { symbol: token, stress: null };
}

/** A transcription (`KJ OEH1 K AX0 N`) as tokens; null when a symbol is not in the inventory. */
export function parseNofabet(nofabet: string): NofabetToken[] | null {
  const tokens = nofabet.trim().split(/\s+/).map(parseNofabetToken);
  return tokens.every((t) => t.symbol in NB_SOUNDS) ? tokens : null;
}

export function soundOf(symbol: string): SoundEntry | null {
  return NB_SOUNDS[symbol] ?? null;
}

export function familyOf(family: SoundFamily): FamilyEntry {
  return NB_FAMILIES[family];
}

/**
 * Whether Azure's score for the sound is a remark in this context: the family it is filed under
 * and the score below which it counts as weak. Null — the sound is not scored there, whatever
 * the score.
 */
export function assessmentOf(
  symbol: string,
  context: SpeechContext,
): { family: SoundFamily; threshold: number } | null {
  const assess = NB_SOUNDS[symbol]?.assess;
  const threshold = assess?.[context];
  return assess && threshold != null ? { family: assess.family, threshold } : null;
}

/** The families with at least one sound scored in this context. */
export function assessedFamilies(context: SpeechContext): SoundFamily[] {
  const families = new Set<SoundFamily>();
  for (const entry of Object.values(NB_SOUNDS)) if (entry.assess?.[context] != null) families.add(entry.assess.family);
  return [...families];
}
