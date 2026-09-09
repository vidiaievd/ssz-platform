import type { Attempt, AttemptStatus } from '../entities/attempt.entity.js';

export const ATTEMPT_REPOSITORY = Symbol('IAttemptRepository');

export interface FindUserAttemptsFilter {
  exerciseId?: string;
  status?: AttemptStatus;
  limit: number;
  offset: number;
}

/**
 * Where a reviewer is allowed to look (plan 44 §0.2).
 *
 * `schoolId` is not optional and never defaulted: a queue query that forgot to name a
 * school is a query that would hand one school's submissions to another's teacher, and
 * the engine — which does no authorising of its own — has no second line of defence.
 * On top of it the caller narrows by the groups it teaches or the courses it owns; both
 * together mean the intersection.
 */
export interface ReviewQueueScope {
  schoolId: string;
  groupIds?: string[];
  containerIds?: string[];
  templateCodes?: string[];
}

/**
 * A place in the queue, as the row it stopped on rather than a count of rows skipped.
 *
 * Submissions arrive and leave while a teacher pages through, so an offset silently
 * skips work; `(submittedAt, id)` names the row itself and stays honest.
 */
export interface ReviewQueueCursor {
  submittedAt: Date;
  id: string;
}

/** The whole scope at a glance — the sidebar badge, not the page. */
export interface ReviewQueueSummary {
  pending: number;
  oldestSubmittedAt: Date | null;
}

/**
 * One submission still waiting, as oversight reads it: where it sits and since when.
 *
 * Rows rather than counts, because every figure on the oversight screen — the median,
 * the age histogram, what counts as overdue — is computed by the caller that knows the
 * school's promised response time. The engine does not know it and never will (§0.1).
 */
export interface PendingLoadRow {
  attemptId: string;
  userId: string;
  exerciseId: string;
  containerId: string | null;
  groupId: string | null;
  submittedAt: Date;
}

/** One verdict a person delivered, as the two timestamps oversight measures between. */
export interface ReviewedLoadRow {
  reviewerId: string;
  containerId: string | null;
  groupId: string | null;
  submittedAt: Date | null;
  reviewedAt: Date;
}

/** A place in the decisions journal: newest first, so paging walks backwards in time. */
export interface ReviewDecisionsCursor {
  reviewedAt: Date;
  id: string;
}

/** The three buckets "Мои работы" can narrow to, or all of them (47.1). */
export type MySubmissionsStatus = 'all' | 'pending' | 'returned' | 'approved';

/** A place in one learner's own list: newest submission first. */
export interface MySubmissionsCursor {
  submittedAt: Date;
  id: string;
}

/** A school with work waiting, and the two numbers that decide whether to say so. */
export interface PendingSchoolRow {
  schoolId: string;
  pending: number;
  /** The oldest thing waiting — what makes a digest urgent rather than merely long. */
  oldestSubmittedAt: Date;
  /** The newest, against which a digest already sent is judged to be old news. */
  newestSubmittedAt: Date;
}

export interface IAttemptRepository {
  findById(id: string): Promise<Attempt | null>;
  findInProgress(userId: string, exerciseId: string): Promise<Attempt | null>;
  /** The most recent RETURNED attempt for this exercise — feeds attemptNo/previousAttemptId on the next try. */
  findLatestReturned(userId: string, exerciseId: string): Promise<Attempt | null>;
  findAllInProgressByExercise(exerciseId: string): Promise<Attempt[]>;
  findAllByUser(userId: string, filter: FindUserAttemptsFilter): Promise<{ items: Attempt[]; total: number }>;
  /**
   * One page of the queue over a scope, oldest submission first.
   *
   * Ordered by `(submittedAt, id)` so that the cursor has something total to compare
   * against: two submissions handed in within the same millisecond still have an order,
   * and without one a page boundary between them loses or repeats a row.
   */
  findReviewQueuePage(
    scope: ReviewQueueScope,
    page: { limit: number; after: ReviewQueueCursor | null },
  ): Promise<Attempt[]>;
  /**
   * Everything the school has waiting on a person right now, in no particular order.
   *
   * Not scoped to groups or courses: this is the administrator's question, and the route
   * that asks it authorises differently from a teacher's queue (§0.2). `limit` is a
   * ceiling the caller reports as a truncation rather than a page — a partial picture
   * that says so beats a page that pretends to be the whole school.
   */
  findPendingLoad(schoolId: string, limit: number): Promise<PendingLoadRow[]>;
  /**
   * Which schools have anything waiting on a person at all, and since when (plan 47.5).
   *
   * The digest's starting point, and the reason it is a question rather than a loop: the
   * job that tells teachers what is waiting must not walk every school on the platform to
   * discover that all but three of them are quiet. One grouped read answers that, and the
   * per-school detail is fetched only for the schools this names.
   */
  findSchoolsWithPendingReview(): Promise<PendingSchoolRow[]>;
  /**
   * The verdicts people delivered in the school since `since`.
   *
   * Only signed ones: a machine score is not somebody's decision, and counting it as one
   * would credit a teacher with work they never did.
   */
  findReviewedLoad(schoolId: string, since: Date, limit: number): Promise<ReviewedLoadRow[]>;
  /**
   * The oldest submission the school has on record — its data horizon (§0.4).
   *
   * Not configurable, because the date describes itself: everything before it predates
   * the school context on attempts, and no reading of the period can reach further back.
   */
  earliestSubmissionAt(schoolId: string): Promise<Date | null>;
  /** One page of the decisions journal, newest verdict first. */
  findReviewDecisionsPage(
    schoolId: string,
    since: Date,
    page: { limit: number; after: ReviewDecisionsCursor | null },
  ): Promise<Attempt[]>;
  /**
   * One page of a learner's own submissions, newest first (47.1).
   *
   * Selects `ROUTED_FOR_REVIEW`, `RETURNED`, and `SCORED`-with-a-reviewer only — the same
   * three buckets `status` narrows within. A practice attempt or a machine-scored one
   * never matches, `status=all` either.
   */
  findMySubmissionsPage(
    userId: string,
    status: MySubmissionsStatus,
    page: { limit: number; after: MySubmissionsCursor | null },
  ): Promise<Attempt[]>;
  /** How much is waiting in a scope, and since when — without reading the submissions. */
  summariseReviewQueue(scope: ReviewQueueScope): Promise<ReviewQueueSummary>;
  save(attempt: Attempt): Promise<void>;
  saveAll(attempts: Attempt[]): Promise<void>;
}
