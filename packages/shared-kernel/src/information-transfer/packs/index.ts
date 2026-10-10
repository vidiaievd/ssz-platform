// Language packs for `information_transfer`, by the course language (plan 73 §3.3).
//
// A course in a language without a pack is not given Norwegian (the prototype's `infPack` fell
// back to `nb`): its cells are read from digits only, and the builder says so (`INF_NO_PACK`,
// decision Q2-A).

import { NB_PACK } from './nb.js';
import type { FormatPack } from './types.js';

export type { AcceptedTemplates, FormatPack, PackPlaceholders } from './types.js';

export const PACKS: readonly FormatPack[] = [NB_PACK];

function baseOf(language: string): string {
  return language.toLowerCase().split(/[-_]/)[0] ?? '';
}

/** `nb`, `nb-NO`, `NB` all find the Bokmål pack. */
export function packFor(language: string): FormatPack | undefined {
  const base = baseOf(language);
  return PACKS.find((p) => p.language === base);
}

/** The packs the builder's select offers: those of the course language. */
export function packsFor(language: string): FormatPack[] {
  const base = baseOf(language);
  return PACKS.filter((p) => p.language === base);
}
