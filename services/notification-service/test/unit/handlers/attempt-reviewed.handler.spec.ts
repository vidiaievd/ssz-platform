import { AttemptReviewedHandler } from '../../../src/modules/notifications/handlers/attempt-reviewed.handler.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-042',
  eventType: 'exercise.attempt.reviewed',
  occurredAt: new Date().toISOString(),
  source: 'exercise-engine-service',
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  attemptId: 'att-1',
  userId: 'learner-1',
  exerciseId: 'ex-1',
  templateCode: 'translate_to_target',
  reviewerId: 'teacher-1',
  outcome: 'approved' as const,
  score: 80,
  comment: null,
  hasComment: false,
  approvedItems: 4,
  totalItems: 5,
  containerId: 'course-1',
  exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
  occurredAt: new Date().toISOString(),
  ...overrides,
});

describe('AttemptReviewedHandler', () => {
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create'>>;
  let handler: AttemptReviewedHandler;

  beforeEach(() => {
    repo = { create: jest.fn() };
    handler = new AttemptReviewedHandler(repo as any);
    repo.create.mockResolvedValue(undefined as any);
  });

  it('tells the learner who handed the work in, not the teacher who marked it', async () => {
    await handler.handle(payload() as never, makeMeta());

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'learner-1',
        type: NotificationType.ATTEMPT_REVIEWED,
        channel: NotificationChannel.IN_APP,
        templateKey: 'attempt_reviewed',
        templateData: expect.objectContaining({
          exerciseId: 'ex-1',
          outcome: 'approved',
          score: 80,
          approvedItems: 4,
          totalItems: 5,
        }),
      }),
    );
  });

  /**
   * The case the whole notification exists for: an approval a teacher wrote nothing on
   * still gets sent. Waiting on a person is the state this template leaves a learner in,
   * and "read, nothing to say" is indistinguishable from "not read yet" without it.
   */
  it('sends an approval nobody commented on', async () => {
    await handler.handle(payload({ comment: null, score: 100 }) as never, makeMeta());

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create.mock.calls[0]![0]).toMatchObject({
      templateData: expect.objectContaining({ comment: null, score: 100 }),
    });
  });

  /** 47.4: the message has to lead back to the work, and name it while doing so. */
  it('carries where the work is and what it is called', async () => {
    await handler.handle(payload() as never, makeMeta());

    const created = repo.create.mock.calls[0]![0];
    expect(created.templateData).toMatchObject({
      attemptId: 'att-1',
      containerId: 'course-1',
      exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
    });
    expect(created.subject).toBe('Your teacher has marked “Familien”');
  });

  /**
   * `hasComment` is not `comment !== null`: a teacher may write nothing overall and still
   * leave a note on one sentence, and the learner must be sent to read it.
   */
  it('passes on that something was written even when nothing was written overall', async () => {
    await handler.handle(payload({ comment: null, hasComment: true }) as never, makeMeta());

    expect(repo.create.mock.calls[0]![0].templateData).toMatchObject({
      comment: null,
      hasComment: true,
    });
  });

  it('still says something sensible about work that carried no path', async () => {
    await handler.handle(payload({ exercisePath: null, containerId: null }) as never, makeMeta());

    const created = repo.create.mock.calls[0]![0];
    expect(created.subject).toBe('Your teacher has marked your work');
    expect(created.templateData).toMatchObject({ exercisePath: null, containerId: null });
  });

  it('carries a returned submission with its comment and no score', async () => {
    await handler.handle(
      payload({ outcome: 'returned', score: null, comment: 'Se på perfektum.' }) as never,
      makeMeta(),
    );

    const created = repo.create.mock.calls[0]![0];
    expect(created).toMatchObject({
      recipientId: 'learner-1',
      templateData: expect.objectContaining({
        outcome: 'returned',
        score: null,
        comment: 'Se på perfektum.',
      }),
    });
    // The subject differs because the two outcomes ask different things of the learner.
    expect(created.subject).toBe('Your teacher sent “Familien” back');
  });
});
