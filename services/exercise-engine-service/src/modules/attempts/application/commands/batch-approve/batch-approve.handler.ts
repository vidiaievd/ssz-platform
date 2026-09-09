import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { BatchApproveCommand } from './batch-approve.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { ReviewScoring, isMachineClean } from '../../services/review-scoring.js';
import { publishAttemptEvents } from '../../services/review-verdict.js';

/**
 * Why one submission of the list was left alone.
 *
 * `already_reviewed` and `not_clean` are the two the screen has words for; the rest are
 * rarer and still have to be said out loud, because the alternative is a count that does
 * not add up and a teacher who never learns which name is missing.
 */
export type BatchSkipReason =
  /** No such submission in this school — including one belonging to another. */
  | 'not_found'
  /** A colleague, or this teacher on another tab, has already decided it. */
  | 'already_reviewed'
  /** Not waiting on a person at all: still in progress, machine-scored, abandoned. */
  | 'not_pending'
  /** The parse says a person is still needed — the key changed since it was routed. */
  | 'not_clean'
  /** The exercise could not be fetched, so cleanliness could not be established. */
  | 'unavailable';

export interface BatchApproveResult {
  approved: number;
  skipped: { id: string; reason: BatchSkipReason }[];
}

/**
 * The batch approval: the same verdict as a single one, delivered to a list.
 *
 * Every submission goes down the path the single verdict goes down — the parse is
 * recomputed against the exercise as it stands now, and only what the machine still
 * closes on its own is credited. A submission that stopped being clean since it was
 * routed (its author fixed the key) leaves as `not_clean` rather than being marked
 * correct by a teacher who never read it: that is the whole reason §0.3 calls the stored
 * counters a hint and not the truth.
 *
 * No per-item decisions are recorded. Nobody ruled on a sentence here; the machine did,
 * and `approvedItems`/`totalItems` on the event say so honestly.
 *
 * The "in hand" marker is not consulted. It is advisory by design (44.8) — it does not
 * stop a single verdict and it does not stop this one; the verdict clears it.
 *
 * Partial success is the normal outcome, not an error: the answer is a count and a list
 * of names the caller can put in a toast.
 */
@CommandHandler(BatchApproveCommand)
export class BatchApproveHandler implements ICommandHandler<BatchApproveCommand> {
  private readonly logger = new Logger(BatchApproveHandler.name);

  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    private readonly scoring: ReviewScoring,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(command: BatchApproveCommand): Promise<BatchApproveResult> {
    const result: BatchApproveResult = { approved: 0, skipped: [] };

    // One at a time, saved and published before the next is touched. A batch that failed
    // half way must leave the submissions it already decided decided — the learners have
    // been told, and there is no undo on the screen either.
    for (const id of command.attemptIds) {
      const reason = await this.approveOne(id, command);
      if (reason === null) {
        result.approved += 1;
      } else {
        result.skipped.push({ id, reason });
      }
    }

    return result;
  }

  /** `null` when it was approved; otherwise why it was not. */
  private async approveOne(
    id: string,
    command: BatchApproveCommand,
  ): Promise<BatchSkipReason | null> {
    const attempt = await this.attempts.findById(id);
    // Another school's submission is answered exactly as a missing one, for the reason
    // the single read gives (44.7): a caller with no business here does not get to learn
    // that the attempt exists.
    if (!attempt || attempt.schoolId !== command.schoolId) return 'not_found';

    if (attempt.deliveredVerdict() !== null) return 'already_reviewed';
    if (attempt.status !== 'ROUTED_FOR_REVIEW') return 'not_pending';

    const autoResult = await this.scoring.autoOutcomes(attempt);
    if (autoResult.isFail) {
      this.logger.warn(
        `Batch approve skipped attempt ${id}: exercise unavailable (${autoResult.error.message})`,
      );
      return 'unavailable';
    }

    if (!isMachineClean(autoResult.value)) return 'not_clean';

    const { approvedItems, totalItems, score } = this.scoring.scoreOf(autoResult.value, []);

    const reviewed = attempt.review({
      reviewerId: command.reviewerId,
      outcome: 'approved',
      decisions: [],
      comment: null,
      score,
      passed: true,
      approvedItems,
      totalItems,
    });
    // The status was checked a line ago and nothing else can refuse an approval with a
    // score the server computed; if the domain still says no, the submission is left
    // untouched rather than reported as marked.
    if (reviewed.isFail) return 'not_pending';

    await this.attempts.save(attempt);
    await publishAttemptEvents(this.publisher, attempt);
    return null;
  }
}
