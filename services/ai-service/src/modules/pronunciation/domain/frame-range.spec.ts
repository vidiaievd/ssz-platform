import { FRAME_RANGE_MIN_POINTS, frameRange, frameSpans } from './frame-range.js';
import { BENCH_93_FRAMES } from './frame-range.fixture.js';

describe('frame range (plan 88, step 9.5)', () => {
  it.each(Object.entries(BENCH_93_FRAMES))('gives the bench 9.3 number for %s', (_clip, { range, curves }) => {
    expect(frameRange(curves)).toBe(range);
  });

  it('tells the voices apart as the bench did: Finn wide, Pernille narrow, the owner narrower', () => {
    const of = (clip: string) => frameRange(BENCH_93_FRAMES[clip]!.curves)!;
    expect(of('synth_w01_Finn')).toBeGreaterThan(13);
    expect(of('synth_w01_Pernille')).toBeGreaterThan(5.5);
    expect(of('synth_w01_Pernille')).toBeLessThan(8);
    expect(of('owner_w01_own')).toBeLessThan(5);
  });

  it('interpolates the percentiles linearly between ranks, as numpy does', () => {
    // numpy.percentile([0..10], 90) − percentile(…, 10) = 9 − 1.
    expect(frameRange([{ points: Array.from({ length: 11 }, (_, i) => i) }])).toBe(8);
    // Four points per curve, pooled across curves, nulls left out: 1..12 → 10.9 − 2.1.
    expect(
      frameRange([
        { points: [1, null, 2, 3, 4] },
        { points: [5, 6, 7, 8] },
        { points: [null, 9, 10, 11, 12] },
      ]),
    ).toBe(8.8);
  });

  it(`measures nothing on fewer than ${FRAME_RANGE_MIN_POINTS} voiced points`, () => {
    expect(frameRange([{ points: [1, 2, 3, null, null, null, null, null, null, 4, 5, 6, 7, 8, 9] }])).toBeNull();
    expect(frameRange([])).toBeNull();
  });

  it('takes the carrier words around the word, not the word itself nor words of no length', () => {
    const heard = [
      { startMs: 100, endMs: 300 }, // nå
      { startMs: 300, endMs: 560 }, // sier
      { startMs: 560, endMs: 790 }, // jeg
      { startMs: 800, endMs: 1100 }, // the word
      { startMs: 1100, endMs: 1100 }, // nothing
      { startMs: 1110, endMs: 1500 }, // igjen
    ];
    expect(frameSpans(heard, { startMs: 800, endMs: 1100 })).toEqual([
      { startMs: 100, endMs: 300 },
      { startMs: 300, endMs: 560 },
      { startMs: 560, endMs: 790 },
      { startMs: 1110, endMs: 1500 },
    ]);
    // A word the recognizer stretched over the toneme word overlaps it and is left out.
    expect(frameSpans([{ startMs: 700, endMs: 900 }], { startMs: 800, endMs: 1100 })).toEqual([]);
  });

  it('cuts a word longer than the sidecar takes', () => {
    expect(frameSpans([{ startMs: 0, endMs: 2600 }], { startMs: 3000, endMs: 3300 })).toEqual([
      { startMs: 0, endMs: 2000 },
    ]);
  });
});
