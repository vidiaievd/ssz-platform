import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PERSONAL_VOCABULARY_READER,
  type IPersonalVocabularyReader,
  type PersonalWordView,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { ListMyWordsQuery } from './list-my-words.query.js';

/** The student's dictionary, newest first. «Pending» is a word with no translation yet. */
@QueryHandler(ListMyWordsQuery)
export class ListMyWordsHandler implements IQueryHandler<ListMyWordsQuery, PersonalWordView[]> {
  constructor(
    @Inject(PERSONAL_VOCABULARY_READER)
    private readonly reader: IPersonalVocabularyReader,
  ) {}

  async execute(query: ListMyWordsQuery): Promise<PersonalWordView[]> {
    const words = await this.reader.listWords(query.userId, {
      translationLanguage: query.translationLanguage,
      targetLanguage: query.targetLanguage,
    });
    if (query.status === undefined) return words;
    const wantTranslated = query.status === 'resolved';
    return words.filter((w) => (w.translation !== null) === wantTranslated);
  }
}
