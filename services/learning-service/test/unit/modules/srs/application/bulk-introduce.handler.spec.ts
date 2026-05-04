import { jest } from '@jest/globals';
import { BulkIntroduceFromVocabularyListHandler } from '../../../../../src/modules/srs/application/commands/bulk-introduce-from-vocabulary-list.handler.js';
import { BulkIntroduceFromVocabularyListCommand } from '../../../../../src/modules/srs/application/commands/bulk-introduce-from-vocabulary-list.command.js';
import { Result } from '../../../../../src/shared/kernel/result.js';
import { SrsNewCardLimitError } from '../../../../../src/modules/srs/application/errors/srs-application.errors.js';
import type { IContentClient } from '../../../../../src/shared/application/ports/content-client.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';
import { ContentClientError } from '../../../../../src/shared/application/ports/content-client.port.js';

const NOW      = new Date('2026-04-29T10:00:00Z');
const USER_ID  = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const LIST_ID  = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

const ITEM_IDS = [
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003',
];

function makeHandler(overrides: {
  itemIds?: string[];
  contentClientFail?: boolean;
  commandBusResults?: Array<Result<any, any>>;
} = {}) {
  const itemIds = overrides.itemIds ?? ITEM_IDS;

  const contentClient: IContentClient = {
    getVocabularyListItems: overrides.contentClientFail
      ? jest.fn<() => Promise<any>>().mockResolvedValue(
          Result.fail(new ContentClientError('Not found', 404)),
        )
      : jest.fn<() => Promise<any>>().mockResolvedValue(Result.ok(itemIds)),
    getVocabularyListAutoAddToSrs: jest.fn(),
    getContentMetadata: jest.fn(),
    checkVisibilityForUser: jest.fn(),
    getAccessTier: jest.fn(),
    getContainerLeafItems: jest.fn(),
  } as any;

  const defaultResults: Array<Result<any, any>> = itemIds.map(() =>
    Result.ok({ id: 'card-' + Math.random(), state: 'NEW' }),
  );
  const results = overrides.commandBusResults ?? defaultResults;

  let callCount = 0;
  const commandBus = {
    execute: jest.fn<() => Promise<any>>().mockImplementation(() =>
      Promise.resolve(results[callCount++] ?? Result.ok({ id: 'extra', state: 'NEW' })),
    ),
  } as any;

  const clock: IClock = { now: () => NOW };

  return {
    handler: new BulkIntroduceFromVocabularyListHandler(contentClient, clock, commandBus),
    contentClient,
    commandBus,
  };
}

const cmd = new BulkIntroduceFromVocabularyListCommand(USER_ID, LIST_ID);

describe('BulkIntroduceFromVocabularyListHandler', () => {
  it('introduces all items and returns correct counts', async () => {
    const { handler, commandBus } = makeHandler();

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.introduced).toBe(3);
    expect(result.value.skipped).toBe(0);
    expect(commandBus.execute).toHaveBeenCalledTimes(3);
  });

  it('counts already-existing cards as skipped (introduce returns existing card)', async () => {
    const { handler } = makeHandler({
      commandBusResults: [
        Result.ok({ id: 'card-1', state: 'NEW', reps: 0 }),
        Result.ok({ id: 'card-2', state: 'NEW', reps: 0 }),
        Result.ok({ id: 'card-3', state: 'NEW', reps: 0 }),
      ],
    });

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.introduced).toBe(3);
  });

  it('stops early when daily limit is hit and counts remainder as skipped', async () => {
    const { handler, commandBus } = makeHandler({
      commandBusResults: [
        Result.ok({ id: 'card-1', state: 'NEW' }),
        Result.fail(new SrsNewCardLimitError()),
        Result.ok({ id: 'card-3', state: 'NEW' }), // should not be called
      ],
    });

    const result = await handler.execute(cmd);

    expect(result.isOk).toBe(true);
    expect(result.value.introduced).toBe(1);
    expect(result.value.skipped).toBe(1);
    // Stopped after limit-hit — third item not processed.
    expect(commandBus.execute).toHaveBeenCalledTimes(2);
  });

  it('fails when Content Service returns an error', async () => {
    const { handler } = makeHandler({ contentClientFail: true });

    const result = await handler.execute(cmd);

    expect(result.isFail).toBe(true);
  });
});
