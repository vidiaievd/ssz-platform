import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVocabularyListsQuery } from './get-vocabulary-lists.query.js';
import { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';

@QueryHandler(GetVocabularyListsQuery)
export class GetVocabularyListsHandler implements IQueryHandler<
  GetVocabularyListsQuery,
  PaginatedResult<VocabularyListEntity>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
  ) {}

  async execute(query: GetVocabularyListsQuery): Promise<PaginatedResult<VocabularyListEntity>> {
    return this.listRepo.findAll(query.filter);
  }
}
