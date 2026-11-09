import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsRepository } from '../notifications.repository.js';
import { AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { UserDeletedPayload } from '@ssz/contracts';

/** The account's deletion grace is over (VoxOrd plan 07, step 3c); nothing of it stays here. */
@Injectable()
export class UserDeletedHandler implements IMessageHandler<UserDeletedPayload> {
  readonly routingKey = AUTH_EVENT_TYPES.USER_DELETED;
  private readonly logger = new Logger(UserDeletedHandler.name);

  constructor(private readonly repository: NotificationsRepository) {}

  async handle(payload: UserDeletedPayload, meta: MessageMeta): Promise<void> {
    if (!payload?.userId) {
      this.logger.warn(`auth.user.deleted without userId [${meta.eventId}] — ignored`);
      return;
    }
    const { notifications } = await this.repository.eraseUser(payload.userId, payload.email || null);
    this.logger.log(`Erased user ${payload.userId}: ${notifications} notifications [${meta.eventId}]`);
  }
}
