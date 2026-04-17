import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RemovePoolEntryCommand } from './remove-pool-entry.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import type { IGrammarRuleExercisePoolRepository } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';

@CommandHandler(RemovePoolEntryCommand)
export class RemovePoolEntryHandler implements ICommandHandler<
  RemovePoolEntryCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY)
    private readonly poolRepo: IGrammarRuleExercisePoolRepository,
  ) {}

  async execute(command: RemovePoolEntryCommand): Promise<Result<void, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const entry = await this.poolRepo.findEntry(command.ruleId, command.exerciseId);
    if (!entry) {
      return Result.fail(GrammarRuleDomainError.POOL_ENTRY_NOT_FOUND);
    }

    await this.poolRepo.delete(command.ruleId, command.exerciseId);

    return Result.ok();
  }
}
