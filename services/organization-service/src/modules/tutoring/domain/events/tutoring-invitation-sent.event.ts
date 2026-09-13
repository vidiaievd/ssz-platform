import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TutoringInvitationSentEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'tutoring.invitation.sent';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly invitationId: string,
    readonly tutorGroupId: string,
    readonly inviteeEmail: string,
    readonly invitationToken: string,
    readonly invitationUrl: string,
    readonly tutorName: string,
    readonly expiresAt: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
