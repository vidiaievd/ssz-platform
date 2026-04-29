import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ProgressCompletedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  completedAt: string;
  score: number | null;
}

export class ProgressCompletedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.progress.completed';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: ProgressCompletedPayload,
  ) {}
}
