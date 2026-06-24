import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { EnrollmentApprovedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class EnrollmentApprovedHandler implements IMessageHandler<EnrollmentApprovedPayload> {
  readonly routingKey = 'school.enrollment.approved';
  private readonly logger = new Logger(EnrollmentApprovedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: EnrollmentApprovedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Enrollment approved: membershipId=${payload.membershipId} [${meta.eventId}]`);

    await this.repo.archiveByMembershipId(payload.membershipId);

    await this.repo.create({
      recipientId: payload.studentId,
      type: NotificationType.ENROLLMENT_APPROVED,
      channel: NotificationChannel.IN_APP,
      subject: `Your application to ${payload.schoolName} was accepted — placement in progress`,
      templateKey: 'enrollment_approved',
      templateData: {
        membershipId: payload.membershipId,
        schoolId: payload.schoolId,
        schoolName: payload.schoolName,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
