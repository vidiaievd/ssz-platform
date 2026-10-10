// Language packs for `minimal_pairs`, by the document's language (plan 72 §3.3; spec 19 §1.2).
//
// A course in a language without a pack has no contrast families to offer, and the builder says
// so (`MP_NO_CONTRAST`) rather than falling back to Norwegian ones.

import type { MinimalPairsContent, Pair } from '../model.js';
import { NB_PACK } from './nb.js';
import type { ContrastFamily, LanguagePack } from './types.js';

export type { ContrastFamily, ContrastIcon, Dialect, LanguagePack, PackPlaceholders, TtsPolicy } from './types.js';

const PACKS: readonly LanguagePack[] = [NB_PACK];

/** `nb`, `nb-NO`, `NB` all find the Bokmål pack. */
export function packFor(language: string): LanguagePack | undefined {
  const base = language.toLowerCase().split(/[-_]/)[0] ?? '';
  return PACKS.find((p) => p.language === base);
}

export function contrastsOf(language: string): ContrastFamily[] {
  return packFor(language)?.contrasts ?? [];
}

/** The exercise's family, or `undefined` when the pack does not know it. */
export function exerciseContrast(ex: MinimalPairsContent): ContrastFamily | undefined {
  return contrastsOf(ex.language).find((c) => c.id === ex.contrastId);
}

/** The family a pair trains — its own when set and known, the exercise's otherwise (`mpPairContrast`). */
export function pairContrast(ex: MinimalPairsContent, pair: Pair): ContrastFamily | undefined {
  const families = contrastsOf(ex.language);
  return (
    (pair.contrastId !== '' ? families.find((c) => c.id === pair.contrastId) : undefined) ??
    families.find((c) => c.id === ex.contrastId)
  );
}

/** The id a pair trains, as the event and the history read it. */
export function pairContrastId(ex: MinimalPairsContent, pair: Pair): string {
  return pairContrast(ex, pair)?.id ?? ex.contrastId;
}

export function libraryOf(language: string, contrastId: string): [string, string][] {
  return packFor(language)?.library[contrastId] ?? [];
}
