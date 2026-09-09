import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SaveDraftCommand } from './save-draft.command.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';

export type SaveDraftError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | AttemptDomainError;

export interface SaveDraftResult {
  savedAt: Date;
}

/**
 * Keeps the unfinished work, so that a closed tab, a dead battery or a reload does not
 * cost a student the text they were writing.
 *
 * Deliberately the thinnest handler here. It does not validate the draft, does not run
 * the analysis engine over it, and publishes no event: everything it might usefully do
 * is a reason for the save to fail, and a failed save is the whole problem. The work is
 * written down exactly as it arrived, and reading it back is `GET /attempts/:id`.
 */
@CommandHandler(SaveDraftCommand)
export class SaveDraftHandler implements ICommandHandler<SaveDraftCommand> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(command: SaveDraftCommand): Promise<Result<SaveDraftResult, SaveDraftError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }

    const saved = attempt.saveDraft(command.draftAnswer);
    if (saved.isFail) {
      return Result.fail(saved.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);
    return Result.ok({ savedAt: attempt.draftSavedAt as Date });
  }
}
