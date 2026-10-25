import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetReviewEffortQuery } from './get-review-effort.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
  type PendingEffortRow,
} from '../../../domain/repositories/attempt.repository.js';
import {
  REVIEW_EFFORT_HISTORY_DAYS,
  REVIEW_EFFORT_MIN_SAMPLE,
  resolveReviewEffortNorms,
  type ReviewEffortNorm,
} from '../../../domain/value-objects/review-effort-norm.js';

export interface GetReviewEffortResult {
  /** Waiting on a person, per group × template; `groupId: null` is work nobody owns. */
  pending: PendingEffortRow[];
  /** One per template in `pending`, plus any the school has history on. */
  norms: ReviewEffortNorm[];
  historyDays: number;
  minSample: number;
}

/**
 * The forecast's inputs, never the forecast.
 *
 * Like `review/aggregate`, it reports numbers and leaves the verdict to the caller: who
 * reviews a group is organization-service's to say, the time set aside is scheduling's,
 * and only the caller holding all three can tell a teacher their queue outgrew their week.
 */
@QueryHandler(GetReviewEffortQuery)
export class GetReviewEffortHandler implements IQueryHandler<GetReviewEffortQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: GetReviewEffortQuery): Promise<GetReviewEffortResult> {
    const since = new Date(Date.now() - REVIEW_EFFORT_HISTORY_DAYS * 24 * 60 * 60 * 1000);

    const [pending, stats] = await Promise.all([
      this.attempts.countPendingByGroupAndTemplate(query.schoolId),
      this.attempts.findHandlingTimeStats(query.schoolId, since),
    ]);

    return {
      pending,
      norms: resolveReviewEffortNorms(
        pending.map((row) => row.templateCode),
        stats,
      ),
      historyDays: REVIEW_EFFORT_HISTORY_DAYS,
      minSample: REVIEW_EFFORT_MIN_SAMPLE,
    };
  }
}
