import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../../vocabulary/domain/exceptions/vocabulary-domain.exceptions.js';
import { UpdateVocabularyItemCommand } from '../../../../vocabulary/application/commands/update-vocabulary-item/update-vocabulary-item.command.js';
import { UpsertItemTranslationCommand } from '../../../../vocabulary/application/commands/upsert-item-translation/upsert-item-translation.command.js';
import { DeleteItemTranslationCommand } from '../../../../vocabulary/application/commands/delete-item-translation/delete-item-translation.command.js';
import { PersonalVocabularyDomainError } from '../../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import { SurfaceForm } from '../../../domain/value-objects/surface-form.vo.js';
import {
  PERSONAL_VOCABULARY_REPOSITORY,
  type IPersonalVocabularyRepository,
} from '../../../domain/repositories/personal-vocabulary.repository.interface.js';
import {
  PERSONAL_VOCABULARY_READER,
  type IPersonalVocabularyReader,
  type PersonalWordView,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { UpdateMyWordCommand } from './update-my-word.command.js';

export type UpdateMyWordError = PersonalVocabularyDomainError | VocabularyDomainError;

/**
 * The student corrects a word of their own: its form or its translation. A word that
 * points at a catalogue item is read-only — it belongs to the course's author.
 */
@CommandHandler(UpdateMyWordCommand)
export class UpdateMyWordHandler implements ICommandHandler<
  UpdateMyWordCommand,
  Result<PersonalWordView, UpdateMyWordError>
> {
  constructor(
    @Inject(PERSONAL_VOCABULARY_REPOSITORY)
    private readonly repo: IPersonalVocabularyRepository,
    @Inject(PERSONAL_VOCABULARY_READER)
    private readonly reader: IPersonalVocabularyReader,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(
    command: UpdateMyWordCommand,
  ): Promise<Result<PersonalWordView, UpdateMyWordError>> {
    const entry = await this.repo.findEntryById(command.entryId);
    if (!entry || !entry.belongsTo(command.userId)) {
      return Result.fail(PersonalVocabularyDomainError.ENTRY_NOT_FOUND);
    }

    const view = await this.view(command.userId, entry.id, command.translationLanguage);
    if (!view.ownWord) return Result.fail(PersonalVocabularyDomainError.CATALOG_WORD_READ_ONLY);

    const listId = await this.repo.findPersonalListId(command.userId, entry.targetLanguage);
    if (listId === null) return Result.fail(PersonalVocabularyDomainError.CATALOG_WORD_READ_ONLY);

    if (command.word !== undefined) {
      const form = SurfaceForm.from(command.word);
      if (form.isFail) return Result.fail(form.error);
      if (form.value.value !== view.word) {
        const updated = await this.commandBus.execute<
          UpdateVocabularyItemCommand,
          Result<void, VocabularyDomainError>
        >(
          new UpdateVocabularyItemCommand(
            command.userId,
            listId,
            entry.vocabularyItemId,
            form.value.value,
          ),
        );
        if (updated.isFail) return Result.fail(updated.error);
      }
    }

    if (command.translation !== undefined) {
      const translation = command.translation?.trim() ?? '';
      const result = translation
        ? await this.commandBus.execute<
            UpsertItemTranslationCommand,
            Result<unknown, VocabularyDomainError>
          >(
            new UpsertItemTranslationCommand(
              command.userId,
              entry.vocabularyItemId,
              command.translationLanguage,
              translation,
            ),
          )
        : await this.commandBus.execute<
            DeleteItemTranslationCommand,
            Result<unknown, VocabularyDomainError>
          >(
            new DeleteItemTranslationCommand(
              command.userId,
              entry.vocabularyItemId,
              command.translationLanguage,
            ),
          );
      // Clearing a translation that was never there is already the state asked for.
      if (result.isFail && result.error !== VocabularyDomainError.TRANSLATION_NOT_FOUND) {
        return Result.fail(result.error);
      }
    }

    return Result.ok(await this.view(command.userId, entry.id, command.translationLanguage));
  }

  private async view(
    userId: string,
    entryId: string,
    translationLanguage: string,
  ): Promise<PersonalWordView> {
    const [view] = await this.reader.listWords(userId, {
      translationLanguage,
      entryIds: [entryId],
    });
    return view;
  }
}
