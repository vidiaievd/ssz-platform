import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ReviewAttemptCommand } from './review-attempt.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import { Inject } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import type { ContentClientError } from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ReviewScoring } from '../../services/review-scoring.js';
import { foldSentenceComments, publishAttemptEvents } from '../../services/review-verdict.js';
import {
  ReviewCommentRequiredError,
  type AttemptDomainError,
} from '../../../domain/exceptions/attempt.errors.js';

export type ReviewAttemptError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  /** A colleague got here first — the screen has to name them (§4 of the contract). */
  | { code: 'ALREADY_REVIEWED'; by: string; verdict: 'approved' | 'returned'; at: Date }
  /** Sent back with nothing said about why. */
  | { code: 'RETURN_REQUIRES_COMMENT' }
  | ContentClientError
  | AttemptDomainError;

export interface ReviewAttemptResult {
  attemptId: string;
  status: 'SCORED' | 'RETURNED';
  score: number | null;
  approvedItems: number;
  totalItems: number;
}

/**
 * The teacher's verdict, and the score that follows from it.
 *
 * The score is not sent by the client. It is derived by `ReviewScoring` from what the
 * server can see — so a client cannot award a mark, and two teachers making the same
 * decisions cannot produce two different marks.
 */
@CommandHandler(ReviewAttemptCommand)
export class ReviewAttemptHandler implements ICommandHandler<ReviewAttemptCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    private readonly scoring: ReviewScoring,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: ReviewAttemptCommand,
  ): Promise<Result<ReviewAttemptResult, ReviewAttemptError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });

    // Someone has already answered this one. Said before anything else is computed,
    // because the answer the screen needs is who and what, not that it failed.
    const standing = attempt.deliveredVerdict();
    if (standing !== null) {
      return Result.fail({
        code: 'ALREADY_REVIEWED',
        by: standing.reviewerId,
        verdict: standing.outcome,
        at: standing.at,
      });
    }

    const decisions = foldSentenceComments(command.decisions, command.sentenceComments);

    if (command.outcome === 'returned') {
      const returned = attempt.review({
        reviewerId: command.reviewerId,
        outcome: 'returned',
        decisions,
        comment: command.comment,
      });
      if (returned.isFail) return Result.fail(toError(returned.error));

      await this.attempts.save(attempt);
      await publishAttemptEvents(this.publisher, attempt);
      return Result.ok({
        attemptId: attempt.id,
        status: 'RETURNED',
        score: null,
        approvedItems: 0,
        totalItems: 0,
      });
    }

    const autoResult = await this.scoring.autoOutcomes(attempt);
    if (autoResult.isFail) return Result.fail(autoResult.error);

    const { approvedItems, totalItems, score } = this.scoring.scoreOf(autoResult.value, decisions);

    const reviewed = attempt.review({
      reviewerId: command.reviewerId,
      outcome: 'approved',
      decisions,
      comment: command.comment,
      score,
      // A submission a teacher has approved item by item passes on those items, not on a
      // threshold this service would have to invent for a template it cannot grade.
      passed: approvedItems > 0,
      approvedItems,
      totalItems,
    });
    if (reviewed.isFail) return Result.fail(toError(reviewed.error));

    await this.attempts.save(attempt);
    await publishAttemptEvents(this.publisher, attempt);

    return Result.ok({
      attemptId: attempt.id,
      status: 'SCORED',
      score,
      approvedItems,
      totalItems,
    });
  }
}

/**
 * A domain refusal, named so the edge can answer it properly.
 *
 * Only the empty return is singled out: the screen has a field to put the message beside
 * and a criterion saying it must (18). Everything else is a transition that should not
 * have been attempted, and one code for those is honest.
 */
function toError(error: AttemptDomainError): ReviewAttemptError {
  return error instanceof ReviewCommentRequiredError ? { code: 'RETURN_REQUIRES_COMMENT' } : error;
}
