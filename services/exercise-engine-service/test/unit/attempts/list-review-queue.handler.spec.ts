import { jest } from '@jest/globals';
import { ListReviewQueueHandler } from '../../../src/modules/attempts/application/queries/list-review-queue/list-review-queue.handler.js';
import { ListReviewQueueQuery } from '../../../src/modules/attempts/application/queries/list-review-queue/list-review-queue.query.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../../src/shared/kernel/result.js';

function routedAttempt(exerciseId: string, userId: string): Attempt {
  const attempt = Attempt.create({
    userId,
    exerciseId,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
  });
  attempt.submit([{ itemId: 'i1', text: 'Jeg har bodd i Tromsø i tre år.' }], 'hash');
  attempt.routeForReview();
  attempt.clearDomainEvents();
  return attempt;
}

function makeHandler(
  items: Attempt[],
  options: { failingExercises?: string[] } = {},
) {
  const failing = new Set(options.failingExercises ?? []);

  const attempts = {
    findAllByExercises: jest.fn(() => Promise.resolve({ items, total: items.length })),
  };
  const validator = {
    validate: jest.fn(() =>
      Promise.resolve(
        Result.ok({
          correct: false,
          score: 0,
          details: { totalItems: 1, items: [{ itemId: 'i1', routing: 'teacher' }] },
          requiresReview: true,
        }),
      ),
    ),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn((exerciseId: string) =>
      Promise.resolve(
        failing.has(exerciseId)
          ? Result.fail(new Error('gone'))
          : Result.ok({
              exercise: { content: {}, expectedAnswers: {}, answerCheckSettings: null },
              template: { answerSchema: {}, defaultCheckSettings: {} },
            }),
      ),
    ),
  };

  const handler = new ListReviewQueueHandler(
    attempts as never,
    validator as never,
    contentClient as never,
  );
  return { handler, attempts, contentClient, validator };
}

describe('ListReviewQueueHandler', () => {
  it('asks the repository for the whole set of exercises at once', async () => {
    const { handler, attempts } = makeHandler([]);

    await handler.execute(new ListReviewQueueQuery(['ex-1', 'ex-2'], 20, 0));

    expect(attempts.findAllByExercises).toHaveBeenCalledWith(['ex-1', 'ex-2'], {
      status: 'ROUTED_FOR_REVIEW',
      limit: 20,
      offset: 0,
    });
  });

  it('fetches each exercise once however many of its submissions are on the page', async () => {
    const { handler, contentClient } = makeHandler([
      routedAttempt('ex-1', 'user-1'),
      routedAttempt('ex-1', 'user-2'),
      routedAttempt('ex-2', 'user-3'),
    ]);

    const result = await handler.execute(new ListReviewQueueQuery(['ex-1', 'ex-2'], 20, 0));

    expect(contentClient.getExerciseForAttempt).toHaveBeenCalledTimes(2);
    // Which exercise a submission belongs to is the only grouping a course inbox has.
    expect(result.items.map((i) => i.exerciseId)).toEqual(['ex-1', 'ex-1', 'ex-2']);
    expect(result.items.every((i) => i.details !== null)).toBe(true);
  });

  it('costs an unreadable exercise its own diffs and nothing else', async () => {
    const { handler } = makeHandler(
      [routedAttempt('ex-1', 'user-1'), routedAttempt('ex-2', 'user-2')],
      { failingExercises: ['ex-1'] },
    );

    const result = await handler.execute(new ListReviewQueueQuery(['ex-1', 'ex-2'], 20, 0));

    // Still reviewable, just without a diff to lean on — a teacher locked out of the
    // queue cannot unblock the learner waiting in it.
    expect(result.items[0]!.details).toBeNull();
    expect(result.items[1]!.details).not.toBeNull();
  });

  it('does not go looking for definitions when nothing is waiting', async () => {
    const { handler, contentClient } = makeHandler([]);

    const result = await handler.execute(new ListReviewQueueQuery(['ex-1'], 20, 0));

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
  });
});
