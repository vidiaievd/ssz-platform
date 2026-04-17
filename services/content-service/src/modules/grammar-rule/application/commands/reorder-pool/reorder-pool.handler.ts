import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReorderPoolCommand } from './reorder-pool.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import type { IGrammarRuleExercisePoolRepository } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';

@CommandHandler(ReorderPoolCommand)
export class ReorderPoolHandler implements ICommandHandler<
  ReorderPoolCommand,
  Result<void, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY)
    private readonly poolRepo: IGrammarRuleExercisePoolRepository,
  ) {}

  async execute(command: ReorderPoolCommand): Promise<Result<void, GrammarRuleDomainError>> {
    if (command.items.length === 0) {
      return Result.fail(GrammarRuleDomainError.INVALID_REORDER_INPUT);
    }

    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Validate all referenced entries exist in this rule's pool.
    const existing = await this.poolRepo.findByRuleId(command.ruleId);
    const existingIds = new Set(existing.map((e) => e.exerciseId));
    for (const item of command.items) {
      if (!existingIds.has(item.exerciseId)) {
        return Result.fail(GrammarRuleDomainError.POOL_ENTRY_NOT_FOUND);
      }
    }

    await this.poolRepo.reorder(command.ruleId, command.items);

    return Result.ok();
  }
}
