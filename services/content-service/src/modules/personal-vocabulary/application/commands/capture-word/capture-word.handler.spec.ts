import { jest } from '@jest/globals';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../../vocabulary/domain/exceptions/vocabulary-domain.exceptions.js';
import { PartOfSpeech } from '../../../../vocabulary/domain/value-objects/part-of-speech.vo.js';
import { CreateVocabularyListCommand } from '../../../../vocabulary/application/commands/create-vocabulary-list/create-vocabulary-list.command.js';
import { DeleteVocabularyListCommand } from '../../../../vocabulary/application/commands/delete-vocabulary-list/delete-vocabulary-list.command.js';
import { CreateVocabularyItemCommand } from '../../../../vocabulary/application/commands/create-vocabulary-item/create-vocabulary-item.command.js';
import { CreateUsageExampleCommand } from '../../../../vocabulary/application/commands/create-usage-example/create-usage-example.command.js';
import { UpsertItemTranslationCommand } from '../../../../vocabulary/application/commands/upsert-item-translation/upsert-item-translation.command.js';
import { PersonalVocabularyEntryEntity } from '../../../domain/entities/personal-vocabulary-entry.entity.js';
import { PersonalVocabularyDomainError } from '../../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import { SurfaceForm } from '../../../domain/value-objects/surface-form.vo.js';
import type {
  CatalogMatch,
  PersonalWordView,
} from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { CaptureWordCommand } from './capture-word.command.js';
import { CaptureWordHandler } from './capture-word.handler.js';

type AnyCommand = object;

function setup(
  opts: {
    match?: CatalogMatch | null;
    personalListId?: string | null;
    listItemId?: string | null;
    existingEntry?: PersonalVocabularyEntryEntity | null;
    linkWinner?: string;
    createItem?: Result<{ itemId: string }, VocabularyDomainError>[];
  } = {},
) {
  const saved: PersonalVocabularyEntryEntity[] = [];
  const repo = {
    findEntryById: jest.fn(),
    findEntryByItem: jest.fn(() => Promise.resolve(opts.existingEntry ?? null)),
    saveEntry: jest.fn((e: PersonalVocabularyEntryEntity) => {
      saved.push(e);
      return Promise.resolve();
    }),
    deleteEntry: jest.fn(),
    findPersonalListId: jest.fn(() => Promise.resolve(opts.personalListId ?? null)),
    linkPersonalList: jest.fn((_u: string, _l: string, id: string) =>
      Promise.resolve(opts.linkWinner ?? id),
    ),
  };
  const listItemIds = [opts.listItemId ?? null];
  const reader = {
    findCatalogMatch: jest.fn(() => Promise.resolve(opts.match ?? null)),
    findListItemId: jest.fn(() => Promise.resolve(listItemIds.shift() ?? null)),
    listWords: jest.fn((_u: string, f: { entryIds?: string[] }) =>
      Promise.resolve([{ entryId: f.entryIds?.[0] } as PersonalWordView]),
    ),
  };
  const createItemResults = [...(opts.createItem ?? [Result.ok({ itemId: 'own-item' })])];
  const commands: AnyCommand[] = [];
  const commandBus = {
    execute: jest.fn((cmd: AnyCommand) => {
      commands.push(cmd);
      if (cmd instanceof CreateVocabularyListCommand)
        return Promise.resolve(Result.ok({ listId: 'new-list' }));
      if (cmd instanceof CreateVocabularyItemCommand)
        return Promise.resolve(createItemResults.shift());
      return Promise.resolve(Result.ok({}));
    }),
  };
  const handler = new CaptureWordHandler(repo as never, reader as never, commandBus as never);
  const of = <T extends object>(type: new (...args: never[]) => T) =>
    commands.filter((c): c is T => c instanceof type);
  return { handler, repo, reader, saved, of };
}

const command = (
  overrides: Partial<{ translation: string | null; sentence: string | null; form: string }> = {},
) =>
  new CaptureWordCommand(
    'u1',
    'nb',
    'ru',
    overrides.form ?? 'kommer',
    overrides.translation ?? null,
    overrides.sentence === null
      ? null
      : {
          sentence: overrides.sentence ?? 'Bartek kommer fra Polen.',
          variantId: null,
          paragraphIndex: 0,
          charStart: 7,
        },
  );

const catalogKomme: CatalogMatch = {
  itemId: 'catalog-item',
  word: 'komme',
  partOfSpeech: PartOfSpeech.VERB,
  grammaticalProperties: { present_tense: 'kommer' },
  translation: 'приходить',
};

