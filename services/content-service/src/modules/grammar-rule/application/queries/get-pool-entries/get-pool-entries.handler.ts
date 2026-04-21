import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetPoolEntriesQuery } from './get-pool-entries.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import type {
  IGrammarRuleExercisePoolRepository,
  PoolEntryWithExercise,
} from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';

@QueryHandler(GetPoolEntriesQuery)
export class GetPoolEntriesHandler implements IQueryHandler<
  GetPoolEntriesQuery,
  Result<PoolEntryWithExercise[], GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY)
    private readonly poolRepo: IGrammarRuleExercisePoolRepository,
  ) {}

  async execute(
    query: GetPoolEntriesQuery,
  ): Promise<Result<PoolEntryWithExercise[], GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(query.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    const entries = await this.poolRepo.findByRuleIdWithExercises(query.ruleId);
    return Result.ok(entries);
  }
}
