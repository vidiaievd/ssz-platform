import { SortIntoBucketsValidator } from '../../../../src/infrastructure/validation/validators/sort-into-buckets.validator.js';

// The grading itself is the kernel's and is tested there; the handler's seam is tested in
// submit-answer.handler.spec. What is left here is what this file decides on its own: the
// shape of a submission, and an exercise with nothing to sort.

const content = {
  buckets: [
    { id: 'b1', label: 'en', rule: '' },
    { id: 'b2', label: 'et', rule: '' },
  ],
  items: [
    { id: 'i1', text: 'bil' },
    { id: 'i2', text: 'hus' },
  ],
};
const expectedAnswers = {
  items: {
    i1: { bucketId: 'b1', also: [], why: '', fb: { def: 'Hankjønn.', ov: {} } },
    i2: { bucketId: 'b2', also: [], why: '', fb: { def: 'Intetkjønn.', ov: {} } },
  },
};
const validate = (submittedAnswer: unknown, over: { content?: unknown; expectedAnswers?: unknown } = {}) =>
  new SortIntoBucketsValidator().validate({
    submittedAnswer,
    content: over.content ?? content,
    expectedAnswers: over.expectedAnswers ?? expectedAnswers,
    checkSettings: {},
    targetLanguage: 'nb',
  });

describe('SortIntoBucketsValidator', () => {
  it('grades a full board', () => {
    const result = validate({
      placements: [
        { itemId: 'i1', bucketId: 'b1' },
        { itemId: 'i2', bucketId: 'b2' },
      ],
    });
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ correct: true, score: 100, passed: true, requiresReview: false });
  });

  it.each([
    ['no object', 'bil'],
    ['no placements', {}],
    ['placements not a list', { placements: { i1: 'b1' } }],
    ['a placement without a bucket', { placements: [{ itemId: 'i1' }] }],
  ])('refuses %s as a schema mismatch', (_label, submitted) => {
    const result = validate(submitted);
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('refuses an exercise with no ready item', () => {
    const result = validate({ placements: [] }, { expectedAnswers: { items: {} } });
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });

  it('takes the first check from the client only on a direct call, never on the first check', () => {
    // On the first check the carried-forward map is ignored — this check *is* the first.
    const result = validate({
      placements: [
        { itemId: 'i1', bucketId: 'b1' },
        { itemId: 'i2', bucketId: 'b2' },
      ],
      firstAnswers: { i1: 'b2', i2: 'b1' },
    });
    expect(result.value.score).toBe(100);
  });
});
