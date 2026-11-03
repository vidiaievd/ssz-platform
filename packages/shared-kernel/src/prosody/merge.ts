// What a student sees: the lexicon's word stresses with the authored layer over them
// (§4a, decisions 4–5). An authored stress replaces the lexicon's on its word — a homograph
// the lexicon resolved wrongly; phrase marks come only from the authored layer. A text nobody
// marked is merged with an empty layer and shows the lexicon words alone.
//
// Both inputs must be anchored to the same text: the lexicon words are computed for it, the
// authored layer re-anchored to it on every edit. Orphans are the author's business and are
// not passed on.

import type { ProsodyLayer, WordStress } from './model.js';
import { emptyProsodyLayer } from './model.js';

export function mergeProsody(
  lexicon: readonly WordStress[],
  authored: ProsodyLayer = emptyProsodyLayer(),
): ProsodyLayer {
  const byToken = new Map<number, WordStress>();
  for (const s of lexicon) byToken.set(s.i, s);
  for (const s of authored.stresses) {
    const known = byToken.get(s.i);
    // The notation does not carry length; the lexicon knows it when both mean the same vowel.
    const long =
      s.vowel.long ??
      (known && known.vowel.s === s.vowel.s && known.vowel.e === s.vowel.e
        ? known.vowel.long
        : null);
    byToken.set(s.i, { ...s, vowel: { ...s.vowel, long } });
  }

  return {
    ...emptyProsodyLayer(),
    stresses: [...byToken.values()].sort((a, b) => a.i - b.i),
    accents: [...authored.accents],
    boundaries: [...authored.boundaries],
    links: [...authored.links],
  };
}
