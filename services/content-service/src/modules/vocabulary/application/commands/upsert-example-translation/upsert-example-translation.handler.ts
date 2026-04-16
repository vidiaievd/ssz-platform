import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpsertExampleTranslationCommand } from './upsert-example-translation.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyExampleTranslationEntity } from '../../../domain/entities/vocabulary-example-translation.entity.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_USAGE_EXAMPLE_REPOSITORY } from '../../../domain/repositories/vocabulary-usage-example.repository.interface.js';
import type { IVocabularyUsageExampleRepository } from '../../../domain/repositories/vocabulary-usage-example.repository.interface.js';
import { VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY } from '../../../domain/repositories/vocabulary-example-translation.repository.interface.js';
import type { IVocabularyExampleTranslationRepository } from '../../../domain/repositories/vocabulary-example-translation.repository.interface.js';
import { VocabularyItemUpdatedEvent } from '../../../domain/events/vocabulary-item-updated.event.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

export interface UpsertExampleTranslationResult {
  translationId: string;
}

@CommandHandler(UpsertExampleTranslationCommand)
export class UpsertExampleTranslationHandler implements ICommandHandler<
  UpsertExampleTranslationCommand,
  Result<UpsertExampleTranslationResult, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    @Inject(VOCABULARY_USAGE_EXAMPLE_REPOSITORY)
    private readonly exampleRepo: IVocabularyUsageExampleRepository,
    @Inject(VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY)
    private readonly exTranslationRepo: IVocabularyExampleTranslationRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly cacheService: VocabularyDisplayCacheService,
  ) {}

  async execute(
    command: UpsertExampleTranslationCommand,
  ): Promise<Result<UpsertExampleTranslationResult, VocabularyDomainError>> {
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

    const example = await this.exampleRepo.findById(command.exampleId);
    if (!example) {
      return Result.fail(VocabularyDomainError.USAGE_EXAMPLE_NOT_FOUND);
    }

    if (example.vocabularyItemId !== command.itemId) {
      return Result.fail(VocabularyDomainError.USAGE_EXAMPLE_NOT_FOUND);
    }

    if (command.translatedText.trim().length === 0) {
      return Result.fail(VocabularyDomainError.EMPTY_EXAMPLE_TEXT);
    }

    const translationEntity = VocabularyExampleTranslationEntity.create({
      vocabularyUsageExampleId: command.exampleId,
      translationLanguage: command.translationLanguage,
      translatedText: command.translatedText,
    });

    const saved = await this.exTranslationRepo.upsert(translationEntity);

    const event = new VocabularyItemUpdatedEvent({
      itemId: command.itemId,
      listId: item.vocabularyListId,
      updatedFields: ['exampleTranslations'],
    });
    await this.eventPublisher.publish(event.eventType, event);

    await this.cacheService.invalidateItem(command.itemId);

    return Result.ok({ translationId: saved.id });
  }
}
