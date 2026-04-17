import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../container/domain/value-objects/visibility.vo.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { GrammarRuleEntity } from '../entities/grammar-rule.entity.js';
import { GrammarTopic } from '../value-objects/grammar-topic.vo.js';

export const GRAMMAR_RULE_REPOSITORY = Symbol('GRAMMAR_RULE_REPOSITORY');

export interface GrammarRuleFilter {
  targetLanguage?: string;
  difficultyLevel?: DifficultyLevel;
  topic?: GrammarTopic;
  visibility?: Visibility;
  ownerUserId?: string;
  ownerSchoolId?: string;
  search?: string;
  page: number;
  limit: number;
  sort?: string;
  includeDeleted?: boolean;
}

export interface IGrammarRuleRepository {
  findById(id: string): Promise<GrammarRuleEntity | null>;

  findAll(filter: GrammarRuleFilter): Promise<PaginatedResult<GrammarRuleEntity>>;

  /** Upserts the entity and publishes its domain events. */
  save(entity: GrammarRuleEntity): Promise<GrammarRuleEntity>;

  softDelete(id: string): Promise<void>;

  /** Returns true if the slug is already taken by a non-deleted rule. */
  isSlugTaken(slug: string): Promise<boolean>;

  /**
   * Returns true if any container_item row references this grammar rule
   * with a version whose status is 'published' or 'deprecated'.
   */
  hasPublishedContainerReferences(ruleId: string): Promise<boolean>;

  /** Returns true if the rule has at least one published (non-deleted) explanation. */
  hasAnyPublishedExplanation(ruleId: string): Promise<boolean>;
}
