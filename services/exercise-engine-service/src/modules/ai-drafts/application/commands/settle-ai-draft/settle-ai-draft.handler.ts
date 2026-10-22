import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import type { SettledOutcomes } from '../../../domain/draft-outcomes.js';
import { SettleAiDraftCommand } from './settle-ai-draft.command.js';

/**
 * Labels a draft with what the verdict made of it: its status and, remark by remark,
 * whether it was taken, reworded, thrown out or left alone. What the model offered stays
 * as it was — the pair is what plan 79 §1.6 compares models on.
 *
 * Run after the verdict is stored and never in its way: a draft left `ready` costs one
 * labelled example, a verdict refused over it would cost the teacher their work. Answers
 * `null` when there was nothing to settle (no draft, or a failed one).
 */
@CommandHandler(SettleAiDraftCommand)
export class SettleAiDraftHandler implements ICommandHandler<SettleAiDraftCommand> {
  private readonly logger = new Logger(SettleAiDraftHandler.name);

  constructor(
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
  ) {}

  async execute(command: SettleAiDraftCommand): Promise<SettledOutcomes | null> {
    const draft = await this.drafts.findByAttempt(command.attemptId, command.capability);
    if (draft === null) return null;

    const settled = draft.settle(command.outcomes, new Date());
    if (settled === null) return null;

    // A conflict here is a rerun's write racing the verdict; the verdict has been given and
    // the rerun's draft is the one left unlabelled. Nothing to retry.
    if ((await this.drafts.save(draft)) === 'conflict') {
      this.logger.warn(`AI draft on attempt ${command.attemptId} changed under the verdict; left unsettled`);
      return null;
    }
    return settled;
  }
}
