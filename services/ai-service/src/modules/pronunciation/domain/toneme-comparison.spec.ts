import { compareToneme, LEARNER_TONEME_BOUNDS, melodySpan } from './toneme-comparison.js';
import { measureToneme, tonemeWindow, type TonemeMeasure } from './toneme-feature.js';

const measure = (score: number): TonemeMeasure => ({
  onset: score,
  post: 0,
  score,
  tone: score > LEARNER_TONEME_BOUNDS.tone2Above ? 2 : score < LEARNER_TONEME_BOUNDS.tone1Below ? 1 : null,
});

describe('compareToneme (plan 88, step 8)', () => {
  // *bønner* (toneme 2): the reference Pernille kept scored 3.3 (step 6b.2, live).
  const bonner = { tone: 2 as const, referenceScore: 3.3 };

  it('says nothing when the learner leans to the word’s toneme, however weakly', () => {
    expect(compareToneme({ ...bonner, learner: measure(2.2) }).verdict).toEqual({ kind: 'like_reference' });
    expect(compareToneme({ ...bonner, learner: measure(7) }).verdict).toEqual({ kind: 'like_reference' });
  });

  it('calls the other toneme only past the learner’s bounds and far from the reference', () => {
    const flat = compareToneme({ ...bonner, learner: measure(-0.5) });
    expect(flat.verdict).toEqual({ kind: 'other_tone', heardAs: 1 });
    expect(flat.gap).toBe(-3.8);
  });

  it('is unsure inside the learner’s dead zone, though the reference’s bounds would call it toneme 1', () => {
    expect(compareToneme({ ...bonner, learner: measure(1.0) }).verdict).toEqual({ kind: 'unsure' });
  });

  it('is unsure past the bounds when the reference sits close', () => {
    // A reference at the edge of its own bounds (1.6 is not kept for 2, but 2.6 is): 0.3 is past the
    // learner's bound and still 2.3 from it.
    expect(compareToneme({ tone: 2, referenceScore: 2.6, learner: measure(0.3) }).verdict).toEqual({ kind: 'unsure' });
  });

  it('hears toneme 2 in a word of toneme 1 the same way', () => {
    // *bønder* (toneme 1): the kept reference scored 1.44.
    expect(compareToneme({ tone: 1, referenceScore: 1.44, learner: measure(5.1) }).verdict).toEqual({
      kind: 'other_tone',
      heardAs: 2,
    });
    expect(compareToneme({ tone: 1, referenceScore: 1.44, learner: measure(3.0) }).verdict).toEqual({ kind: 'unsure' });
  });

  it('has no gap and no verdict without a measure', () => {
    expect(compareToneme({ ...bonner, learner: null })).toEqual({
      tone: 2,
      learner: null,
      referenceScore: 3.3,
      gap: null,
      verdict: { kind: 'not_measured' },
    });
  });

  it('takes the measure as the feature gives it under the learner’s bounds', () => {
    const sounds = [
      { startMs: 0, durationMs: 40, stress: null },
      { startMs: 50, durationMs: 70, stress: 2 as const },
      { startMs: 130, durationMs: 60, stress: null },
      { startMs: 200, durationMs: 40, stress: 0 as const },
      { startMs: 250, durationMs: 40, stress: null },
    ];
    const window = tonemeWindow(sounds, 1)!;
    // Onset 3, post-tonic vowel 0: past the reference's bound for 2, inside the learner's dead zone.
    const points = Array.from({ length: 23 }, (_, i) => (i < 15 ? 3 : 0));
    const learner = measureToneme({ points }, 10, window, LEARNER_TONEME_BOUNDS);
    expect(learner).toMatchObject({ score: 3, tone: null });
    expect(measureToneme({ points }, 10, window)).toMatchObject({ tone: 2 });
    expect(compareToneme({ ...bonner, learner }).verdict).toEqual({ kind: 'like_reference' });
  });
});

describe('melodySpan', () => {
  const sounds = [
    { startMs: 400, durationMs: 40 },
    { startMs: 450, durationMs: 70 },
    { startMs: 530, durationMs: 60 },
    { startMs: 600, durationMs: 40 },
  ];

  it('runs from the stressed vowel to the word’s end and its tail', () => {
    expect(melodySpan(sounds, 1)).toEqual({ startMs: 450, endMs: 670 });
  });

  it('has none without a primary stress', () => {
    expect(melodySpan(sounds, null)).toBeNull();
    expect(melodySpan([], 0)).toBeNull();
  });
});
