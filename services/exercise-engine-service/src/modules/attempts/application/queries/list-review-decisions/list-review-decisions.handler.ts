import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListReviewDecisionsQuery } from './list-review-decisions.query.js';
import { encodeReviewDecisionsCursor } from './review-decisions-cursor.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import type { ExercisePathSnapshot } from '../../../domain/entities/attempt.entity.js';

export interface ReviewDecisionEntry {
  attemptId: string;
  userId: string;
  exerciseId: string;
  /** The path as it read when the learner started — the exercise may be gone (§0.3). */
  exercisePath: ExercisePathSnapshot | null;
  reviewerId: string;
  verdict: 'approved' | 'returned';
  submittedAt: Date | null;
  reviewedAt: Date;
}

export interface ListReviewDecisionsResult {
  items: ReviewDecisionEntry[];
  nextCursor: string | null;
}

/**
 * The journal of verdicts, newest first.
 *
 * Only what a person decided. `deliveredVerdict()` is the same reading the conflict
 * answer and the single submission use: a machine score is not a decision, and a journal
 * that listed them would tell an administrator their teachers reviewed work nobody read.
 *
 * Names are not here — neither the learner's nor the reviewer's. The engine has never
 * known them, and the caller already joins them from the profile directory for every
 * other review screen.
 */
@QueryHandler(ListReviewDecisionsQuery)
export class ListReviewDecisionsHandler implements IQueryHandler<ListReviewDecisionsQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: ListReviewDecisionsQuery): Promise<ListReviewDecisionsResult> {
    const since = new Date(Date.now() - query.periodDays * 24 * 60 * 60 * 1000);

    // One row beyond the page, only to learn whether there is a next one.
    const rows = await this.attempts.findReviewDecisionsPage(query.schoolId, since, {
      limit: query.limit + 1,
      after: query.after,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const items = page.flatMap((attempt): ReviewDecisionEntry[] => {
      const verdict = attempt.deliveredVerdict();
      if (verdict === null) return [];

      return [
        {
          attemptId: attempt.id,
          userId: attempt.userId,
          exerciseId: attempt.exerciseId,
          exercisePath: attempt.exercisePath,
          reviewerId: verdict.reviewerId,
          verdict: verdict.outcome,
          submittedAt: attempt.submittedAt,
          reviewedAt: verdict.at,
        },
      ];
    });

    const last = page.at(-1);
    return {
      items,
      // Keyed off the page, not off `items`: a row the reading above dropped still
      // occupies a place in the ordering, and paging from the last kept row would
      // deliver it again on the next page.
      nextCursor:
        hasMore && last?.reviewedAt
          ? encodeReviewDecisionsCursor({ reviewedAt: last.reviewedAt, id: last.id })
          : null,
    };
  }
}
