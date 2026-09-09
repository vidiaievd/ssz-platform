// Deterministic, seeded shuffling — README "mcShuffled".
//
// Two rules the handoff states and this file keeps:
//
//   1. **Seeded and reproducible.** The same student sees a stable order within an
//      attempt, and a test can assert an order rather than a set.
//   2. **`fixed` options are appended last, in author order.** "Alle over" that floats
//      into the middle of the list is a bug the reader sees before the author does.
//
// Where the seed comes from is a caller's decision, and plan 53 §3.4 makes it: the server
// seeds per attempt, so a reload does not re-deal the options and the order the server
// numbered the 50/50 by is the order the student is looking at.

/** A Fisher–Yates pass driven by a linear congruential generator (Numerical Recipes). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = (Math.trunc(seed) >>> 0) || 1;

  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }

  return out;
}

/**
 * Order one question's options: everything shuffled except the pinned ones, which follow
 * in author order.
 *
 * `shuffle` is injected rather than called from here — the same arrangement
 * `sentence_schema` and `match_pairs` use — so this stays a pure function the builder
 * preview can drive with a stable seed while the server drives it with a per-attempt one.
 */
export function ordered<T extends { fixed: boolean }>(
  options: readonly T[],
  shuffle: <U>(items: readonly U[]) => U[],
): T[] {
  const loose = options.filter((o) => !o.fixed);
  const pinned = options.filter((o) => o.fixed);
  return [...shuffle(loose), ...pinned];
}

/** The no-op ordering: author order, pinned options still last. */
export const identityShuffle = <T,>(items: readonly T[]): T[] => [...items];
