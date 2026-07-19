import { GrammarRuleCompareExampleEntity } from '../entities/grammar-rule-compare-example.entity.js';

export const GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY = Symbol(
  'GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY',
);

export interface IGrammarRuleCompareExampleRepository {
  findByExplanationId(explanationId: string): Promise<GrammarRuleCompareExampleEntity[]>;
  /**
   * Atomically replaces all compare examples for an explanation.
   * Runs delete + createMany in a single transaction, mirroring
   * ILessonVideoCueRepository.replaceForVariant.
   */
  replaceForExplanation(
    explanationId: string,
    examples: GrammarRuleCompareExampleEntity[],
  ): Promise<void>;
}
