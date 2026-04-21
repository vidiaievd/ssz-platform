import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ContainerCreatedPayload {
  containerId: string;
  containerType: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: string;
  targetLanguage: string;
}

export class ContainerCreatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.container.created';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContainerCreatedPayload;

  constructor(payload: ContainerCreatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
