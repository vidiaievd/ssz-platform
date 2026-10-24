import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import type { AiDraftMark, AiDraftRemark } from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { GetLearnerAiReviewQuery } from './get-learner-ai-review.query.js';

export type GetLearnerAiReviewError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /** No model's verdict closed this attempt: still waiting, a teacher's, or none at all. */
  | { code: 'NO_AI_REVIEW' };

/** What the learner's result screen draws under their answer, beside the verdict. */
export interface LearnerAiReview {
  outcome: 'approved' | 'returned';
  items: AiDraftRemark[];
  summary: string | null;
  /** The marks behind an essay's grade, with the model's reason for each; null otherwise. */
  marks: AiDraftMark[] | null;
  reviewedAt: Date;
}

/**
 * The model's remarks on a learner's work, once its verdict has closed the attempt.
 *
 * Read only through the verdict: the stored review and the attempt are written one after
 * the other, and a review whose verdict did not land is not one the learner was given — it
 * waits for the retry that finishes it. Which model and prompt wrote it stays with the
 * teacher-facing reads; the learner is told it was a model, not which.
 */
@QueryHandler(GetLearnerAiReviewQuery)
export class GetLearnerAiReviewHandler implements IQueryHandler<GetLearnerAiReviewQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
  ) {}

  async execute(
    query: GetLearnerAiReviewQuery,
  ): Promise<Result<LearnerAiReview, GetLearnerAiReviewError>> {
    const attempt = await this.attempts.findById(query.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.userId !== query.userId) return Result.fail({ code: 'FORBIDDEN' });
    if (attempt.reviewedBy !== 'ai') return Result.fail({ code: 'NO_AI_REVIEW' });

    const review = await this.drafts.findByAttempt(attempt.id, 'review_direct');
    if (review === null || review.status === 'FAILED') return Result.fail({ code: 'NO_AI_REVIEW' });

    return Result.ok({
      outcome: attempt.status === 'RETURNED' ? 'returned' : 'approved',
      items: review.items,
      summary: review.summary,
      marks: review.marks,
      // `reviewedBy` is only `ai` with a delivery time on the attempt.
      reviewedAt: attempt.reviewedAt as Date,
    });
  }
}
