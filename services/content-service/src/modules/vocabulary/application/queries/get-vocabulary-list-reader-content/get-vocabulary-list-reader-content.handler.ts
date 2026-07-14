import { QueryHandler, QueryBus, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVocabularyListReaderContentQuery } from './get-vocabulary-list-reader-content.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { BatchGetVocabularyItemsForDisplayQuery } from '../batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.query.js';
import type { VocabularyItemDisplayResult } from '../../dto/vocabulary-item-display-result.js';

// Matches BatchGetVocabularyItemsForDisplayHandler's own cap — a lesson-embedded
// vocabulary list is expected to stay well under this in practice.
const MAX_LIST_ITEMS = 200;

export interface VocabularyListReaderContent {
  id: string;
  title: string;
  items: VocabularyItemDisplayResult[];
}

@QueryHandler(GetVocabularyListReaderContentQuery)
export class GetVocabularyListReaderContentHandler implements IQueryHandler<
  GetVocabularyListReaderContentQuery,
  Result<VocabularyListReaderContent, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(
    query: GetVocabularyListReaderContentQuery,
  ): Promise<Result<VocabularyListReaderContent, VocabularyDomainError>> {
    const list = await this.listRepo.findById(query.listId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    const paginated = await this.itemRepo.findByListId(query.listId, { limit: MAX_LIST_ITEMS });
    const itemIds = paginated.items.map((i) => i.id);

    if (itemIds.length === 0) {
      return Result.ok({ id: list.id, title: list.title, items: [] });
    }

    // Delegates translation-fallback resolution and caching to the same
    // handler the single/batch display endpoints use — avoids duplicating
    // that logic here.
    const displayResult = await this.queryBus.execute<
      BatchGetVocabularyItemsForDisplayQuery,
      Result<VocabularyItemDisplayResult[], VocabularyDomainError>
    >(
      new BatchGetVocabularyItemsForDisplayQuery(
        itemIds,
        query.translationLanguage,
        query.includeExamples,
        query.examplesLimit,
        query.examplesRandom,
        query.studentKnownLanguages,
      ),
    );

    if (displayResult.isFail) {
      return Result.fail(displayResult.error);
    }

    return Result.ok({ id: list.id, title: list.title, items: displayResult.value });
  }
}
