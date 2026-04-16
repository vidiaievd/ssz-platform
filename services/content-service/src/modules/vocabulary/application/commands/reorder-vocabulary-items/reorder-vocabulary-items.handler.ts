import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReorderVocabularyItemsCommand } from './reorder-vocabulary-items.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

@CommandHandler(ReorderVocabularyItemsCommand)
export class ReorderVocabularyItemsHandler implements ICommandHandler<
  ReorderVocabularyItemsCommand,
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
    command: ReorderVocabularyItemsCommand,
  ): Promise<Result<void, VocabularyDomainError>> {
    const list = await this.listRepo.findById(command.listId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Fetch all non-deleted items for this list.
    const allItemsResult = await this.itemRepo.findByListId(command.listId, {
      page: 1,
      limit: 100000,
    });
    const existingItems = allItemsResult.items;

    // Input must cover exactly all existing items — no missing, no extras.
    if (command.items.length !== existingItems.length) {
      return Result.fail(VocabularyDomainError.INVALID_REORDER_INPUT);
    }

    const existingIds = new Set(existingItems.map((i) => i.id));
    for (const inputItem of command.items) {
      if (!existingIds.has(inputItem.id)) {
        return Result.fail(VocabularyDomainError.INVALID_REORDER_INPUT);
      }
    }

    // Positions must form a continuous 0..N-1 range with no duplicates.
    const n = command.items.length;
    const positions = command.items.map((i) => i.position).sort((a, b) => a - b);
    for (let i = 0; i < n; i++) {
      if (positions[i] !== i) {
        return Result.fail(VocabularyDomainError.INVALID_REORDER_INPUT);
      }
    }

    await this.itemRepo.reorder(command.listId, command.items);

    // Invalidate display cache for all affected items.
    await this.cacheService.invalidateList(
      command.listId,
      command.items.map((i) => i.id),
    );

    return Result.ok();
  }
}
