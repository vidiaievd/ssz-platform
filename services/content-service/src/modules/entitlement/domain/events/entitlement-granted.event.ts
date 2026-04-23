import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { EntitlementType } from '../value-objects/entitlement-type.vo.js';

export interface EntitlementGrantedPayload {
  entitlementId: string;
  userId: string;
  containerId: string;
  entitlementType: EntitlementType;
  grantedByUserId: string | null;
}

export class EntitlementGrantedEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType = 'content.entitlement.granted';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: EntitlementGrantedPayload;

  constructor(payload: EntitlementGrantedPayload) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.aggregateId = payload.entitlementId;
    this.payload = payload;
  }
}
