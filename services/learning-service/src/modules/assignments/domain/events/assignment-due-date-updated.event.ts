import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AssignmentDueDateUpdatedPayload {
  previousDueAt: Date;
  newDueAt: Date;
}

export class AssignmentDueDateUpdatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.assignment.due_date_updated';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AssignmentDueDateUpdatedPayload,
  ) {}
}
