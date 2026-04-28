import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const EXERCISE_ENGINE_EVENT_TYPES = {
  ATTEMPT_STARTED: 'exercise.attempt.started',
  ATTEMPT_COMPLETED: 'exercise.attempt.completed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface ExerciseAttemptStartedPayload {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
  assignmentId: string | null;
  enrollmentId: string | null;
}

/**
 * Published after a closed-form attempt is scored OR a free-form attempt is
 * routed for human review. Consumed by Learning Service's ExerciseAttemptedConsumer.
 *
 * Field contract is FROZEN — must match ExerciseAttemptedConsumer exactly:
 *   completed=true  → closed-form, score present
 *   completed=false → free-form, score null, routed for review
 */
export interface ExerciseAttemptCompletedPayload {
  userId: string;
  exerciseId: string;
  score: number | null;
  timeSpentSeconds: number;
  completed: boolean;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type ExerciseAttemptStartedEvent = BaseEvent<ExerciseAttemptStartedPayload>;
export type ExerciseAttemptCompletedEvent = BaseEvent<ExerciseAttemptCompletedPayload>;
