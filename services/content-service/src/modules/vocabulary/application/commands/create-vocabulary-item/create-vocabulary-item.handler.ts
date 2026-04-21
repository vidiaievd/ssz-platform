import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateVocabularyItemCommand } from './create-vocabulary-item.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { GrammaticalPropertiesValidatorService } from '../../../domain/services/grammatical-properties-validator.service.js';

export interface CreateVocabularyItemResult {
  itemId: string;
}

@CommandHandler(CreateVocabularyItemCommand)
export class CreateVocabularyItemHandler implements ICommandHandler<
  CreateVocabularyItemCommand,
  Result<CreateVocabularyItemResult, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    private readonly grammarValidator: GrammaticalPropertiesValidatorService,
  ) {}

  async execute(
    command: CreateVocabularyItemCommand,
  ): Promise<Result<CreateVocabularyItemResult, VocabularyDomainError>> {
    const list = await this.listRepo.findById(command.listId);
    if (!list || list.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    if (command.grammaticalProperties !== undefined) {
      const grammarResult = this.grammarValidator.validate(
        list.targetLanguage,
        command.grammaticalProperties,
      );
      if (grammarResult.isFail) {
        return Result.fail(grammarResult.error);
      }
    }

    const wordTaken = await this.itemRepo.wordExists(command.listId, command.word);
    if (wordTaken) {
      return Result.fail(VocabularyDomainError.DUPLICATE_WORD_IN_LIST);
    }

    let position: number;
    if (command.position !== undefined) {
      const maxPos = await this.itemRepo.getMaxPosition(command.listId);
      if (command.position > maxPos + 1) {
        return Result.fail(VocabularyDomainError.DUPLICATE_POSITION);
      }
      position = command.position;
    } else {
      position = (await this.itemRepo.getMaxPosition(command.listId)) + 1;
    }

    const itemResult = VocabularyItemEntity.create({
      vocabularyListId: command.listId,
      word: command.word,
      position,
      partOfSpeech: command.partOfSpeech,
      ipaTranscription: command.ipaTranscription,
      pronunciationAudioMediaId: command.pronunciationAudioMediaId,
      grammaticalProperties: command.grammaticalProperties,
      register: command.register,
      notes: command.notes,
    });

    if (itemResult.isFail) {
      return Result.fail(itemResult.error);
    }

    await this.itemRepo.save(itemResult.value);

    return Result.ok({ itemId: itemResult.value.id });
  }
}
