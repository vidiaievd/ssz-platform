import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import type { Attempt } from '../../../../attempts/domain/entities/attempt.entity.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { GiveUpAiReviewCommand } from './give-up-ai-review.command.js';

export type GiveUpAiReviewError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  /** Decided, or never waiting for a reviewer. */
  | { code: 'ATTEMPT_NOT_IN_REVIEW' }
  | { code: 'HAS_TEACHER_REVIEW' }
  /** A ready review is on the attempt: a retry of its write closes it, not this. */
  | { code: 'REVIEW_EXISTS' };

export interface GiveUpAiReviewResult {
  status: Attempt['status'];
}

/**
 * ai-service could not review the work of a learner nobody else reviews (plan 79, step
 * 2.2a): the attempt closes as `NO_REVIEWER`, as it would have at hand-in had the engine
 * known. Idempotent: an attempt already closed this way answers 200 again.
 *
 * A school's work the model was to answer first (plan 80) has a reviewer all the same: it
 * simply stays in the teacher's queue, as it would without the policy, and the answer is 200
 * with the attempt still routed.
 */
@CommandHandler(GiveUpAiReviewCommand)
export class GiveUpAiReviewHandler implements ICommandHandler<GiveUpAiReviewCommand> {
  private readonly logger = new Logger(GiveUpAiReviewHandler.name);

  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
  ) {}

  async execute(
    command: GiveUpAiReviewCommand,
  ): Promise<Result<GiveUpAiReviewResult, GiveUpAiReviewError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.status === 'NO_REVIEWER') return Result.ok({ status: attempt.status });
    if (attempt.status !== 'ROUTED_FOR_REVIEW') return Result.fail({ code: 'ATTEMPT_NOT_IN_REVIEW' });
    if (attempt.schoolId !== null) {
      if (attempt.reviewAiPolicy === null) return Result.fail({ code: 'HAS_TEACHER_REVIEW' });
      this.logger.log(
        `No model's review of attempt ${command.attemptId}; it stays with the teacher: ${command.reason}` +
          (command.aiCallId ? ` (call ${command.aiCallId})` : ''),
      );
      return Result.ok({ status: attempt.status });
    }

    const review = await this.drafts.findByAttempt(command.attemptId, 'review_direct');
    if (review?.status === 'READY') return Result.fail({ code: 'REVIEW_EXISTS' });

    const closed = attempt.giveUpReview();
    if (closed.isFail) return Result.fail({ code: 'ATTEMPT_NOT_IN_REVIEW' });
    await this.attempts.save(attempt);

    this.logger.log(
      `Attempt ${command.attemptId} closed without a reviewer: ${command.reason}` +
        (command.aiCallId ? ` (call ${command.aiCallId})` : ''),
    );
    return Result.ok({ status: attempt.status });
  }
}
