import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { SCHEDULING_EVENT_TYPES } from '@ssz/contracts';
import type { TeacherAbsenceReportedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class TeacherAbsenceHandler implements IMessageHandler<TeacherAbsenceReportedPayload> {
  readonly routingKey = SCHEDULING_EVENT_TYPES.TEACHER_ABSENCE_REPORTED;
  private readonly logger = new Logger(TeacherAbsenceHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: TeacherAbsenceReportedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(
      `Teacher absence for teacherId=${payload.teacherId} in schoolId=${payload.schoolId} [${meta.eventId}]`,
    );

    await this.repo.create({
      recipientId: payload.teacherId,
      type: NotificationType.TEACHER_ABSENCE,
      channel: NotificationChannel.IN_APP,
      subject: 'Absence recorded',
      templateKey: 'teacher_absence',
      templateData: {
        absenceId: payload.absenceId,
        schoolId: payload.schoolId,
        kind: payload.kind,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        substituteRequestCount: payload.createdSubstituteRequestIds.length,
      },
    });
  }
}
