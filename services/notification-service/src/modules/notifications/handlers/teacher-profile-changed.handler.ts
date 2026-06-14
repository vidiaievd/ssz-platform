import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { TeacherProfileChangedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class TeacherProfileChangedHandler implements IMessageHandler<TeacherProfileChangedPayload> {
  // routing key from ORGANIZATION_EVENT_TYPES.TEACHER_PROFILE_CHANGED
  readonly routingKey = 'organization.teacher.profile_changed';
  private readonly logger = new Logger(TeacherProfileChangedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: TeacherProfileChangedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Teacher profile changed: teacherId=${payload.teacherUserId} schoolId=${payload.schoolId} fields=[${payload.changedFields.join(', ')}] [${meta.eventId}]`,
    );

    await this.repo.create({
      recipientId: payload.recipientId,
      type: NotificationType.TEACHER_PROFILE_CHANGED,
      channel: NotificationChannel.IN_APP,
      subject: 'Teacher profile updated',
      templateKey: 'teacher_profile_changed',
      templateData: {
        teacherUserId: payload.teacherUserId,
        changedFields: payload.changedFields,
        schoolId: payload.schoolId,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
