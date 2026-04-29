import { OrderingValidator } from '../../../../src/infrastructure/validation/validators/ordering.validator.js';
import { ValidationError } from '../../../../src/shared/application/ports/answer-validator.port.js';

const validator = new OrderingValidator();

const run = (
  submittedIds: string[],
  expectedIds: string[],
  settings: Record<string, unknown> = {},
) =>
  validator.validate({
    submittedAnswer: { ordered_ids: submittedIds },
    expectedAnswers: { ordered_ids: expectedIds },
    checkSettings: settings,
    targetLanguage: 'en',
  });

describe('OrderingValidator', () => {
  describe('exact-order match (default scoring)', () => {
    it('returns score=100 correct=true when order is exactly right', () => {
      const result = run(['a', 'b', 'c'], ['a', 'b', 'c']);
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.correct).toBe(true);
      expect(result.value.requiresReview).toBe(false);
    });

    it('returns score=0 correct=false when order is fully reversed', () => {
      const result = run(['c', 'b', 'a'], ['a', 'b', 'c']);
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(0);
      expect(result.value.correct).toBe(false);
    });

    it('returns score=0 on single swap without partial credit', () => {
      const result = run(['a', 'c', 'b'], ['a', 'b', 'c']);
      expect(result.value.score).toBe(0);
      expect(result.value.correct).toBe(false);
    });

    it('returns score=0 on single swap when partial credit not enabled', () => {
      const result = run(['a', 'c', 'b'], ['a', 'b', 'c'], { allow_partial_credit: false });
      expect(result.value.score).toBe(0);
    });
  });

  describe('partial credit (by_position strategy)', () => {
    it('returns partial score for single swap when partial credit enabled', () => {
      // ['a', 'c', 'b'] vs ['a', 'b', 'c'] → position 0 correct, 1 wrong, 2 wrong → 1/3 = 33
      const result = run(['a', 'c', 'b'], ['a', 'b', 'c'], {
        allow_partial_credit: true,
        partial_credit_strategy: 'by_position',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(33);
      expect(result.value.correct).toBe(false);
    });

    it('returns score=100 on exact match even with partial credit enabled', () => {
      const result = run(['a', 'b', 'c'], ['a', 'b', 'c'], {
        allow_partial_credit: true,
        partial_credit_strategy: 'by_position',
      });
      expect(result.value.score).toBe(100);
      expect(result.value.correct).toBe(true);
    });

    it('ignores partial credit when strategy is not by_position', () => {
      const result = run(['a', 'c', 'b'], ['a', 'b', 'c'], {
        allow_partial_credit: true,
        partial_credit_strategy: 'other',
      });
      expect(result.value.score).toBe(0);
    });

    it('ignores partial credit when allow_partial_credit is false even with by_position strategy', () => {
      const result = run(['a', 'c', 'b'], ['a', 'b', 'c'], {
        allow_partial_credit: false,
        partial_credit_strategy: 'by_position',
      });
      expect(result.value.score).toBe(0);
    });
  });

  describe('mismatched length', () => {
    it('returns SCHEMA_MISMATCH error when submitted has more items than expected', () => {
      const result = run(['a', 'b', 'c', 'd'], ['a', 'b', 'c']);
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
    });

    it('returns SCHEMA_MISMATCH error when submitted has fewer items than expected', () => {
      const result = run(['a', 'b'], ['a', 'b', 'c']);
      expect(result.isFail).toBe(true);
      expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
    });
  });

  describe('details', () => {
    it('exposes correct_positions and total_positions in details', () => {
      const result = run(['a', 'c', 'b'], ['a', 'b', 'c'], {
        allow_partial_credit: true,
        partial_credit_strategy: 'by_position',
      });
      expect(result.value.details).toMatchObject({
        correct_positions: 1,
        total_positions: 3,
        submitted: ['a', 'c', 'b'],
        expected: ['a', 'b', 'c'],
      });
    });
  });
});
