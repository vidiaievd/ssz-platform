import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteVocabularyListCommand } from './delete-vocabulary-list.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';

@CommandHandler(DeleteVocabularyListCommand)
export class DeleteVocabularyListHandler implements ICommandHandler<
  DeleteVocabularyListCommand,
  Result<void, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
  ) {}

  async execute(
    command: DeleteVocabularyListCommand,
  ): Promise<Result<void, VocabularyDomainError>> {
    const list = await this.listRepo.findById(command.listId);
    if (!list) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check via OrganizationService.
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const hasRefs = await this.listRepo.hasPublishedContainerReferences(command.listId);
    if (hasRefs) {
      return Result.fail(VocabularyDomainError.LIST_HAS_PUBLISHED_CONTAINER_REFERENCES);
    }

    const deleteResult = list.softDelete();
    if (deleteResult.isFail) {
      return Result.fail(deleteResult.error);
    }

    // Persist list soft-delete and publish VocabularyListDeletedEvent.
    await this.listRepo.save(list);

    // Cascade soft-delete to all non-deleted items in this list.
    // No per-item events are published — the list-level event is sufficient.
    await this.itemRepo.softDeleteByListId(command.listId);

    return Result.ok();
  }
}
