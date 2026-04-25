import { PasswordResetHandler } from '../../../src/modules/notifications/handlers/password-reset.handler.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-003',
  eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
  occurredAt: new Date().toISOString(),
  source: 'auth-service',
});

describe('PasswordResetHandler', () => {
  let handler: PasswordResetHandler;
  let notifications: jest.Mocked<Pick<NotificationsService, 'sendPasswordReset'>>;

  beforeEach(() => {
    notifications = { sendPasswordReset: jest.fn() };
    handler = new PasswordResetHandler(notifications as any);
  });

  it('has correct routing key', () => {
    expect(handler.routingKey).toBe(AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED);
  });

  it('calls sendPasswordReset with all payload fields mapped correctly', async () => {
    notifications.sendPasswordReset.mockResolvedValue(undefined);

    await handler.handle(
      {
        userId: 'user-reset',
        email: 'reset@example.com',
        resetUrl: 'https://app.example.com/reset?token=rstTok',
        expiresInMinutes: 30,
      },
      makeMeta(),
    );

    expect(notifications.sendPasswordReset).toHaveBeenCalledWith({
      recipientId: 'user-reset',
      email: 'reset@example.com',
      resetUrl: 'https://app.example.com/reset?token=rstTok',
      expiresInMinutes: 30,
    });
  });

  it('propagates errors from notification service', async () => {
    notifications.sendPasswordReset.mockRejectedValue(new Error('Service unavailable'));

    await expect(
      handler.handle(
        { userId: 'u', email: 'e@e.com', resetUrl: 'http://x', expiresInMinutes: 15 },
        makeMeta(),
      ),
    ).rejects.toThrow('Service unavailable');
  });
});
