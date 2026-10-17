import { jest } from '@jest/globals';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { OpenAttemptExistsError } from '../../../src/modules/attempts/domain/exceptions/attempt.errors.js';
import { Result } from '../../../src/shared/kernel/result.js';
import type { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

// Plan 76, 2.5 — two starts for the same exercise both found no open attempt and both saved
// one. The partial unique index now refuses the second save; the handler that lost looks
// again and answers as for any start that meets an open attempt.

const ENVELOPE = {
  exercise: {
    templateCode: 'word_bank_gap_fill',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    content: { settings: { input: 'free' }, sentences: [], distractors: [] },
    expectedAnswers: {},
    answerCheckSettings: null,
  },
  template: { answerSchema: {}, defaultCheckSettings: {} },
  axes: { skills: ['written'], focus: ['grammar'], modality: 'recall' },
  targets: [],
};

function makeHandler(saveError: Error) {
  // The winner: whatever the losing start tried to save stands in for it.
  let winner: Attempt | null = null;
  let lookups = 0;
  const attempts = {
    findInProgress: jest.fn(() => Promise.resolve(lookups++ === 0 ? null : winner)),
    findOpenBoard: jest.fn(() => Promise.resolve(null)),
    findLatestReturned: jest.fn(() => Promise.resolve(null)),
    save: jest.fn((attempt: Attempt) => {
      winner = attempt;
      return Promise.reject(saveError);
    }),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok(ENVELOPE))),
    getPracticedAtoms: jest.fn(() => Promise.resolve(Result.ok([]))),
    getExercisePlacement: jest.fn(() =>
      Promise.resolve(Result.fail({ statusCode: 404, message: 'Not placed' })),
    ),
  };
  const organizationClient = {
    resolveLearnerReviewContext: jest.fn(() =>
      Promise.resolve(Result.fail({ statusCode: 404, message: 'No context' })),
    ),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  const handler = new StartAttemptHandler(
    attempts as never,
    contentClient as never,
    new ReviewContextResolver(contentClient as never, organizationClient as never),
    publisher as never,
  );
  return { handler, attempts, publisher, winnerId: () => (winner as Attempt | null)?.id };
}

const command = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');

describe('StartAttemptHandler — a start that loses the race', () => {
  it('is handed the attempt that won, and publishes nothing of its own', async () => {
    const { handler, attempts, publisher, winnerId } = makeHandler(new OpenAttemptExistsError());

    const result = await handler.execute(command);

    expect(result.isFail).toBe(true);
    expect(result.isFail && result.error).toEqual({
      code: 'ALREADY_IN_PROGRESS',
      attemptId: winnerId(),
    });
    expect(attempts.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('does not retry on any other failure of the store', async () => {
    const { handler, attempts } = makeHandler(new Error('connection reset'));

    await expect(handler.execute(command)).rejects.toThrow('connection reset');
    expect(attempts.findInProgress).toHaveBeenCalledTimes(1);
  });
});
