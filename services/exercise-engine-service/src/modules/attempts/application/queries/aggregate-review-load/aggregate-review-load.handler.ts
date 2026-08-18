import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { AggregateReviewLoadQuery } from './aggregate-review-load.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
  type PendingLoadRow,
  type ReviewedLoadRow,
} from '../../../domain/repositories/attempt.repository.js';

/**
 * How many rows either half of the picture may carry (plan 44 §44.11).
 *
 * Past it the answer says so and stops, rather than turning an administrator's page into
 * a megabyte of timestamps: the histogram and the median look the same drawn from five
 * thousand submissions as from five thousand and one.
 */
export const MAX_LOAD_ROWS = 5000;

/** What is waiting in one course for one group, and since when for each submission. */
export interface PendingLoadGroup {
  containerId: string | null;
  groupId: string | null;
  submittedAt: Date[];
}

/** What one reviewer answered in one course for one group, and how long each took. */
export interface ReviewedLoadGroup {
  reviewerId: string;
  containerId: string | null;
  groupId: string | null;
  durationsHours: number[];
}

/** A submission with nobody to answer it: the learner was in no group when they started. */
export interface UnassignedSubmission {
  attemptId: string;
  userId: string;
  exerciseId: string;
  submittedAt: Date;
}

export interface AggregateReviewLoadResult {
  /** The school's data horizon: nothing before this date carries a school at all (§0.4). */
  since: Date | null;
  pending: PendingLoadGroup[];
  reviewed: ReviewedLoadGroup[];
  unassigned: UnassignedSubmission[];
  /** One half of the picture hit the ceiling — the screen draws the same, and says so. */
  truncated: boolean;
}

/**
 * The oversight screen's one query.
 *
 * It reports times, never verdicts about them: no median, no "overdue", no names. The
 * response time a school promised is the school's policy and lives in organization-service
 * (44.12), so the figure that depends on it is computed by the caller that knows it —
 * which is what keeps one formula for urgency across the whole product (§0.1).
 */
@QueryHandler(AggregateReviewLoadQuery)
export class AggregateReviewLoadHandler implements IQueryHandler<AggregateReviewLoadQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: AggregateReviewLoadQuery): Promise<AggregateReviewLoadResult> {
    const since = new Date(Date.now() - query.periodDays * 24 * 60 * 60 * 1000);

    const [pendingRows, reviewedRows, horizon] = await Promise.all([
      this.attempts.findPendingLoad(query.schoolId, MAX_LOAD_ROWS + 1),
      this.attempts.findReviewedLoad(query.schoolId, since, MAX_LOAD_ROWS + 1),
      this.attempts.earliestSubmissionAt(query.schoolId),
    ]);

    const truncated =
      pendingRows.length > MAX_LOAD_ROWS || reviewedRows.length > MAX_LOAD_ROWS;
    const pending = pendingRows.slice(0, MAX_LOAD_ROWS);
    const reviewed = reviewedRows.slice(0, MAX_LOAD_ROWS);

    return {
      since: horizon,
      pending: groupPending(pending),
      reviewed: groupReviewed(reviewed),
      // The same rows again, named individually: a submission nobody is responsible for
      // is a row on the screen with a learner in it, not a bar on a chart.
      unassigned: pending
        .filter((row) => row.groupId === null)
        .map((row) => ({
          attemptId: row.attemptId,
          userId: row.userId,
          exerciseId: row.exerciseId,
          submittedAt: row.submittedAt,
        })),
      truncated,
    };
  }
}

function groupPending(rows: PendingLoadRow[]): PendingLoadGroup[] {
  const groups = new Map<string, PendingLoadGroup>();

  for (const row of rows) {
    const key = `${row.containerId ?? ''}|${row.groupId ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = { containerId: row.containerId, groupId: row.groupId, submittedAt: [] };
      groups.set(key, group);
    }
    group.submittedAt.push(row.submittedAt);
  }

  return [...groups.values()];
}

function groupReviewed(rows: ReviewedLoadRow[]): ReviewedLoadGroup[] {
  const groups = new Map<string, ReviewedLoadGroup>();

  for (const row of rows) {
    // A verdict on a submission with no submission time has no duration to report. It
    // cannot arise through the domain, and dropping it beats contributing a zero that
    // would pull a school's median down.
    if (row.submittedAt === null) continue;

    const key = `${row.reviewerId}|${row.containerId ?? ''}|${row.groupId ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        reviewerId: row.reviewerId,
        containerId: row.containerId,
        groupId: row.groupId,
        durationsHours: [],
      };
      groups.set(key, group);
    }

    const hours = (row.reviewedAt.getTime() - row.submittedAt.getTime()) / 3_600_000;
    // Two decimals: the screen reads hours, and a full float per verdict is the kind of
    // payload this step's ceiling exists to keep down.
    group.durationsHours.push(Math.max(0, Number(hours.toFixed(2))));
  }

  return [...groups.values()];
}
