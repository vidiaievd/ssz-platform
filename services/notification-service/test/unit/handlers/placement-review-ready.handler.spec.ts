import { PlacementReviewReadyHandler } from '../../../src/modules/notifications/handlers/placement-review-ready.handler.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-001',
  eventType: 'school.enrollment.placement_review_ready',
  occurredAt: new Date().toISOString(),
  source: 'organization-service',
});

describe('PlacementReviewReadyHandler', () => {
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create'>>;
  let handler: PlacementReviewReadyHandler;

  beforeEach(() => {
    repo = { create: jest.fn() };
    handler = new PlacementReviewReadyHandler(repo as any);
  });

  it('creates one IN_APP notification per admin', async () => {
    repo.create.mockResolvedValue(undefined as any);

    await handler.handle(
      {
        membershipId: 'm-1',
        schoolId: 's-1',
        schoolName: 'Test School',
        studentId: 'st-1',
        adminIds: ['admin-1', 'admin-2'],
        occurredAt: new Date().toISOString(),
      },
      makeMeta(),
    );

    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'admin-1',
        type: NotificationType.PLACEMENT_REVIEW_READY,
        channel: NotificationChannel.IN_APP,
        templateKey: 'placement_review_ready',
        templateData: expect.objectContaining({ membershipId: 'm-1', schoolId: 's-1' }),
      }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'admin-2' }),
    );
  });

  it('creates no notifications when there are no admins', async () => {
    await handler.handle(
      {
        membershipId: 'm-1',
        schoolId: 's-1',
        schoolName: 'Test School',
        studentId: 'st-1',
        adminIds: [],
        occurredAt: new Date().toISOString(),
      },
      makeMeta(),
    );

    expect(repo.create).not.toHaveBeenCalled();
  });
});
