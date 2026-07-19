import { ShortAnswerValidator } from '../../../../src/infrastructure/validation/validators/short-answer.validator.js';

const validator = new ShortAnswerValidator();

const run = (
  text: string,
  expected: { reference_answer: string; accepted_answers?: string[] },
  checkSettings: Record<string, unknown> = { case_sensitive: false, trim_whitespace: true },
) =>
  validator.validate({
    submittedAnswer: { text },
    expectedAnswers: expected,
    checkSettings,
    targetLanguage: 'no',
  });

describe('ShortAnswerValidator', () => {
  it('auto-grades correct when text matches an accepted answer', () => {
    const result = run('på radio', { reference_answer: 'Hun hørte det på radio.', accepted_answers: ['på radio'] });
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('is case-insensitive and trims by default', () => {
    const result = run('  På Radio  ', { reference_answer: 'x', accepted_answers: ['på radio'] });
    expect(result.value.score).toBe(100);
  });

  it('routes to review when no accepted answer matches', () => {
    const result = run('noe annet', { reference_answer: 'x', accepted_answers: ['på radio'] });
    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(0);
    expect(result.value.requiresReview).toBe(true);
  });

  it('routes to review when there are no accepted_answers shortcuts', () => {
    const result = run('på radio', { reference_answer: 'Hun hørte det på radio.' });
    expect(result.value.requiresReview).toBe(true);
  });

  it('does not auto-grade an empty submission even if an accepted answer is empty-ish', () => {
    const result = run('   ', { reference_answer: 'x', accepted_answers: [''] });
    expect(result.value.requiresReview).toBe(true);
  });

  it('respects case_sensitive setting', () => {
    const result = run('På Radio', { reference_answer: 'x', accepted_answers: ['på radio'] }, { case_sensitive: true });
    expect(result.value.requiresReview).toBe(true);
  });
});
