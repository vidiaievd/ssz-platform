import { VocabularyUsageExampleEntity } from '../entities/vocabulary-usage-example.entity.js';

export const VOCABULARY_USAGE_EXAMPLE_REPOSITORY = Symbol('VOCABULARY_USAGE_EXAMPLE_REPOSITORY');

export interface IVocabularyUsageExampleRepository {
  findById(id: string): Promise<VocabularyUsageExampleEntity | null>;
  findByItemId(itemId: string): Promise<VocabularyUsageExampleEntity[]>;
  /**
   * Returns up to `limit` examples per item, chosen randomly within each item.
   * Implementation: fetch all examples for the given item IDs and randomise in Node.
   * Acceptable at current scale. Document as a candidate for Postgres-side randomisation
   * (ORDER BY random() with a lateral join) if examples-per-item grows large.
   */
  findRandomForItems(
    itemIds: string[],
    limit: number,
  ): Promise<Map<string, VocabularyUsageExampleEntity[]>>;
  save(entity: VocabularyUsageExampleEntity): Promise<VocabularyUsageExampleEntity>;
  delete(id: string): Promise<void>;
  getMaxPosition(itemId: string): Promise<number>;
}
