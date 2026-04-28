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
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface AssignmentCreatedPayload {
  assignmentId: string;
  exerciseId: string;
  assignedByUserId: string;
  assignedToUserId: string;
  schoolId: string | null;
  dueAt: string | null;
}

export interface AssignmentCompletedPayload {
  assignmentId: string;
  exerciseId: string;
  userId: string;
  completedAt: string;
}

export interface AssignmentCancelledPayload {
  assignmentId: string;
  exerciseId: string;
  userId: string;
  cancelledByUserId: string;
}

export interface AssignmentOverduePayload {
  assignmentId: string;
  exerciseId: string;
  userId: string;
  dueAt: string;
}

export interface AssignmentDueDateUpdatedPayload {
  assignmentId: string;
  previousDueAt: string | null;
  newDueAt: string | null;
}

export interface EnrollmentCreatedPayload {
  enrollmentId: string;
  userId: string;
  contentId: string;
  contentType: string;
  schoolId: string | null;
}

export interface EnrollmentCompletedPayload {
  enrollmentId: string;
  userId: string;
  contentId: string;
  contentType: string;
}

export interface EnrollmentUnenrolledPayload {
  enrollmentId: string;
  userId: string;
  contentId: string;
  contentType: string;
}

export interface ProgressCompletedPayload {
  userId: string;
  contentId: string;
  contentType: string;
  score: number;
  attemptsCount: number;
  completedAt: string;
}

export interface ProgressUpdatedPayload {
  userId: string;
  contentId: string;
  contentType: string;
  score: number;
  attemptsCount: number;
}

export interface SubmissionCreatedPayload {
  submissionId: string;
  assignmentId: string | null;
  exerciseId: string;
  userId: string;
  attemptId: string;
}

export interface SubmissionReviewedPayload {
  submissionId: string;
  exerciseId: string;
  userId: string;
  reviewedByUserId: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
}

export interface SubmissionResubmittedPayload {
  submissionId: string;
  exerciseId: string;
  userId: string;
  revisionCount: number;
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
