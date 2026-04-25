import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../infrastructure/email/email.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { welcomeTemplate } from '../../infrastructure/email/templates/welcome.template.js';
import { emailVerificationTemplate } from '../../infrastructure/email/templates/email-verification.template.js';
import { passwordResetTemplate } from '../../infrastructure/email/templates/password-reset.template.js';
import type { NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';

export interface SendWelcomeEmailInput {
  recipientId: string;
  email: string;
}

export interface SendEmailVerificationInput {
  recipientId: string;
  email: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface SendPasswordResetInput {
  recipientId: string;
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly email: EmailService,
  ) {}

  async sendWelcomeEmail(input: SendWelcomeEmailInput): Promise<void> {
    const template = welcomeTemplate({ email: input.email });

    const notification = await this.repo.create({
      type: 'WELCOME_EMAIL' as NotificationType,
      channel: 'EMAIL' as NotificationChannel,
      recipientId: input.recipientId,
      recipientEmail: input.email,
      subject: template.subject,
      templateKey: 'welcome',
      templateData: { email: input.email },
    });

    await this.sendEmail(notification.id, input.email, template);
  }

  async sendEmailVerification(input: SendEmailVerificationInput): Promise<void> {
    const template = emailVerificationTemplate({
      email: input.email,
      verificationUrl: input.verificationUrl,
      expiresInMinutes: input.expiresInMinutes,
    });

    const notification = await this.repo.create({
      type: 'EMAIL_VERIFICATION' as NotificationType,
      channel: 'EMAIL' as NotificationChannel,
      recipientId: input.recipientId,
      recipientEmail: input.email,
      subject: template.subject,
      templateKey: 'email-verification',
      templateData: {
        email: input.email,
        verificationUrl: input.verificationUrl,
        expiresInMinutes: input.expiresInMinutes,
      },
    });

    await this.sendEmail(notification.id, input.email, template);
  }

  async sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    const template = passwordResetTemplate({
      email: input.email,
      resetUrl: input.resetUrl,
      expiresInMinutes: input.expiresInMinutes,
    });

    const notification = await this.repo.create({
      type: 'PASSWORD_RESET' as NotificationType,
      channel: 'EMAIL' as NotificationChannel,
      recipientId: input.recipientId,
      recipientEmail: input.email,
      subject: template.subject,
      templateKey: 'password-reset',
      templateData: {
        email: input.email,
        resetUrl: input.resetUrl,
        expiresInMinutes: input.expiresInMinutes,
      },
    });

    await this.sendEmail(notification.id, input.email, template);
  }

  private async sendEmail(
    notificationId: string,
    to: string,
    template: { subject: string; html: string; text: string },
  ): Promise<void> {
    await this.repo.update(notificationId, { status: 'SENDING' });
    await this.repo.incrementAttempts(notificationId);

    try {
      await this.email.send({ to, subject: template.subject, html: template.html, text: template.text });
      await this.repo.update(notificationId, { status: 'SENT', sentAt: new Date(), lastError: null });
      this.logger.log(`Notification [${notificationId}] sent to ${to}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Notification [${notificationId}] failed: ${errorMessage}`);

      const current = await this.repo.findById(notificationId);
      const isPermanentFailure = current && current.attempts >= current.maxAttempts;

      await this.repo.update(notificationId, {
        status: isPermanentFailure ? 'PERMANENTLY_FAILED' : 'FAILED',
        lastError: errorMessage,
      });

      throw err;
    }
  }
}
