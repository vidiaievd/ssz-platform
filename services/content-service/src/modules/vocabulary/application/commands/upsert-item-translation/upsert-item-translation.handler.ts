import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpsertItemTranslationCommand } from './upsert-item-translation.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemTranslationEntity } from '../../../domain/entities/vocabulary-item-translation.entity.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_TRANSLATION_REPOSITORY } from '../../../domain/repositories/vocabulary-item-translation.repository.interface.js';
import type { IVocabularyItemTranslationRepository } from '../../../domain/repositories/vocabulary-item-translation.repository.interface.js';
import { VocabularyTranslationAddedEvent } from '../../../domain/events/vocabulary-translation-added.event.js';
import { VocabularyItemUpdatedEvent } from '../../../domain/events/vocabulary-item-updated.event.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

export interface UpsertItemTranslationResult {
  translationId: string;
  wasCreated: boolean;
}

@CommandHandler(UpsertItemTranslationCommand)
export class UpsertItemTranslationHandler implements ICommandHandler<
  UpsertItemTranslationCommand,
  Result<UpsertItemTranslationResult, VocabularyDomainError>
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
    command: UpsertItemTranslationCommand,
  ): Promise<Result<UpsertItemTranslationResult, VocabularyDomainError>> {
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

    if (command.primaryTranslation.trim().length === 0) {
      return Result.fail(VocabularyDomainError.EMPTY_TRANSLATION);
    }

    const translationEntity = VocabularyItemTranslationEntity.create({
      vocabularyItemId: command.itemId,
      translationLanguage: command.translationLanguage,
      primaryTranslation: command.primaryTranslation,
      alternativeTranslations: command.alternativeTranslations,
      definition: command.definition ?? undefined,
      usageNotes: command.usageNotes ?? undefined,
      falseFriendWarning: command.falseFriendWarning ?? undefined,
      createdByUserId: command.userId,
    });

    const { entity: saved, wasCreated } = await this.translationRepo.upsert(translationEntity);

    // Emit different event depending on whether this is a new translation language.
    if (wasCreated) {
      const event = new VocabularyTranslationAddedEvent({
        itemId: command.itemId,
        listId: item.vocabularyListId,
        translationLanguage: command.translationLanguage,
      });
      await this.eventPublisher.publish(event.eventType, event);
    } else {
      const event = new VocabularyItemUpdatedEvent({
        itemId: command.itemId,
        listId: item.vocabularyListId,
        updatedFields: ['translations'],
      });
      await this.eventPublisher.publish(event.eventType, event);
    }

    await this.cacheService.invalidateItem(command.itemId);

    return Result.ok({ translationId: saved.id, wasCreated });
  }
}
