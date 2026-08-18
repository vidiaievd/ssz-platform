import type { BaseEvent } from '../base.js';
import type { AnswerForm } from '../exercise-engine/index.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const LEARNING_EVENT_TYPES = {
  ASSIGNMENT_CREATED: 'learning.assignment.created',
  ASSIGNMENT_COMPLETED: 'learning.assignment.completed',
  ASSIGNMENT_CANCELLED: 'learning.assignment.cancelled',
  ASSIGNMENT_OVERDUE: 'learning.assignment.overdue',
  ASSIGNMENT_DUE_DATE_UPDATED: 'learning.assignment.due_date_updated',
  ENROLLMENT_CREATED: 'learning.enrollment.created',
  ENROLLMENT_COMPLETED: 'learning.enrollment.completed',
  ENROLLMENT_UNENROLLED: 'learning.enrollment.unenrolled',
  PROGRESS_COMPLETED: 'learning.progress.completed',
  PROGRESS_UPDATED: 'learning.progress.updated',
  VOCABULARY_LOOKED_UP: 'learning.vocabulary.looked_up',
  ATTEMPT_RATED: 'learning.attempt.rated',
  SRS_LIMIT_REFUSED: 'learning.srs.limit_refused',
} as const;

// ─── Assignment payload interfaces ────────────────────────────────────────────

export interface AssignmentCreatedPayload {
  assignmentId: string;
  assignerId: string;
  assigneeId: string;
  schoolId: string | null;
  contentType: string;
  contentId: string;
  dueAt: string | null;
}

export interface AssignmentCompletedPayload {
  assignmentId: string;
  assignerId: string;
  assigneeId: string;
}

export interface AssignmentCancelledPayload {
  assignmentId: string;
  assignerId: string;
  assigneeId: string;
  reason: string | null;
}

export interface AssignmentOverduePayload {
  assignmentId: string;
  assignerId: string;
  assigneeId: string;
  dueAt: string;
}

export interface AssignmentDueDateUpdatedPayload {
  assignmentId: string;
  previousDueAt: string | null;
  newDueAt: string | null;
}

// ─── Enrollment payload interfaces ───────────────────────────────────────────

export interface EnrollmentCreatedPayload {
  enrollmentId: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
}

export interface EnrollmentCompletedPayload {
  enrollmentId: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  completedAt: string;
}

export interface EnrollmentUnenrolledPayload {
  enrollmentId: string;
  userId: string;
  containerId: string;
  reason: string | null;
}

// ─── Progress payload interfaces ──────────────────────────────────────────────

export interface ProgressCompletedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  completedAt: string;
  score: number | null;
}

export interface ProgressUpdatedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  status: string;
  attemptsCount: number;
  score: number | null;
}

// ─── Vocabulary payload interfaces ───────────────────────────────────────────

/**
 * A learner opened the word card for a glossed word while reading (web spec 18).
 * Reported by the reader in batches and published per lookup; nothing in the
 * platform's state changes, so this is a record of behaviour, not of a write.
 */
export interface VocabularyLookedUpPayload {
  userId: string;
  lessonId: string;
  /** Glossing differs per variant, so the variant is part of the observation. */
  lessonVariantId: string;
  vocabularyItemId: string;
  /** `preview` is a hover hint, `full` is the card the learner asked for. */
  level: 'preview' | 'full';
  /**
   * The learner's SRS state for the word at the moment of the lookup, or null
   * when they have no card for it. Separates "opened a new word" from "opened a
   * word they were supposed to know". Resolved by learning-service, never by
   * the client.
   */
  srsState: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'SUSPENDED' | null;
  /** When the learner opened the card — the envelope carries the publish time. */
  occurredAt: string;
}

// ─── SRS calibration payload interfaces ──────────────────────────────────────

/**
 * One attempt, as it reached spaced repetition (plan 36 §A.1).
 *
 * Published by learning-service after it has turned a scored attempt into an FSRS
 * rating, because that is the only place where both halves are known: the answer's
 * form comes from the exercise engine, the rating and the card's history do not
 * exist until the consumer has run.
 *
 * It exists to be measured against. The ceilings plan 36 puts on ratings are a
 * judgement, and the only way to tell "the scale works" from "the scale broke the
 * schedule" is to have recorded the same fields before the ceilings were switched
 * on. So `ratingApplied` ships from the start, clamped or not.
 *
 * Deliberately absent: the learner's answer. Right or wrong is enough to calibrate,
 * and storing the text would accumulate personal data for no purpose.
 */
export interface AttemptRatedPayload {
  userId: string;
  exerciseId: string;
  /** Null on events published before the exercise engine reported it. */
  templateCode: string | null;
  /** How the answer was produced. Null for the templates that cannot say. */
  answerForm: AnswerForm | null;
  score: number;
  /** Cleared the passing threshold. Null when the publisher did not report it. */
  passed: boolean | null;
  /** 1 for the first attempt on this card, counting from the card's rep count. */
  attemptOrdinal: number;
  /** Null on the first review — there is no previous one to measure from. */
  daysSinceLastReview: number | null;
  /**
   * Where the gap sat in its block, for the decay in §B.3: with a consumed bank of
   * N words over N gaps, the last gap is a certainty rather than a recollection.
   * Both null until cards are per-gap (§C.1) — before that there is no position to
   * report, since one card stands for the whole exercise.
   */
  gapPosition: number | null;
  gapCount: number | null;
  /** The rating that actually reached FSRS, after any clamping. */
  ratingApplied: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
}

/**
 * A daily SRS cap turned something down (plan 37 §A.1).
 *
 * The two caps — new cards and reviews — are the only decisions the scheduler makes
 * that leave no trace anywhere: `learning.attempt.rated` is written once a rating has
 * reached FSRS, so the refused cases are precisely the ones missing from it. Without
 * this event "is 20 the right number" cannot be answered at all, only argued about.
 *
 * Purely quantitative: how often, to whom, and which of the two caps. What the
 * material was is not asked, so `contentType` is the kind of card, not its content.
 */
export interface SrsLimitRefusedPayload {
  userId: string;
  /** Which cap refused: the new-card intake or the daily review budget. */
  kind: 'new' | 'review';
  /** Card kind the refusal fell on — EXERCISE | EXERCISE_GAP | VOCABULARY_WORD. */
  contentType: string;
  /** When the refusal happened, as the scheduler saw the day. */
  occurredAt: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type AssignmentCreatedEvent = BaseEvent<AssignmentCreatedPayload>;
export type AssignmentCompletedEvent = BaseEvent<AssignmentCompletedPayload>;
export type AssignmentCancelledEvent = BaseEvent<AssignmentCancelledPayload>;
export type AssignmentOverdueEvent = BaseEvent<AssignmentOverduePayload>;
export type AssignmentDueDateUpdatedEvent = BaseEvent<AssignmentDueDateUpdatedPayload>;

export type EnrollmentCreatedEvent = BaseEvent<EnrollmentCreatedPayload>;
export type EnrollmentCompletedEvent = BaseEvent<EnrollmentCompletedPayload>;
export type EnrollmentUnenrolledEvent = BaseEvent<EnrollmentUnenrolledPayload>;

export type ProgressCompletedEvent = BaseEvent<ProgressCompletedPayload>;
export type ProgressUpdatedEvent = BaseEvent<ProgressUpdatedPayload>;


export type VocabularyLookedUpEvent = BaseEvent<VocabularyLookedUpPayload>;

export type AttemptRatedEvent = BaseEvent<AttemptRatedPayload>;
export type SrsLimitRefusedEvent = BaseEvent<SrsLimitRefusedPayload>;
