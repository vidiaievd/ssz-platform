import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { draftRefusal } from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { GetReviewSubjectQuery } from './get-review-subject.query.js';
import { hasReviewPrompt, reviewSubject, type ReviewSubject } from './review-subject.js';

/** Why there is nothing to review — answered as a 200, since none of these is a fault. */
export type ReviewSubjectSkip =
  /** Decided, returned or never routed: no reviewer is waiting on it. */
  | 'ATTEMPT_NOT_IN_REVIEW'
  /** No school: no teacher reads the queue it is in (part 2 of the plan). */
  | 'NO_TEACHER_REVIEW'
  /** A draft is already on it — written, failed or acted on. A redelivered event stops here. */
  | 'DRAFT_EXISTS'
  /** No review prompt for this template yet (translate and error_correction have one). */
  | 'TEMPLATE_NOT_SUPPORTED'
  /** The exercise was deleted: there is no key to review against. */
  | 'EXERCISE_GONE';

export interface ReviewSubjectResult {
  attemptId: string;
  userId: string;
  schoolId: string | null;
  exerciseId: string;
  templateCode: string;
  skip: ReviewSubjectSkip | null;
  /** Null exactly when `skip` is set. */
  subject: ReviewSubject | null;
}

export type GetReviewSubjectError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  /** content-service could not be read right now — worth a retry, unlike a skip. */
  | { code: 'CONTENT_UNAVAILABLE' };

/**
 * What ai-service drafts a review from (plan 79, step 1.3): the learner's answer beside the
 * author's key, read through the template's model. ai-service holds no copy of any template;
 * this service already reads both halves for the teacher's screen.
 *
 * The answer key leaves this service here, so the route is internal and the only caller is
 * the one that writes the teacher a draft.
 */
@QueryHandler(GetReviewSubjectQuery)
export class GetReviewSubjectHandler implements IQueryHandler<GetReviewSubjectQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
  ) {}

  async execute(query: GetReviewSubjectQuery): Promise<Result<ReviewSubjectResult, GetReviewSubjectError>> {
    const attempt = await this.attempts.findById(query.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });

    const base = {
      attemptId: attempt.id,
      userId: attempt.userId,
      schoolId: attempt.schoolId,
      exerciseId: attempt.exerciseId,
      templateCode: attempt.templateCode,
    };
    const skip = (reason: ReviewSubjectSkip) => Result.ok<ReviewSubjectResult, GetReviewSubjectError>({ ...base, skip: reason, subject: null });

    const refusal = draftRefusal(attempt, query.capability);
    if (refusal === 'ATTEMPT_NOT_IN_REVIEW' || refusal === 'NO_TEACHER_REVIEW') return skip(refusal);
    if (await this.drafts.findByAttempt(attempt.id, query.capability)) return skip('DRAFT_EXISTS');

    if (!hasReviewPrompt(attempt.templateCode)) return skip('TEMPLATE_NOT_SUPPORTED');

    const exercise = await this.content.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      // The teacher's copy: the key is what the answer is reviewed against.
      'PRACTICE',
    );
    if (exercise.isFail) {
      return exercise.error.statusCode === 404 ? skip('EXERCISE_GONE') : Result.fail({ code: 'CONTENT_UNAVAILABLE' });
    }

    const subject = reviewSubject(attempt.templateCode, exercise.value.exercise, attempt);
    return subject === null ? skip('TEMPLATE_NOT_SUPPORTED') : Result.ok({ ...base, skip: null, subject });
  }
}
