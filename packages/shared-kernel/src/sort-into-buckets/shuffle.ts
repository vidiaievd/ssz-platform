// Deterministic, seeded shuffling of the items.
//
// Seeded so a student sees a stable order within an attempt and a test can assert an
// order. The server seeds per attempt (plan 66 §3.1), so a reload does not re-deal the
// pool. Buckets are never shuffled: their order is the author's, and the same zone in the
// same place is what lets a student apply a rule instead of hunting for it.

/** A Fisher-Yates pass driven by a linear congruential generator (Numerical Recipes). */
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

/** The no-op ordering: author order. */
export const identityShuffle = <T,>(items: readonly T[]): T[] => [...items];
