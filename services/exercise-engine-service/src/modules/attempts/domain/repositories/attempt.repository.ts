import type { Attempt, AttemptStatus } from '../entities/attempt.entity.js';

export const ATTEMPT_REPOSITORY = Symbol('IAttemptRepository');

export interface FindUserAttemptsFilter {
  exerciseId?: string;
  status?: AttemptStatus;
  limit: number;
  offset: number;
}

/** A review queue: submissions waiting on a person, oldest first. */
export interface FindForReviewFilter {
  status: AttemptStatus;
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

export interface IAttemptRepository {
  findById(id: string): Promise<Attempt | null>;
  findInProgress(userId: string, exerciseId: string): Promise<Attempt | null>;
  /** The most recent RETURNED attempt for this exercise — feeds attemptNo/previousAttemptId on the next try. */
  findLatestReturned(userId: string, exerciseId: string): Promise<Attempt | null>;
  findAllInProgressByExercise(exerciseId: string): Promise<Attempt[]>;
  findAllByUser(userId: string, filter: FindUserAttemptsFilter): Promise<{ items: Attempt[]; total: number }>;
  /**
   * The queue across a set of exercises. One exercise is the set of one — the teacher's
   * screen for a whole course asks the same question of every exercise in it, and asking
   * once keeps the paging honest: twenty oldest submissions of the course, not twenty of
   * each exercise stitched together afterwards.
   */
  findAllByExercises(
    exerciseIds: string[],
    filter: FindForReviewFilter,
  ): Promise<{ items: Attempt[]; total: number }>;
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
  /** How much is waiting in a scope, and since when — without reading the submissions. */
  summariseReviewQueue(scope: ReviewQueueScope): Promise<ReviewQueueSummary>;
  save(attempt: Attempt): Promise<void>;
  saveAll(attempts: Attempt[]): Promise<void>;
}
