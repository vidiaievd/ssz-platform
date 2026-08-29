// Deterministic, seeded shuffling of the statement rows.
//
// Two rules, and the second is a hard prohibition the handoff repeats three times:
//
//   1. **Seeded and reproducible.** The same student sees a stable order within an attempt,
//      and a test can assert an order rather than a set.
//   2. **Only rows are ever shuffled.** IMPLEMENTATION.md, "Things that will bite you":
//      shuffling the columns would break the table header, the audit and the muscle memory
//      of a Riktig/Galt grid. There is deliberately no `orderedColumns` in this file.
//
// Where the seed comes from is the caller's decision, and plan 54 §3.5 makes it: the server
// seeds per attempt, so a reload does not re-deal the table.

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
