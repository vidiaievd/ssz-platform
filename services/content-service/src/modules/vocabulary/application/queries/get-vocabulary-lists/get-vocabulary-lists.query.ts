import { VocabularyListFilter } from '../../../domain/repositories/vocabulary-list.repository.interface.js';

export class GetVocabularyListsQuery {
  constructor(public readonly filter: VocabularyListFilter) {}
}
