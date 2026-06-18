import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import type { GroupAssignedPayload } from '@ssz/contracts';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';

@Injectable()
export class GroupAssignedHandler implements IMessageHandler<GroupAssignedPayload> {
  readonly routingKey = 'school.enrollment.group_assigned';
  private readonly logger = new Logger(GroupAssignedHandler.name);

  constructor(private readonly repo: NotificationsRepository) {}

  async handle(payload: GroupAssignedPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Group assigned: membershipId=${payload.membershipId} groupId=${payload.groupId} [${meta.eventId}]`);

    await this.repo.create({
      recipientId: payload.studentId,
      type: NotificationType.GROUP_ASSIGNED,
      channel: NotificationChannel.IN_APP,
      subject: `You've been added to group "${payload.groupName}"`,
      templateKey: 'group_assigned',
      templateData: {
        membershipId: payload.membershipId,
        schoolId: payload.schoolId,
        schoolName: payload.schoolName,
        groupId: payload.groupId,
        groupName: payload.groupName,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
