import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetSubmissionForReviewQuery } from './get-submission-for-review.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  ANSWER_VALIDATOR,
  type IAnswerValidator,
} from '../../../../../shared/application/ports/answer-validator.port.js';
import {
  CONTENT_CLIENT,
  type ExerciseDefinition,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type {
  Attempt,
  AttemptStatus,
  ExercisePathSnapshot,
} from '../../../domain/entities/attempt.entity.js';

export type GetSubmissionForReviewError = { code: 'ATTEMPT_NOT_FOUND' };

/** A verdict already delivered on some attempt — this one, or the try before it. */
export interface SubmissionVerdict {
  attemptId: string;
  outcome: 'approved' | 'returned';
  at: Date;
  /** The colleague who decided. The engine has no names; the BFF fills them in. */
  reviewerId: string | null;
  comment: string | null;
}

export interface SubmissionLock {
  teacherId: string;
  expiresAt: Date;
}

export interface GetSubmissionForReviewResult {
  attemptId: string;
  userId: string;
  status: AttemptStatus;
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  exerciseId: string;
  templateCode: string;
  /** What the submission is written in — `contentLang` on the screen. */
  targetLanguage: string;
  /** Course · module · exercise as they read when the learner started (§0.3). */
  path: ExercisePathSnapshot | null;
  /**
   * The exercise still resolves in content-service. `false` means gone or moved, and the
   * screen falls back to `path` — a submission must stay openable after its exercise is
   * deleted (requirement B/21).
   */
  exerciseAvailable: boolean;
  submittedAt: Date | null;
  /** Which try this is after a returned verdict — `revisionCount + 1`. */
  attemptNo: number;
  /** The verdict that sent the learner back here; null on a first try. */
  previous: SubmissionVerdict | null;
  /** Already decided — a colleague got here first, and the screen is read-only. */
  decision: SubmissionVerdict | null;
  lock: SubmissionLock | null;
  /** The validator's unmasked breakdown, recomputed now. Null is a valid answer. */
  details: unknown;
  /** `writing_task` only: the essay itself, lifted out of the submitted answer. */
  text: string | null;
  submittedAnswer: unknown;
  timeSpentSeconds: number;
  selfChecksUsed: number;
  answersRevealed: boolean;
}

/**
 * The reviewer's screen for a single submission.
 *
 * `details` is recomputed on every read and never stored (§0.3): the author fixing an
 * answer key has to change what the next teacher sees, and a breakdown written down at
 * submission time would quietly disagree with the exercise it came from.
 *
 * Nothing here fails on a submission the machine cannot read. A validator that throws up
 * its hands, an exercise the author deleted — both come back as `details: null` with the
 * answer and the snapshotted path intact, because a teacher who gets a 500 has no way at
 * all to unblock the learner waiting behind it.
 */
@QueryHandler(GetSubmissionForReviewQuery)
export class GetSubmissionForReviewHandler implements IQueryHandler<GetSubmissionForReviewQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(
    query: GetSubmissionForReviewQuery,
  ): Promise<Result<GetSubmissionForReviewResult, GetSubmissionForReviewError>> {
    const attempt = await this.attempts.findById(query.attemptId);
    // Another school's submission is not found rather than forbidden: a caller that has
    // no business with it should not learn that it exists.
    if (!attempt || attempt.schoolId !== query.schoolId) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }

    const [exercise, previous] = await Promise.all([
      this.exerciseFor(attempt),
      this.previousVerdictFor(attempt),
    ]);

    return Result.ok({
      attemptId: attempt.id,
      userId: attempt.userId,
      status: attempt.status,
      schoolId: attempt.schoolId,
      containerId: attempt.containerId,
      groupId: attempt.groupId,
      exerciseId: attempt.exerciseId,
      templateCode: attempt.templateCode,
      targetLanguage: attempt.targetLanguage,
      path: attempt.exercisePath,
      exerciseAvailable: exercise.available,
      submittedAt: attempt.submittedAt,
      attemptNo: attempt.revisionCount + 1,
      previous,
      decision: verdictOf(attempt),
      lock: attempt.activeReviewLock(),
      details:
        exercise.definition === null ? null : await this.detailsFor(attempt, exercise.definition),
      text: essayOf(attempt),
      submittedAnswer: attempt.submittedAnswer,
      timeSpentSeconds: attempt.timeSpentSeconds,
      selfChecksUsed: attempt.selfChecksUsed,
      answersRevealed: attempt.answersRevealed,
    });
  }

  /**
   * The exercise as its author left it — and whether it is still there at all.
   *
   * The two answers are not the same one. A 404 is content-service saying the exercise is
   * gone, which the screen must name; anything else is content-service being unreachable
   * right now, which is not evidence of a deletion and must not be reported as one. Both
   * cost the diff; only the first costs the exercise.
   */
  private async exerciseFor(
    attempt: Attempt,
  ): Promise<{ available: boolean; definition: ExerciseDefinition | null }> {
    const result = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      // The teacher's copy: the answer key is what the diff is drawn against.
      'PRACTICE',
    );

    if (result.isFail) {
      return { available: result.error.statusCode !== 404, definition: null };
    }
    return { available: true, definition: result.value };
  }

  private async detailsFor(attempt: Attempt, def: ExerciseDefinition): Promise<unknown> {
    const validation = await this.validator.validate({
      templateCode: attempt.templateCode,
      answerSchema: def.template.answerSchema as object,
      expectedAnswers: def.exercise.expectedAnswers,
      content: def.exercise.content,
      submittedAnswer: attempt.submittedAnswer,
      checkSettings: {
        ...(def.template.defaultCheckSettings ?? {}),
        ...(def.exercise.answerCheckSettings ?? {}),
      },
      targetLanguage: attempt.targetLanguage,
    });

    return validation.isFail ? null : validation.value.details;
  }

  /**
   * The verdict on the try this one resubmits.
   *
   * Read through `previousAttemptId` rather than by searching for earlier attempts of the
   * same exercise: the chain is what the learner actually walked, and a practice run they
   * did in between is not part of it.
   */
  private async previousVerdictFor(attempt: Attempt): Promise<SubmissionVerdict | null> {
    if (attempt.previousAttemptId === null) return null;

    const previous = await this.attempts.findById(attempt.previousAttemptId);
    return previous === null ? null : verdictOf(previous);
  }
}

