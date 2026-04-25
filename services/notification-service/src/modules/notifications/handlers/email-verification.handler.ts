import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsService } from '../notifications.service.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { EmailVerificationRequestedPayload } from '@ssz/contracts';

@Injectable()
export class EmailVerificationHandler implements IMessageHandler<EmailVerificationRequestedPayload> {
  readonly routingKey = AUTH_EVENT_TYPES.EMAIL_VERIFICATION_REQUESTED;
  private readonly logger = new Logger(EmailVerificationHandler.name);

  constructor(private readonly notifications: NotificationsService) {}

  async handle(payload: EmailVerificationRequestedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Handling email_verification_requested for userId=${payload.userId} [${meta.eventId}]`);

    await this.notifications.sendEmailVerification({
      recipientId: payload.userId,
      email: payload.email,
      verificationUrl: payload.verificationUrl,
      expiresInMinutes: payload.expiresInMinutes,
    });
  }
}
