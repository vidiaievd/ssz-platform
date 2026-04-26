import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ProgressUpdatedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  status: string;
  attemptsCount: number;
  score: number | null;
}

export class ProgressUpdatedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.progress.updated';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: ProgressUpdatedPayload,
  ) {}
}
