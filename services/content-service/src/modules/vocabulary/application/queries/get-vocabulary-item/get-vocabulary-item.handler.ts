import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVocabularyItemQuery } from './get-vocabulary-item.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';

/**
 * Authoring endpoint — returns the full item with all translations and usage examples.
 * Not cached; intended for content editors, not student-facing display.
 */
@QueryHandler(GetVocabularyItemQuery)
export class GetVocabularyItemHandler implements IQueryHandler<
  GetVocabularyItemQuery,
  Result<VocabularyItemEntity, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
  ) {}

  async execute(
    query: GetVocabularyItemQuery,
  ): Promise<Result<VocabularyItemEntity, VocabularyDomainError>> {
    const item = await this.itemRepo.findById(query.itemId, true);

    if (!item || item.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.ITEM_NOT_FOUND);
    }

    return Result.ok(item);
  }
}
