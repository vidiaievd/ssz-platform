import { MatchPairsValidator } from '../../../../src/infrastructure/validation/validators/match-pairs.validator.js';

const validator = new MatchPairsValidator();

const run = (
  submitted: Array<{ left_id: string; right_id: string }>,
  expected: Array<{ left_id: string; right_id: string }>,
) =>
  validator.validate({
    submittedAnswer: { pairs: submitted },
    expectedAnswers: { pairs: expected },
    checkSettings: { allow_partial_credit: true },
    targetLanguage: 'no',
  });

describe('MatchPairsValidator', () => {
  it('returns score=100 when all pairs are correct', () => {
    const result = run(
      [
        { left_id: 'a', right_id: '1' },
        { left_id: 'b', right_id: '2' },
      ],
      [
        { left_id: 'a', right_id: '1' },
        { left_id: 'b', right_id: '2' },
      ],
    );
    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('returns score=0 when all pairs are wrong', () => {
    const result = run(
      [
        { left_id: 'a', right_id: '2' },
        { left_id: 'b', right_id: '1' },
      ],
      [
        { left_id: 'a', right_id: '1' },
        { left_id: 'b', right_id: '2' },
      ],
    );
    expect(result.value.score).toBe(0);
    expect(result.value.correct).toBe(false);
  });

  it('gives partial score for partial matches', () => {
    const result = run(
      [
        { left_id: 'a', right_id: '1' }, // correct
        { left_id: 'b', right_id: '1' }, // wrong (should be '2')
      ],
      [
        { left_id: 'a', right_id: '1' },
        { left_id: 'b', right_id: '2' },
      ],
    );
    expect(result.value.score).toBe(50);
  });

  it('returns score=100 for empty expected pairs', () => {
    const result = run([], []);
    expect(result.value.score).toBe(100);
  });

  it('is strict about left_id + right_id combination', () => {
    // Same IDs but swapped → wrong
    const result = run(
      [{ left_id: '1', right_id: 'a' }],
      [{ left_id: 'a', right_id: '1' }],
    );
    expect(result.value.score).toBe(0);
  });

  it('exposes per-pair results in details', () => {
    const result = run(
      [
        { left_id: 'a', right_id: '1' },
        { left_id: 'b', right_id: '1' },
      ],
      [
        { left_id: 'a', right_id: '1' },
        { left_id: 'b', right_id: '2' },
      ],
    );
    const details = result.value.details as { pairs: Array<{ correct: boolean }> };
    expect(details.pairs[0].correct).toBe(true);
    expect(details.pairs[1].correct).toBe(false);
  });
});
