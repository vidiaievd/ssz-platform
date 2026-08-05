import { gapFillViolations } from './gap-fill-preflight.js';

// Pre-flight is where plan 35's decision 5 lands: there is no `state: ready` on the
// exercise, so "may this be published?" is answered by running the builder's own
// validation engine over the stored document.

const settings = {
  shuffle: true,
  allowReuse: false,
  showBankCount: true,
  caseSensitive: false,
  input: 'bank',
};

/** A complete exercise: two gaps, a bank of four, every explanation written. */
function ready() {
  return {
    id: 'ex-1',
    content: {
      settings,
      sentences: [
        { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
        { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
      ],
      distractors: ['bestilt', 'regning'],
    },
    expectedAnswers: {
      feedback: {
        's1#3': {
          fallback: 'Needs an infinitive.',
          why: 'After «vil gjerne» the verb stays in the infinitive.',
          pairs: {
            regningen: { text: 'a noun', origin: 'author' },
            bestilt: { text: 'past participle', origin: 'author' },
            regning: { text: 'a noun', origin: 'author' },
          },
        },
        's2#3': {
          fallback: 'Check the form of the noun.',
          why: 'Your own bill is a specific thing.',
          pairs: {
            bestille: { text: 'a verb', origin: 'author' },
            bestilt: { text: 'a verb', origin: 'author' },
            regning: { text: 'indefinite', origin: 'author' },
          },
        },
      },
    },
  };
}

const codes = (violations: { ruleCode: string }[]) => violations.map((v) => v.ruleCode);

describe('gapFillViolations', () => {
  it('finds nothing wrong with a finished exercise', () => {
    expect(gapFillViolations(ready())).toEqual([]);
  });

  it('blocks publication of a gap with no default explanation', () => {
    const exercise = ready();
    exercise.expectedAnswers.feedback['s2#3'].fallback = '   ';

    expect(gapFillViolations(exercise)).toEqual([
      {
        ruleCode: 'GAPFILL_FB_NO_FALLBACK',
        severity: 'blocker',
        itemType: 'EXERCISE',
        itemId: 'ex-1',
        detail: '1 gap has no default explanation',
      },
    ]);
  });

  it('reports one violation per code, however many gaps are affected', () => {
    const exercise = ready();
    exercise.expectedAnswers.feedback = {};

    const violations = gapFillViolations(exercise);
    expect(codes(violations)).toEqual([
      'GAPFILL_FB_NO_FALLBACK',
      'GAPFILL_FB_NO_WHY',
      'GAPFILL_FB_PARTIAL_COVERAGE',
    ]);
    expect(violations[0]?.detail).toBe('2 gaps have no default explanation');
  });

  it('does not raise a missing title — the platform already calls that EXERCISE_INCOMPLETE', () => {
    // The document is built with an empty title on purpose; the code must be dropped
    // rather than reported under a second name.
    expect(codes(gapFillViolations(ready()))).not.toContain('GAPFILL_EX_NO_TITLE');
  });

  it('separates what blocks publication from what only warns', () => {
    const exercise = ready();
    exercise.content.distractors = [];

    const violations = gapFillViolations(exercise);
    // Two answers and no distractors: a thin bank, but the one pair each gap now
    // has is written, so coverage is complete and nothing else fires.
    const bySeverity = Object.fromEntries(violations.map((v) => [v.ruleCode, v.severity]));
    expect(bySeverity).toEqual({ GAPFILL_BANK_TOO_SMALL: 'warning' });
  });

  it('blocks a distractor that is really an answer, and names it', () => {
    const exercise = ready();
    exercise.content.distractors = ['bestilt', 'regning', 'bestille'];

    const violation = gapFillViolations(exercise).find(
      (v) => v.ruleCode === 'GAPFILL_BANK_DUPLICATE',
    );
    expect(violation?.severity).toBe('blocker');
    expect(violation?.detail).toBe('«bestille» is both a correct answer and a distractor');
  });

  it('blocks a sentence with no gap marked', () => {
    const exercise = ready();
    exercise.content.sentences[1].gaps = [];

    expect(codes(gapFillViolations(exercise))).toContain('GAPFILL_SENT_NO_GAP');
  });

  it('warns that a typed exercise will never show its word-specific explanations', () => {
    const exercise = ready();
    exercise.content.settings = { ...settings, input: 'free' };

    const violation = gapFillViolations(exercise).find(
      (v) => v.ruleCode === 'GAPFILL_FB_PAIRS_UNUSED',
    );
    expect(violation?.severity).toBe('warning');
    expect(violation?.detail).toContain('6 word-specific explanations');
  });

  it('does not throw on a document stored in some older shape', () => {
    expect(() =>
      gapFillViolations({ id: 'ex-1', content: null, expectedAnswers: 'nonsense' }),
    ).not.toThrow();
  });
});
