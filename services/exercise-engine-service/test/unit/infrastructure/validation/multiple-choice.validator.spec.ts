import { MultipleChoiceValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice.validator.js';

const validator = new MultipleChoiceValidator();

const run = (
  submittedIds: string[],
  expectedIds: string[],
  settings: Record<string, unknown> = {},
) =>
  validator.validate({
    submittedAnswer: { correct_option_ids: submittedIds },
    expectedAnswers: { correct_option_ids: expectedIds },
    checkSettings: settings,
    targetLanguage: 'no',
  });

describe('MultipleChoiceValidator', () => {
  // Everything below in this first block is the *old* form, graded by
  // `multiple-choice-legacy.ts` and unchanged by the rewrite. 121 seeded exercises are
  // still written this way (plan 53 §8 Q2), and the dispatch is by the shape of the
  // document: an input with no `content.questions` is one of them.
  describe('exact match (no partial credit)', () => {
    it('returns score=100 correct=true when selection matches exactly', () => {
      const result = run(['A'], ['A']);
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.correct).toBe(true);
      expect(result.value.requiresReview).toBe(false);
    });

    it('returns score=0 correct=false when selection is wrong', () => {
      const result = run(['B'], ['A']);
      expect(result.value.score).toBe(0);
      expect(result.value.correct).toBe(false);
    });

    it('returns score=0 when partially correct without allow_partial_credit', () => {
      const result = run(['A', 'B'], ['A', 'C'], { allow_partial_credit: false });
      expect(result.value.score).toBe(0);
    });

    it('handles multi-select exact match', () => {
      const result = run(['A', 'B'], ['B', 'A']);
      expect(result.value.score).toBe(100);
    });

    it('refuses a submission with no options picked at all', () => {
      // `minItems: 1` used to be AJV's, and AJV no longer runs for this template — it
      // joined `OWN_SUBMISSION_SHAPE` on the rewrite (plan 53). The check moved into the
      // legacy reader rather than disappearing: an empty pick list is a client that
      // submitted nothing, which is worth naming rather than marking zero.
      const result = run([], ['A']);
      expect(result.isFail).toBe(true);
      expect((result.error as { code: string }).code).toBe('SCHEMA_MISMATCH');
    });
  });

  describe('partial credit (allow_partial_credit: true)', () => {
    it('gives partial score for one correct out of two expected', () => {
      const result = run(['A'], ['A', 'B'], { allow_partial_credit: true });
      expect(result.value.score).toBe(50);
      expect(result.value.correct).toBe(false);
    });

    it('penalises wrong picks: 1 correct 1 wrong out of 2 expected → 0', () => {
      const result = run(['A', 'C'], ['A', 'B'], { allow_partial_credit: true });
      // (1 correct - 1 wrong) / 2 = 0
      expect(result.value.score).toBe(0);
    });

    it('clamps negative score to 0 (2 wrong, 0 correct, 1 expected)', () => {
      const result = run(['B', 'C'], ['A'], { allow_partial_credit: true });
      // (0 - 2) / 1 = -200 → clamped to 0
      expect(result.value.score).toBe(0);
    });

    it('returns score=100 on exact match with partial credit enabled', () => {
      const result = run(['A', 'B'], ['A', 'B'], { allow_partial_credit: true });
      expect(result.value.score).toBe(100);
    });
  });

  describe('details', () => {
    it('exposes correct_selected and wrong_selected in details', () => {
      const result = run(['A', 'C'], ['A', 'B'], { allow_partial_credit: true });
      expect(result.value.details).toMatchObject({
        correct_selected: ['A'],
        wrong_selected: ['C'],
      });
    });
  });
});

// ── The new form ────────────────────────────────────────────────────────────
// A set of questions answered one at a time, scored on the first attempt alone.

