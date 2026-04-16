import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVocabularyListQuery } from './get-vocabulary-list.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';

@QueryHandler(GetVocabularyListQuery)
export class GetVocabularyListHandler implements IQueryHandler<
  GetVocabularyListQuery,
  Result<VocabularyListEntity, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
  ) {}

  async execute(
    query: GetVocabularyListQuery,
  ): Promise<Result<VocabularyListEntity, VocabularyDomainError>> {
    const list = await this.listRepo.findById(query.listId);

    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    return Result.ok(list);
  }
}
