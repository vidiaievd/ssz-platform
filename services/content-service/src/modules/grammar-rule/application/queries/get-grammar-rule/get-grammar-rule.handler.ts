import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRuleQuery } from './get-grammar-rule.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';

@QueryHandler(GetGrammarRuleQuery)
export class GetGrammarRuleHandler implements IQueryHandler<
  GetGrammarRuleQuery,
  Result<GrammarRuleEntity, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
  ) {}

  async execute(
    query: GetGrammarRuleQuery,
  ): Promise<Result<GrammarRuleEntity, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(query.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    return Result.ok(rule);
  }
}
