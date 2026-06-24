import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { EnrollmentRequestPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class EnrollmentRequestHandler implements IMessageHandler<EnrollmentRequestPayload> {
  readonly routingKey = 'school.enrollment.requested';
  private readonly logger = new Logger(EnrollmentRequestHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: EnrollmentRequestPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Enrollment request: membershipId=${payload.membershipId} schoolId=${payload.schoolId} [${meta.eventId}]`);

    await Promise.all(
      payload.adminIds.map((adminId) =>
        this.repo.create({
          recipientId: adminId,
          type: NotificationType.ENROLLMENT_REQUEST,
          channel: NotificationChannel.IN_APP,
          subject: `New enrollment application from ${payload.studentName}`,
          templateKey: 'enrollment_request',
          templateData: {
            membershipId: payload.membershipId,
            schoolId: payload.schoolId,
            schoolName: payload.schoolName,
            studentId: payload.studentId,
            studentName: payload.studentName,
            studentAvatarUrl: payload.studentAvatarUrl,
            studentEmail: payload.studentEmail,
            language: payload.language,
            ageBand: payload.ageBand,
            source: payload.source,
            occurredAt: payload.occurredAt,
          },
        }),
      ),
    );
  }
}
