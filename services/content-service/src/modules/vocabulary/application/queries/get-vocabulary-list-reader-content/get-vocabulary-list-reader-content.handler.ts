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
import { GetPersonalWordsForListQuery } from '../../../../personal-vocabulary/application/queries/get-personal-words-for-list/get-personal-words-for-list.query.js';

// Matches BatchGetVocabularyItemsForDisplayHandler's own cap — a lesson-embedded
// vocabulary list is expected to stay well under this in practice.
const MAX_LIST_ITEMS = 200;

/** `personal` marks a word the reader added themselves rather than one of the list's. */
export type VocabularyListReaderItem = VocabularyItemDisplayResult & { personal?: boolean };

export interface VocabularyListReaderContent {
  id: string;
  title: string;
  items: VocabularyListReaderItem[];
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

    const listItems = await this.display(itemIds, query);
    if (listItems.isFail) return Result.fail(listItems.error);
    const items: VocabularyListReaderItem[] = listItems.value;

    if (query.userId !== undefined) {
      const own = new Set(itemIds);
      const personalIds = (
        await this.queryBus.execute<GetPersonalWordsForListQuery, string[]>(
          new GetPersonalWordsForListQuery(query.userId, query.listId),
        )
      )
        // A catalogue word of this very list is already in it.
        .filter((id) => !own.has(id))
        .slice(0, MAX_LIST_ITEMS);
      const personal = await this.display(personalIds, query);
      if (personal.isFail) return Result.fail(personal.error);
      items.push(...personal.value.map((item) => ({ ...item, personal: true })));
    }

    return Result.ok({ id: list.id, title: list.title, items });
  }

  // Delegates translation-fallback resolution and caching to the same handler the
  // single/batch display endpoints use — avoids duplicating that logic here.
  private async display(
    itemIds: string[],
    query: GetVocabularyListReaderContentQuery,
  ): Promise<Result<VocabularyItemDisplayResult[], VocabularyDomainError>> {
    if (itemIds.length === 0) return Result.ok([]);
    return this.queryBus.execute<
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
  }
}
