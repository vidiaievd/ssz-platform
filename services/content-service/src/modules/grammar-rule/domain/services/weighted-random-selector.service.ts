/**
 * Pure domain service — no @Injectable, no external dependencies.
 * Selects a single exercise from a weighted pool, excluding already-seen IDs.
 * All methods are static to make the service unambiguously side-effect-free.
 */
export class WeightedRandomSelectorService {
  /**
   * Selects a random exerciseId from the pool using weighted probability.
   *
   * Algorithm:
   *  1. Filter out entries where exerciseId is in excludeExerciseIds.
   *  2. If empty → return null.
   *  3. Compute cumulative weights.
   *  4. Pick a random value in [0, totalWeight).
   *  5. Binary search for the entry whose cumulative range covers the random value.
   *  6. Return exerciseId.
   */
  static selectWeightedRandom(
    entries: Array<{ exerciseId: string; weight: number }>,
    excludeExerciseIds: string[],
  ): string | null {
    const excluded = new Set(excludeExerciseIds);
    const eligible = entries.filter((e) => !excluded.has(e.exerciseId));

    if (eligible.length === 0) {
      return null;
    }

    // Build cumulative weight array.
    const cumulative: number[] = [];
    let total = 0;
    for (const entry of eligible) {
      total += entry.weight;
      cumulative.push(total);
    }

    const rand = Math.random() * total;

    // Binary search for the first cumulative value > rand.
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= rand) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return eligible[lo].exerciseId;
  }
}
