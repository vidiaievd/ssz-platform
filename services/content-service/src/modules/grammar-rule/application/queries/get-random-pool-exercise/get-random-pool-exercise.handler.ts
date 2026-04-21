import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetRandomPoolExerciseQuery } from './get-random-pool-exercise.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { ExerciseEntity } from '../../../../exercise/domain/entities/exercise.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import type { IGrammarRuleExercisePoolRepository } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import { WeightedRandomSelectorService } from '../../../domain/services/weighted-random-selector.service.js';

@QueryHandler(GetRandomPoolExerciseQuery)
export class GetRandomPoolExerciseHandler implements IQueryHandler<
  GetRandomPoolExerciseQuery,
  Result<ExerciseEntity, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY)
    private readonly poolRepo: IGrammarRuleExercisePoolRepository,
  ) {}

  async execute(
    query: GetRandomPoolExerciseQuery,
  ): Promise<Result<ExerciseEntity, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(query.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }

    // Fetches entries joined with their (non-deleted) exercises in one query.
    const poolWithExercises = await this.poolRepo.findByRuleIdWithExercises(query.ruleId);

    const selectedId = WeightedRandomSelectorService.selectWeightedRandom(
      poolWithExercises.map(({ entry }) => ({
        exerciseId: entry.exerciseId,
        weight: entry.weight,
      })),
      query.excludeExerciseIds,
    );

    if (!selectedId) {
      return Result.fail(GrammarRuleDomainError.NO_EXERCISES_AVAILABLE);
    }

    const hit = poolWithExercises.find(({ entry }) => entry.exerciseId === selectedId)!;

    return Result.ok(hit.exercise);
  }
}
