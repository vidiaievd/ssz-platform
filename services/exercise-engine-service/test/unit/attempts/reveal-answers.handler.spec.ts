import { jest } from '@jest/globals';
import { RevealAnswersHandler } from '../../../src/modules/attempts/application/commands/reveal-answers/reveal-answers.handler.js';
import { RevealAnswersCommand } from '../../../src/modules/attempts/application/commands/reveal-answers/reveal-answers.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

const content = {
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
  distractors: ['bestilt'],
};

const expectedAnswers = {
  feedback: {
    's1#3': {
      fallback: 'Needs an infinitive.',
      why: 'After «vil gjerne» the verb stays in the infinitive.',
      pairs: {},
    },
    's2#3': { fallback: 'Check the noun form.', why: '   ', pairs: {} },
  },
};

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'word_bank_gap_fill',
    targetLanguage: 'no',
    answersRevealed: false,
    revealAnswers: jest.fn(() => Result.ok()),
    ...overrides,
  };
}

function makeHandler(attempt: unknown) {
  const attempts = { findById: jest.fn(() => Promise.resolve(attempt)), save: jest.fn() };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(Result.ok({ exercise: { content, expectedAnswers } })),
    ),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = new RevealAnswersHandler(attempts as any, contentClient as any);
  return { handler, attempts, contentClient };
}

const command = new RevealAnswersCommand('att-1', 'user-1');

describe('RevealAnswersHandler', () => {
  it('returns the answer for every gap, with its label', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(result.value.answers).toEqual([
      {
        gapKey: 's1#3',
        label: 'G1',
        word: 'bestille',
        why: 'After «vil gjerne» the verb stays in the infinitive.',
      },
      { gapKey: 's2#3', label: 'G2', word: 'regningen', why: null },
    ]);
  });

  it('derives the answer from the sentence and strips its punctuation', () => {
    // «regningen,» carries a comma in the text; the answer does not.
    expect(content.sentences[1].text).toContain('regningen,');
  });

  it('records that the learner was shown the words, and saves it', async () => {
    const attempt = makeAttempt();
    const { handler, attempts } = makeHandler(attempt);
    await handler.execute(command);

    expect(attempt.revealAnswers).toHaveBeenCalled();
    expect(attempts.save).toHaveBeenCalledWith(attempt);
  });

  it('refuses an attempt belonging to someone else', async () => {
    const { handler, contentClient } = makeHandler(makeAttempt({ userId: 'someone-else' }));
    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'FORBIDDEN' });
    // And does not go and fetch the answers first.
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
  });

  it('refuses a template that never withheld its answers', async () => {
    const { handler } = makeHandler(makeAttempt({ templateCode: 'fill_in_blank' }));
    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  it('refuses when nothing has been submitted yet', async () => {
    const transitionError = { message: 'Cannot reveal answers for an attempt with status IN_PROGRESS' };
    const attempt = makeAttempt({ revealAnswers: jest.fn(() => Result.fail(transitionError)) });
    const { handler, attempts } = makeHandler(attempt);

    const result = await handler.execute(command);
    expect(result.isFail).toBe(true);
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('reports a missing attempt rather than throwing', async () => {
    const { handler } = makeHandler(null);
    const result = await handler.execute(command);
    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });
});
