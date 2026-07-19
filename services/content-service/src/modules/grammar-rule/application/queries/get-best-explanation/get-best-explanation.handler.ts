import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetBestExplanationQuery } from './get-best-explanation.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GrammarRuleCompareExampleEntity } from '../../../domain/entities/grammar-rule-compare-example.entity.js';
import { GrammarRuleQuickCheckEntity } from '../../../domain/entities/grammar-rule-quick-check.entity.js';
import { GRAMMAR_RULE_REPOSITORY } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import type { IGrammarRuleCompareExampleRepository } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import { GRAMMAR_RULE_QUICK_CHECK_REPOSITORY } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import type { IGrammarRuleQuickCheckRepository } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import { BestVariantSelectorService } from '../../../../lesson/domain/services/best-variant-selector.service.js';

export interface GetBestExplanationResult {
  explanation: GrammarRuleExplanationEntity;
  compareExamples: GrammarRuleCompareExampleEntity[];
  quickCheck: GrammarRuleQuickCheckEntity | null;
  fallbackUsed: boolean;
}

@QueryHandler(GetBestExplanationQuery)
export class GetBestExplanationHandler implements IQueryHandler<
  GetBestExplanationQuery,
  Result<GetBestExplanationResult, GrammarRuleDomainError>
> {
  constructor(
    @Inject(GRAMMAR_RULE_REPOSITORY)
    private readonly ruleRepo: IGrammarRuleRepository,
    @Inject(GRAMMAR_RULE_EXPLANATION_REPOSITORY)
    private readonly explanationRepo: IGrammarRuleExplanationRepository,
    @Inject(GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY)
    private readonly compareExampleRepo: IGrammarRuleCompareExampleRepository,
    @Inject(GRAMMAR_RULE_QUICK_CHECK_REPOSITORY)
    private readonly quickCheckRepo: IGrammarRuleQuickCheckRepository,
  ) {}

  async execute(
    query: GetBestExplanationQuery,
  ): Promise<Result<GetBestExplanationResult, GrammarRuleDomainError>> {
    const rule = await this.ruleRepo.findById(query.ruleId);
    if (!rule || rule.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
    }

    const published = await this.explanationRepo.findByRuleId(query.ruleId, true);

    // Adapt GrammarRuleExplanationEntity to the variant-selector's expected shape.
    // BestVariantSelectorService is generic over any object with
    // { explanationLanguage, minLevel, maxLevel } — the adapter bridges the types.
    const adapted = published.map((e) => ({
      ...e,
      explanationLanguage: e.explanationLanguage,
      minLevel: e.minLevel,
      maxLevel: e.maxLevel,
    }));

    const selected = BestVariantSelectorService.selectBestVariant({
      variants: adapted as never,
      studentNativeLanguage: query.studentNativeLanguage,
      studentCurrentLevel: query.studentCurrentLevel,
      studentKnownLanguages: query.studentKnownLanguages,
      targetLanguage: rule.targetLanguage,
    });

    if (!selected) {
      return Result.fail(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    }

    // Find the original entity by matching back through the published array.
    const explanation = published.find(
      (e) =>
        e.explanationLanguage === selected.variant.explanationLanguage &&
        e.minLevel === selected.variant.minLevel &&
        e.maxLevel === selected.variant.maxLevel,
    )!;

    const [compareExamples, quickCheck] = await Promise.all([
      this.compareExampleRepo.findByExplanationId(explanation.id),
      this.quickCheckRepo.findByExplanationId(explanation.id),
    ]);

    return Result.ok({
      explanation,
      compareExamples,
      quickCheck,
      fallbackUsed: selected.fallbackUsed,
    });
  }
}
