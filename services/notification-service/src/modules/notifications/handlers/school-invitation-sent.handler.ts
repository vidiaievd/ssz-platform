import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsService } from '../notifications.service.js';
import { ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { SchoolInvitationSentPayload } from '@ssz/contracts';

@Injectable()
export class SchoolInvitationSentHandler implements IMessageHandler<SchoolInvitationSentPayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.SCHOOL_INVITATION_SENT;
  private readonly logger = new Logger(SchoolInvitationSentHandler.name);

  constructor(private readonly notifications: NotificationsService) {}

  async handle(payload: SchoolInvitationSentPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Handling school.invitation.sent for email=${payload.inviteeEmail} school=${payload.schoolId} [${meta.eventId}]`);

    await this.notifications.sendSchoolInvitation({
      invitationId: payload.invitationId,
      email: payload.inviteeEmail,
      schoolName: payload.schoolName,
      inviterName: payload.inviterName,
      invitationUrl: payload.invitationUrl,
      role: payload.role,
      expiresAt: payload.expiresAt,
    });
  }
}
