import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ContainerUpdatedPayload {
  containerId: string;
  updatedFields: string[];
}

export class ContainerUpdatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.container.updated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContainerUpdatedPayload;

  constructor(payload: ContainerUpdatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
