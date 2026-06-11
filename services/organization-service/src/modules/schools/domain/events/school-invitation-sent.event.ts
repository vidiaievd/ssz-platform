import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class SchoolInvitationSentEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.invitation.sent';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly invitationId: string,
    readonly schoolId: string,
    readonly schoolName: string,
    readonly inviteeEmail: string,
    readonly inviterName: string,
    readonly invitationUrl: string,
    readonly role: string,
    readonly expiresAt: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
