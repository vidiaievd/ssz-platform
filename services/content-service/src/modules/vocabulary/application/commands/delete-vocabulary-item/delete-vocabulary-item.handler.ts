import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteVocabularyItemCommand } from './delete-vocabulary-item.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

@CommandHandler(DeleteVocabularyItemCommand)
export class DeleteVocabularyItemHandler implements ICommandHandler<
  DeleteVocabularyItemCommand,
  Result<void, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    private readonly cacheService: VocabularyDisplayCacheService,
  ) {}

  async execute(
    command: DeleteVocabularyItemCommand,
  ): Promise<Result<void, VocabularyDomainError>> {
    const list = await this.listRepo.findById(command.listId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const item = await this.itemRepo.findById(command.itemId);
    if (!item || item.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.ITEM_NOT_FOUND);
    }

    if (item.vocabularyListId !== command.listId) {
      return Result.fail(VocabularyDomainError.ITEM_NOT_FOUND);
    }

    const deleteResult = item.softDelete();
    if (deleteResult.isFail) {
      return Result.fail(deleteResult.error);
    }

    await this.itemRepo.save(item);
    await this.cacheService.invalidateItem(command.itemId);

    return Result.ok();
  }
}
