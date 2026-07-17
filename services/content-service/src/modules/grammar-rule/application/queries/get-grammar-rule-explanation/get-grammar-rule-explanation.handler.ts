import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGrammarRuleExplanationQuery } from './get-grammar-rule-explanation.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GrammarRuleCompareExampleEntity } from '../../../domain/entities/grammar-rule-compare-example.entity.js';
import { GrammarRuleQuickCheckEntity } from '../../../domain/entities/grammar-rule-quick-check.entity.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import type { IGrammarRuleCompareExampleRepository } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import { GRAMMAR_RULE_QUICK_CHECK_REPOSITORY } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import type { IGrammarRuleQuickCheckRepository } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';

export interface GrammarRuleExplanationWithComposite {
  explanation: GrammarRuleExplanationEntity;
  compareExamples: GrammarRuleCompareExampleEntity[];
  quickCheck: GrammarRuleQuickCheckEntity | null;
}

@QueryHandler(GetGrammarRuleExplanationQuery)
export class GetGrammarRuleExplanationHandler implements IQueryHandler<
  GetGrammarRuleExplanationQuery,
  Result<GrammarRuleExplanationWithComposite, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
    @Inject(GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY)
    private readonly compareExampleRepo: IGrammarRuleCompareExampleRepository,
    @Inject(GRAMMAR_RULE_QUICK_CHECK_REPOSITORY)
    private readonly quickCheckRepo: IGrammarRuleQuickCheckRepository,
  ) {}

  async execute(
    query: GetGrammarRuleExplanationQuery,
  ): Promise<Result<GrammarRuleExplanationWithComposite, GrammarRuleDomainError>> {
    const explanation = await this.explanationRepo.findById(query.explanationId);
    if (
      !explanation ||
      explanation.grammarRuleId !== query.ruleId ||
      explanation.deletedAt !== null
    ) {
      return Result.fail(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    }

    const [compareExamples, quickCheck] = await Promise.all([
      this.compareExampleRepo.findByExplanationId(explanation.id),
      this.quickCheckRepo.findByExplanationId(explanation.id),
    ]);

    return Result.ok({ explanation, compareExamples, quickCheck });
  }
}
