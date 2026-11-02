import { measureToneme, tonemeWindow } from './toneme-feature.js';

type Sound = { startMs: number; durationMs: number; stress: 0 | 1 | 2 | 3 | null };
const sound = (startMs: number, durationMs: number, stress: Sound['stress'] = null): Sound => ({
  startMs,
  durationMs,
  stress,
});

// Azure TTS in «Nå sier jeg … igjen.», heard back by Pronunciation Assessment, F0 from the sidecar
// (step 6b.2 calibration, 02.11): times from the word's start, the curve from the stressed vowel's.
const BONNER_PERNILLE = {
  sounds: [sound(0, 40), sound(50, 70, 2), sound(130, 60), sound(200, 40, 0), sound(250, 40)],
  points: [
    2, 1.7, 1.5, 1.2, 0.8, 0.3, 0.1, 0.1, -0.3, -0.8, -1.4, -1.8, -2.1, -2.3, -2.5, -2.3, -2.2, -2.3, -2.3, -2.3, -2.3,
    -2.4,
  ],
};
const BONDER_ISELIN = {
  sounds: [sound(0, 50), sound(60, 90, 1), sound(160, 60), sound(230, 40, 0), sound(280, 50)],
  points: [
    -0.3, -0.7, -1.1, -1.5, -1.8, -2.2, -2.5, -2.5, -2.7, -2.9, -2.9, -3, -3.1, -3.1, -3.1, -3.2, -3.1, -2.9, -2.7,
    -2.4, -2.2, -2, -1.7, -1.4, -1.4,
  ],
};

describe('tonemeWindow (plan 88, step 6b.2)', () => {
  it('spans the stressed vowel to the end of the post-tonic one, its tail included', () => {
    expect(tonemeWindow(BONNER_PERNILLE.sounds, 1)).toEqual({
      span: { startMs: 50, endMs: 50 + 150 + 40 + 30 },
      post: { fromMs: 150, toMs: 220 },
    });
  });

  it('has none without a single primary stress or a syllable after it', () => {
    expect(tonemeWindow(BONNER_PERNILLE.sounds, null)).toBeNull();
    expect(tonemeWindow([sound(0, 40), sound(40, 120, 1), sound(160, 50)], 1)).toBeNull();
  });
});

describe('measureToneme (§0.5c)', () => {
  it('hears toneme 2 in a high onset over a low post-tonic vowel (bønner)', () => {
    const window = tonemeWindow(BONNER_PERNILLE.sounds, 1)!;
    const measure = measureToneme({ points: BONNER_PERNILLE.points }, 10, window)!;
    expect(measure.tone).toBe(2);
    expect(measure.score).toBeCloseTo(3.3, 1);
  });

  it('hears toneme 1 where the onset sits no higher than the post-tonic vowel (bønder)', () => {
    const window = tonemeWindow(BONDER_ISELIN.sounds, 1)!;
    const measure = measureToneme({ points: BONDER_ISELIN.points }, 10, window)!;
    expect(measure.tone).toBe(1);
    expect(measure.score).toBeLessThan(1.5);
  });

  it('leaves the first 20 ms out: a voiceless onset lifts them', () => {
    const window = { span: { startMs: 0, endMs: 200 }, post: { fromMs: 150, toMs: 200 } };
    const points = [9, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(measureToneme({ points }, 10, window)!.onset).toBe(0);
  });

  it('is unsure between the bounds', () => {
    const window = { span: { startMs: 0, endMs: 200 }, post: { fromMs: 150, toMs: 200 } };
    const points = [2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    expect(measureToneme({ points }, 10, window)).toMatchObject({ score: 2, tone: null });
  });

  it('takes the first voiced frames up to 100 ms when the onset window is voiceless (alle, step 9.2)', () => {
    const window = { span: { startMs: 0, endMs: 300 }, post: { fromMs: 240, toMs: 300 } };
    // Iselin's «alle» after «jeg»: the vowel's first 60 ms come back unvoiced.
    const points = [null, null, null, null, null, null, 3.3, 3.6, 3.6, 3.3, 2.8, 2, 1.2, 0.3, -0.5, -1.3, -2];
    points.push(-2.7, -3.2, -3.6, -3.8, -4, -4, -3.9, -3.3, -2.7, -2.2, -1.9, -1.6, -1.2);
    expect(measureToneme({ points }, 10, window)).toMatchObject({ onset: 3.45, tone: 2 });
  });

  it('keeps the onset window when it has a voiced frame: the fallback does not move a measured onset', () => {
    const window = { span: { startMs: 0, endMs: 200 }, post: { fromMs: 150, toMs: 200 } };
    const points = [null, null, null, null, null, 1, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(measureToneme({ points }, 10, window)!.onset).toBe(1);
  });

  it('measures nothing without a voiced onset or post-tonic vowel', () => {
    const window = { span: { startMs: 0, endMs: 200 }, post: { fromMs: 150, toMs: 200 } };
    const silentOnset = [1, 1, null, null, null, null, null, null, null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const silentPost = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, null, null, null, null];
    expect(measureToneme({ points: silentOnset }, 10, window)).toBeNull();
    expect(measureToneme({ points: silentPost }, 10, window)).toBeNull();
  });
});
