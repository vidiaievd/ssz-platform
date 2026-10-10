// Facts read off a `minimal_pairs` document — the prototype's `mp*` helpers.

import type { MinimalPairsContent, Pair, Word } from './model.js';
import { hasClip } from './model.js';
import { pairContrastId } from './packs/index.js';

export interface PlacedWord extends Word {
  pairId: string;
}

/** Every word of every pair, in document order (`mpAllWords`). */
export function allWords(ex: MinimalPairsContent): PlacedWord[] {
  return ex.pairs.flatMap((p) => p.words.map((w) => ({ ...w, pairId: p.id })));
}

/** The words that say something (`mpFilled`). */
export function filledWords(pair: Pair): Word[] {
  return pair.words.filter((w) => w.text.trim() !== '');
}

/** A pair with two words and a clip on every word that has text (`mpReadyPairs`). */
export function isReadyPair(pair: Pair): boolean {
  return filledWords(pair).length >= 2 && filledWords(pair).every((w) => hasClip(w.clip));
}

export function readyPairs(ex: MinimalPairsContent): Pair[] {
  return ex.pairs.filter(isReadyPair);
}

/** How many distinct words a probe can be made of (`mpProbePool`). */
export function probePool(ex: MinimalPairsContent): number {
  return readyPairs(ex).reduce((n, p) => n + filledWords(p).length, 0);
}

/** Words with text and without a recording (`mpMissingClips`). */
export function missingClips(ex: MinimalPairsContent): number {
  return allWords(ex).filter((w) => w.text.trim() !== '' && !hasClip(w.clip)).length;
}

/** Words with text — the denominator of step 2's coverage line. */
export function wordCount(ex: MinimalPairsContent): number {
  return allWords(ex).filter((w) => w.text.trim() !== '').length;
}

/** Longest minus shortest clip in a pair, milliseconds (`mpPairSpread`). */
export function pairSpread(pair: Pair): number {
  const ms = filledWords(pair)
    .map((w) => w.clip.durationMs)
    .filter((x) => x > 0);
  return ms.length > 1 ? Math.max(...ms) - Math.min(...ms) : 0;
}

/** The distinct voices in a pair, a clip's voice standing in for its provenance (`mpVoices`). */
export function voicesOf(pair: Pair): string[] {
  const out: string[] = [];
  for (const w of filledWords(pair)) {
    if (!hasClip(w.clip)) continue;
    const v = w.clip.voice.trim() || w.clip.provenance;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** Synthetic clips per family — the policy is the pair's family's, not the exercise's. */
export function syntheticByContrast(ex: MinimalPairsContent): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of ex.pairs) {
    const n = filledWords(p).filter((w) => hasClip(w.clip) && w.clip.provenance === 'tts').length;
    if (n === 0) continue;
    const id = pairContrastId(ex, p);
    out.set(id, (out.get(id) ?? 0) + n);
  }
  return out;
}

export function syntheticCount(ex: MinimalPairsContent): number {
  let n = 0;
  for (const v of syntheticByContrast(ex).values()) n += v;
  return n;
}

/** The families the set trains (`mpMixed`): the exercise's and any a pair overrides with. */
export function contrastsInSet(ex: MinimalPairsContent): string[] {
  const out = [ex.contrastId];
  for (const p of ex.pairs) {
    const id = pairContrastId(ex, p);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** What a probe's buttons hold (`mpOptions`): the pair's words, or every word of the set. */
export function optionWords(ex: MinimalPairsContent, pairId: string): Word[] {
  const pair = ex.pairs.find((p) => p.id === pairId);
  if (!pair) return [];
  return ex.set.options === 'all'
    ? ex.pairs.flatMap((p) => filledWords(p))
    : filledWords(pair);
}

/** Correct answers the pass mark asks for — step 5's «k of N correct». */
export function neededToPass(passPct: number, probes: number): number {
  return Math.ceil((passPct / 100) * probes);
}

/** Minutes the reader card promises: a quarter of a minute per probe, at least one. */
export function estimatedMinutes(probes: number): number {
  return Math.max(1, Math.round(probes * 0.25));
}

export function findWord(ex: MinimalPairsContent, wordId: string): PlacedWord | undefined {
  return allWords(ex).find((w) => w.id === wordId);
}
