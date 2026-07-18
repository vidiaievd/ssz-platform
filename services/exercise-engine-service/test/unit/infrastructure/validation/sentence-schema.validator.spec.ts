import { SentenceSchemaValidator } from '../../../../src/infrastructure/validation/validators/sentence-schema.validator.js';

const validator = new SentenceSchemaValidator();

// "Lars har aldri likt Lotte" → Forfelt | Verbal | Midtfelt | Verbal | Sluttfelt
const expected = {
  placements: [
    { field_id: 'forfelt', token_ids: ['t1'] },
    { field_id: 'verbal1', token_ids: ['t2'] },
    { field_id: 'midtfelt', token_ids: ['t3'] },
    { field_id: 'verbal2', token_ids: ['t4'] },
    { field_id: 'sluttfelt', token_ids: ['t5'] },
  ],
};

const run = (
  placements: Array<{ field_id: string; token_ids: string[] }>,
  checkSettings: Record<string, unknown> = { allow_partial_credit: true, order_sensitive: true },
) =>
  validator.validate({
    submittedAnswer: { placements },
    expectedAnswers: expected,
    checkSettings,
    targetLanguage: 'no',
  });

describe('SentenceSchemaValidator', () => {
  it('scores 100 when every field matches', () => {
    const result = run(expected.placements);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('gives partial credit per field', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] }, // correct
      { field_id: 'verbal1', token_ids: ['t2'] }, // correct
      { field_id: 'midtfelt', token_ids: ['t4'] }, // wrong
      { field_id: 'verbal2', token_ids: ['t3'] }, // wrong
      { field_id: 'sluttfelt', token_ids: ['t5'] }, // correct
    ]);
    expect(result.value.score).toBe(60);
    expect(result.value.correct).toBe(false);
  });

  it('is order-sensitive within a field', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] },
      { field_id: 'verbal1', token_ids: ['t2'] },
      { field_id: 'midtfelt', token_ids: ['t3'] },
      { field_id: 'verbal2', token_ids: ['t4'] },
      { field_id: 'sluttfelt', token_ids: ['t5', 'extra'] }, // wrong length/order
    ]);
    expect(result.value.score).toBe(80);
  });

  it('treats a missing submitted field as incorrect', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] },
      // verbal1 missing
      { field_id: 'midtfelt', token_ids: ['t3'] },
      { field_id: 'verbal2', token_ids: ['t4'] },
      { field_id: 'sluttfelt', token_ids: ['t5'] },
    ]);
    expect(result.value.score).toBe(80);
  });

  it('with allow_partial_credit=false scores 0 unless all fields match', () => {
    const result = run(
      [
        { field_id: 'forfelt', token_ids: ['t1'] },
        { field_id: 'verbal1', token_ids: ['t2'] },
        { field_id: 'midtfelt', token_ids: ['t3'] },
        { field_id: 'verbal2', token_ids: ['t4'] },
        { field_id: 'sluttfelt', token_ids: ['wrong'] },
      ],
      { allow_partial_credit: false },
    );
    expect(result.value.score).toBe(0);
  });

  it('exposes per-field results in details', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] },
      { field_id: 'verbal1', token_ids: ['wrong'] },
      { field_id: 'midtfelt', token_ids: ['t3'] },
      { field_id: 'verbal2', token_ids: ['t4'] },
      { field_id: 'sluttfelt', token_ids: ['t5'] },
    ]);
    const details = result.value.details as { fields: Array<{ field_id: string; correct: boolean }> };
    expect(details.fields.find((f) => f.field_id === 'verbal1')?.correct).toBe(false);
    expect(details.fields.find((f) => f.field_id === 'forfelt')?.correct).toBe(true);
  });
});
