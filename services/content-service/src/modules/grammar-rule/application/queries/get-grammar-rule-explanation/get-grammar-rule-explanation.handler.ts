import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRuleExplanationQuery } from './get-grammar-rule-explanation.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';

@QueryHandler(GetGrammarRuleExplanationQuery)
export class GetGrammarRuleExplanationHandler implements IQueryHandler<
  GetGrammarRuleExplanationQuery,
  Result<GrammarRuleExplanationEntity, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
  ) {}

  async execute(
    query: GetGrammarRuleExplanationQuery,
  ): Promise<Result<GrammarRuleExplanationEntity, GrammarRuleDomainError>> {
    const explanation = await this.explanationRepo.findById(query.explanationId);
    if (
      !explanation ||
      explanation.grammarRuleId !== query.ruleId ||
      explanation.deletedAt !== null
    ) {
      return Result.fail(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    }
    return Result.ok(explanation);
  }
}
