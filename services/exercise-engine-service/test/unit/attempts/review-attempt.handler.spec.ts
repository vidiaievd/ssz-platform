import { jest } from '@jest/globals';
import { ReviewAttemptHandler } from '../../../src/modules/attempts/application/commands/review-attempt/review-attempt.handler.js';
import { ReviewAttemptCommand } from '../../../src/modules/attempts/application/commands/review-attempt/review-attempt.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../../src/shared/kernel/result.js';

/**
 * Three sentences: the first hit the key and was closed by the machine, the other two are
 * why this submission is in a queue at all.
 */
const DETAILS = {
  totalItems: 3,
  items: [
    { itemId: 'i1', routing: 'pass', verdict: 'exact' },
    { itemId: 'i2', routing: 'teacher', verdict: 'near' },
    { itemId: 'i3', routing: 'teacher', verdict: 'off' },
  ],
};

function routedAttempt(): Attempt {
  const attempt = Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
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

function makeHandler(attempt: Attempt | null, details: unknown = DETAILS) {
  const attempts = {
    findById: jest.fn(() => Promise.resolve(attempt)),
    save: jest.fn(() => Promise.resolve()),
  };
  const validator = {
    validate: jest.fn(() =>
      Promise.resolve(Result.ok({ correct: false, score: 0, details, requiresReview: true })),
    ),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(
        Result.ok({
          exercise: { content: {}, expectedAnswers: {}, answerCheckSettings: null },
          template: { answerSchema: {}, defaultCheckSettings: {} },
        }),
      ),
    ),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  const handler = new ReviewAttemptHandler(
    attempts as never,
    validator as never,
    contentClient as never,
    publisher as never,
  );
  return { handler, attempts, publisher, validator };
}

const approve = (decisions: { itemId: string; approved: boolean; comment?: string }[]) =>
  new ReviewAttemptCommand('att-1', 'teacher-1', 'approved', decisions, null);

describe('ReviewAttemptHandler', () => {
  it('scores from what the machine closed plus what the teacher approved', async () => {
    const attempt = routedAttempt();
    const { handler } = makeHandler(attempt);

    const result = await handler.execute(
      approve([
        { itemId: 'i2', approved: true },
        { itemId: 'i3', approved: false },
      ]),
    );

    expect(result.isOk).toBe(true);
    // i1 auto-passed, i2 approved, i3 not: two of three.
    expect(result.value.score).toBe(67);
    expect(result.value.approvedItems).toBe(2);
    expect(attempt.status).toBe('SCORED');
    expect(attempt.reviewedByUserId).toBe('teacher-1');
  });

  /**
   * The one mistake this template cannot afford: the learner's only feedback is a
   * person's, so a sentence nobody decided about is not a sentence quietly accepted.
   */
  it('does not approve an item the teacher said nothing about', async () => {
    const { handler } = makeHandler(routedAttempt());

    const result = await handler.execute(approve([{ itemId: 'i2', approved: true }]));

    expect(result.value.approvedItems).toBe(2);
    expect(result.value.score).toBe(67);
  });

  it('publishes the scored event, so progress and the SRS learn the verdict', async () => {
    const { handler, publisher } = makeHandler(routedAttempt());

    await handler.execute(approve([{ itemId: 'i2', approved: true }]));

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const [eventType] = publisher.publish.mock.calls[0]!;
    expect(String(eventType)).toContain('attempt');
  });

  it('sends a submission back without scoring it and without an event', async () => {
    const attempt = routedAttempt();
    const { handler, publisher } = makeHandler(attempt);

    const result = await handler.execute(
      new ReviewAttemptCommand('att-1', 'teacher-1', 'returned', [], 'Se på perfektum.'),
    );

    expect(result.value.status).toBe('RETURNED');
    expect(attempt.status).toBe('RETURNED');
    expect(attempt.scoreValue).toBeNull();
    expect(attempt.reviewComment).toBe('Se på perfektum.');
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  /** A submission a colleague marked a minute ago is no longer in anyone's queue. */
  it('refuses to review an attempt that is not waiting for review', async () => {
    const attempt = routedAttempt();
    attempt.review({
      reviewerId: 'teacher-0',
      outcome: 'returned',
      decisions: [],
      comment: null,
    });
    const { handler } = makeHandler(attempt);

    const result = await handler.execute(approve([]));

    expect(result.isFail).toBe(true);
  });

  it('reports a missing attempt as missing rather than failing to mark it', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(approve([]));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });
});
