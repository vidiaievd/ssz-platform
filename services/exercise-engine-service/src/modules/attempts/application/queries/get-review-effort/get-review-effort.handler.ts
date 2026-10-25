import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
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
  type StartingReviewMinutes,
} from '../../../domain/value-objects/review-effort-norm.js';
import {
  REVIEW_POLICY_READER,
  type IReviewPolicyReader,
} from '../../../../../shared/application/ports/review-policy-reader.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

export interface GetReviewEffortResult {
  /** Waiting on a person, per group × template; `groupId: null` is work nobody owns. */
  pending: PendingEffortRow[];
  /** One per template in `pending`, plus any the school has history on. */
  norms: ReviewEffortNorm[];
  historyDays: number;
  minSample: number;
}

export type GetReviewEffortError =
  | { code: 'SCHOOL_NOT_FOUND' }
  /** organization-service did not answer: without the starting minutes there is no forecast. */
  | { code: 'STARTING_MINUTES_UNAVAILABLE' };

/**
 * The forecast's inputs, never the forecast.
 *
 * Like `review/aggregate`, it reports numbers and leaves the verdict to the caller: who
 * reviews a group is organization-service's to say, the time set aside is scheduling's,
 * and only the caller holding all three can tell a teacher their queue outgrew their week.
 *
 * An organization-service outage fails the read rather than answering with history alone:
 * the templates left without a norm would be exactly the ones the school has not measured
 * yet, and a forecast that silently counts them as nothing reads as a lighter week.
 */
@QueryHandler(GetReviewEffortQuery)
export class GetReviewEffortHandler implements IQueryHandler<GetReviewEffortQuery> {
  private readonly logger = new Logger(GetReviewEffortHandler.name);

  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(REVIEW_POLICY_READER) private readonly policies: IReviewPolicyReader,
  ) {}

  async execute(
    query: GetReviewEffortQuery,
  ): Promise<Result<GetReviewEffortResult, GetReviewEffortError>> {
    const since = new Date(Date.now() - REVIEW_EFFORT_HISTORY_DAYS * 24 * 60 * 60 * 1000);

    const [pending, stats, starting] = await Promise.all([
      this.attempts.countPendingByGroupAndTemplate(query.schoolId),
      this.attempts.findHandlingTimeStats(query.schoolId, since),
      this.startingMinutes(query.schoolId),
    ]);

    if (starting === 'unavailable') {
      return Result.fail({ code: 'STARTING_MINUTES_UNAVAILABLE' });
    }
    if (starting === null) {
      return Result.fail({ code: 'SCHOOL_NOT_FOUND' });
    }

    return Result.ok({
      pending,
      norms: resolveReviewEffortNorms(
        pending.map((row) => row.templateCode),
        stats,
        starting,
      ),
      historyDays: REVIEW_EFFORT_HISTORY_DAYS,
      minSample: REVIEW_EFFORT_MIN_SAMPLE,
    });
  }

  private async startingMinutes(
    schoolId: string,
  ): Promise<StartingReviewMinutes | null | 'unavailable'> {
    try {
      return await this.policies.schoolReviewEffortMinutes(schoolId);
    } catch (err) {
      this.logger.warn(
        `Review minutes of school ${schoolId} unreadable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'unavailable';
    }
  }
}
