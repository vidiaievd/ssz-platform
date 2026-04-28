import { FillInBlankValidator } from '../../../../src/infrastructure/validation/validators/fill-in-blank.validator.js';

const validator = new FillInBlankValidator();

const run = (
  submittedBlanks: Array<{ blank_id: number; accepted_answers: string[] }>,
  expectedBlanks: Array<{ blank_id: number; accepted_answers: string[] }>,
  settings: Record<string, unknown> = {},
) =>
  validator.validate({
    submittedAnswer: { blanks: submittedBlanks },
    expectedAnswers: { blanks: expectedBlanks },
    checkSettings: settings,
    targetLanguage: 'no',
  });

describe('FillInBlankValidator', () => {
  describe('happy path', () => {
    it('returns score=100 when all blanks are correct', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['hei'] }],
        [{ blank_id: 1, accepted_answers: ['hei', 'hello'] }],
      );
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.correct).toBe(true);
      expect(result.value.requiresReview).toBe(false);
    });

    it('accepts any of the multiple accepted answers', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['hello'] }],
        [{ blank_id: 1, accepted_answers: ['hei', 'hello', 'hi'] }],
      );
      expect(result.value.score).toBe(100);
    });
  });

  describe('case sensitivity', () => {
    it('is case-insensitive by default', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['HEI'] }],
        [{ blank_id: 1, accepted_answers: ['hei'] }],
      );
      expect(result.value.score).toBe(100);
    });

    it('respects case_sensitive: true', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['HEI'] }],
        [{ blank_id: 1, accepted_answers: ['hei'] }],
        { case_sensitive: true },
      );
      expect(result.value.score).toBe(0);
    });
  });

  describe('whitespace', () => {
    it('trims whitespace by default', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['  hei  '] }],
        [{ blank_id: 1, accepted_answers: ['hei'] }],
      );
      expect(result.value.score).toBe(100);
    });

    it('does not trim when trim_whitespace: false', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['  hei  '] }],
        [{ blank_id: 1, accepted_answers: ['hei'] }],
        { trim_whitespace: false },
      );
      expect(result.value.score).toBe(0);
    });
  });

  describe('partial credit', () => {
    it('gives partial score when allow_partial_credit is true (default)', () => {
      const result = run(
        [
          { blank_id: 1, accepted_answers: ['hei'] },
          { blank_id: 2, accepted_answers: ['wrong'] },
        ],
        [
          { blank_id: 1, accepted_answers: ['hei'] },
          { blank_id: 2, accepted_answers: ['farvel'] },
        ],
      );
      expect(result.value.score).toBe(50);
    });

    it('returns 0 when allow_partial_credit is false and not all correct', () => {
      const result = run(
        [
          { blank_id: 1, accepted_answers: ['hei'] },
          { blank_id: 2, accepted_answers: ['wrong'] },
        ],
        [
          { blank_id: 1, accepted_answers: ['hei'] },
          { blank_id: 2, accepted_answers: ['farvel'] },
        ],
        { allow_partial_credit: false },
      );
      expect(result.value.score).toBe(0);
    });
  });

  describe('fuzzy matching', () => {
    it('accepts answer within editDistance when fuzzy is set', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['hei'] }], // 1 typo vs 'hey'
        [{ blank_id: 1, accepted_answers: ['hey'] }],
        { fuzzy: { editDistance: 1 } },
      );
      expect(result.value.score).toBe(100);
    });

    it('rejects answer outside editDistance', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: ['abc'] }], // distance 3 vs 'xyz'
        [{ blank_id: 1, accepted_answers: ['xyz'] }],
        { fuzzy: { editDistance: 1 } },
      );
      expect(result.value.score).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns score=0 when submitted blank answer is empty string', () => {
      const result = run(
        [{ blank_id: 1, accepted_answers: [''] }],
        [{ blank_id: 1, accepted_answers: ['hei'] }],
      );
      expect(result.value.score).toBe(0);
    });

    it('marks blank as incorrect when blank_id does not match expected', () => {
      const result = run(
        [{ blank_id: 99, accepted_answers: ['hei'] }],
        [{ blank_id: 1, accepted_answers: ['hei'] }],
      );
      expect(result.value.score).toBe(0);
    });

    it('returns score=100 when expected blanks list is empty', () => {
      const result = run([], []);
      expect(result.value.score).toBe(100);
    });
  });
});
