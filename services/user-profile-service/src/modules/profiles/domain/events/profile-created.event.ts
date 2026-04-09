import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import { ProfileType } from '../value-objects/profile-type.vo.js';

export class ProfileCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'profile.created';
  readonly occurredAt: Date;

  constructor(
    eventId: string,
    readonly profileId: string,
    readonly userId: string,
    readonly displayName: string,
    readonly profileType: ProfileType,
  ) {
    this.eventId = eventId;
    this.occurredAt = new Date();
  }
}
