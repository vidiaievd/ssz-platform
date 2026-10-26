import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import {
  learnerReviewCapability,
  type AiDraftMark,
  type AiDraftRemark,
} from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import type { DraftReading } from '../../../domain/reading-verdict.js';
import { GetLearnerAiReviewQuery } from './get-learner-ai-review.query.js';

export type GetLearnerAiReviewError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /** No model's verdict on this attempt: still waiting for one, a teacher's, or none at all. */
  | { code: 'NO_AI_REVIEW' };

/** What the learner's result screen draws under their answer, beside the verdict. */
export interface LearnerAiReview {
  outcome: 'approved' | 'returned';
  items: AiDraftRemark[];
  summary: string | null;
  /** The marks behind an essay's grade, with the model's reason for each; null otherwise. */
  marks: AiDraftMark[] | null;
  /**
   * A `read_aloud` reading (plan 82): what was heard in each prompt and the check the verdict
   * stood on. Null for every other template.
   */
  reading: DraftReading | null;
  reviewedAt: Date;
  /** When the learner said the review is wrong (2.3b); null until they do. */
  disputedAt: Date | null;
  /**
   * A school's work (plan 80, step 3b): the verdict does not count yet — a teacher will read
   * the work, and their verdict is the one that counts. False once the model's closed it.
   */
  provisional: boolean;
  /** For a provisional one: when it counts by itself if no teacher answers; null otherwise. */
  countsAt: Date | null;
  /** It counted by itself — the school's term ran out with no teacher's answer (step 4). */
  acceptedAtTerm: boolean;
}

/**
 * The model's remarks on a learner's work, once its verdict has closed the attempt — or, at a
 * school that has a model answer first, once its provisional verdict is on it (plan 80).
 *
 * Read only through the verdict: the stored review and the attempt are written one after
 * the other, and a review whose verdict did not land is not one the learner was given — it
 * waits for the retry that finishes it. Which model and prompt wrote it stays with the
 * teacher-facing reads; the learner is told it was a model, not which. Once a teacher has
 * answered, the review is theirs to tell — the model's goes quiet here.
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
    const pending = attempt.pendingAiVerdict();
    if (attempt.reviewedBy !== 'ai' && pending === null) return Result.fail({ code: 'NO_AI_REVIEW' });

    const review = await this.drafts.findByAttempt(attempt.id, learnerReviewCapability(attempt.templateCode));
    if (review === null || review.status === 'FAILED') return Result.fail({ code: 'NO_AI_REVIEW' });

    if (pending !== null) {
      return Result.ok({
        outcome: pending.outcome,
        items: review.items,
        summary: review.summary,
        marks: review.marks,
        reading: review.reading,
        reviewedAt: pending.at,
        disputedAt: null,
        provisional: true,
        countsAt: pending.countsAt,
        acceptedAtTerm: false,
      });
    }
    return Result.ok({
      outcome: attempt.status === 'RETURNED' ? 'returned' : 'approved',
      items: review.items,
      summary: review.summary,
      marks: review.marks,
      reading: review.reading,
      // `reviewedBy` is only `ai` with a delivery time on the attempt.
      reviewedAt: attempt.reviewedAt as Date,
      disputedAt: review.disputedAt,
      provisional: false,
      countsAt: null,
      acceptedAtTerm: attempt.acceptedAtTerm,
    });
  }
}
