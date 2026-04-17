import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRuleExplanationsQuery } from './get-grammar-rule-explanations.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';

@QueryHandler(GetGrammarRuleExplanationsQuery)
export class GetGrammarRuleExplanationsHandler implements IQueryHandler<
  GetGrammarRuleExplanationsQuery,
  Result<GrammarRuleExplanationEntity[], GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
  ) {}

  async execute(
    query: GetGrammarRuleExplanationsQuery,
  ): Promise<Result<GrammarRuleExplanationEntity[], GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(query.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }
    const explanations = await this.explanationRepo.findByRuleId(query.ruleId, query.onlyPublished);
    return Result.ok(explanations);
  }
}
