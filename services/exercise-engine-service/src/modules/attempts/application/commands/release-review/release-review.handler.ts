import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReleaseReviewCommand } from './release-review.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ReviewLockResult } from '../review-lock.result.js';

export type ReleaseReviewError = { code: 'ATTEMPT_NOT_FOUND' };

/**
 * The reviewer navigated away.
 *
 * Idempotent and never refused on the submission's state: releasing is how a teacher
 * gives work back, and a screen closing must not have to reason about whether the verdict
 * it just sent already cleared the marker.
 */
@CommandHandler(ReleaseReviewCommand)
export class ReleaseReviewHandler implements ICommandHandler<ReleaseReviewCommand> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(
    command: ReleaseReviewCommand,
  ): Promise<Result<ReviewLockResult, ReleaseReviewError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt || attempt.schoolId !== command.schoolId) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }

    const lock = attempt.releaseReview(command.teacherId);

    // A colleague's marker was left standing; there is nothing to persist.
    if (lock === null) {
      await this.attempts.save(attempt);
    }

    return Result.ok({ lock, mine: false });
  }
}
