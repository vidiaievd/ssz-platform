import { randomUUID } from 'crypto';
import { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface VersionUnpublishedPayload {
  containerId: string;
  versionId: string;
}

export class VersionUnpublishedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.version.unpublished';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: VersionUnpublishedPayload;

  constructor(payload: VersionUnpublishedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.containerId;
    this.payload = payload;
  }
}
