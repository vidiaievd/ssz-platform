import { TextOrderValidator } from '../../../../src/infrastructure/validation/validators/text-order.validator.js';

const validator = new TextOrderValidator();

const expectedOrder = ['a', 'b', 'c', 'd'];

const run = (order: string[], settings: Record<string, unknown> = {}) =>
  validator.validate({
    submittedAnswer: { order },
    expectedAnswers: { order: expectedOrder },
    checkSettings: settings,
    targetLanguage: 'no',
  });

describe('TextOrderValidator', () => {
  it('scores 100 for the exact sequence', () => {
    const result = run(['a', 'b', 'c', 'd']);

    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('gives partial credit for items sitting in their own slot', () => {
    // a and d are placed right; b and c are swapped.
    const result = run(['a', 'c', 'b', 'd']);

    expect(result.value.score).toBe(50);
    expect(result.value.correct).toBe(false);
  });

  it('scores 0 for a fully reversed sequence', () => {
    expect(run(['d', 'c', 'b', 'a']).value.score).toBe(0);
  });

  it('is all-or-nothing when allow_partial_credit is false', () => {
    expect(run(['a', 'c', 'b', 'd'], { allow_partial_credit: false }).value.score).toBe(0);
    expect(run(['a', 'b', 'c', 'd'], { allow_partial_credit: false }).value.score).toBe(100);
  });

  it('reports each item position in details', () => {
    const result = run(['a', 'c', 'b', 'd']);
    const positions = (
      result.value.details as {
        positions: Array<{ item_id: string; expected_index: number; submitted_index: number | null; correct: boolean }>;
      }
    ).positions;

    expect(positions).toHaveLength(4);
    expect(positions[1]).toEqual({
      item_id: 'b',
      expected_index: 1,
      submitted_index: 2,
      correct: false,
    });
  });

  describe('malformed answers', () => {
    it('marks a missing item as unplaced rather than correct', () => {
      const result = run(['a', 'b', 'c']);
      const positions = (result.value.details as { positions: Array<{ submitted_index: number | null }> })
        .positions;

      expect(positions[3]!.submitted_index).toBeNull();
      expect(result.value.correct).toBe(false);
    });

    it('never returns 100 when the answer has the wrong number of items', () => {
      // Every listed item sits in its own slot, but one is missing entirely.
      const result = run(['a', 'b', 'c']);

      expect(result.value.correct).toBe(false);
      expect(result.value.score).toBeLessThan(100);
    });

    it('counts only the first occurrence of a duplicated id', () => {
      const result = run(['a', 'b', 'b', 'd']);
      const positions = (result.value.details as { positions: Array<{ item_id: string; correct: boolean }> })
        .positions;

      expect(positions.find((p) => p.item_id === 'b')!.correct).toBe(true);
      expect(positions.find((p) => p.item_id === 'c')!.correct).toBe(false);
    });
  });
});
