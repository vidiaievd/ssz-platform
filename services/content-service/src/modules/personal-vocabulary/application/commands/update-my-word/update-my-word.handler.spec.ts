import { jest } from '@jest/globals';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../../vocabulary/domain/exceptions/vocabulary-domain.exceptions.js';
import { UpdateVocabularyItemCommand } from '../../../../vocabulary/application/commands/update-vocabulary-item/update-vocabulary-item.command.js';
import { DeleteItemTranslationCommand } from '../../../../vocabulary/application/commands/delete-item-translation/delete-item-translation.command.js';
import { UpsertItemTranslationCommand } from '../../../../vocabulary/application/commands/upsert-item-translation/upsert-item-translation.command.js';
import { PersonalVocabularyEntryEntity } from '../../../domain/entities/personal-vocabulary-entry.entity.js';
import { PersonalVocabularyDomainError } from '../../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import { SurfaceForm } from '../../../domain/value-objects/surface-form.vo.js';
import type { PersonalWordView } from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { UpdateMyWordCommand } from './update-my-word.command.js';
import { UpdateMyWordHandler } from './update-my-word.handler.js';

const entry = PersonalVocabularyEntryEntity.capture({
  userId: 'u1',
  targetLanguage: 'nb',
  vocabularyItemId: 'item-1',
  surfaceForm: SurfaceForm.from('kommer').value,
  context: null,
});

function setup(ownWord = true, deleteResult = Result.ok<unknown, VocabularyDomainError>()) {
  const commands: object[] = [];
  const repo = {
    findEntryById: jest.fn(() => Promise.resolve(entry)),
    findPersonalListId: jest.fn(() => Promise.resolve('my-list')),
  };
  const reader = {
    listWords: jest.fn(() =>
      Promise.resolve([{ entryId: entry.id, word: 'kommer', ownWord } as PersonalWordView]),
    ),
  };
  const commandBus = {
    execute: jest.fn((cmd: object) => {
      commands.push(cmd);
      return Promise.resolve(
        cmd instanceof DeleteItemTranslationCommand ? deleteResult : Result.ok(),
      );
    }),
  };
  const handler = new UpdateMyWordHandler(repo as never, reader as never, commandBus as never);
  return { handler, commands };
}

describe('UpdateMyWordHandler', () => {
  it('renames the item and writes the translation', async () => {
    const { handler, commands } = setup();

    const result = await handler.execute(
      new UpdateMyWordCommand('u1', entry.id, 'ru', 'komme', 'приходить'),
    );

    expect(result.isOk).toBe(true);
    const rename = commands.find(
      (c) => c instanceof UpdateVocabularyItemCommand,
    ) as UpdateVocabularyItemCommand;
    expect(rename.listId).toBe('my-list');
    expect(rename.word).toBe('komme');
    expect(commands.some((c) => c instanceof UpsertItemTranslationCommand)).toBe(true);
  });

  it('an empty translation removes it, and removing a missing one is fine', async () => {
    const { handler, commands } = setup(
      true,
      Result.fail(VocabularyDomainError.TRANSLATION_NOT_FOUND),
    );

    const result = await handler.execute(
      new UpdateMyWordCommand('u1', entry.id, 'ru', undefined, ''),
    );

    expect(result.isOk).toBe(true);
    expect(commands.some((c) => c instanceof DeleteItemTranslationCommand)).toBe(true);
  });

  it('refuses to edit a catalogue word', async () => {
    const { handler, commands } = setup(false);

    const result = await handler.execute(
      new UpdateMyWordCommand('u1', entry.id, 'ru', undefined, 'x'),
    );

    expect(result.error).toBe(PersonalVocabularyDomainError.CATALOG_WORD_READ_ONLY);
    expect(commands).toHaveLength(0);
  });

  it('someone else’s entry is not found', async () => {
    const { handler } = setup();

    const result = await handler.execute(
      new UpdateMyWordCommand('u2', entry.id, 'ru', undefined, 'x'),
    );

    expect(result.error).toBe(PersonalVocabularyDomainError.ENTRY_NOT_FOUND);
  });
});
