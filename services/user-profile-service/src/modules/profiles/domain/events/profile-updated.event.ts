import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class ProfileUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'profile.updated';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly profileId: string,
    readonly userId: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
