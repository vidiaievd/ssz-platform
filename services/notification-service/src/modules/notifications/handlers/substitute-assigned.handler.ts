import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { SCHEDULING_EVENT_TYPES } from '@ssz/contracts';
import type { SubstituteAssignedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class SubstituteAssignedHandler implements IMessageHandler<SubstituteAssignedPayload> {
  readonly routingKey = SCHEDULING_EVENT_TYPES.SUBSTITUTE_ASSIGNED;
  private readonly logger = new Logger(SubstituteAssignedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: SubstituteAssignedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Substitute assigned substituteTeacherId=${payload.substituteTeacherId} for lessonId=${payload.lessonId} [${meta.eventId}]`,
    );

    // Notify the substitute
    await this.repo.create({
      recipientId: payload.substituteTeacherId,
      type: NotificationType.SUBSTITUTE_ASSIGNED,
      channel: NotificationChannel.IN_APP,
      subject: 'You have been assigned as substitute',
      templateKey: 'substitute_assigned_sub',
      templateData: {
        assignmentId: payload.assignmentId,
        schoolId: payload.schoolId,
        groupId: payload.groupId,
        lessonId: payload.lessonId,
        coverFrom: payload.coverFrom,
        coverTo: payload.coverTo,
        fitScore: payload.fitScore,
      },
    });

    // Notify the original teacher
    await this.repo.create({
      recipientId: payload.originalTeacherId,
      type: NotificationType.SUBSTITUTE_ASSIGNED,
      channel: NotificationChannel.IN_APP,
      subject: 'Cover arranged for your absence',
      templateKey: 'substitute_assigned_original',
      templateData: {
        assignmentId: payload.assignmentId,
        substituteTeacherId: payload.substituteTeacherId,
        lessonId: payload.lessonId,
        coverFrom: payload.coverFrom,
        coverTo: payload.coverTo,
      },
    });
  }
}
