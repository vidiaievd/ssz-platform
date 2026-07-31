import type { BaseEvent } from '../base.js';

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
  SUBMISSION_CREATED: 'learning.submission.created',
  SUBMISSION_REVIEWED: 'learning.submission.reviewed',
  SUBMISSION_RESUBMITTED: 'learning.submission.resubmitted',
  VOCABULARY_LOOKED_UP: 'learning.vocabulary.looked_up',
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

// ─── Submission payload interfaces ────────────────────────────────────────────

export interface SubmissionCreatedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  schoolId: string | null;
}

export interface SubmissionReviewedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  reviewerId: string;
  decision: string;
  feedback: string | null;
  score: number | null;
}

export interface SubmissionResubmittedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  revisionNumber: number;
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

export type SubmissionCreatedEvent = BaseEvent<SubmissionCreatedPayload>;
export type SubmissionReviewedEvent = BaseEvent<SubmissionReviewedPayload>;
export type SubmissionResubmittedEvent = BaseEvent<SubmissionResubmittedPayload>;

export type VocabularyLookedUpEvent = BaseEvent<VocabularyLookedUpPayload>;
