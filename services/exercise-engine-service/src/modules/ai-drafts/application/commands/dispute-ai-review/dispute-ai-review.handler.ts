import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { ATTEMPT_AI_REVIEW_DISPUTED, aiReviewDisputedPayload } from '../../../domain/events/ai-review-events.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { DisputeAiReviewCommand } from './dispute-ai-review.command.js';

export type DisputeAiReviewError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /** No model's verdict closed this attempt — the same reading as the learner's GET. */
  | { code: 'NO_AI_REVIEW' };

export interface DisputeAiReviewResult {
  disputedAt: Date;
}

/**
 * "This review is wrong" (plan 79, step 2.3b) — the learner's counterpart of a teacher
 * discarding a draft, and the only label a review nobody else reads ever gets.
 *
 * Once per review: a second press answers with the first one's time and publishes nothing,
 * so a double tap or a retry cannot count twice. It changes nothing about the verdict — the
 * learner's word is a signal about the model, not an appeal (Q1: only a teacher's verdict
 * replaces a model's).
 */
@CommandHandler(DisputeAiReviewCommand)
export class DisputeAiReviewHandler implements ICommandHandler<DisputeAiReviewCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: DisputeAiReviewCommand,
  ): Promise<Result<DisputeAiReviewResult, DisputeAiReviewError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.userId !== command.userId) return Result.fail({ code: 'FORBIDDEN' });
    if (attempt.reviewedBy !== 'ai') return Result.fail({ code: 'NO_AI_REVIEW' });

    const review = await this.drafts.findByAttempt(attempt.id, 'review_direct');
    if (review === null || review.status === 'FAILED') return Result.fail({ code: 'NO_AI_REVIEW' });
    if (review.disputedAt) return Result.ok({ disputedAt: review.disputedAt });

    const now = new Date();
    if (!(await this.drafts.markDisputed(review.id, now, command.reason))) {
      // Another press landed in between and has already been counted.
      const marked = await this.drafts.findByAttempt(attempt.id, 'review_direct');
      return Result.ok({ disputedAt: marked?.disputedAt ?? now });
    }

    await this.publisher.publish(
      ATTEMPT_AI_REVIEW_DISPUTED,
      aiReviewDisputedPayload(attempt, review, command.reason !== null, now),
    );
    return Result.ok({ disputedAt: now });
  }
}
