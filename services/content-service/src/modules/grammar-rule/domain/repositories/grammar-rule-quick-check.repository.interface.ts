import { GrammarRuleQuickCheckEntity } from '../entities/grammar-rule-quick-check.entity.js';

export const GRAMMAR_RULE_QUICK_CHECK_REPOSITORY = Symbol('GRAMMAR_RULE_QUICK_CHECK_REPOSITORY');

export interface IGrammarRuleQuickCheckRepository {
  findByExplanationId(explanationId: string): Promise<GrammarRuleQuickCheckEntity | null>;
  /**
   * Upserts the single quick-check row for an explanation, or clears it
   * (deletes the row) when `entity` is null.
   */
  upsertForExplanation(
    explanationId: string,
    entity: GrammarRuleQuickCheckEntity | null,
  ): Promise<GrammarRuleQuickCheckEntity | null>;
}
