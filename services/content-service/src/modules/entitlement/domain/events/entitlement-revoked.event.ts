import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface EntitlementRevokedPayload {
  entitlementId: string;
  userId: string;
  containerId: string;
}

export class EntitlementRevokedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.entitlement.revoked';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: EntitlementRevokedPayload;

  constructor(payload: EntitlementRevokedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.entitlementId;
    this.payload = payload;
  }
}
