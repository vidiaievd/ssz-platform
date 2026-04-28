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

    it('returns score=0 when no options submitted', () => {
      const result = run([], ['A']);
      expect(result.value.score).toBe(0);
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
