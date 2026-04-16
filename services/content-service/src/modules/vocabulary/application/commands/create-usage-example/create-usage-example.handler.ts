import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateUsageExampleCommand } from './create-usage-example.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyUsageExampleEntity } from '../../../domain/entities/vocabulary-usage-example.entity.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_USAGE_EXAMPLE_REPOSITORY } from '../../../domain/repositories/vocabulary-usage-example.repository.interface.js';
import type { IVocabularyUsageExampleRepository } from '../../../domain/repositories/vocabulary-usage-example.repository.interface.js';
import { VocabularyItemUpdatedEvent } from '../../../domain/events/vocabulary-item-updated.event.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

export interface CreateUsageExampleResult {
  exampleId: string;
}

@CommandHandler(CreateUsageExampleCommand)
export class CreateUsageExampleHandler implements ICommandHandler<
  CreateUsageExampleCommand,
  Result<CreateUsageExampleResult, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    @Inject(VOCABULARY_USAGE_EXAMPLE_REPOSITORY)
    private readonly exampleRepo: IVocabularyUsageExampleRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly cacheService: VocabularyDisplayCacheService,
  ) {}

  async execute(
    command: CreateUsageExampleCommand,
  ): Promise<Result<CreateUsageExampleResult, VocabularyDomainError>> {
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

    if (command.exampleText.trim().length === 0) {
      return Result.fail(VocabularyDomainError.EMPTY_EXAMPLE_TEXT);
    }

    const position =
      command.position !== undefined
        ? command.position
        : (await this.exampleRepo.getMaxPosition(command.itemId)) + 1;

    const example = VocabularyUsageExampleEntity.create({
      vocabularyItemId: command.itemId,
      exampleText: command.exampleText,
      position,
      audioMediaId: command.audioMediaId,
      contextNote: command.contextNote,
    });

    const saved = await this.exampleRepo.save(example);

    const event = new VocabularyItemUpdatedEvent({
      itemId: command.itemId,
      listId: item.vocabularyListId,
      updatedFields: ['usageExamples'],
    });
    await this.eventPublisher.publish(event.eventType, event);

    await this.cacheService.invalidateItem(command.itemId);

    return Result.ok({ exampleId: saved.id });
  }
}
