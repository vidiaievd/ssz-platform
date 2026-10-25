import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { publishAttemptEvents } from '../../../../attempts/application/services/review-verdict.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { ATTEMPT_AI_REVIEWED, aiReviewedPayload } from '../../../domain/events/ai-review-events.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { AcceptAiVerdictsAtTermCommand } from './accept-ai-verdicts-at-term.command.js';

export interface AcceptAiVerdictsAtTermResult {
  /** Closed by the model's verdict in this pass. */
  accepted: number;
  /**
   * Left for a later pass: a teacher has the card open (their claim holds it until it
   * lapses), or their verdict landed between the read and the write.
   */
  skipped: number;
}

/**
 * The school's term ran out and no teacher answered: the model's provisional verdict counts
 * (plan 80, step 4, R2). What the learner has been reading becomes the verdict on the work —
 * progress hears it, memory rates it once, as a model's evidence, dated by the hand-in.
 *
 * A teacher looking at the work right now keeps it: an open review card is someone about to
 * answer, and pulling the work out from under them would throw their verdict away. The write
 * itself goes through only while the work is still in review, so a teacher's verdict that
 * lands first wins and nothing is published twice.
 *
 * `exercise.attempt.ai_reviewed` follows, as for any model verdict that closes work: it is
 * the count a dispute rate is read against.
 */
@CommandHandler(AcceptAiVerdictsAtTermCommand)
export class AcceptAiVerdictsAtTermHandler implements ICommandHandler<AcceptAiVerdictsAtTermCommand> {
  private readonly logger = new Logger(AcceptAiVerdictsAtTermHandler.name);

  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(command: AcceptAiVerdictsAtTermCommand): Promise<AcceptAiVerdictsAtTermResult> {
    const { now } = command;
    const ids = await this.attempts.findDueAiVerdictIds(now, command.limit);
    let accepted = 0;
    let skipped = 0;

    for (const id of ids) {
      const attempt = await this.attempts.findById(id);
      if (attempt === null) continue;
      if (attempt.activeReviewLock(now) !== null) {
        skipped++;
        continue;
      }

      const delivered = attempt.acceptAiVerdictAtTerm(now);
      if (delivered.isFail) {
        // The row matched the query but not the attempt's own rules — a verdict that no
        // longer validates. Left for a teacher, and said out loud.
        this.logger.warn(`Attempt ${id}: model verdict not accepted at term — ${delivered.error.message}`);
        skipped++;
        continue;
      }
      if (!(await this.attempts.saveIfInReview(attempt))) {
        skipped++;
        continue;
      }

      await publishAttemptEvents(this.publisher, attempt);
      const review = await this.drafts.findByAttempt(id, 'review_direct');
      if (review !== null) {
        await this.publisher.publish(ATTEMPT_AI_REVIEWED, aiReviewedPayload(attempt, review, now));
      }
      accepted++;
    }

    if (accepted > 0 || skipped > 0) {
      this.logger.log(`Model verdicts accepted at term: ${accepted}, left for later: ${skipped}`);
    }
    return { accepted, skipped };
  }
}
