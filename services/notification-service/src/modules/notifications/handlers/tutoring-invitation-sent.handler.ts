import { Injectable, Logger } from '@nestjs/common';
import type { IMessageHandler, MessageMeta } from '../../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsService } from '../notifications.service.js';
import { ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { TutoringInvitationSentPayload } from '@ssz/contracts';

@Injectable()
export class TutoringInvitationSentHandler implements IMessageHandler<TutoringInvitationSentPayload> {
  readonly routingKey = ORGANIZATION_EVENT_TYPES.TUTORING_INVITATION_SENT;
  private readonly logger = new Logger(TutoringInvitationSentHandler.name);

  constructor(private readonly notifications: NotificationsService) {}

  async handle(payload: TutoringInvitationSentPayload, meta: MessageMeta): Promise<void> {
    this.logger.log(`Handling tutoring.invitation.sent for email=${payload.inviteeEmail} tutorGroup=${payload.tutorGroupId} [${meta.eventId}]`);

    await this.notifications.sendTutoringInvitation({
      invitationId: payload.invitationId,
      email: payload.inviteeEmail,
      tutorName: payload.tutorName,
      invitationUrl: payload.invitationUrl,
      expiresAt: payload.expiresAt,
    });
  }
}
