import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { AbandonAttemptCommand } from './abandon-attempt.command.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';

export type AbandonAttemptError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | AttemptDomainError;

@CommandHandler(AbandonAttemptCommand)
export class AbandonAttemptHandler implements ICommandHandler<AbandonAttemptCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
  ) {}

  async execute(
    command: AbandonAttemptCommand,
  ): Promise<Result<void, AbandonAttemptError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }

    const abandonResult = attempt.abandon();
    if (abandonResult.isFail) {
      return Result.fail(abandonResult.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);
    return Result.ok();
  }
}
