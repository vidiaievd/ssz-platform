import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ContainerArchivedPayload {
  containerId: string;
  versionId: string;
}

export class ContainerArchivedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.container.archived';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContainerArchivedPayload;

  constructor(payload: ContainerArchivedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
