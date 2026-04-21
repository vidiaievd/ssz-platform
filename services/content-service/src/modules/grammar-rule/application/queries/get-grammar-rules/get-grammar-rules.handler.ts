import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRulesQuery } from './get-grammar-rules.query.js';
import { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';

@QueryHandler(GetGrammarRulesQuery)
export class GetGrammarRulesHandler implements IQueryHandler<
  GetGrammarRulesQuery,
  PaginatedResult<GrammarRuleEntity>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
  ) {}

  async execute(query: GetGrammarRulesQuery): Promise<PaginatedResult<GrammarRuleEntity>> {
    return this.ruleRepo.findAll(query.filter);
  }
}
