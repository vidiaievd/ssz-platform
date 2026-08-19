import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

/**
 * An administrator asked a colleague to look at what is waiting on them.
 *
 * Carries the count rather than the submissions: the reminder is one message saying how
 * much has piled up, never a letter per piece of work (`BEHAVIOR.md` §C). What becomes of
 * this event — a push, an email, an in-app note — belongs to the notification service
 * (plan 47); the school's side of it ends here.
 */
export class ReviewerRemindedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.review.reviewer_reminded';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly teacherId: string,
    readonly pending: number,
    readonly requestedBy: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
