import type { Attempt, AttemptStatus } from '../entities/attempt.entity.js';
import type { HandlingTimeStat } from '../value-objects/review-effort-norm.js';

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
  /**
   * Instead of what waits on a person: the work a model's verdict closed at the school's term
   * since this moment, with no teacher's verdict on it yet (plan 80, step 7f) — the one place
   * a teacher finds what they may still revise. A teacher's verdict takes it off the list.
   */
  acceptedAtTermSince?: Date;
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

/**
 * One submission whose provisional model verdict counts by itself at `autoAcceptAt`
 * (plan 80, step 5): where it sits, so the caller can find who reviews it.
 */
export interface ReviewTermRow {
  attemptId: string;
  containerId: string | null;
  groupId: string | null;
  submittedAt: Date;
  autoAcceptAt: Date;
}

/** One verdict a person delivered, as the two timestamps oversight measures between. */
export interface ReviewedLoadRow {
  reviewerId: string;
  containerId: string | null;
  groupId: string | null;
  submittedAt: Date | null;
  reviewedAt: Date;
}

/** How much one group has waiting on a person in one template (plan 81, step 5). */
export interface PendingEffortRow {
  groupId: string | null;
  templateCode: string;
  count: number;
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
  /**
   * The learner's newest attempt at this exercise when it is a whole-board check that has been
   * scored but not closed — checks left, nothing finished (plan 69, phase 9).
   *
   * A whole board is scored by its first check, so unlike a question-by-question template it
   * never sits `IN_PROGRESS` between checks; without this a reload starts a fresh attempt and
   * with it a fresh budget and a fresh first try. `null` when the newest attempt is anything
   * else, closed included.
   */
  findOpenBoard(userId: string, exerciseId: string): Promise<Attempt | null>;
  /** The most recent RETURNED attempt for this exercise — feeds attemptNo/previousAttemptId on the next try. */
  findLatestReturned(userId: string, exerciseId: string): Promise<Attempt | null>;
  findAllInProgressByExercise(exerciseId: string): Promise<Attempt[]>;
  /**
   * How many attempts at this exercise the learner has handed in, in any mode — what a
   * `minimal_pairs` limit on sittings is counted against (plan 72, Q4-A). An attempt left open
   * or abandoned is not a sitting.
   */
  countSubmitted(userId: string, exerciseId: string): Promise<number>;
  /**
   * The validator's details of the learner's own scored attempts on any exercise of one
   * template in one language, newest first — the history `minimal_pairs` draws `weakest` from
   * (plan 72 §3.11). Only the learner's own: nothing is read from anyone else's work.
   */
  findScoredDetails(
    userId: string,
    templateCode: string,
    targetLanguage: string,
    limit: number,
  ): Promise<unknown[]>;
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
  /**
   * What the school has waiting on a person, counted per group × template (plan 81,
   * step 5). Counts rather than rows: a forecast multiplies them by a norm and needs no
   * timestamps, so the answer stays a handful of rows however long the queue.
   */
  countPendingByGroupAndTemplate(schoolId: string): Promise<PendingEffortRow[]>;
  /**
   * The median time a teacher spent on a card, per template, over the verdicts the school
   * delivered since `since` — only those that measured one (`review_handling_seconds`).
   */
  findHandlingTimeStats(schoolId: string, since: Date): Promise<HandlingTimeStat[]>;
  /** One page of the decisions journal, newest verdict first. */
  findReviewDecisionsPage(
    schoolId: string,
    since: Date,
    page: { limit: number; after: ReviewDecisionsCursor | null },
  ): Promise<Attempt[]>;
  /**
   * One page of a learner's own submissions, newest first (47.1).
   *
   * Selects `ROUTED_FOR_REVIEW`, `RETURNED`, and `SCORED` by a verdict — a teacher's or a
   * model's (plan 79, 2.3) — only: the same three buckets `status` narrows within. A
   * practice attempt or a machine-scored one never matches, `status=all` either.
   */
  findMySubmissionsPage(
    userId: string,
    status: MySubmissionsStatus,
    page: { limit: number; after: MySubmissionsCursor | null },
  ): Promise<Attempt[]>;
  /**
   * A learner's exercises whose latest machine-scored attempt failed (VoxOrd plan 05, step 8):
   * newest mistake first, at most `limit`, and how many there are in all. Only attempts in a
   * course, never a probe, never work a reviewer judged. A later passing attempt is the
   * latest one, so a corrected exercise drops out by itself.
   */
  findLatestMistakes(
    userId: string,
    options: { courseId: string | null; limit: number },
  ): Promise<{ attempts: Attempt[]; total: number }>;
  /**
   * Which of these attempts a teacher reviewed from a model's draft they sent or edited
   * (plan 79, `review_draft`) — the "AI drafted, teacher checked" line a learner reads.
   * A discarded draft does not count: the teacher wrote that review themselves.
   */
  findAiDraftedIds(attemptIds: string[]): Promise<Set<string>>;
  /** How much is waiting in a scope, and since when — without reading the submissions. */
  summariseReviewQueue(scope: ReviewQueueScope): Promise<ReviewQueueSummary>;
  /**
   * Which of these recording assets does some `read_aloud` attempt stand on (plan 71): handed in
   * (`submitted_answer`, chosen take or discarded one — a prompt carried into a retry points at
   * the earlier attempt's file), or a take on the draft of an attempt still in progress whose
   * draft was saved at or after `liveDraftSince`.
   */
  findRecordingsInUse(assetIds: readonly string[], liveDraftSince: Date): Promise<string[]>;
  /**
   * School work whose model verdict is due to count by itself (plan 80, step 4): still in
   * review, a provisional verdict on it, the term at or before `now`. Oldest term first.
   */
  findDueAiVerdictIds(now: Date, limit: number): Promise<string[]>;
  /**
   * Work of one template a person ruled on, item by item — a teacher's verdict, not a model's
   * (plan 82, step 10: the readings a speech model is measured against). Newest verdict first.
   */
  findTeacherReviewed(templateCode: string, limit: number): Promise<Attempt[]>;
  /**
   * The school's work the term job will close within `(after, until]` (plan 80, step 5):
   * still in review, a provisional verdict on it. Earliest term first, at most `limit`.
   */
  findReviewTermsAhead(
    schoolId: string,
    after: Date,
    until: Date,
    limit: number,
  ): Promise<ReviewTermRow[]>;
  save(attempt: Attempt): Promise<void>;
  saveAll(attempts: Attempt[]): Promise<void>;
  /**
   * `save`, only while the stored row is still in review — false when someone closed it in
   * between (a teacher's verdict landing beside the term job). Nothing is written then.
   */
  saveIfInReview(attempt: Attempt): Promise<boolean>;
}
