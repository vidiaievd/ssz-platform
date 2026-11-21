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
    readonly recipientUserId?: string,
    /**
     * SOLO when the invitation is into a private tutor's workspace — the invitee
     * is never told about a school, and `inviterName` is the tutor's own name.
     */
    readonly workspaceKind: 'SCHOOL' | 'SOLO' = 'SCHOOL',
    /** The owner: the letter's language falls back to theirs (plan 90, session 16 remark 3). */
    readonly ownerId?: string,
    /** The school's language (`defaultExplanationLanguage`), the letter's language for a new address. */
    readonly schoolLanguage: string | null = null,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
