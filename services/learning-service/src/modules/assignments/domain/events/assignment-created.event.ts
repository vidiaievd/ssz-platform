import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface AssignmentCreatedPayload {
  assignmentId: string;
  assignerId: string;
  assigneeId: string;
  schoolId: string | null;
  contentType: string;
  contentId: string;
  dueAt: string | null;
}

export class AssignmentCreatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.assignment.created';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AssignmentCreatedPayload,
  ) {}
}
