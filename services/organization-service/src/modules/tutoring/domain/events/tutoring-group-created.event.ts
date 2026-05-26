import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class TutoringGroupCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'tutoring.group.created';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly tutorGroupId: string,
    readonly tutorId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
