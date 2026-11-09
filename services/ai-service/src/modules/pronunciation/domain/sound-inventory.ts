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

/**
 * The transcription with every syllabic consonant split into the sounds Azure hears in its place
 * (plan 88, step 9.1: *hesten* `H EH1 S T NX0` → `H EH1 S T AX0 N`); null when it has none.
 * `spelling` is the word as written — a word-final split may follow it (*morgen* → r g ə n).
 */
export function splitSyllabic(tokens: readonly NofabetToken[], spelling = ''): NofabetToken[] | null {
  if (!tokens.some((t) => NB_SOUNDS[t.symbol]?.split)) return null;
  const written = spelling.toLowerCase();
  return tokens.flatMap((t, i) => {
    const entry = NB_SOUNDS[t.symbol];
    if (!entry?.split) return [t];
    const spelled =
      i === tokens.length - 1
        ? Object.entries(entry.splitSpelled ?? {}).find(([ending]) => written.endsWith(ending))?.[1]
        : undefined;
    let split = spelled ?? entry.split;
    // The r is already in a retroflex before it: *stjernen* `RN RNX0` is heard ɳ ə n, not ɳ r ə n.
    const before = tokens[i - 1] ? NB_SOUNDS[tokens[i - 1]!.symbol] : undefined;
    if (!spelled && split[0] === 'R' && before?.kind === 'consonant' && before.family === 'retroflex') {
      split = split.slice(1);
    }
    return split.map((symbol) => ({ symbol, stress: NB_SOUNDS[symbol]!.kind === 'vowel' ? t.stress : null }));
  });
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

/** Course languages with a sound inventory — the only ones whose sounds are reviewed (plan 88). */
const INVENTORY_LANGUAGES: ReadonlySet<string> = new Set(['nb']);

export function hasSoundInventory(language: string): boolean {
  return INVENTORY_LANGUAGES.has(language);
}
