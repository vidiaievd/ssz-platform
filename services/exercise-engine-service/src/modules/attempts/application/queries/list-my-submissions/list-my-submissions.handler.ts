import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMySubmissionsQuery } from './list-my-submissions.query.js';
import { encodeMySubmissionsCursor } from './my-submissions-cursor.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import type { Attempt, ExercisePathSnapshot } from '../../../domain/entities/attempt.entity.js';

export type MySubmissionEntryStatus = 'pending' | 'returned' | 'approved';

/** The teacher's word on a submission, as this screen may say it — no per-item detail. */
export interface MySubmissionDecision {
  verdict: 'approved' | 'returned';
  byUserId: string;
  at: Date;
  comment: string | null;
}

export interface MySubmissionEntry {
  attemptId: string;
  exerciseId: string;
  /** Course · module · exercise as they read when the learner started (§0.3). */
  exercisePath: ExercisePathSnapshot | null;
  containerId: string | null;
  /**
   * The school the attempt was submitted under, snapshotted at start (44.4).
   *
   * On the list because the response time a learner is owed is the school's promise
   * unless the course overrides it, and this list crosses schools — a screen resolving
   * one promise for the whole page would quote one school's word over another's.
   */
  schoolId: string | null;
  submittedAt: Date;
  status: MySubmissionEntryStatus;
  attemptNo: number;
  decision: MySubmissionDecision | null;
  /** `true` only on the `RETURNED` row a resubmit actually resumes (see below). */
  canResubmit: boolean;
}

export interface ListMySubmissionsResult {
  items: MySubmissionEntry[];
  nextCursor: string | null;
}

/**
 * "Мои работы": every submission of one learner's that ever went to a person, across every
 * exercise, newest first.
 *
 * The selection is the invariant, not the `status` filter: only `ROUTED_FOR_REVIEW`,
 * `RETURNED`, and `SCORED` attempts a person actually signed make the list at all — a
 * machine-scored MCQ never appears here, `status=all` just stops narrowing further
 * (plan 47 §1, invariant 1 is enforced by never reading these attempts' `submittedAnswer` or
 * `validationDetails` in the first place, not by trimming them after).
 */
@QueryHandler(ListMySubmissionsQuery)
export class ListMySubmissionsHandler implements IQueryHandler<ListMySubmissionsQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: ListMySubmissionsQuery): Promise<ListMySubmissionsResult> {
    // One row beyond the page, only to learn whether there is a next one.
    const rows = await this.attempts.findMySubmissionsPage(query.userId, query.status, {
      limit: query.limit + 1,
      after: query.after,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const latestReturnedByExercise = await this.latestReturnedIds(query.userId, page);

    const items = page.map((attempt): MySubmissionEntry => {
      const status = statusOf(attempt);
      return {
        attemptId: attempt.id,
        exerciseId: attempt.exerciseId,
        exercisePath: attempt.exercisePath,
        containerId: attempt.containerId,
        schoolId: attempt.schoolId,
        // The selection above guarantees a submission time on every row this reaches.
        submittedAt: attempt.submittedAt as Date,
        status,
        attemptNo: attempt.revisionCount + 1,
        decision: decisionOf(attempt),
        canResubmit: status === 'returned' && latestReturnedByExercise.get(attempt.exerciseId) === attempt.id,
      };
    });

    const last = page.at(-1);
    return {
      items,
      // Keyed off the page, not off `items`: every row on this list is kept (unlike the
      // decisions journal, which drops unsigned scores), but the convention matches the
      // rest of the module regardless.
      nextCursor:
        hasMore && last?.submittedAt
          ? encodeMySubmissionsCursor({ submittedAt: last.submittedAt, id: last.id })
          : null,
    };
  }

  /**
   * Which `RETURNED` attempt, per exercise, a resubmit actually resumes.
   *
   * `POST /exercises/:id/attempts` does not take an attempt id — it always resumes
   * whatever `findLatestReturned` answers for that exercise (44.4). An older `RETURNED`
   * row already superseded by a later attempt would offer a button that quietly resumes
   * the wrong one, so only the row that *is* the latest gets to say so. One lookup per
   * distinct exercise in the page, not per row.
   */
  private async latestReturnedIds(
    userId: string,
    page: Attempt[],
  ): Promise<Map<string, string>> {
    const exerciseIds = [...new Set(page.filter((a) => a.status === 'RETURNED').map((a) => a.exerciseId))];
    const found = await Promise.all(
      exerciseIds.map((exerciseId) => this.attempts.findLatestReturned(userId, exerciseId)),
    );

    const byExercise = new Map<string, string>();
    exerciseIds.forEach((exerciseId, i) => {
      const latest = found[i];
      if (latest) byExercise.set(exerciseId, latest.id);
    });
    return byExercise;
  }
}

/**
 * `ROUTED_FOR_REVIEW` → pending; `RETURNED` → returned; `SCORED` → approved. The
 * repository's selection already guarantees a `SCORED` row here carries a reviewer, so
 * nothing further is checked — a machine-scored attempt never reaches this mapping.
 */
function statusOf(attempt: Attempt): MySubmissionEntryStatus {
  if (attempt.status === 'ROUTED_FOR_REVIEW') return 'pending';
  if (attempt.status === 'RETURNED') return 'returned';
  return 'approved';
}

function decisionOf(attempt: Attempt): MySubmissionDecision | null {
  const verdict = attempt.deliveredVerdict();
  if (verdict === null) return null;
  return {
    verdict: verdict.outcome,
    byUserId: verdict.reviewerId,
    at: verdict.at,
    comment: verdict.comment,
  };
}
