import { AssignmentCreatedHandler } from '../../../src/modules/notifications/handlers/assignment-created.handler.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-6b',
  eventType: 'learning.assignment.created',
  occurredAt: new Date().toISOString(),
  source: 'learning-service',
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  assignmentId: 'asg-1',
  assignerId: 'teacher-1',
  assigneeId: 'learner-1',
  schoolId: 'school-1',
  groupId: 'group-1',
  contentType: 'LESSON',
  contentId: 'lesson-1',
  dueAt: '2026-11-05T18:00:00.000Z',
  contentTitle: 'Familien',
  ...overrides,
});

describe('AssignmentCreatedHandler', () => {
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create'>>;
  let handler: AssignmentCreatedHandler;

  beforeEach(() => {
    repo = { create: jest.fn() };
    handler = new AssignmentCreatedHandler(repo as any);
    repo.create.mockResolvedValue(undefined as any);
  });

  it('tells the learner it was given to, in-app, with what and by when', async () => {
    await handler.handle(payload() as never, makeMeta());

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'learner-1',
        type: NotificationType.ASSIGNMENT_NEW,
        channel: NotificationChannel.IN_APP,
        templateKey: 'assignment_new',
        subject: 'New assignment: “Familien”',
        templateData: {
          assignmentId: 'asg-1',
          assignerId: 'teacher-1',
          schoolId: 'school-1',
          groupId: 'group-1',
          contentType: 'LESSON',
          contentId: 'lesson-1',
          contentTitle: 'Familien',
          dueAt: '2026-11-05T18:00:00.000Z',
        },
      }),
    );
  });

  it('words an event from before titles travelled without one', async () => {
    const older = payload();
    delete (older as Record<string, unknown>).contentTitle;
    delete (older as Record<string, unknown>).groupId;

    await handler.handle(older as never, makeMeta());

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'You have a new assignment',
        templateData: expect.objectContaining({ contentTitle: null, groupId: null }),
      }),
    );
  });
});
