import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import {
  AttemptAiDraft,
  draftRefusal,
  type DraftRefusal,
} from '../../../domain/entities/attempt-ai-draft.entity.js';
import {
  ATTEMPT_AI_DRAFT_REPOSITORY,
  type IAttemptAiDraftRepository,
} from '../../../domain/repositories/attempt-ai-draft.repository.js';
import { PutAiDraftCommand } from './put-ai-draft.command.js';

export type PutAiDraftError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: DraftRefusal }
  /** The `aiCallId` already holds a draft of another attempt or capability. */
  | { code: 'AI_CALL_ID_REUSED' };

/**
 * ai-service leaves its draft on a submission (plan 79, step 1.2).
 *
 * Idempotent on `aiCallId`: the same call written twice — a redelivered event, a retried
 * request — answers with the draft already there and changes nothing. A different call on
 * the same attempt replaces a draft nobody has acted on.
 */
@CommandHandler(PutAiDraftCommand)
export class PutAiDraftHandler implements ICommandHandler<PutAiDraftCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ATTEMPT_AI_DRAFT_REPOSITORY) private readonly drafts: IAttemptAiDraftRepository,
  ) {}

  async execute(command: PutAiDraftCommand): Promise<Result<AttemptAiDraft, PutAiDraftError>> {
    const replay = await this.replayOf(command);
    if (replay) return replay;

    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });

    const refusal = draftRefusal(attempt, command.capability);
    if (refusal) return Result.fail({ code: refusal });

    const now = new Date();
    const existing = await this.drafts.findByAttempt(command.attemptId, command.capability);
    let draft: AttemptAiDraft;
    if (existing) {
      const decided = existing.replaceWith(command.draft, now);
      if (decided) return Result.fail({ code: decided });
      draft = existing;
    } else {
      draft = AttemptAiDraft.propose(command.attemptId, command.capability, command.draft, now);
    }

    if ((await this.drafts.save(draft)) === 'conflict') {
      // A twin of this write landed first: answer as its replay would.
      const raced = await this.replayOf(command);
      if (raced) return raced;
      return Result.fail({ code: 'DRAFT_DECIDED' });
    }
    return Result.ok(draft);
  }

  private async replayOf(command: PutAiDraftCommand): Promise<Result<AttemptAiDraft, PutAiDraftError> | null> {
    const stored = await this.drafts.findByAiCallId(command.draft.aiCallId);
    if (!stored) return null;
    if (stored.attemptId !== command.attemptId || stored.capability !== command.capability) {
      return Result.fail({ code: 'AI_CALL_ID_REUSED' });
    }
    return Result.ok(stored);
  }
}
