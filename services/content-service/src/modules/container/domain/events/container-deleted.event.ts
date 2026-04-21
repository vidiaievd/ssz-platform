import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ContainerDeletedPayload {
  containerId: string;
  ownerUserId: string;
}

export class ContainerDeletedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.container.deleted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContainerDeletedPayload;

  constructor(payload: ContainerDeletedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
