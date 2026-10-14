import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { VocabularyDomainError } from '../../../../vocabulary/domain/exceptions/vocabulary-domain.exceptions.js';
import { CreateVocabularyListCommand } from '../../../../vocabulary/application/commands/create-vocabulary-list/create-vocabulary-list.command.js';
import type { CreateVocabularyListResult } from '../../../../vocabulary/application/commands/create-vocabulary-list/create-vocabulary-list.handler.js';
import { DeleteVocabularyListCommand } from '../../../../vocabulary/application/commands/delete-vocabulary-list/delete-vocabulary-list.command.js';
import { CreateVocabularyItemCommand } from '../../../../vocabulary/application/commands/create-vocabulary-item/create-vocabulary-item.command.js';
import type { CreateVocabularyItemResult } from '../../../../vocabulary/application/commands/create-vocabulary-item/create-vocabulary-item.handler.js';
import { CreateUsageExampleCommand } from '../../../../vocabulary/application/commands/create-usage-example/create-usage-example.command.js';
import { UpsertItemTranslationCommand } from '../../../../vocabulary/application/commands/upsert-item-translation/upsert-item-translation.command.js';
import { PersonalVocabularyEntryEntity } from '../../../domain/entities/personal-vocabulary-entry.entity.js';
import { PersonalVocabularyDomainError } from '../../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import { SurfaceForm } from '../../../domain/value-objects/surface-form.vo.js';
import {
  PERSONAL_VOCABULARY_REPOSITORY,
  type IPersonalVocabularyRepository,
} from '../../../domain/repositories/personal-vocabulary.repository.interface.js';
import {
  PERSONAL_VOCABULARY_READER,
  type CatalogMatch,
  type IPersonalVocabularyReader,
  type PersonalWordView,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { CaptureWordCommand } from './capture-word.command.js';

/** Stored on the list; clients label the personal dictionary themselves. */
const PERSONAL_LIST_TITLE = 'My words';

export type CaptureWordError = PersonalVocabularyDomainError | VocabularyDomainError;

export interface CaptureWordResult {
  word: PersonalWordView;
  /** False when the word was already in the dictionary and was only refreshed. */
  created: boolean;
}

/**
 * Puts a word the student selected in a text into their dictionary (plan 75).
 *
 * A catalogue item that has this form and a translation in the student's language is
 * referenced as it is: no copy, and the SRS card stays the one the course would make.
 * Anything else becomes an item of the student's personal list — with the catalogue's
 * dictionary form and grammar when the form matched an untranslated item, with the form
 * as selected otherwise (decision Q3). The translation may be missing: the word is saved
 * all the same and waits for one.
 *
 * Writes to vocabulary items go through the vocabulary module's own commands, so its
 * validation, events and display cache apply as for any other item.
 */
@CommandHandler(CaptureWordCommand)
export class CaptureWordHandler implements ICommandHandler<
  CaptureWordCommand,
  Result<CaptureWordResult, CaptureWordError>
> {
  private readonly logger = new Logger(CaptureWordHandler.name);

  constructor(
    @Inject(PERSONAL_VOCABULARY_REPOSITORY)
    private readonly repo: IPersonalVocabularyRepository,
    @Inject(PERSONAL_VOCABULARY_READER)
    private readonly reader: IPersonalVocabularyReader,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: CaptureWordCommand): Promise<Result<CaptureWordResult, CaptureWordError>> {
    const formResult = SurfaceForm.from(command.surfaceForm);
    if (formResult.isFail) return Result.fail(formResult.error);
    const form = formResult.value;

    const match = await this.reader.findCatalogMatch(
      form.matchKey,
      command.targetLanguage,
      command.translationLanguage,
      command.userId,
    );

    let itemId: string;
    if (match?.translation) {
      itemId = match.itemId;
    } else {
      const own = await this.ownItem(command, form, match);
      if (own.isFail) return Result.fail(own.error);
      itemId = own.value;
    }

    let entry = await this.repo.findEntryByItem(command.userId, itemId);
    const created = entry === null;
    if (entry === null) {
      entry = PersonalVocabularyEntryEntity.capture({
        userId: command.userId,
        targetLanguage: command.targetLanguage,
        vocabularyItemId: itemId,
        surfaceForm: form,
        context: command.context,
      });
      await this.repo.saveEntry(entry);
    } else if (entry.recapture(command.context)) {
      await this.repo.saveEntry(entry);
    }

    const [word] = await this.reader.listWords(command.userId, {
      translationLanguage: command.translationLanguage,
      entryIds: [entry.id],
    });
    return Result.ok({ word, created });
  }

  /** The student's own item for this word, created on first capture. */
  private async ownItem(
    command: CaptureWordCommand,
    form: SurfaceForm,
    match: CatalogMatch | null,
  ): Promise<Result<string, CaptureWordError>> {
    const listResult = await this.ensurePersonalList(command.userId, command.targetLanguage);
    if (listResult.isFail) return Result.fail(listResult.error);
    const listId = listResult.value;

    const word = match?.word ?? form.dictionaryFormIn(command.context?.sentence ?? null);
    let itemId = await this.reader.findListItemId(listId, word);

    if (itemId === null) {
      const createdItem = await this.createItem(command.userId, listId, word, match);
      if (createdItem.isOk) {
        itemId = createdItem.value;
        await this.addExample(command, itemId);
      } else if (createdItem.error === VocabularyDomainError.DUPLICATE_WORD_IN_LIST) {
        // The same word captured twice at once — the other request made the item.
        itemId = await this.reader.findListItemId(listId, word);
        if (itemId === null) return Result.fail(createdItem.error);
      } else {
        return Result.fail(createdItem.error);
      }
    }

    const translation = command.translation?.trim();
    if (translation) {
      const upserted = await this.commandBus.execute<
        UpsertItemTranslationCommand,
        Result<unknown, VocabularyDomainError>
      >(
        new UpsertItemTranslationCommand(
          command.userId,
          itemId,
          command.translationLanguage,
          translation,
        ),
      );
      if (upserted.isFail) return Result.fail(upserted.error);
    }

    return Result.ok(itemId);
  }

  private async createItem(
    userId: string,
    listId: string,
    word: string,
    match: CatalogMatch | null,
  ): Promise<Result<string, VocabularyDomainError>> {
    const create = (grammar?: Record<string, unknown>) =>
      this.commandBus.execute<
        CreateVocabularyItemCommand,
        Result<CreateVocabularyItemResult, VocabularyDomainError>
      >(
        new CreateVocabularyItemCommand(
          userId,
          listId,
          word,
          match?.partOfSpeech ?? undefined,
          undefined,
          undefined,
          grammar,
        ),
      );

    let result = await create(match?.grammaticalProperties ?? undefined);
    // Catalogue grammar written before a stricter schema still describes the word; the
    // word matters more than its forms, so it is saved without them rather than refused.
    if (
      result.isFail &&
      result.error === VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES &&
      match?.grammaticalProperties
    ) {
      result = await create();
    }
    return result.isOk ? Result.ok(result.value.itemId) : Result.fail(result.error);
  }

  /** Best effort: a context that fails to save as an example must not cost the word. */
  private async addExample(command: CaptureWordCommand, itemId: string): Promise<void> {
    const sentence = command.context?.sentence?.trim();
    if (!sentence) return;
    const result = await this.commandBus.execute<
      CreateUsageExampleCommand,
      Result<unknown, VocabularyDomainError>
    >(new CreateUsageExampleCommand(command.userId, itemId, sentence));
    if (result.isFail) {
      this.logger.warn(
        `Context of personal item ${itemId} not saved as an example: ${result.error}`,
      );
    }
  }

  private async ensurePersonalList(
    userId: string,
    targetLanguage: string,
  ): Promise<Result<string, VocabularyDomainError>> {
    const existing = await this.repo.findPersonalListId(userId, targetLanguage);
    if (existing !== null) return Result.ok(existing);

    const created = await this.commandBus.execute<
      CreateVocabularyListCommand,
      Result<CreateVocabularyListResult, VocabularyDomainError>
    >(
      new CreateVocabularyListCommand(
        userId,
        targetLanguage,
        // A personal list spans every level; A1 only satisfies the required column.
        DifficultyLevel.A1,
        PERSONAL_LIST_TITLE,
        Visibility.PRIVATE,
        undefined,
        undefined,
        undefined,
        // The student's words reach SRS once translated, not on enrolment in the list.
        false,
      ),
    );
    if (created.isFail) return Result.fail(created.error);

    const listId = created.value.listId;
    const winner = await this.repo.linkPersonalList(userId, targetLanguage, listId);
    if (winner !== listId) {
      await this.commandBus.execute(new DeleteVocabularyListCommand(userId, listId));
    }
    return Result.ok(winner);
  }
}
