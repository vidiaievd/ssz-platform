import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVocabularyListItemsQuery } from './get-vocabulary-list-items.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';

@QueryHandler(GetVocabularyListItemsQuery)
export class GetVocabularyListItemsHandler implements IQueryHandler<
  GetVocabularyListItemsQuery,
  Result<PaginatedResult<VocabularyItemEntity>, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
  ) {}

  async execute(
    query: GetVocabularyListItemsQuery,
  ): Promise<Result<PaginatedResult<VocabularyItemEntity>, VocabularyDomainError>> {
    const list = await this.listRepo.findById(query.listId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    const paginated = await this.itemRepo.findByListId(query.listId, {
      page: query.page,
      limit: query.limit,
    });

    return Result.ok(paginated);
  }
}
