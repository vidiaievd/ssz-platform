import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { EmailService } from '../../../src/infrastructure/email/email.service.js';

const makeRepo = (): jest.Mocked<NotificationsRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  incrementAttempts: jest.fn(),
} as any);

const makeEmail = (): jest.Mocked<Pick<EmailService, 'send'>> => ({
  send: jest.fn(),
});

const baseNotification = (overrides: object = {}) => ({
  id: 'notif-1',
  attempts: 1,
  maxAttempts: 3,
  status: 'SENDING',
  ...overrides,
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: jest.Mocked<NotificationsRepository>;
  let email: jest.Mocked<Pick<EmailService, 'send'>>;

  beforeEach(() => {
    repo = makeRepo();
    email = makeEmail();
    service = new NotificationsService(repo as any, email as any);
  });

  describe('sendWelcomeEmail', () => {
    it('creates notification, sets SENDING, sends email, marks SENT', async () => {
      repo.create.mockResolvedValue(baseNotification() as any);
      repo.update.mockResolvedValue({} as any);
      repo.incrementAttempts.mockResolvedValue({} as any);
      email.send.mockResolvedValue(undefined as any);

      await service.sendWelcomeEmail({ recipientId: 'user-1', email: 'user@example.com' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'WELCOME_EMAIL',
        channel: 'EMAIL',
        recipientId: 'user-1',
        recipientEmail: 'user@example.com',
        templateKey: 'welcome',
      }));
      expect(repo.update).toHaveBeenCalledWith('notif-1', { status: 'SENDING' });
      expect(repo.incrementAttempts).toHaveBeenCalledWith('notif-1');
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
        to: 'user@example.com',
        subject: 'Welcome to SSZ Platform',
      }));
      expect(repo.update).toHaveBeenCalledWith('notif-1', expect.objectContaining({
        status: 'SENT',
        sentAt: expect.any(Date),
        lastError: null,
      }));
    });
  });

  describe('sendEmailVerification', () => {
    it('creates notification with correct template data and sends email', async () => {
      repo.create.mockResolvedValue(baseNotification() as any);
      repo.update.mockResolvedValue({} as any);
      repo.incrementAttempts.mockResolvedValue({} as any);
      email.send.mockResolvedValue(undefined as any);

      await service.sendEmailVerification({
        recipientId: 'user-2',
        email: 'verify@example.com',
        verificationUrl: 'https://example.com/verify?token=abc',
        expiresInMinutes: 60,
      });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EMAIL_VERIFICATION',
        templateKey: 'email-verification',
        templateData: expect.objectContaining({
          verificationUrl: 'https://example.com/verify?token=abc',
          expiresInMinutes: 60,
        }),
      }));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
        to: 'verify@example.com',
        subject: 'Verify your email address',
      }));
    });
  });

  describe('sendPasswordReset', () => {
    it('creates notification with correct template data and sends email', async () => {
      repo.create.mockResolvedValue(baseNotification() as any);
      repo.update.mockResolvedValue({} as any);
      repo.incrementAttempts.mockResolvedValue({} as any);
      email.send.mockResolvedValue(undefined as any);

      await service.sendPasswordReset({
        recipientId: 'user-3',
        email: 'reset@example.com',
        resetUrl: 'https://example.com/reset?token=xyz',
        expiresInMinutes: 30,
      });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'PASSWORD_RESET',
        templateKey: 'password-reset',
        templateData: expect.objectContaining({
          resetUrl: 'https://example.com/reset?token=xyz',
          expiresInMinutes: 30,
        }),
      }));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'Reset your password',
      }));
    });
  });

  describe('failure handling', () => {
    it('marks FAILED when attempts < maxAttempts', async () => {
      repo.create.mockResolvedValue(baseNotification({ attempts: 1, maxAttempts: 3 }) as any);
      repo.update.mockResolvedValue({} as any);
      repo.incrementAttempts.mockResolvedValue({} as any);
      repo.findById.mockResolvedValue(baseNotification({ attempts: 1, maxAttempts: 3 }) as any);
      email.send.mockRejectedValue(new Error('SMTP timeout'));

      await expect(
        service.sendWelcomeEmail({ recipientId: 'user-1', email: 'user@example.com' }),
      ).rejects.toThrow('SMTP timeout');

      expect(repo.update).toHaveBeenCalledWith('notif-1', expect.objectContaining({
        status: 'FAILED',
        lastError: 'SMTP timeout',
      }));
    });

    it('marks PERMANENTLY_FAILED when attempts >= maxAttempts', async () => {
      repo.create.mockResolvedValue(baseNotification({ attempts: 3, maxAttempts: 3 }) as any);
      repo.update.mockResolvedValue({} as any);
      repo.incrementAttempts.mockResolvedValue({} as any);
      repo.findById.mockResolvedValue(baseNotification({ attempts: 3, maxAttempts: 3 }) as any);
      email.send.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.sendWelcomeEmail({ recipientId: 'user-1', email: 'user@example.com' }),
      ).rejects.toThrow('Connection refused');

      expect(repo.update).toHaveBeenCalledWith('notif-1', expect.objectContaining({
        status: 'PERMANENTLY_FAILED',
        lastError: 'Connection refused',
      }));
    });
  });
});
