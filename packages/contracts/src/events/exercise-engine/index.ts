import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const EXERCISE_ENGINE_EVENT_TYPES = {
  ATTEMPT_STARTED: 'exercise.attempt.started',
  ATTEMPT_COMPLETED: 'exercise.attempt.completed',
  ATTEMPT_ROUTED_FOR_REVIEW: 'exercise.attempt.routed_for_review',
  ATTEMPT_REVIEWED: 'exercise.attempt.reviewed',
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
  // Additive (plan 21 §3) — PRACTICED_BY atoms snapshotted from Content Service at
  // attempt start. Optional so older publishers without this field stay valid.
  practicedAtoms?: Array<{ atomType: string; atomId: string }>;
  // Additive (plan 35 §5.4) — how the answer was produced. Optional: only
  // word_bank_gap_fill reports it today, and events published before it existed
  // stay valid.
  answerForm?: AnswerForm;
  // Additive (plan 36 §A.1) — telemetry context. The consumer turns an attempt into
  // an SRS rating and forwards the pair to analytics; without these, the calibration
  // data cannot say which template or whether the attempt counted as a success.
  // Optional for the same reason as the fields above: events already in the queue.
  templateCode?: string;
  /** Cleared the template's passing threshold. `score === 100` is "every gap right". */
  passed?: boolean;
  /**
   * Additive (plan 36 §C.1) — per-gap verdicts, in the order the gaps appear.
   *
   * Present only for the templates graded gap by gap. It exists so spaced repetition
   * can schedule a gap rather than a whole exercise: with one card per exercise, one
   * wrong sentence in a block of six brings all six back. Before gap-fill was merged
   * into one template, six separate exercises gave six independent cards, and that
   * was *better* — this is what gives it back, finer than it was.
   *
   * Deliberately not the explanation: that is feedback for the learner, and the
   * scheduler has no use for it.
   */
  gapResults?: Array<{ gapKey: string; correct: boolean }>;
}

/**
 * How the learner produced the answer, as opposed to whether it was right.
 *
 * Needed because `word_bank_gap_fill` absorbed `fill_in_blank`: one template now
 * covers both choosing a word from five and typing it from memory. Those are not
 * equal evidence of knowing it, and after the merge there is no `templateCode` left
 * to tell them apart — so without this field, merging the two types would make
 * spaced repetition *worse* than it was.
 *
 * Nothing consumes it yet. The scale that will —
 * ceilings on rating, asymmetry between success and failure — is plan 36.
 */
export interface AnswerForm {
  /** `bank`: chosen from a closed set. `free`: typed, with nothing to choose from. */
  mode: 'bank' | 'free';
  /** How many words were on offer. `null` in `free` mode, where there is no bank. */
  bankSize: number | null;
  /** Each word could be used once, so spending one narrowed what was left. */
  wordsConsumed: boolean;
}

/**
 * Published when a submission starts waiting for a person — plan 44 §44.5.
 *
 * `attempt.completed` travels at the same moment and says the learner finished
 * without a score; its shape is frozen by the Learning Service consumer, and progress
 * is all it is about. This one is about the *queue*: which school, course and group
 * the work landed in, which is what a reminder or an escalation needs to work out who
 * to tell. Nothing outside review consumes it.
 *
 * The context fields are the snapshot taken when the learner started (or filled in on
 * the way here). `null` means a neighbouring service could not say — the work is still
 * waiting, it just has no group to chase.
 */
export interface ExerciseAttemptRoutedForReviewPayload {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  /** ISO 8601 — the clock every "how long has this been waiting" answer starts from. */
  submittedAt: string;
}

/**
 * Published when a person has marked a submission — plan 42.
 *
 * Separate from `attempt.completed` rather than a flag on it, because the two answer
 * different questions. `completed` is progress: the SRS and the learner's course state
 * move on it, and an approved attempt already publishes it. This one is *correspondence*:
 * a learner handed work to a teacher and is owed an answer, and the only consumer that
 * cares is the one that tells them.
 *
 * It is published for both outcomes, including an approval with nothing written on it.
 * Silence after handing in work is the hole the marking queue was built to close, and a
 * learner cannot tell "not looked at yet" from "looked at, nothing to say".
 */
export interface ExerciseAttemptReviewedPayload {
  attemptId: string;
  /** The learner who handed the work in — the recipient of anything sent about it. */
  userId: string;
  exerciseId: string;
  templateCode: string;
  reviewerId: string;
  /**
   * The school the work was handed in to, snapshotted when the attempt started.
   *
   * `null` for practice outside a school, and for attempts that predate plan 44. It rides
   * along so that a consumer building a school-wide feed does not have to keep its own
   * copy of every submission just to learn which school a verdict belongs to.
   */
  schoolId: string | null;
  /**
   * The course the work belongs to, snapshotted when the attempt started.
   *
   * On the letter rather than looked up by its reader: a notification is written once and
   * read weeks later, and a consumer that resolved the course at read time would answer
   * for where the exercise sits *now* — or fail to answer at all once it has moved.
   */
  containerId: string | null;
  /**
   * Course · module · exercise as they read when the learner started (plan 44 §0.3).
   *
   * What lets a message name the work instead of pointing at "an exercise": `null` only
   * for attempts that predate the snapshot, and a consumer must still say something
   * sensible without it.
   */
  exercisePath: { course: string; module: string | null; exercise: string | null } | null;
  outcome: 'approved' | 'returned';
  /** 0–100 on an approval; `null` when the work was sent back unmarked. */
  score: number | null;
  /** What the teacher wrote about the submission as a whole, if anything. */
  comment: string | null;
  /**
   * A person wrote something, anywhere — the overall comment or a note on a single
   * sentence.
   *
   * Not the same question as `comment !== null`: a teacher may approve with nothing to
   * say in general and a remark on one sentence, and the learner must still be told there
   * is something to read. It is the flag that separates "marked, nothing to add" from
   * "marked, go and look" (plan 44 §44.9, criterion 40).
   */
  hasComment: boolean;
  /** How much of the submission counted. Both `0` when there was nothing readable. */
  approvedItems: number;
  totalItems: number;
  occurredAt: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type ExerciseAttemptStartedEvent = BaseEvent<ExerciseAttemptStartedPayload>;
export type ExerciseAttemptCompletedEvent = BaseEvent<ExerciseAttemptCompletedPayload>;
export type ExerciseAttemptReviewedEvent = BaseEvent<ExerciseAttemptReviewedPayload>;
export type ExerciseAttemptRoutedForReviewEvent =
  BaseEvent<ExerciseAttemptRoutedForReviewPayload>;
