import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { ANALYTICS_EVENT_TYPES } from '@ssz/contracts';
import type { NudgeRequestedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class NudgeRequestedHandler implements IMessageHandler<NudgeRequestedPayload> {
  readonly routingKey = ANALYTICS_EVENT_TYPES.NUDGE_REQUESTED;
  private readonly logger = new Logger(NudgeRequestedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: NudgeRequestedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Nudge requested for userId=${payload.userId} in schoolId=${payload.schoolId} [${meta.eventId}]`,
    );

    await this.repo.create({
      recipientId: payload.userId,
      type: NotificationType.STUDY_REMINDER,
      channel: NotificationChannel.IN_APP,
      subject: 'Time to study!',
      templateKey: 'study_reminder',
      templateData: { schoolId: payload.schoolId, requestedBy: payload.requestedBy },
    });
  }
}
