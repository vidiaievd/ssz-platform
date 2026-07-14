import { GetVocabularyListReaderContentHandler } from './get-vocabulary-list-reader-content.handler.js';
import { GetVocabularyListReaderContentQuery } from './get-vocabulary-list-reader-content.query.js';
import { BatchGetVocabularyItemsForDisplayQuery } from '../batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.query.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { VocabularyItemDisplayResult } from '../../dto/vocabulary-item-display-result.js';

const OWNER_ID = 'owner-1';
const LIST_ID = 'list-1';

function makeList(): VocabularyListEntity {
  const result = VocabularyListEntity.create(
    {
      title: 'Bolig-ord',
      targetLanguage: 'no',
      difficultyLevel: DifficultyLevel.A1,
      ownerUserId: OWNER_ID,
      visibility: Visibility.PUBLIC,
    },
    LIST_ID,
  );
  if (result.isFail) throw new Error('unexpected failure building list fixture');
  return result.value;
}

function makeDisplayResult(itemId: string): VocabularyItemDisplayResult {
  return {
    itemId,
    listId: LIST_ID,
    word: 'bo',
    position: 0,
    partOfSpeech: null,
    ipaTranscription: null,
    pronunciationAudioMediaId: null,
    grammaticalProperties: null,
    register: null,
    notes: null,
    translation: {
      id: 'translation-1',
      language: 'en',
      primaryTranslation: 'to live',
      alternativeTranslations: [],
      definition: null,
      usageNotes: null,
      falseFriendWarning: null,
      fallbackUsed: false,
    },
    immersionMode: false,
    examples: [],
  };
}

function makeDeps(
  overrides: Partial<{
    list: VocabularyListEntity | null;
    itemIds: string[];
    displayResult: Result<VocabularyItemDisplayResult[], VocabularyDomainError>;
  }> = {},
) {
  const listRepo = {
    findById: jest.fn().mockResolvedValue(overrides.list ?? null),
  } as unknown as IVocabularyListRepository;

  const itemIds = overrides.itemIds ?? ['item-1'];
  const itemRepo = {
    findByListId: jest.fn().mockResolvedValue({
      items: itemIds.map((id) => ({ id })),
      total: itemIds.length,
      page: 1,
      limit: 200,
      totalPages: 1,
    }),
  } as unknown as IVocabularyItemRepository;

  const queryBus = {
    execute: jest
      .fn()
      .mockResolvedValue(overrides.displayResult ?? Result.ok(itemIds.map(makeDisplayResult))),
  };

  const handler = new GetVocabularyListReaderContentHandler(listRepo, itemRepo, queryBus as never);

  return { handler, listRepo, itemRepo, queryBus };
}

function makeQuery(): GetVocabularyListReaderContentQuery {
  return new GetVocabularyListReaderContentQuery(LIST_ID, 'en', true, 3, false, []);
}

describe('GetVocabularyListReaderContentHandler', () => {
  it('fails when the list does not exist', async () => {
    const { handler } = makeDeps({ list: null });

    const result = await handler.execute(makeQuery());

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(VocabularyDomainError.LIST_NOT_FOUND);
  });

  it('returns an empty items array without calling the batch-display query when the list is empty', async () => {
    const { handler, queryBus } = makeDeps({ list: makeList(), itemIds: [] });

    const result = await handler.execute(makeQuery());

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({ id: LIST_ID, title: 'Bolig-ord', items: [] });
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('delegates to BatchGetVocabularyItemsForDisplayQuery for translation/example resolution', async () => {
    const { handler, queryBus } = makeDeps({ list: makeList(), itemIds: ['item-1', 'item-2'] });

    const result = await handler.execute(makeQuery());

    expect(result.isOk).toBe(true);
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0].translation?.primaryTranslation).toBe('to live');

    const [passedQuery] = queryBus.execute.mock.calls[0] as [
      BatchGetVocabularyItemsForDisplayQuery,
    ];
    expect(passedQuery.vocabularyItemIds).toEqual(['item-1', 'item-2']);
    expect(passedQuery.translationLanguage).toBe('en');
  });

  it('propagates a failure from the batch-display query', async () => {
    const { handler } = makeDeps({
      list: makeList(),
      displayResult: Result.fail(VocabularyDomainError.BATCH_SIZE_EXCEEDED),
    });

    const result = await handler.execute(makeQuery());

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(VocabularyDomainError.BATCH_SIZE_EXCEEDED);
  });
});
