import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ContainerPublishedPayload {
  containerId: string;
  newVersionId: string;
  previousVersionId: string | null;
  versionNumber: number;
  /** `ContainerPublishedPayload` in @ssz/contracts: who made the version live, and when (ISO 8601). */
  publishedBy: string;
  publishedAt: string;
}

export class ContainerPublishedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.container.published';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: ContainerPublishedPayload;

  constructor(payload: ContainerPublishedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
