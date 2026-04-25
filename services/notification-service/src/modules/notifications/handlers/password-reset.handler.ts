import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsService } from '../notifications.service.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { PasswordResetRequestedPayload } from '@ssz/contracts';

@Injectable()
export class PasswordResetHandler implements IMessageHandler<PasswordResetRequestedPayload> {
  readonly routingKey = AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED;
  private readonly logger = new Logger(PasswordResetHandler.name);

  constructor(private readonly notifications: NotificationsService) {}

  async handle(payload: PasswordResetRequestedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Handling password_reset_requested for userId=${payload.userId} [${meta.eventId}]`);

    await this.notifications.sendPasswordReset({
      recipientId: payload.userId,
      email: payload.email,
      resetUrl: payload.resetUrl,
      expiresInMinutes: payload.expiresInMinutes,
    });
  }
}
