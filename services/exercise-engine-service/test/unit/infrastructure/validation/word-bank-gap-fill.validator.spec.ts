import { WordBankGapFillValidator } from '../../../../src/infrastructure/validation/validators/word-bank-gap-fill.validator.js';

const validator = new WordBankGapFillValidator();

const settings = {
  shuffle: true,
  allowReuse: false,
  showBankCount: true,
  caseSensitive: false,
  input: 'bank',
};

const content = {
  settings,
  sentences: [
    { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
    { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
  ],
  distractors: ['bestilt', 'regning'],
};

const expectedAnswers = {
  feedback: {
    's1#3': {
      fallback: 'This gap needs an infinitive.',
      why: 'After «vil gjerne» the verb stays in the infinitive.',
      pairs: { bestilt: { text: '«bestilt» needs «har».', origin: 'author' } },
    },
    's2#3': { fallback: 'Check the form of the noun.', why: '', pairs: {} },
  },
};

const run = (
  placements: Array<{ gapKey: string; word: string }>,
  overrides: { content?: unknown; expectedAnswers?: unknown; checkSettings?: Record<string, unknown> } = {},
) =>
  validator.validate({
    submittedAnswer: { placements },
    expectedAnswers: overrides.expectedAnswers ?? expectedAnswers,
    content: overrides.content ?? content,
    checkSettings: overrides.checkSettings ?? { allow_partial_credit: true },
    targetLanguage: 'no',
  });

type GapDetail = { gapKey: string; correct: boolean; explanation: string | null };
const detailsOf = (result: ReturnType<typeof run>): GapDetail[] =>
  (result.value.details as { gaps: GapDetail[] }).gaps;

describe('WordBankGapFillValidator', () => {
  it('scores a fully correct answer', () => {
    const result = run([
      { gapKey: 's1#3', word: 'bestille' },
      { gapKey: 's2#3', word: 'regningen' },
    ]);

    expect(result.isOk).toBe(true);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('derives the answer from the sentence, not from a separate key', () => {
    // Nothing in `expectedAnswers` says «bestille». The only place that word exists
    // is inside `content.sentences[0].text`, which is what makes this template
    // different from the other twelve.
    expect(JSON.stringify(expectedAnswers)).not.toContain('bestille');
    expect(run([{ gapKey: 's1#3', word: 'bestille' }]).value.score).toBe(50);
  });

  it('gives partial credit when the settings allow it, and none when they do not', () => {
    const placements = [
      { gapKey: 's1#3', word: 'bestilt' },
      { gapKey: 's2#3', word: 'regningen' },
    ];
    expect(run(placements).value.score).toBe(50);
    expect(run(placements, { checkSettings: {} }).value.score).toBe(0);
  });

  it('resolves the explanation for exactly the wrong word chosen', () => {
    const details = detailsOf(run([{ gapKey: 's1#3', word: 'bestilt' }]));
    expect(details[0]).toEqual({
      gapKey: 's1#3',
      correct: false,
      explanation: '«bestilt» needs «har».',
    });
  });

  it('falls back to the gap default for a wrong word with no explanation of its own', () => {
    const details = detailsOf(run([{ gapKey: 's1#3', word: 'regning' }]));
    expect(details[0]?.explanation).toBe('This gap needs an infinitive.');
  });

  it('explains a correct answer with the note on why it is right', () => {
    const details = detailsOf(run([{ gapKey: 's1#3', word: 'bestille' }]));
    expect(details[0]).toEqual({
      gapKey: 's1#3',
      correct: true,
      explanation: 'After «vil gjerne» the verb stays in the infinitive.',
    });
  });

  it('never puts an answer in the details — being wrong does not hand the word over', () => {
    const details = detailsOf(run([{ gapKey: 's1#3', word: 'bestilt' }]));
    expect(JSON.stringify(details)).not.toContain('bestille');
  });

  it('marks a gap the learner left alone as wrong rather than skipping it', () => {
    const result = run([{ gapKey: 's1#3', word: 'bestille' }]);
    expect(detailsOf(result)).toHaveLength(2);
    expect(detailsOf(result)[1]).toMatchObject({ gapKey: 's2#3', correct: false });
  });

  it('AC-X5: æ ø å survive the comparison unchanged', () => {
    const norwegian = {
      settings,
      sentences: [{ id: 's1', text: 'Vi spiser blåbær om sommeren.', gaps: [2] }],
      distractors: ['blabar'],
    };
    const answers = { feedback: { 's1#2': { fallback: 'Hvilket bær?', why: '', pairs: {} } } };

    expect(
      run([{ gapKey: 's1#2', word: 'blåbær' }], { content: norwegian, expectedAnswers: answers })
        .value.correct,
    ).toBe(true);
    expect(
      run([{ gapKey: 's1#2', word: 'blabar' }], { content: norwegian, expectedAnswers: answers })
        .value.correct,
    ).toBe(false);
  });

  it('ignores punctuation around the word the learner typed', () => {
    expect(run([{ gapKey: 's2#3', word: 'regningen,' }]).value.correct).toBe(false);
    expect(detailsOf(run([{ gapKey: 's2#3', word: 'regningen,' }]))[1]?.correct).toBe(true);
  });

  it('rejects a submission that is not a list of placements', () => {
    for (const submitted of [null, {}, { placements: 'nope' }, { placements: [{ gapKey: 1 }] }]) {
      const result = validator.validate({
        submittedAnswer: submitted,
        expectedAnswers,
        content,
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isFail).toBe(true);
      expect(result.error.code).toBe('SCHEMA_MISMATCH');
    }
  });

  it('refuses an exercise with nothing to answer rather than scoring it 100', () => {
    const result = run([], { content: { settings, sentences: [], distractors: [] } });
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });

  describe('free-input mode', () => {
    const freeContent = { ...content, settings: { ...settings, input: 'free' } };
    const freeAnswers = { ...expectedAnswers, alternatives: { 's1#3': ['å bestille'] } };

    it('accepts an alternative spelling the teacher listed', () => {
      const details = detailsOf(
        run([{ gapKey: 's1#3', word: 'å bestille' }], {
          content: freeContent,
          expectedAnswers: freeAnswers,
        }),
      );
      expect(details[0]?.correct).toBe(true);
    });

    it('ignores the pair matrix, which nobody chose from', () => {
      const details = detailsOf(
        run([{ gapKey: 's1#3', word: 'bestilt' }], {
          content: freeContent,
          expectedAnswers: freeAnswers,
        }),
      );
      expect(details[0]?.explanation).toBe('This gap needs an infinitive.');
    });

    it('does not honour alternatives when the bank is on, where the set is closed', () => {
      const details = detailsOf(
        run([{ gapKey: 's1#3', word: 'bestilt' }], { expectedAnswers: freeAnswers }),
      );
      expect(details[0]?.correct).toBe(false);
    });
  });
});
