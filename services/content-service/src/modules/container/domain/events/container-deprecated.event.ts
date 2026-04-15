import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ContainerDeprecatedPayload {
  containerId: string;
  versionId: string;
  sunsetAt: Date;
}

export class ContainerDeprecatedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.container.deprecated';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContainerDeprecatedPayload;

  constructor(payload: ContainerDeprecatedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
