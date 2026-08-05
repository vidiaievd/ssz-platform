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

/** The seeded indirect-speech task from Norsk B1, leksjon 1. */
const indirectSpeech = {
  reference_answer: 'Bartek sa at han skulle begynne 1. april.',
  accepted_answers: ['bartek sa at han skulle begynne 1. april', 'at han skulle begynne 1. april'],
};

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

  it('routes to review when the answer is nowhere near the key', () => {
    const result = run('noe helt annet enn dette', { reference_answer: 'x', accepted_answers: ['på radio'] });
    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(0);
    expect(result.value.requiresReview).toBe(true);
  });

  it('accepts the reference answer itself when no shortcuts are authored', () => {
    const result = run('Hun hørte det på radio.', { reference_answer: 'Hun hørte det på radio.' });
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('does not auto-grade an empty submission even if an accepted answer is empty-ish', () => {
    const result = run('   ', { reference_answer: 'x', accepted_answers: [''] });
    expect(result.value.requiresReview).toBe(true);
  });

  it('marks a case-only difference wrong — not for review — when case_sensitive is on', () => {
    const result = run('På Radio', { reference_answer: 'x', accepted_answers: ['på radio'] }, { case_sensitive: true });
    expect(result.value.correct).toBe(false);
    expect(result.value.requiresReview).toBe(false);
    expect(result.value.details).toMatchObject({ reason: 'case_mismatch' });
  });

  it('scores a near miss itself instead of handing it to a teacher', () => {
    const result = run('han skulle begynte 1. april', indirectSpeech);
    expect(result.value.correct).toBe(false);
    expect(result.value.requiresReview).toBe(false);
    expect(result.value.details).toMatchObject({
      target: 'at han skulle begynne 1. april',
      distance: 2,
      counts: { form: 1, wrong: 0, extra: 0, missing: 1 },
    });
  });

  it('gives partial credit for the words a near miss did get right', () => {
    const result = run('at han skulle begynte 1. april', indirectSpeech);
    expect(result.value.score).toBeGreaterThan(0);
    expect(result.value.score).toBeLessThan(100);
  });

  it('still reviews a rewrite the author never listed', () => {
    const result = run('Bartek fortalte meg at han begynner i jobben til våren', indirectSpeech);
    expect(result.value.requiresReview).toBe(true);
  });
});
