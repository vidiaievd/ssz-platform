import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class SchoolCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'school.created';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly schoolId: string,
    readonly ownerId: string,
    readonly name: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
