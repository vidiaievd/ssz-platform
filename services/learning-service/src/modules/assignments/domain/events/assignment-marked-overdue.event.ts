import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AssignmentMarkedOverduePayload {
  assignmentId: string;
  assignerId: string;
  assigneeId: string;
  dueAt: string;
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
