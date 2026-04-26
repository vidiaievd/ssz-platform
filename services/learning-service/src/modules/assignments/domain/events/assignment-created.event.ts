import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';

export interface AssignmentCreatedPayload {
  assignerId: string;
  assigneeId: string;
  schoolId: string | null;
  contentRef: ContentRef;
  dueAt: Date;
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
