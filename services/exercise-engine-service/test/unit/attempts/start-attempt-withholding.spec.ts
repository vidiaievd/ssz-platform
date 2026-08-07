import { jest } from '@jest/globals';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

// `checkMode: PRACTICE` means "ship the answers so the client can check locally", and
// that is safe for twelve templates whose answers are a separate key. It is not safe
// for word_bank_gap_fill, whose content *is* the answer key.

const gapFillContent = {
  settings: {
    shuffle: true,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
  },
  sentences: [
    { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
    { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
  ],
  distractors: ['bestilt', 'regning'],
};

const gapFillAnswers = {
  feedback: { 's1#3': { fallback: 'Needs an infinitive.', why: 'Because.', pairs: {} } },
};

function makeHandler(templateCode: string, content: unknown, expectedAnswers: unknown) {
  const attempts = {
    findInProgress: jest.fn(() => Promise.resolve(null)),
    save: jest.fn(),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(
        Result.ok({
          exercise: {
            templateCode,
            targetLanguage: 'no',
            difficultyLevel: 'B1',
            content,
            expectedAnswers,
            answerCheckSettings: null,
          },
          template: { answerSchema: {}, defaultCheckSettings: {} },
        }),
      ),
    ),
    getPracticedAtoms: jest.fn(() => Promise.resolve(Result.ok([]))),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new StartAttemptHandler(attempts as any, contentClient as any, publisher as any);
}

const practice = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');

describe('StartAttemptHandler — what leaves with the attempt', () => {
  it('ships no answers for a gap-fill, even in PRACTICE mode', async () => {
    const handler = makeHandler('word_bank_gap_fill', gapFillContent, gapFillAnswers);
    const result = await handler.execute(practice);

    expect(result.value.expectedAnswers).toBeNull();
    const shipped = JSON.stringify(result.value.exerciseContent);
    expect(shipped).not.toContain('Needs an infinitive');
  });

  it('ships the sentences with the gapped words cut out', async () => {
    const handler = makeHandler('word_bank_gap_fill', gapFillContent, gapFillAnswers);
    const result = await handler.execute(practice);

    const { sentences } = result.value.exerciseContent as { sentences: unknown };
    const rendered = JSON.stringify(sentences);
    expect(rendered).not.toContain('bestille');
    expect(rendered).not.toContain('regningen');
    // The rest of the sentence survives, comma and all.
    expect(rendered).toContain('takk?');
  });

  it('still offers the bank, which is what makes it answerable', async () => {
    const handler = makeHandler('word_bank_gap_fill', gapFillContent, gapFillAnswers);
    const result = await handler.execute(practice);

    const { bank } = result.value.exerciseContent as { bank: string[] };
    expect([...bank].sort()).toEqual(['bestille', 'bestilt', 'regning', 'regningen']);
  });

  it('leaves the other templates exactly as they were', async () => {
    const content = { text_with_blanks: 'Jeg ___1___ norsk' };
    const answers = { blanks: [{ blank_id: 1, accepted_answers: ['snakker'] }] };
    const handler = makeHandler('fill_in_blank', content, answers);

    const result = await handler.execute(practice);
    expect(result.value.exerciseContent).toEqual(content);
    expect(result.value.expectedAnswers).toEqual(answers);
  });
});