describe('CaptureWordHandler', () => {
  it('points at a translated catalogue item and writes no item of its own', async () => {
    const { handler, saved, of } = setup({ match: catalogKomme });

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(result.value.created).toBe(true);
    expect(saved[0].vocabularyItemId).toBe('catalog-item');
    expect(saved[0].surfaceForm).toBe('kommer');
    expect(of(CreateVocabularyListCommand)).toHaveLength(0);
    expect(of(CreateVocabularyItemCommand)).toHaveLength(0);
  });

  it('saves an unknown word without a translation in a list created on first use', async () => {
    const { handler, saved, of, repo } = setup();

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    const [list] = of(CreateVocabularyListCommand);
    expect(list.visibility).toBe('private');
    expect(list.autoAddToSrs).toBe(false);
    expect(repo.linkPersonalList).toHaveBeenCalledWith('u1', 'nb', 'new-list');
    const [item] = of(CreateVocabularyItemCommand);
    expect(item.listId).toBe('new-list');
    expect(item.word).toBe('kommer');
    expect(of(UpsertItemTranslationCommand)).toHaveLength(0);
    expect(of(CreateUsageExampleCommand)[0].exampleText).toBe('Bartek kommer fra Polen.');
    expect(saved[0].vocabularyItemId).toBe('own-item');
  });

  it('writes the student’s translation onto their own item', async () => {
    const { handler, of } = setup({ personalListId: 'my-list' });

    await handler.execute(command({ translation: '  приходит ' }));

    const [upsert] = of(UpsertItemTranslationCommand);
    expect(upsert.itemId).toBe('own-item');
    expect(upsert.translationLanguage).toBe('ru');
    expect(upsert.primaryTranslation).toBe('приходит');
    expect(of(CreateVocabularyListCommand)).toHaveLength(0);
  });

  it('takes the dictionary form and grammar from an untranslated catalogue item', async () => {
    const { handler, of } = setup({
      personalListId: 'my-list',
      match: { ...catalogKomme, translation: null },
    });

    await handler.execute(command({ translation: 'приходить' }));

    const [item] = of(CreateVocabularyItemCommand);
    expect(item.word).toBe('komme');
    expect(item.partOfSpeech).toBe(PartOfSpeech.VERB);
    expect(item.grammaticalProperties).toEqual({ present_tense: 'kommer' });
  });

  it('saves the word without catalogue grammar that no longer validates', async () => {
    const { handler, of } = setup({
      personalListId: 'my-list',
      match: { ...catalogKomme, translation: null },
      createItem: [
        Result.fail(VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES),
        Result.ok({ itemId: 'own-item' }),
      ],
    });

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    const [, retry] = of(CreateVocabularyItemCommand);
    expect(retry.grammaticalProperties).toBeUndefined();
  });

  it('reuses the item of a word captured before, without a second example', async () => {
    const { handler, of } = setup({ personalListId: 'my-list', listItemId: 'old-item' });

    await handler.execute(command());

    expect(of(CreateVocabularyItemCommand)).toHaveLength(0);
    expect(of(CreateUsageExampleCommand)).toHaveLength(0);
  });

  it('is idempotent: the same word again keeps its first context', async () => {
    const existing = PersonalVocabularyEntryEntity.capture({
      userId: 'u1',
      targetLanguage: 'nb',
      vocabularyItemId: 'catalog-item',
      surfaceForm: SurfaceForm.from('kommer').value,
      context: { sentence: 'Først.', variantId: null, paragraphIndex: null, charStart: null },
    });
    const { handler, repo } = setup({ match: catalogKomme, existingEntry: existing });

    const result = await handler.execute(command({ sentence: 'Senere.' }));

    expect(result.value.created).toBe(false);
    expect(repo.saveEntry).not.toHaveBeenCalled();
  });

  it('a race on the same word lands on the item the other request made', async () => {
    const { handler, saved, reader } = setup({
      personalListId: 'my-list',
      createItem: [Result.fail(VocabularyDomainError.DUPLICATE_WORD_IN_LIST)],
    });
    reader.findListItemId.mockResolvedValueOnce(null).mockResolvedValueOnce('their-item');

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(saved[0].vocabularyItemId).toBe('their-item');
  });

  it('a race on the first word drops the list that lost', async () => {
    const { handler, of } = setup({ linkWinner: 'their-list' });

    await handler.execute(command());

    expect(of(DeleteVocabularyListCommand)[0].listId).toBe('new-list');
    expect(of(CreateVocabularyItemCommand)[0].listId).toBe('their-list');
  });

  it('refuses a phrase', async () => {
    const { handler, saved } = setup();

    const result = await handler.execute(command({ form: 'ta seg av' }));

    expect(result.error).toBe(PersonalVocabularyDomainError.INVALID_SURFACE_FORM);
    expect(saved).toHaveLength(0);
  });
});
