import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { BulkCreateVocabularyItemsCommand } from './bulk-create-vocabulary-items.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { GrammaticalPropertiesValidatorService } from '../../../domain/services/grammatical-properties-validator.service.js';

export interface BulkCreateVocabularyItemsResult {
  createdItemIds: string[];
}

const MAX_BULK_SIZE = 500;

@CommandHandler(BulkCreateVocabularyItemsCommand)
export class BulkCreateVocabularyItemsHandler implements ICommandHandler<
  BulkCreateVocabularyItemsCommand,
  Result<BulkCreateVocabularyItemsResult, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    private readonly grammarValidator: GrammaticalPropertiesValidatorService,
  ) {}

  async execute(
    command: BulkCreateVocabularyItemsCommand,
  ): Promise<Result<BulkCreateVocabularyItemsResult, VocabularyDomainError>> {
    if (command.items.length === 0 || command.items.length > MAX_BULK_SIZE) {
      return Result.fail(VocabularyDomainError.INVALID_BULK_INPUT);
    }

    const list = await this.listRepo.findById(command.listId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Validate grammaticalProperties for all items — collect all errors for better UX.
    const grammarErrors: { index: number; error: VocabularyDomainError }[] = [];
    for (let i = 0; i < command.items.length; i++) {
      const item = command.items[i];
      if (item.grammaticalProperties !== undefined) {
        const result = this.grammarValidator.validate(
          list.targetLanguage,
          item.grammaticalProperties,
        );
        if (result.isFail) {
          grammarErrors.push({ index: i, error: result.error });
        }
      }
    }
    if (grammarErrors.length > 0) {
      return Result.fail(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES);
    }

    // Check for duplicate words within the batch itself.
    const batchWords = command.items.map((i) => i.word.trim().toLowerCase());
    const uniqueBatchWords = new Set(batchWords);
    if (uniqueBatchWords.size !== batchWords.length) {
      return Result.fail(VocabularyDomainError.DUPLICATE_WORD_IN_LIST);
    }

    // Check duplicate words against existing items (single query).
    const existingResult = await this.itemRepo.findByListId(command.listId, {
      page: 1,
      limit: 100000,
    });
    const existingWords = new Set(existingResult.items.map((i) => i.word.trim().toLowerCase()));
    for (const word of batchWords) {
      if (existingWords.has(word)) {
        return Result.fail(VocabularyDomainError.DUPLICATE_WORD_IN_LIST);
      }
    }

    const startPosition = (await this.itemRepo.getMaxPosition(command.listId)) + 1;

    const entities: VocabularyItemEntity[] = [];
    for (let i = 0; i < command.items.length; i++) {
      const dto = command.items[i];
      const itemResult = VocabularyItemEntity.create({
        vocabularyListId: command.listId,
        word: dto.word,
        position: startPosition + i,
        partOfSpeech: dto.partOfSpeech,
        ipaTranscription: dto.ipaTranscription,
        pronunciationAudioMediaId: dto.pronunciationAudioMediaId,
        grammaticalProperties: dto.grammaticalProperties,
        register: dto.register,
        notes: dto.notes,
      });
      if (itemResult.isFail) {
        return Result.fail(itemResult.error);
      }
      entities.push(itemResult.value);
    }

    const saved = await this.itemRepo.saveBatch(entities);

    return Result.ok({ createdItemIds: saved.map((e) => e.id) });
  }
}
