import type { ReviewQueueScope } from '../../../domain/repositories/attempt.repository.js';

/**
 * How much is waiting in a scope — the sidebar badge, asked for on every verdict.
 *
 * Separate from the queue itself because it is asked far more often than it is read from:
 * a count and a min over the same index, with no rows fetched, no grouping and nothing
 * for the caller to page.
 */
export class CountReviewQueueQuery {
  constructor(public readonly scope: ReviewQueueScope) {}
}
