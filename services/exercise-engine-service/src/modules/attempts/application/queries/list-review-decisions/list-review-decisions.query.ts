import type { ReviewDecisionsCursor } from '../../../domain/repositories/attempt.repository.js';

/** One page of "who decided what, and when" for a school. */
export class ListReviewDecisionsQuery {
  constructor(
    public readonly schoolId: string,
    public readonly periodDays: number,
    public readonly limit: number,
    public readonly after: ReviewDecisionsCursor | null,
  ) {}
}
