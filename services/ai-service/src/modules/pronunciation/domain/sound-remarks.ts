import type { WordAlignment } from './align-word.js';
import { familyOf, soundOf, type SoundFamily } from './sound-inventory.js';
import type { WeakSound } from './weak-sounds.js';

/** One remark on a word: a family whose sound fell below the native threshold (plan 88, step 5). */
export interface WordSoundRemark {
  family: SoundFamily;
  /** The family's name in the inventory (`kj-lyden`). */
  title: string;
  /** The family's articulation note from the inventory, in English — what stays when no model explains it. */
  note: string;
  /** `major` far below what native speakers score, `minor` a little below. */
  severity: 'minor' | 'major';
  /** NoFAbet symbols of the weak sounds of that family in the word, distinct. */
  symbols: string[];
}

/** A sound as a reading shows it: IPA (`''` where the lexicon's readings differ) and its score. */
export interface NamedSound {
  symbol: string;
  accuracy: number;
}

/** The `sound` atom of a family (plan 86 Q5): the language's inventory and the family in it. */
export function soundAtomId(language: string, family: SoundFamily): string {
  return `${language}:${family}`;
}

/**
 * A word's weak sounds as remarks, one per family in the order first met: two weak ʉ in one
 * word are one remark. `major` when the worst scored under half its threshold — kj said as k
 * scores 0–18 against 53 (§0.2); a near miss is `minor`.
 */
export function wordSoundRemarks(weak: readonly WeakSound[]): WordSoundRemark[] {
  const byFamily = new Map<SoundFamily, WeakSound[]>();
  for (const sound of weak) byFamily.set(sound.family, [...(byFamily.get(sound.family) ?? []), sound]);
  return [...byFamily].map(([family, sounds]) => {
    const worst = sounds.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
    const { title } = familyOf(family);
    return {
      family,
      title,
      note: `${title}: ${soundOf(worst.symbols[0]!)!.articulation}`,
      severity: worst.accuracy < worst.threshold / 2 ? 'major' : 'minor',
      symbols: [...new Set(sounds.flatMap((s) => s.symbols))],
    };
  });
}

/** The word's sounds in IPA, `?` where the readings differ; empty when they were not named. */
export function transcriptionOf(alignment: WordAlignment): string {
  return alignment.status === 'aligned' ? alignment.sounds.map((s) => s.ipa ?? '?').join('') : '';
}

/** The word's sounds with their scores; null when they could not be named against the lexicon. */
export function namedSoundsOf(alignment: WordAlignment): NamedSound[] | null {
  return alignment.status === 'aligned'
    ? alignment.sounds.map((s) => ({ symbol: s.ipa ?? '', accuracy: s.accuracy }))
    : null;
}
