/**
 * Fixed latency buckets for the AI usage rollup (plan 77, step 10).
 *
 * Upper bounds in milliseconds; a call lands in the first bucket whose bound it does not
 * exceed, and anything slower than the last bound in the open bucket after it. The spacing
 * is roughly logarithmic: a gate refusal answers in single milliseconds, a model call takes
 * seconds, and the request timeout of the gateway is 120 s.
 *
 * The bounds are part of the stored data — row `latency_buckets[i]` means bucket `i` of
 * this list. Changing them means rebuilding `ai_usage_daily` from the event archive.
 */
export const LATENCY_BUCKET_BOUNDS_MS = [
  10, 50, 100, 250, 500, 750, 1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 7_500, 10_000,
  15_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000,
] as const;

/** Bounds plus the open bucket above the last one. */
export const LATENCY_BUCKET_COUNT = LATENCY_BUCKET_BOUNDS_MS.length + 1;

/** Zero-based bucket for one latency. */
export function latencyBucket(latencyMs: number): number {
  const ms = Math.max(0, latencyMs);
  const index = LATENCY_BUCKET_BOUNDS_MS.findIndex((bound) => ms <= bound);
  return index === -1 ? LATENCY_BUCKET_BOUNDS_MS.length : index;
}

/** A histogram with one call in the bucket of `latencyMs`. */
export function singleCallHistogram(latencyMs: number): number[] {
  const buckets = new Array<number>(LATENCY_BUCKET_COUNT).fill(0);
  buckets[latencyBucket(latencyMs)] = 1;
  return buckets;
}

/** Element-wise sum. A shorter array is read as zeros past its end. */
export function mergeHistograms(a: readonly number[], b: readonly number[]): number[] {
  const length = Math.max(a.length, b.length);
  return Array.from({ length }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

/**
 * Percentile `q` (0..1) read off the histogram, interpolated linearly inside the bucket it
 * falls in. The bucket is narrowed to the fastest and slowest calls actually seen: the open
 * bucket has no upper bound of its own, and without the narrowing a group of one 2 ms call
 * would report a median of 1 ms. Null when there are no calls.
 */
export function histogramPercentile(
  buckets: readonly number[],
  q: number,
  minMs: number,
  maxMs: number,
): number | null {
  const total = buckets.reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;

  const target = q * total;
  let before = 0;
  for (let i = 0; i < buckets.length; i++) {
    const count = buckets[i] ?? 0;
    if (count === 0 || before + count < target) {
      before += count;
      continue;
    }
    const lower = Math.max(i === 0 ? 0 : LATENCY_BUCKET_BOUNDS_MS[i - 1], minMs);
    const upper = Math.max(Math.min(LATENCY_BUCKET_BOUNDS_MS[i] ?? maxMs, maxMs), lower);
    const value = lower + (upper - lower) * ((target - before) / count);
    return Math.round(Math.min(value, maxMs));
  }
  return maxMs;
}
