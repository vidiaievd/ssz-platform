import { VocabularyListEntity } from '../entities/vocabulary-list.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../container/domain/value-objects/visibility.vo.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';

export const VOCABULARY_LIST_REPOSITORY = Symbol('VOCABULARY_LIST_REPOSITORY');

export interface VocabularyListFilter {
  targetLanguage?: string;
  difficultyLevel?: DifficultyLevel;
  visibility?: Visibility;
  ownerUserId?: string;
  ownerSchoolId?: string;
  search?: string;
  page: number;
  limit: number;
  sort?: string;
  includeDeleted?: boolean;
}

export interface IVocabularyListRepository {
  findById(id: string): Promise<VocabularyListEntity | null>;
  findBySlug(slug: string): Promise<VocabularyListEntity | null>;
  findAll(filter: VocabularyListFilter): Promise<PaginatedResult<VocabularyListEntity>>;
  save(entity: VocabularyListEntity): Promise<VocabularyListEntity>;
  softDelete(id: string): Promise<void>;
  isSlugTaken(slug: string): Promise<boolean>;
  /**
   * Returns true if this vocabulary list is referenced by any container_item
   * whose parent container_version has status IN ('published', 'deprecated').
   *
   * Cross-module read within content_db: intentional — querying across tables
   * inside the same service is acceptable. item_type = 'vocabulary_list' filter applied.
   */
  hasPublishedContainerReferences(listId: string): Promise<boolean>;
}
