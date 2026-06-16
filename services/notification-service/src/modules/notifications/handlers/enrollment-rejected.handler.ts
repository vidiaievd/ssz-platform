import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { EnrollmentRejectedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class EnrollmentRejectedHandler implements IMessageHandler<EnrollmentRejectedPayload> {
  readonly routingKey = 'school.enrollment.rejected';
  private readonly logger = new Logger(EnrollmentRejectedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: EnrollmentRejectedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Enrollment rejected: membershipId=${payload.membershipId} [${meta.eventId}]`);

    await this.repo.create({
      recipientId: payload.studentId,
      type: NotificationType.ENROLLMENT_REJECTED,
      channel: NotificationChannel.IN_APP,
      subject: `Your application to ${payload.schoolName} was not approved`,
      templateKey: 'enrollment_rejected',
      templateData: {
        membershipId: payload.membershipId,
        schoolId: payload.schoolId,
        schoolName: payload.schoolName,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
