import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsService } from '../notifications.service.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { UserRegisteredPayload } from '@ssz/contracts';

@Injectable()
export class UserRegisteredHandler implements IMessageHandler<UserRegisteredPayload> {
  readonly routingKey = AUTH_EVENT_TYPES.USER_REGISTERED;
  private readonly logger = new Logger(UserRegisteredHandler.name);

  constructor(private readonly notifications: NotificationsService) {}

  async handle(payload: UserRegisteredPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Handling user.registered for userId=${payload.userId} [${meta.eventId}]`);

    await this.notifications.sendWelcomeEmail({
      recipientId: payload.userId,
      email: payload.email,
    });
  }
}
