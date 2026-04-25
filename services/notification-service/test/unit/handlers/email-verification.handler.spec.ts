import { EmailVerificationHandler } from '../../../src/modules/notifications/handlers/email-verification.handler.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const makeMeta = (): MessageMeta => ({
  eventId: 'evt-002',
  eventType: AUTH_EVENT_TYPES.EMAIL_VERIFICATION_REQUESTED,
  occurredAt: new Date().toISOString(),
  source: 'auth-service',
});

describe('EmailVerificationHandler', () => {
  let handler: EmailVerificationHandler;
  let notifications: jest.Mocked<Pick<NotificationsService, 'sendEmailVerification'>>;

  beforeEach(() => {
    notifications = { sendEmailVerification: jest.fn() };
    handler = new EmailVerificationHandler(notifications as any);
  });

  it('has correct routing key', () => {
    expect(handler.routingKey).toBe(AUTH_EVENT_TYPES.EMAIL_VERIFICATION_REQUESTED);
  });

  it('calls sendEmailVerification with all payload fields mapped correctly', async () => {
    notifications.sendEmailVerification.mockResolvedValue(undefined);

    await handler.handle(
      {
        userId: 'user-xyz',
        email: 'verify@example.com',
        verificationUrl: 'https://app.example.com/verify?token=tok123',
        expiresInMinutes: 60,
      },
      makeMeta(),
    );

    expect(notifications.sendEmailVerification).toHaveBeenCalledWith({
      recipientId: 'user-xyz',
      email: 'verify@example.com',
      verificationUrl: 'https://app.example.com/verify?token=tok123',
      expiresInMinutes: 60,
    });
  });

  it('propagates errors from notification service', async () => {
    notifications.sendEmailVerification.mockRejectedValue(new Error('Send failed'));

    await expect(
      handler.handle(
        { userId: 'u', email: 'e@e.com', verificationUrl: 'http://x', expiresInMinutes: 15 },
        makeMeta(),
      ),
    ).rejects.toThrow('Send failed');
  });
});
