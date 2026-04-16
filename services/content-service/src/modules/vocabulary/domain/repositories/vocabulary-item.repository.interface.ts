import { VocabularyItemEntity } from '../entities/vocabulary-item.entity.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';

export const VOCABULARY_ITEM_REPOSITORY = Symbol('VOCABULARY_ITEM_REPOSITORY');

export interface IVocabularyItemRepository {
  findById(id: string, includeChildren?: boolean): Promise<VocabularyItemEntity | null>;
  findByListId(
    listId: string,
    options?: { page?: number; limit?: number; includeDeleted?: boolean },
  ): Promise<PaginatedResult<VocabularyItemEntity>>;
  findByIds(ids: string[], includeChildren?: boolean): Promise<VocabularyItemEntity[]>;
  save(entity: VocabularyItemEntity): Promise<VocabularyItemEntity>;
  saveBatch(entities: VocabularyItemEntity[]): Promise<VocabularyItemEntity[]>;
  softDelete(id: string): Promise<void>;
  getMaxPosition(listId: string): Promise<number>;
  /**
   * Atomically updates positions for all items in the list.
   * Uses a temporary +10000 offset strategy to avoid unique constraint violations
   * when two items swap positions within the same transaction.
   */
  reorder(listId: string, items: { id: string; position: number }[]): Promise<void>;
  wordExists(listId: string, word: string, excludeItemId?: string): Promise<boolean>;
  /** Bulk soft-deletes all non-deleted items in a list. Used when a list is soft-deleted. */
  softDeleteByListId(listId: string): Promise<void>;
}
