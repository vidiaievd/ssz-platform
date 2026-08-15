import { ErrorCorrectionValidator } from '../../../../src/infrastructure/validation/validators/error-correction.validator.js';

const validator = new ErrorCorrectionValidator();

/** The content column: what a student may see. */
const content = {
  mode: 'sentences',
  items: [
    { id: 'i1', wrong: 'I går jeg gikk på kino.' },
    { id: 'i2', wrong: 'Hun har bodde i Bergen.' },
  ],
};

/** The expected_answers column: the key, keyed by item id. */
const expectedAnswers = {
  items: {
    i1: { ref: 'I går gikk jeg på kino.' },
    i2: { ref: 'Hun har bodd i Bergen.' },
  },
};

type Edits = {
  marked?: Record<string, boolean>;
  fix?: Record<string, string>;
  ins?: Record<string, string>;
};

const run = (
  items: Record<string, Edits>,
  overrides: { content?: unknown; expectedAnswers?: unknown } = {},
) =>
  validator.validate({
    submittedAnswer: { items },
    expectedAnswers: overrides.expectedAnswers ?? expectedAnswers,
    content: overrides.content ?? content,
    checkSettings: {},
    targetLanguage: 'nb',
  });

/** Both sentences corrected exactly as the key has them. */
const perfect = {
  i1: { marked: { 2: true, 3: true }, fix: { 2: 'gikk', 3: 'jeg' } },
  i2: { marked: { 2: true }, fix: { 2: 'bodd' } },
};

const detail = (result: ReturnType<typeof run>, itemId: string) =>
  (
    result.value.details as {
      items: Array<{ itemId: string; verdict: string; routing?: string; state?: string }>;
    }
  ).items.find(
    (item) => item.itemId === itemId,
  );

describe('ErrorCorrectionValidator', () => {
  it('passes an answer identical to the key, without a teacher', () => {
    const result = run(perfect);

    expect(result.isOk).toBe(true);
    expect(result.value.requiresReview).toBe(false);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
  });

  // The rule the whole template rests on: a machine may approve, never reject.
  it('routes a partly corrected answer to the teacher rather than marking it wrong', () => {
    const result = run({ i1: perfect.i1 });

    expect(result.value.requiresReview).toBe(true);
    expect(result.value.correct).toBe(false);
    expect(detail(result, 'i1')?.verdict).toBe('exact');
    expect(detail(result, 'i2')?.verdict).toBe('empty');
  });

  it('routes a single typo to the teacher too — it is not the machine\'s call', () => {
    const result = run({
      ...perfect,
      i2: { marked: { 2: true }, fix: { 2: 'bod' } },
    });

    expect(result.value.requiresReview).toBe(true);
  });

  it('routes a right answer reached by rewriting more than the mistake', () => {
    const result = run({
      ...perfect,
      i1: { marked: { 2: true, 3: true, 5: true }, fix: { 2: 'gikk', 3: 'jeg', 5: 'teater.' } },
    });

    expect(result.value.requiresReview).toBe(true);
    expect(detail(result, 'i1')?.verdict).toBe('stray');
  });

  // An alternative is a whole sentence, and reaching it can leave the mistake the key
  // points at untouched — here the student rebuilt the sentence around it. With
  // `requireAllSpans` on, the handoff's default, that is exactly the case a teacher
  // should see rather than a machine wave through.
  describe('a sentence the author listed as an alternative', () => {
    const viaAlt = {
      i1: perfect.i1,
      i2: { marked: { 1: true, 2: true }, fix: { 1: 'bodde', 2: 'lenge' } },
    };
    const withAlt = {
      items: {
        i1: expectedAnswers.items.i1,
        i2: { ref: 'Hun har bodd i Bergen.', alts: ['Hun bodde lenge i Bergen.'] },
      },
    };

    it('is exact, and still goes to the teacher while every mistake must be touched', () => {
      const result = run(viaAlt, { expectedAnswers: withAlt });

      expect(detail(result, 'i2')?.verdict).toBe('exact');
      expect(result.value.requiresReview).toBe(true);
    });

    // Reaching an alternative trips both guards at once: the key's mistake is left
    // untouched, and the words rewritten instead count as edits outside it. Passing an
    // alternative automatically therefore takes both settings, which is worth knowing
    // before an author wonders why their accepted variant still needs a teacher.
    it('passes only once both guards are off', () => {
      const result = run(viaAlt, {
        expectedAnswers: withAlt,
        content: { ...content, check: { requireAllSpans: false, strayEdits: 'ignore' } },
      });

      expect(result.value.requiresReview).toBe(false);
      expect(result.value.correct).toBe(true);
    });
  });

  it('reports what the student produced and which mistakes they reached', () => {
    const result = run({ i1: perfect.i1 });
    const item = detail(result, 'i1') as unknown as {
      built: string;
      fixedSpans: number;
      totalSpans: number;
      spans: Array<{ type: string; state: string; submitted: string }>;
      edits: unknown;
    };

    expect(item.built).toBe('I går gikk jeg på kino.');
    expect(item.fixedSpans).toBe(1);
    expect(item.totalSpans).toBe(1);
    expect(item.spans[0]).toMatchObject({ type: 'order', state: 'fixed', submitted: 'gikk jeg' });
    // The edits travel with the judgement: which mistake was found cannot be
    // recovered from a rewritten sentence.
    expect(item.edits).toEqual({ ...perfect.i1, ins: {} });
  });

  // The review queue credits the sentences the check closed on its own, and it reads
  // that off `routing` — a detail without it makes a teacher re-decide what the machine
  // already decided, and the score follows their decision rather than the check.
  it('says per sentence what the check did with it, so the queue can credit a pass', () => {
    const result = run({ i1: perfect.i1 });

    expect(detail(result, 'i1')?.routing).toBe('pass');
    expect(detail(result, 'i2')?.routing).toBe('teacher');
    expect(result.value.details).toMatchObject({ totalItems: 2, routedItems: 1, passedItems: 1 });
  });

  it('routes an untouched exercise rather than scoring it zero', () => {
    const result = run({});

    expect(result.value.requiresReview).toBe(true);
    expect(result.value.score).toBe(0);
  });

  it('rejects a submission that is not a set of edits', () => {
    const result = validator.validate({
      submittedAnswer: { corrections: [] },
      expectedAnswers,
      content,
      checkSettings: {},
      targetLanguage: 'nb',
    });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('refuses an exercise with no sentences', () => {
    const result = run({}, { content: { items: [] } });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });
});
