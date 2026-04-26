import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AssignmentCancelledPayload {
  assignerId: string;
  assigneeId: string;
  reason: string | null;
}

export class AssignmentCancelledEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.assignment.cancelled';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AssignmentCancelledPayload,
  ) {}
}
