import { EnrollmentApprovedHandler } from '../../../src/modules/notifications/handlers/enrollment-approved.handler.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-001',
  eventType: 'school.enrollment.approved',
  occurredAt: new Date().toISOString(),
  source: 'organization-service',
});

describe('EnrollmentApprovedHandler', () => {
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create' | 'archiveByMembershipId'>>;
  let handler: EnrollmentApprovedHandler;

  beforeEach(() => {
    repo = { create: jest.fn(), archiveByMembershipId: jest.fn() };
    handler = new EnrollmentApprovedHandler(repo as any);
  });

  it('archives the pending ENROLLMENT_REQUEST notifications and creates the approved one', async () => {
    repo.archiveByMembershipId.mockResolvedValue(undefined);
    repo.create.mockResolvedValue(undefined as any);

    await handler.handle(
      {
        membershipId: 'm-1',
        schoolId: 's-1',
        schoolName: 'Test School',
        studentId: 'st-1',
        occurredAt: new Date().toISOString(),
      },
      makeMeta(),
    );

    expect(repo.archiveByMembershipId).toHaveBeenCalledWith('m-1');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'st-1', templateKey: 'enrollment_approved' }),
    );
  });
});
