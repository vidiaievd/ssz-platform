import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { StudentNudgedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class StudentNudgedHandler implements IMessageHandler<StudentNudgedPayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.STUDENT_NUDGED;
  private readonly logger = new Logger(StudentNudgedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: StudentNudgedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Individual nudge for studentUserId=${payload.studentUserId} in schoolId=${payload.schoolId} [${meta.eventId}]`,
    );

    await this.repo.create({
      recipientId: payload.studentUserId,
      type: NotificationType.STUDY_REMINDER,
      channel: NotificationChannel.IN_APP,
      subject: 'Time to study!',
      templateKey: 'study_reminder',
      templateData: { schoolId: payload.schoolId, requestedBy: payload.requestedBy },
    });
  }
}
