import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AssignmentMarkedOverduePayload {
  assignerId: string;
  assigneeId: string;
  dueAt: Date;
}

export class AssignmentMarkedOverdueEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.assignment.overdue';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AssignmentMarkedOverduePayload,
  ) {}
}
