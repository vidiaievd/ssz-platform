import { audioViolations } from './audio-preflight.js';

// The one blocker here is the one a student would otherwise find: listening switched on
// with nothing attached shows a player with no clip, and behind a `first` gate it shows
// items that will never unlock. Everything else the layer says is a judgement the author
// is allowed to make, and stays a warning.

const audio = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  source: 'asset',
  assetId: 'asset-1',
  title: 'Dialog: på legekontoret',
  duration: 60,
  transcript: '',
  useSegments: false,
  settings: {
    layout: 'top',
    plays: 0,
    seek: true,
    speed: true,
    gate: 'none',
    transcriptWhen: 'never',
    ...((over['settings'] as object) ?? {}),
  },
  ...over,
});

const exercise = (content: unknown, templateCode = 'multiple_choice') => ({
  id: 'ex-1',
  templateCode,
  content,
});

const codes = (violations: ReturnType<typeof audioViolations>) => violations.map((v) => v.ruleCode);

describe('audioViolations', () => {
  it('says nothing about an exercise that carries no audio', () => {
    expect(audioViolations(exercise({ questions: [{ id: 'q1' }] }))).toEqual([]);
  });

  it('says nothing about an exercise whose audio is switched off', () => {
    // Switching off keeps the material, and a kept clip is not an unfinished one.
    expect(audioViolations(exercise({ audio: audio({ enabled: false, assetId: '' }) }))).toEqual([]);
  });

  it('blocks publication of a listening exercise with nothing to play', () => {
    const violations = audioViolations(exercise({ audio: audio({ assetId: '' }) }));

    expect(violations).toContainEqual(
      expect.objectContaining({
        ruleCode: 'AUDIO_AUD_NO_CLIP',
        severity: 'blocker',
        itemType: 'EXERCISE',
        itemId: 'ex-1',
      }),
    );
  });

  it('clears the blocker for a link and for a borrowed lesson clip', () => {
    for (const source of [
      { source: 'link', url: 'https://example.test/dialog.mp3', assetId: '' },
      { source: 'lesson', lessonRef: { lessonId: 'l-1', variant: 'nb' }, assetId: '' },
    ]) {
      expect(codes(audioViolations(exercise({ audio: audio(source) })))).not.toContain(
        'AUDIO_AUD_NO_CLIP',
      );
    }
  });

  it('warns rather than blocks about the judgements the author is allowed to make', () => {
    const violations = audioViolations(
      exercise({
        questions: [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}` })),
        audio: audio({ title: '', settings: { plays: 1, seek: false, transcriptWhen: 'after' } }),
      }),
    );

    expect(violations.every((v) => v.severity === 'warning')).toBe(true);
    expect(codes(violations)).toEqual(
      expect.arrayContaining([
        'AUDIO_AUD_NO_TITLE',
        'AUDIO_AUD_ONE_PLAY_MANY_ITEMS',
        'AUDIO_AUD_NO_TRANSCRIPT',
      ]),
    );
  });

  it('drops the info level, which belongs on the card and not in a container report', () => {
    // "A limit next to a scrub bar does not limit" — true, and not worth a line here.
    const violations = audioViolations(
      exercise({ audio: audio({ settings: { plays: 2, seek: true } }) }),
    );
    expect(violations).toEqual([]);
  });

  it('finds the timecodes wherever the template keeps its items', () => {
    // The kernel is written against "an item"; which key holds them is this file's job.
    const broken = { audio: { start: 30, end: 10 } };

    const mc = audioViolations(
      exercise({ questions: [{ id: 'q1', ...broken }], audio: audio({ useSegments: true }) }),
    );
    const pairs = audioViolations(
      exercise(
        { pairs: [{ id: 'p1', ...broken }], audio: audio({ useSegments: true }) },
        'match_pairs',
      ),
    );
    const sentences = audioViolations(
      exercise(
        { sentences: [{ id: 's1', ...broken }], audio: audio({ useSegments: true }) },
        'word_bank_gap_fill',
      ),
    );

    for (const violations of [mc, pairs, sentences]) {
      expect(codes(violations)).toContain('AUDIO_AUD_SEG_INVERTED');
    }
  });

  it('reports one line per code however many items share it', () => {
    const violations = audioViolations(
      exercise({
        questions: [1, 2, 3].map((n) => ({ id: `q${n}`, audio: { start: 30, end: 10 } })),
        audio: audio({ useSegments: true }),
      }),
    );

    const inverted = violations.filter((v) => v.ruleCode === 'AUDIO_AUD_SEG_INVERTED');
    expect(inverted).toHaveLength(1);
    expect(inverted[0]?.detail).toContain('3 timecodes');
  });

  it('judges a template it has no item key for on the exercise-level rules alone', () => {
    // `writing_task` has nothing to time, and that is not a failure to report.
    const violations = audioViolations(
      exercise({ prompt: 'Skriv et svar', audio: audio({ assetId: '' }) }, 'writing_task'),
    );
    expect(codes(violations)).toEqual(['AUDIO_AUD_NO_CLIP']);
  });
});
