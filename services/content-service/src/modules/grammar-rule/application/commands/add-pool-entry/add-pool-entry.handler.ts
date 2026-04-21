import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { AddPoolEntryCommand } from './add-pool-entry.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleExercisePoolEntry } from '../../../domain/entities/grammar-rule-exercise-pool-entry.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import type { IGrammarRuleExercisePoolRepository } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import { EXERCISE_REPOSITORY } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';

export interface AddPoolEntryResult {
  entryId: string;
}

@CommandHandler(AddPoolEntryCommand)
export class AddPoolEntryHandler implements ICommandHandler<
  AddPoolEntryCommand,
  Result<AddPoolEntryResult, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY)
    private readonly poolRepo: IGrammarRuleExercisePoolRepository,
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(
    command: AddPoolEntryCommand,
  ): Promise<Result<AddPoolEntryResult, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(command.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    if (rule.ownerUserId !== command.userId) {
      return Result.fail(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise) {
      return Result.fail(GrammarRuleDomainError.EXERCISE_NOT_FOUND_FOR_POOL);
    }
    if (exercise.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.EXERCISE_DELETED_FOR_POOL);
    }

    const existing = await this.poolRepo.findEntry(command.ruleId, command.exerciseId);
    if (existing) {
      return Result.fail(GrammarRuleDomainError.EXERCISE_ALREADY_IN_POOL);
    }

    const maxPosition = await this.poolRepo.getMaxPosition(command.ruleId);

    const entryResult = GrammarRuleExercisePoolEntry.create({
      grammarRuleId: command.ruleId,
      exerciseId: command.exerciseId,
      position: maxPosition + 1,
      weight: command.weight,
      addedByUserId: command.userId,
    });

    if (entryResult.isFail) {
      return Result.fail(entryResult.error);
    }

    const entry = await this.poolRepo.save(entryResult.value);

    return Result.ok({ entryId: entry.id });
  }
}
