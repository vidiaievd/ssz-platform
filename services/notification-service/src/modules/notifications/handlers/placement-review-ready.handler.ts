import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { PlacementReviewReadyPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class PlacementReviewReadyHandler implements IMessageHandler<PlacementReviewReadyPayload> {
  readonly routingKey = 'school.enrollment.placement_review_ready';
  private readonly logger = new Logger(PlacementReviewReadyHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: PlacementReviewReadyPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Placement review ready: membershipId=${payload.membershipId} [${meta.eventId}]`);

    await Promise.all(
      payload.adminIds.map((adminId) =>
        this.repo.create({
          recipientId: adminId,
          type: NotificationType.PLACEMENT_REVIEW_READY,
          channel: NotificationChannel.IN_APP,
          subject: 'Student ready for placement review',
          templateKey: 'placement_review_ready',
          templateData: {
            membershipId: payload.membershipId,
            schoolId: payload.schoolId,
            schoolName: payload.schoolName,
            studentId: payload.studentId,
            occurredAt: payload.occurredAt,
          },
        }),
      ),
    );
  }
}
