import {
  LATENCY_BUCKET_BOUNDS_MS,
  LATENCY_BUCKET_COUNT,
  histogramPercentile,
  latencyBucket,
  mergeHistograms,
  singleCallHistogram,
} from '../../../../src/modules/ai-usage/domain/latency-histogram.js';

describe('latency histogram', () => {
  it('puts a call on a bound into that bound’s bucket and anything slower into the open one', () => {
    expect(latencyBucket(0)).toBe(0);
    expect(latencyBucket(10)).toBe(0);
    expect(latencyBucket(11)).toBe(1);
    expect(latencyBucket(120_000)).toBe(LATENCY_BUCKET_BOUNDS_MS.length - 1);
    expect(latencyBucket(500_000)).toBe(LATENCY_BUCKET_BOUNDS_MS.length);
  });

  it('builds a one-call histogram of the full width', () => {
    const h = singleCallHistogram(800);
    expect(h).toHaveLength(LATENCY_BUCKET_COUNT);
    expect(h.reduce((a, b) => a + b, 0)).toBe(1);
    expect(h[latencyBucket(800)]).toBe(1);
  });

  it('merges element-wise and reads a shorter array as zeros', () => {
    expect(mergeHistograms([1, 2, 3], [1])).toEqual([2, 2, 3]);
    expect(mergeHistograms([], [0, 4])).toEqual([0, 4]);
  });

  it('interpolates a percentile inside its bucket', () => {
    // Ten calls, all in (1000, 1500]: the median sits halfway through that bucket.
    const h = new Array<number>(LATENCY_BUCKET_COUNT).fill(0);
    h[latencyBucket(1_200)] = 10;
    expect(histogramPercentile(h, 0.5, 1_000, 1_500)).toBe(1_250);
    // The bucket is narrowed to the calls actually seen, not to its bounds.
    expect(histogramPercentile(h, 0.5, 1_001, 1_300)).toBe(1_151);
  });

  it('never reports more than the slowest call seen', () => {
    const h = singleCallHistogram(130_000);
    expect(histogramPercentile(h, 0.95, 130_000, 130_000)).toBeLessThanOrEqual(130_000);
    const fast = singleCallHistogram(3);
    expect(histogramPercentile(fast, 0.95, 3, 3)).toBe(3);
  });

  it('separates a fast majority from a slow tail', () => {
    // 95 refusals answered in 2 ms, 5 model calls at ~8 s.
    const h = mergeHistograms(
      Array.from({ length: 95 }, () => singleCallHistogram(2)).reduce(mergeHistograms, []),
      Array.from({ length: 5 }, () => singleCallHistogram(8_000)).reduce(mergeHistograms, []),
    );
    expect(histogramPercentile(h, 0.5, 2, 8_000)).toBeLessThanOrEqual(10);
    expect(histogramPercentile(h, 0.96, 2, 8_000)).toBeGreaterThan(7_500);
  });

  it('reports a lone call as itself', () => {
    expect(histogramPercentile(singleCallHistogram(2), 0.5, 2, 2)).toBe(2);
    expect(histogramPercentile(singleCallHistogram(2), 0.95, 2, 2)).toBe(2);
  });

  it('has no percentile without calls', () => {
    expect(histogramPercentile(new Array(LATENCY_BUCKET_COUNT).fill(0), 0.5, 0, 0)).toBeNull();
  });
});
