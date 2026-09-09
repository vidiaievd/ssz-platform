import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CountReviewQueueQuery } from './count-review-queue.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
  type ReviewQueueSummary,
} from '../../../domain/repositories/attempt.repository.js';

/**
 * `hasOverdue` is deliberately absent: overdue is `submittedAt` measured against a
 * school's or a course's response window, and that window is not this service's to know
 * (plan 44 §0.1). The caller that knows the deadline derives it from `oldestSubmittedAt`.
 */
@QueryHandler(CountReviewQueueQuery)
export class CountReviewQueueHandler implements IQueryHandler<CountReviewQueueQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: CountReviewQueueQuery): Promise<ReviewQueueSummary> {
    return this.attempts.summariseReviewQueue(query.scope);
  }
}
