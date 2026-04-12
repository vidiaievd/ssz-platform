import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export class ProfileCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'profile.created';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly profileId: string,
    readonly userId: string,
    readonly displayName: string,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
