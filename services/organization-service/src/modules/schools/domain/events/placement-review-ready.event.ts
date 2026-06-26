import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class PlacementReviewReadyEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.enrollment.placement_review_ready';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly membershipId: string,
    readonly schoolId: string,
    readonly schoolName: string,
    readonly studentId: string,
    readonly adminIds: string[],
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
