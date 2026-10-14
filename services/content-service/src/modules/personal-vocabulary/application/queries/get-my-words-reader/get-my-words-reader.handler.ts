import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import type { VocabularyDomainError } from '../../../../vocabulary/domain/exceptions/vocabulary-domain.exceptions.js';
import type { VocabularyItemDisplayResult } from '../../../../vocabulary/application/dto/vocabulary-item-display-result.js';
import type { VocabularyListReaderContent } from '../../../../vocabulary/application/queries/get-vocabulary-list-reader-content/get-vocabulary-list-reader-content.handler.js';
import { BatchGetVocabularyItemsForDisplayQuery } from '../../../../vocabulary/application/queries/batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.query.js';
import {
  PERSONAL_VOCABULARY_READER,
  type IPersonalVocabularyReader,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { GetMyWordsReaderQuery } from './get-my-words-reader.query.js';

/** The display handler's own cap. */
const BATCH_SIZE = 200;

/**
 * «My words» in the exact shape of a vocabulary list's reader, so a client that imports
 * a list into a local deck imports this one with the same code (plan 75, phase 2).
 *
 * The id is not a list's: a student whose every word is a catalogue one has no personal
 * list at all. `personal:<language>` is stable per student and language, which is what a
 * deck keyed by list id needs. Words without a translation come back like any other —
 * the importer already leaves them out until one is written.
 */
@QueryHandler(GetMyWordsReaderQuery)
export class GetMyWordsReaderHandler implements IQueryHandler<
  GetMyWordsReaderQuery,
  Result<VocabularyListReaderContent, VocabularyDomainError>
> {
  constructor(
    @Inject(PERSONAL_VOCABULARY_READER)
    private readonly reader: IPersonalVocabularyReader,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(
    query: GetMyWordsReaderQuery,
  ): Promise<Result<VocabularyListReaderContent, VocabularyDomainError>> {
    const words = await this.reader.listWords(query.userId, {
      translationLanguage: query.translationLanguage,
      targetLanguage: query.targetLanguage,
    });
    // Oldest first, as a deck grows.
    const itemIds = words.map((w) => w.vocabularyItemId).reverse();

    const items: VocabularyItemDisplayResult[] = [];
    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batch = await this.queryBus.execute<
        BatchGetVocabularyItemsForDisplayQuery,
        Result<VocabularyItemDisplayResult[], VocabularyDomainError>
      >(
        new BatchGetVocabularyItemsForDisplayQuery(
          itemIds.slice(i, i + BATCH_SIZE),
          query.translationLanguage,
          query.includeExamples,
          query.examplesLimit,
          query.examplesRandom,
          query.studentKnownLanguages,
        ),
      );
      if (batch.isFail) return Result.fail(batch.error);
      items.push(...batch.value);
    }

    return Result.ok({
      id: `personal:${query.targetLanguage}`,
      title: 'My words',
      items,
    });
  }
}
