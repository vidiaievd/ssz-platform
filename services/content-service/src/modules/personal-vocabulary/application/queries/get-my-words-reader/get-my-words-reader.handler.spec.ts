import { jest } from '@jest/globals';
import { Result } from '../../../../../shared/kernel/result.js';
import type { BatchGetVocabularyItemsForDisplayQuery } from '../../../../vocabulary/application/queries/batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.query.js';
import type { PersonalWordView } from '../../../domain/repositories/personal-vocabulary.reader.interface.js';
import { GetMyWordsReaderQuery } from './get-my-words-reader.query.js';
import { GetMyWordsReaderHandler } from './get-my-words-reader.handler.js';

function setup(count: number) {
  // listWords answers newest first.
  const words = Array.from({ length: count }, (_, i) => ({
    vocabularyItemId: `item-${count - 1 - i}`,
  })) as PersonalWordView[];
  const reader = { listWords: jest.fn(() => Promise.resolve(words)) };
  const batches: string[][] = [];
  const queryBus = {
    execute: jest.fn((q: BatchGetVocabularyItemsForDisplayQuery) => {
      batches.push(q.vocabularyItemIds);
      return Promise.resolve(Result.ok(q.vocabularyItemIds.map((itemId) => ({ itemId }))));
    }),
  };
  const handler = new GetMyWordsReaderHandler(reader as never, queryBus as never);
  return { handler, batches };
}

const query = () => new GetMyWordsReaderQuery('u1', 'nb', 'ru', false, 3, false, []);

describe('GetMyWordsReaderHandler', () => {
  it('answers as a list keyed by language, oldest word first', async () => {
    const { handler } = setup(3);

    const result = await handler.execute(query());

    expect(result.value.id).toBe('personal:nb');
    expect(result.value.items.map((i) => i.itemId)).toEqual(['item-0', 'item-1', 'item-2']);
  });

  it('splits a large dictionary into batches the display handler accepts', async () => {
    const { handler, batches } = setup(450);

    const result = await handler.execute(query());

    expect(batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(result.value.items).toHaveLength(450);
  });

  it('an empty dictionary is an empty list, not an error', async () => {
    const { handler, batches } = setup(0);

    const result = await handler.execute(query());

    expect(result.value.items).toEqual([]);
    expect(batches).toHaveLength(0);
  });
});
