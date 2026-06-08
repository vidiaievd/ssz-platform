import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { SCHEDULING_EVENT_TYPES } from '@ssz/contracts';
import type { SubstituteRequestCreatedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class SubstituteRequestHandler implements IMessageHandler<SubstituteRequestCreatedPayload> {
  readonly routingKey = SCHEDULING_EVENT_TYPES.SUBSTITUTE_REQUEST_CREATED;
  private readonly logger = new Logger(SubstituteRequestHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: SubstituteRequestCreatedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Substitute request created requestId=${payload.requestId} for groupId=${payload.groupId} [${meta.eventId}]`,
    );

    await this.repo.create({
      recipientId: payload.originalTeacherId,
      type: NotificationType.SUBSTITUTE_REQUEST,
      channel: NotificationChannel.IN_APP,
      subject: 'Cover request created',
      templateKey: 'substitute_request',
      templateData: {
        requestId: payload.requestId,
        schoolId: payload.schoolId,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        urgency: payload.urgency,
        coverFrom: payload.coverFrom,
        coverTo: payload.coverTo,
      },
    });
  }
}
