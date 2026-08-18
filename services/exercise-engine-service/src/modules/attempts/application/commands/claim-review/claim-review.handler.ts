import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ClaimReviewCommand } from './claim-review.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ReviewLockResult } from '../review-lock.result.js';

export type ClaimReviewError = { code: 'ATTEMPT_NOT_FOUND' } | { code: 'NOT_WAITING_FOR_REVIEW' };

/**
 * "I am looking at this one."
 *
 * A soft marker and nothing more: it is written down so a second teacher does not spend
 * ten minutes marking a submission that is being marked, and it is not consulted by
 * anything that reads or decides. Expiry is read off `claimedAt` (see the entity), so a
 * teacher who closed their laptop stops holding the submission without anything having to
 * run in the background.
 */
@CommandHandler(ClaimReviewCommand)
export class ClaimReviewHandler implements ICommandHandler<ClaimReviewCommand> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(command: ClaimReviewCommand): Promise<Result<ReviewLockResult, ClaimReviewError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    // Another school's submission is not found rather than forbidden — as everywhere on
    // these routes, a caller with no business here does not learn that it exists.
    if (!attempt || attempt.schoolId !== command.schoolId) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }

    const claimed = attempt.claimForReview(command.teacherId);
    if (claimed.isFail) {
      return Result.fail({ code: 'NOT_WAITING_FOR_REVIEW' });
    }

    const lock = claimed.value;
    const mine = lock.teacherId === command.teacherId;

    // A claim that did not displace a colleague's changed nothing worth a write.
    if (mine) {
      await this.attempts.save(attempt);
    }

    return Result.ok({ lock, mine });
  }
}