/**
 * How an attempt ended, if it ended by someone's decision.
 *
 * `RETURNED` only ever comes from a person. `SCORED` does not: the machine scores too, so
 * a reviewer has to have signed it before it counts as a verdict here.
 */
function verdictOf(attempt: Attempt): SubmissionVerdict | null {
  if (attempt.status === 'RETURNED') {
    return {
      attemptId: attempt.id,
      outcome: 'returned',
      at: attempt.reviewedAt ?? attempt.submittedAt ?? attempt.startedAt,
      reviewerId: attempt.reviewedByUserId,
      comment: attempt.reviewComment,
    };
  }

  if (attempt.status === 'SCORED' && attempt.reviewedByUserId !== null) {
    return {
      attemptId: attempt.id,
      outcome: 'approved',
      at: attempt.reviewedAt ?? attempt.scoredAt ?? attempt.startedAt,
      reviewerId: attempt.reviewedByUserId,
      comment: attempt.reviewComment,
    };
  }

  return null;
}

/**
 * The essay out of a `writing_task` submission.
 *
 * Only that template: every other one submits a set of items, and there is no single
 * piece of prose to lift out of it. Read defensively — the answer is stored as it
 * arrived, and a shape from an older client must cost the field, not the request.
 */
function essayOf(attempt: Attempt): string | null {
  if (attempt.templateCode !== 'writing_task') return null;

  const answer = attempt.submittedAnswer;
  if (typeof answer !== 'object' || answer === null) return null;

  const text = (answer as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}
