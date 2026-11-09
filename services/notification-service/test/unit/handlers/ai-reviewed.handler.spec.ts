import { AiReviewedHandler } from '../../../src/modules/notifications/handlers/ai-reviewed.handler.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-077',
  eventType: 'exercise.attempt.ai_reviewed',
  occurredAt: new Date().toISOString(),
  source: 'exercise-engine-service',
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  attemptId: 'att-1',
  userId: 'learner-1',
  exerciseId: 'ex-1',
  templateCode: 'writing_task',
  capability: 'review_direct',
  modelId: 'model-1',
  promptVersion: 'v1',
  outcome: 'approved' as const,
  schoolId: null,
  groupId: null,
  containerId: 'course-1',
  exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
  score: 85,
  occurredAt: new Date().toISOString(),
  ...overrides,
});

describe('AiReviewedHandler', () => {
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create'>>;
  let handler: AiReviewedHandler;

  beforeEach(() => {
    repo = { create: jest.fn() };
    handler = new AiReviewedHandler(repo as any);
    repo.create.mockResolvedValue(undefined as any);
  });

  it('tells the learner, in-app, with the outcome, the mark and the work it names', async () => {
    await handler.handle(payload() as never, makeMeta());

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'learner-1',
        type: NotificationType.AI_REVIEWED,
        channel: NotificationChannel.IN_APP,
        templateKey: 'ai_reviewed',
        subject: '“Familien” was checked',
        templateData: expect.objectContaining({
          attemptId: 'att-1',
          exerciseId: 'ex-1',
          outcome: 'approved',
          score: 85,
          containerId: 'course-1',
          exercisePath: { course: 'Ny i Norge — A2', module: 'Leksjon 19', exercise: 'Familien' },
          acceptedAtTerm: false,
        }),
      }),
    );
  });

  it('carries no model axes — they are about the model, not news to the learner', async () => {
    await handler.handle(payload() as never, makeMeta());

    const data = repo.create.mock.calls[0][0].templateData as Record<string, unknown>;
    expect(data).not.toHaveProperty('modelId');
    expect(data).not.toHaveProperty('promptVersion');
    expect(data).not.toHaveProperty('capability');
  });

  it('marks a verdict that counted at the school’s term', async () => {
    await handler.handle(payload({ acceptedAtTerm: true, outcome: 'returned', score: null }) as never, makeMeta());

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '“Familien” was checked and sent back',
        templateData: expect.objectContaining({ outcome: 'returned', score: null, acceptedAtTerm: true }),
      }),
    );
  });

  it('words an event from before the names travelled without them', async () => {
    const older = payload();
    delete (older as Record<string, unknown>).exercisePath;
    delete (older as Record<string, unknown>).score;
    delete (older as Record<string, unknown>).containerId;

    await handler.handle(older as never, makeMeta());

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your work was checked',
        templateData: expect.objectContaining({ exercisePath: null, score: null, containerId: null }),
      }),
    );
  });
});
