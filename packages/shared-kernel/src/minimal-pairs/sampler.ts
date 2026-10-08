// The probe sampler — `mpSample` of the handoff, which README calls «the real algorithm and can
// be lifted». Lifted as it is; what changed is only where the randomness comes from.
//
// Balanced: every word of every ready pair comes up once before any word repeats, and the
// answer never lands on the same side of its pair more than `maxSameAnswer` times in a row —
// students find a run of three identical answers faster than they find the contrast
// (DECISIONS §3). Random: any remaining word, no streak guard. Weakest: balanced over a deck
// where the words the student has missed before appear twice; with no history it is balanced
// exactly.
//
// The random source is a parameter. The builder's «One draw» and the preview use the
// prototype's LCG with a counter seed, so «Draw again» behaves as it does in the prototype; the
// engine passes a CSPRNG-seeded source per attempt and stores what it drew.

import { filledWords, optionWords, readyPairs } from './derive.js';
import type { MinimalPairsContent } from './model.js';

export type Rand = () => number;

/** The prototype's generator: `rnd = (rnd * 1664525 + 1013904223) >>> 0`. Exact in doubles. */
export function lcg(seed: number): Rand {
  let rnd = (seed || 7) >>> 0;
  return () => {
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    return rnd / 4294967296;
  };
}

/** One probe of a draw: which word of which pair, and on which side of the pair it sits. */
export interface DrawnProbe {
  n: number;
  pairId: string;
  wordId: string;
  /** The word's index among its pair's filled words — what the streak guard reads. */
  side: number;
}

/** What the student has done with a word before, keyed by `historyKey(text)`. */
export interface WordHistory {
  played: number;
  missed: number;
}

export type History = Record<string, WordHistory>;

/** Words are remembered by spelling, case-folded: «Kjære» in two exercises is one word. */
export function historyKey(text: string): string {
  return text.trim().toLowerCase();
}

interface Card {
  pairId: string;
  wordId: string;
  side: number;
}

export function sample(ex: MinimalPairsContent, rand: Rand, history?: History): DrawnProbe[] {
  const pairs = readyPairs(ex);
  if (pairs.length === 0) return [];
  const s = ex.set;
  const weakest = s.sampling === 'weakest' && history !== undefined;

  const build = (): Card[] => {
    const d: Card[] = [];
    for (const p of pairs) {
      filledWords(p).forEach((w, i) => {
        const card = { pairId: p.id, wordId: w.id, side: i };
        d.push(card);
        // Over-sample what was missed before. A word never missed, or never met, comes once.
        if (weakest && (history[historyKey(w.text)]?.missed ?? 0) > 0) d.push({ ...card });
      });
    }
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = d[i]!;
      d[i] = d[j]!;
      d[j] = t;
    }
    return d;
  };

  let cur = build();
  const out: Card[] = [];
  const want = Math.min(s.probes, s.allowRepeat ? s.probes : cur.length);
  const run = Math.max(1, s.maxSameAnswer);
  let guard = 0;
  while (out.length < want && guard++ < 500) {
    if (cur.length === 0) {
      if (!s.allowRepeat) break;
      cur = build();
    }
    let k = 0;
    if (s.sampling !== 'random') {
      const tail = out.slice(-run);
      const streak = tail.length === run && tail.every((x) => x.side === tail[0]!.side);
      if (streak) {
        const alt = cur.findIndex((x) => x.side !== tail[0]!.side);
        if (alt > -1) k = alt;
      }
    } else {
      k = Math.floor(rand() * cur.length);
    }
    out.push(cur.splice(k, 1)[0]!);
  }
  return out.map((x, i) => ({ n: i + 1, ...x }));
}

/** A probe as the engine stores it: the drawn word plus the button order the student will see. */
export interface DealtProbe extends DrawnProbe {
  optionIds: string[];
}

/** The draw and the button order of every probe, from one random source. */
export function deal(ex: MinimalPairsContent, rand: Rand, history?: History): DealtProbe[] {
  return sample(ex, rand, history).map((probe) => {
    const ids = optionWords(ex, probe.pairId).map((w) => w.id);
    if (ex.set.shuffleOptions) {
      for (let k = ids.length - 1; k > 0; k--) {
        const j = Math.floor(rand() * (k + 1));
        const t = ids[k]!;
        ids[k] = ids[j]!;
        ids[j] = t;
      }
    }
    return { ...probe, optionIds: ids };
  });
}
