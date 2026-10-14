import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PERSONAL_VOCABULARY_READER,
  type IPersonalVocabularyReader,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { GetPersonalWordsForListQuery } from './get-personal-words-for-list.query.js';

/** Vocabulary item ids, oldest word first. */
@QueryHandler(GetPersonalWordsForListQuery)
export class GetPersonalWordsForListHandler implements IQueryHandler<
  GetPersonalWordsForListQuery,
  string[]
> {
  constructor(
    @Inject(PERSONAL_VOCABULARY_READER)
    private readonly reader: IPersonalVocabularyReader,
  ) {}

  execute(query: GetPersonalWordsForListQuery): Promise<string[]> {
    return this.reader.listItemIdsForModuleList(query.userId, query.vocabularyListId);
  }
}