const content = {
  title: 'Indirekte tale',
  instruction: 'Velg riktig form.',
  questions: [
    {
      id: 'q1',
      kind: 'grammar',
      context: '',
      stem: 'Han sa at han ___ sliten.',
      options: [
        { id: 'o1', text: 'var', fixed: false },
        { id: 'o2', text: 'er', fixed: false },
      ],
    },
    {
      id: 'q2',
      kind: 'grammar',
      context: '',
      stem: 'Hun spurte om jeg ___ med.',
      options: [
        { id: 'p1', text: 'ville bli', fixed: false },
        { id: 'p2', text: 'vil bli', fixed: false },
      ],
    },
    // Never given a key: not part of the set, and not part of the denominator either.
    { id: 'q3', kind: 'grammar', context: '', stem: 'Ufullført.', options: [] },
  ],
  settings: { retry: 'one', shuffle: true },
};

const key = {
  questions: {
    q1: { correctOptionId: 'o1', why: 'Presens flyttes til preteritum.', options: {} },
    q2: { correctOptionId: 'p1', why: 'Samme regel.', options: {} },
    q3: { correctOptionId: '', why: '', options: {} },
  },
};

const grade = (answers: Array<{ questionId: string; optionId: string | null; attempt?: number }>) =>
  validator.validate({
    content,
    submittedAnswer: { answers },
    expectedAnswers: key,
    checkSettings: {},
    targetLanguage: 'nb',
  });

describe('MultipleChoiceValidator — the set form', () => {
  it('scores only the questions taken on the first attempt', () => {
    // README: "Score counts first-attempt correctness only". Right on the second try is
    // still right — the student is not told they were wrong — and it is worth nothing.
    const result = grade([
      { questionId: 'q1', optionId: 'o1', attempt: 1 },
      { questionId: 'q2', optionId: 'p1', attempt: 2 },
    ]);

    expect(result.value.score).toBe(50);
    expect(result.value.correct).toBe(false);
    expect(result.value.details).toMatchObject({ totalItems: 2, passedItems: 1 });
  });

  it('calls the attempt correct when every question fell on the first try', () => {
    const result = grade([
      { questionId: 'q1', optionId: 'o1', attempt: 1 },
      { questionId: 'q2', optionId: 'p1', attempt: 1 },
    ]);

    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
  });

  it('counts a question left unanswered as wrong', () => {
    // A decision, not a consequence (plan 53 §3.5): otherwise leaving a set halfway
    // scores better than finishing it.
    const result = grade([{ questionId: 'q1', optionId: 'o1', attempt: 1 }]);

    expect(result.value.score).toBe(50);
    expect(
      (result.value.details as { items: Array<{ itemId: string; submitted: string | null }> })
        .items.find((i) => i.itemId === 'q2')?.submitted,
    ).toBeNull();
  });

  it('leaves a question with no key out of the count entirely', () => {
    const result = grade([
      { questionId: 'q1', optionId: 'o1', attempt: 1 },
      { questionId: 'q2', optionId: 'p1', attempt: 1 },
      { questionId: 'q3', optionId: 'x', attempt: 1 },
    ]);

    expect(result.value.details).toMatchObject({ totalItems: 2 });
    expect(result.value.score).toBe(100);
  });

  it('never routes to a teacher', () => {
    expect(grade([{ questionId: 'q1', optionId: 'o1' }]).value.requiresReview).toBe(false);
  });

  it('refuses a submission that is not a list of picks', () => {
    const result = validator.validate({
      content,
      submittedAnswer: { correct_option_ids: ['o1'] },
      expectedAnswers: key,
      checkSettings: {},
      targetLanguage: 'nb',
    });

    expect(result.isFail).toBe(true);
    expect((result.error as { code: string }).code).toBe('SCHEMA_MISMATCH');
  });

  it('refuses a set in which nothing could be answered', () => {
    const result = validator.validate({
      content: { ...content, questions: [content.questions[2]] },
      submittedAnswer: { answers: [] },
      expectedAnswers: key,
      checkSettings: {},
      targetLanguage: 'nb',
    });

    expect(result.isFail).toBe(true);
    expect((result.error as { code: string }).code).toBe('INVALID_EXERCISE');
  });
});
