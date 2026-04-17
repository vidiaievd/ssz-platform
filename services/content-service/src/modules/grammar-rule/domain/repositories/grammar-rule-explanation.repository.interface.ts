import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { GrammarRuleExplanationEntity } from '../entities/grammar-rule-explanation.entity.js';

export const GRAMMAR_RULE_EXPLANATION_REPOSITORY = Symbol('GRAMMAR_RULE_EXPLANATION_REPOSITORY');

export interface IGrammarRuleExplanationRepository {
  findById(id: string): Promise<GrammarRuleExplanationEntity | null>;

  /**
   * Returns all explanations for a rule.
   * Pass onlyPublished = true to filter to status = 'published' and deletedAt IS NULL.
   */
  findByRuleId(ruleId: string, onlyPublished?: boolean): Promise<GrammarRuleExplanationEntity[]>;

  /** Looks up by the composite unique key (ruleId, language, minLevel, maxLevel). */
  findByCompositeKey(
    ruleId: string,
    explanationLanguage: string,
    minLevel: DifficultyLevel,
    maxLevel: DifficultyLevel,
  ): Promise<GrammarRuleExplanationEntity | null>;

  save(entity: GrammarRuleExplanationEntity): Promise<GrammarRuleExplanationEntity>;

  /** Hard-deletes a single explanation row. */
  delete(id: string): Promise<void>;

  /**
   * Sets deletedAt = now() for all non-deleted explanations of a rule.
   * Called when the parent grammar rule is soft-deleted.
   */
  softDeleteByRuleId(ruleId: string): Promise<void>;
}
