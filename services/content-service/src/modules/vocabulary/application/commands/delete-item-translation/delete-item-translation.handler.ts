import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteItemTranslationCommand } from './delete-item-translation.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_TRANSLATION_REPOSITORY } from '../../../domain/repositories/vocabulary-item-translation.repository.interface.js';
import type { IVocabularyItemTranslationRepository } from '../../../domain/repositories/vocabulary-item-translation.repository.interface.js';
import { VocabularyItemUpdatedEvent } from '../../../domain/events/vocabulary-item-updated.event.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

@CommandHandler(DeleteItemTranslationCommand)
export class DeleteItemTranslationHandler implements ICommandHandler<
  DeleteItemTranslationCommand,
  Result<void, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    @Inject(VOCABULARY_ITEM_TRANSLATION_REPOSITORY)
    private readonly translationRepo: IVocabularyItemTranslationRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly cacheService: VocabularyDisplayCacheService,
  ) {}

  async execute(
    command: DeleteItemTranslationCommand,
  ): Promise<Result<void, VocabularyDomainError>> {
    const item = await this.itemRepo.findById(command.itemId);
    if (!item || item.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.ITEM_NOT_FOUND);
    }

    const list = await this.listRepo.findById(item.vocabularyListId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const translation = await this.translationRepo.findByItemAndLanguage(
      command.itemId,
      command.translationLanguage,
    );
    if (!translation) {
      return Result.fail(VocabularyDomainError.TRANSLATION_NOT_FOUND);
    }

    await this.translationRepo.delete(translation.id);

    const event = new VocabularyItemUpdatedEvent({
      itemId: command.itemId,
      listId: item.vocabularyListId,
      updatedFields: ['translations'],
    });
    await this.eventPublisher.publish(event.eventType, event);

    await this.cacheService.invalidateItem(command.itemId);

    return Result.ok();
  }
}
