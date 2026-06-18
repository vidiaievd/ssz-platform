import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsService } from '../notifications.service.js';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationType, NotificationChannel } from '../../../../generated/prisma/enums.js';
import { ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { SchoolInvitationSentPayload } from '@ssz/contracts';

@Injectable()
export class SchoolInvitationSentHandler implements IMessageHandler<SchoolInvitationSentPayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.SCHOOL_INVITATION_SENT;
  private readonly logger = new Logger(SchoolInvitationSentHandler.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly repo: NotificationsRepository,
  ) {}

  async handle(payload: SchoolInvitationSentPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Handling school.invitation.sent for email=${payload.inviteeEmail} school=${payload.schoolId} [${meta.eventId}]`);

    const tasks: Promise<unknown>[] = [
      this.notifications.sendSchoolInvitation({
        invitationId: payload.invitationId,
        email: payload.inviteeEmail,
        schoolName: payload.schoolName,
        inviterName: payload.inviterName,
        invitationUrl: payload.invitationUrl,
        role: payload.role,
        expiresAt: payload.expiresAt,
        recipientUserId: payload.recipientUserId,
      }),
    ];

    if (payload.recipientUserId) {
      tasks.push(
        this.repo.create({
          recipientId: payload.recipientUserId,
          type: NotificationType.SCHOOL_INVITATION,
          channel: NotificationChannel.IN_APP,
          subject: `You've been invited to ${payload.schoolName}`,
          templateKey: 'school_invitation_in_app',
          templateData: {
            schoolName: payload.schoolName,
            inviterName: payload.inviterName,
            invitationUrl: payload.invitationUrl,
            role: payload.role,
            expiresAt: payload.expiresAt,
          },
        }),
      );
    }

    await Promise.all(tasks);
  }
}
