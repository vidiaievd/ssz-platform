import { UserRegisteredHandler } from '../../../src/modules/notifications/handlers/user-registered.handler.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-001',
  eventType: AUTH_EVENT_TYPES.USER_REGISTERED,
  occurredAt: new Date().toISOString(),
  source: 'auth-service',
});

describe('UserRegisteredHandler', () => {
  let handler: UserRegisteredHandler;
  let notifications: jest.Mocked<Pick<NotificationsService, 'sendWelcomeEmail'>>;

  beforeEach(() => {
    notifications = { sendWelcomeEmail: jest.fn() };
    handler = new UserRegisteredHandler(notifications as any);
  });

  it('has correct routing key', () => {
    expect(handler.routingKey).toBe(AUTH_EVENT_TYPES.USER_REGISTERED);
  });

  it('calls sendWelcomeEmail with userId and email from payload', async () => {
    notifications.sendWelcomeEmail.mockResolvedValue(undefined);

    await handler.handle(
      { userId: 'user-abc', email: 'new@example.com', roles: ['student'] },
      makeMeta(),
    );

    expect(notifications.sendWelcomeEmail).toHaveBeenCalledWith({
      recipientId: 'user-abc',
      email: 'new@example.com',
    });
  });

  it('propagates errors from notification service', async () => {
    notifications.sendWelcomeEmail.mockRejectedValue(new Error('Email failed'));

    await expect(
      handler.handle({ userId: 'u', email: 'e@e.com', roles: [] }, makeMeta()),
    ).rejects.toThrow('Email failed');
  });
});
