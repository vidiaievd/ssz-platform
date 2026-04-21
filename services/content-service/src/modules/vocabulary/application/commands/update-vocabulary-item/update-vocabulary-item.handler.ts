import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateVocabularyItemCommand } from './update-vocabulary-item.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { GrammaticalPropertiesValidatorService } from '../../../domain/services/grammatical-properties-validator.service.js';
import { VocabularyDisplayCacheService } from '../../../infrastructure/cache/vocabulary-display-cache.service.js';

@CommandHandler(UpdateVocabularyItemCommand)
export class UpdateVocabularyItemHandler implements ICommandHandler<
  UpdateVocabularyItemCommand,
  Result<void, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    private readonly grammarValidator: GrammaticalPropertiesValidatorService,
    private readonly cacheService: VocabularyDisplayCacheService,
  ) {}

  async execute(
    command: UpdateVocabularyItemCommand,
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

    if (command.word !== undefined && command.word !== item.word) {
      const wordTaken = await this.itemRepo.wordExists(
        command.listId,
        command.word,
        command.itemId,
      );
      if (wordTaken) {
        return Result.fail(VocabularyDomainError.DUPLICATE_WORD_IN_LIST);
      }
    }

    if ('grammaticalProperties' in command && command.grammaticalProperties !== undefined) {
      const grammarResult = this.grammarValidator.validate(
        list.targetLanguage,
        command.grammaticalProperties,
      );
      if (grammarResult.isFail) {
        return Result.fail(grammarResult.error);
      }
    }

    const updateResult = item.update({
      word: command.word,
      partOfSpeech: command.partOfSpeech,
      ipaTranscription: command.ipaTranscription,
      pronunciationAudioMediaId: command.pronunciationAudioMediaId,
      grammaticalProperties: command.grammaticalProperties,
      register: command.register,
      notes: command.notes,
    });

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    await this.itemRepo.save(item);
    await this.cacheService.invalidateItem(command.itemId);

    return Result.ok();
  }
}
