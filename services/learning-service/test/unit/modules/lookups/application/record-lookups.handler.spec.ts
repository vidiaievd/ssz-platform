import { jest } from '@jest/globals';
import { LEARNING_EVENT_TYPES, type VocabularyLookedUpPayload } from '@ssz/contracts';
import { RecordLookupsHandler } from '../../../../../src/modules/lookups/application/commands/record-lookups.handler.js';
import {
  RecordLookupsCommand,
  type LookupInput,
} from '../../../../../src/modules/lookups/application/commands/record-lookups.command.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { IEventPublisher } from '../../../../../src/shared/application/ports/event-publisher.port.js';
import type { IClock } from '../../../../../src/shared/application/ports/clock.port.js';

const NOW = new Date('2026-07-31T10:00:00.000Z');
const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const OTHER_ID = 'aaaaaaaa-bbbb-4000-8000-000000000001';
const LESSON_ID = '1f0b7c2e-8a44-4c1b-9d33-5e7a1b2c3d44';
const VARIANT_ID = '2a1c8d3f-9b55-4d2c-8e44-6f8b2c3d4e55';
const WORD_A = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';
const WORD_B = '9f1c2f0e-6a2b-4d0e-8f3a-2d5f4a1b7c33';

function lookup(overrides: Partial<LookupInput> = {}): LookupInput {
  return {
    lessonId: LESSON_ID,
    lessonVariantId: VARIANT_ID,
    vocabularyItemId: WORD_A,
    level: 'full',
    occurredAt: '2026-07-31T09:59:50.000Z',
    ...overrides,
  };
}

function makeHandler(cardsInStore: ReviewCard[]) {
  // Mirrors the Prisma repository contract: scoped by userId and contentType.
  const findByUserAndContents = jest
    .fn<ISrsRepository['findByUserAndContents']>()
    .mockImplementation(async (userId, contentType, contentIds) =>
      cardsInStore.filter(
        (c) =>
          c.userId === userId && c.contentType === contentType && contentIds.includes(c.contentId),
      ),
    );
  const publish = jest.fn<IEventPublisher['publish']>().mockResolvedValue(undefined);

  const handler = new RecordLookupsHandler(
    { findByUserAndContents } as unknown as ISrsRepository,
    { publish } as unknown as IEventPublisher,
    { now: () => NOW } as IClock,
  );

  return { handler, publish, findByUserAndContents };
}

function payloadsOf(publish: ReturnType<typeof makeHandler>['publish']): VocabularyLookedUpPayload[] {
  return publish.mock.calls.map((call) => call[1] as VocabularyLookedUpPayload);
}

describe('RecordLookupsHandler', () => {
  it('publishes one event per lookup', async () => {
    const { handler, publish } = makeHandler([]);

    await handler.execute(
      new RecordLookupsCommand(USER_ID, [
        lookup({ vocabularyItemId: WORD_A, level: 'preview' }),
        lookup({ vocabularyItemId: WORD_A, level: 'full' }),
        lookup({ vocabularyItemId: WORD_B, level: 'full' }),
      ]),
    );

    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish.mock.calls.every((c) => c[0] === LEARNING_EVENT_TYPES.VOCABULARY_LOOKED_UP)).toBe(
      true,
    );
    expect(payloadsOf(publish).map((p) => p.level)).toEqual(['preview', 'full', 'full']);
  });

  it("resolves the learner's own SRS state for the word", async () => {
    const card = ReviewCard.create(USER_ID, 'VOCABULARY_WORD', WORD_A, NOW);
    const { handler, publish } = makeHandler([card]);

    await handler.execute(new RecordLookupsCommand(USER_ID, [lookup()]));

    expect(payloadsOf(publish)[0]).toMatchObject({
      userId: USER_ID,
      lessonId: LESSON_ID,
      lessonVariantId: VARIANT_ID,
      vocabularyItemId: WORD_A,
      srsState: card.state,
    });
  });

  it('reports a null state for a word the learner has no card for', async () => {
    const { handler, publish } = makeHandler([]);

    await handler.execute(new RecordLookupsCommand(USER_ID, [lookup()]));

    expect(payloadsOf(publish)[0]?.srsState).toBeNull();
  });

  it("never reports another learner's card state", async () => {
    const theirs = ReviewCard.createSeeded(OTHER_ID, 'VOCABULARY_WORD', WORD_A, 'CLAIMED_KNOWN', NOW);
    const { handler, publish, findByUserAndContents } = makeHandler([theirs]);

    await handler.execute(new RecordLookupsCommand(USER_ID, [lookup()]));

    expect(findByUserAndContents).toHaveBeenCalledWith(USER_ID, 'VOCABULARY_WORD', [WORD_A]);
    expect(payloadsOf(publish)[0]?.srsState).toBeNull();
  });

  it('asks the repository for each word once, however often it was looked up', async () => {
    const { handler, findByUserAndContents } = makeHandler([]);

    await handler.execute(
      new RecordLookupsCommand(USER_ID, [
        lookup({ level: 'preview' }),
        lookup({ level: 'full' }),
        lookup({ vocabularyItemId: WORD_B }),
      ]),
    );

    expect(findByUserAndContents).toHaveBeenCalledTimes(1);
    expect(findByUserAndContents).toHaveBeenCalledWith(USER_ID, 'VOCABULARY_WORD', [WORD_A, WORD_B]);
  });

  it('keeps a plausible client timestamp rather than the receive time', async () => {
    const { handler, publish } = makeHandler([]);

    await handler.execute(
      new RecordLookupsCommand(USER_ID, [lookup({ occurredAt: '2026-07-31T09:59:50.000Z' })]),
    );

    expect(payloadsOf(publish)[0]?.occurredAt).toBe('2026-07-31T09:59:50.000Z');
  });

  it('clamps a future timestamp to the receive time', async () => {
    const { handler, publish } = makeHandler([]);

    await handler.execute(
      new RecordLookupsCommand(USER_ID, [lookup({ occurredAt: '2026-08-01T00:00:00.000Z' })]),
    );

    expect(payloadsOf(publish)[0]?.occurredAt).toBe(NOW.toISOString());
  });

  it('clamps a timestamp older than a day to the receive time', async () => {
    const { handler, publish } = makeHandler([]);

    await handler.execute(
      new RecordLookupsCommand(USER_ID, [lookup({ occurredAt: '2026-07-29T10:00:00.000Z' })]),
    );

    expect(payloadsOf(publish)[0]?.occurredAt).toBe(NOW.toISOString());
  });

  it('publishes nothing for an empty batch', async () => {
    const { handler, publish, findByUserAndContents } = makeHandler([]);

    await handler.execute(new RecordLookupsCommand(USER_ID, []));

    expect(publish).not.toHaveBeenCalled();
    expect(findByUserAndContents).not.toHaveBeenCalled();
  });
});
