import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

export interface ReviewCardReviewedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  rating: string;
  newState: string;
  newDueAt: string;
  scheduledDays: number;
  reviewedAt: string;
}

export class ReviewCardReviewedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'learning.srs.card.reviewed';
  readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly payload: ReviewCardReviewedPayload,
  ) {}
}
