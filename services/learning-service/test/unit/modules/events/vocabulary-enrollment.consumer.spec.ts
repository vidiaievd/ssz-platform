import { jest } from '@jest/globals';
import { VocabularyEnrollmentConsumer } from '../../../../src/modules/events/consumers/vocabulary-enrollment.consumer.js';
import { BulkIntroduceFromVocabularyListCommand } from '../../../../src/modules/srs/application/commands/bulk-introduce-from-vocabulary-list.command.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import {
  ContentClientError,
  type IContentClient,
} from '../../../../src/shared/application/ports/content-client.port.js';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

const USER_ID      = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTAINER_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function makeMsg(content: unknown): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)) } as unknown as ConsumeMessage;
}

function makeChannel(): jest.Mocked<Pick<ConfirmChannel, 'ack' | 'nack'>> {
  return { ack: jest.fn(), nack: jest.fn() } as any;
}

function makeConsumer(overrides: {
  processedEvent?: { findUnique: any; create: any };
  autoAddToSrs?: boolean | null;   // null → fail (404)
  bulkResult?: Result<any, any>;
} = {}) {
  const autoAddToSrs = overrides.autoAddToSrs;
  const srsResult =
    autoAddToSrs === null
      ? Result.fail(new ContentClientError('Not Found', 404))
      : Result.ok(autoAddToSrs ?? true);

  const contentClient: IContentClient = {
    getVocabularyListAutoAddToSrs: jest.fn<() => Promise<any>>().mockResolvedValue(srsResult),
    getVocabularyListItems: jest.fn(),
    getContentMetadata: jest.fn(),
    checkVisibilityForUser: jest.fn(),
    getAccessTier: jest.fn(),
    getContainerLeafItems: jest.fn(),
  } as any;

  const bulkIntroduceReturn =
    overrides.bulkResult ?? Result.ok({ introduced: 3, skipped: 0 });

  const commandBus = {
    execute: jest.fn<() => Promise<any>>().mockResolvedValue(bulkIntroduceReturn),
  } as any;

  const prisma = {
    processedEvent: {
      findUnique: overrides.processedEvent?.findUnique
        ?? jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: overrides.processedEvent?.create
        ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;

  const config = { get: jest.fn().mockReturnValue(undefined) } as any;

  return {
    consumer: new VocabularyEnrollmentConsumer(commandBus, prisma, config, contentClient),
    commandBus,
    contentClient,
    prisma,
  };
}

function envelope(payload: object, eventId = 'evt-001') {
  return { eventId, eventType: 'learning.enrollment.created', payload };
}

const basePayload = {
  enrollmentId: 'enroll-001',
  userId: USER_ID,
  containerId: CONTAINER_ID,
  schoolId: null,
};

describe('VocabularyEnrollmentConsumer', () => {
  describe('handleMessage — autoAddToSrs=true', () => {
    it('dispatches BulkIntroduceFromVocabularyListCommand and acks', async () => {
      const { consumer, commandBus } = makeConsumer({ autoAddToSrs: true });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(basePayload)));

      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      const [cmd] = commandBus.execute.mock.calls[0] as unknown[];
      expect(cmd).toBeInstanceOf(BulkIntroduceFromVocabularyListCommand);
      expect((cmd as BulkIntroduceFromVocabularyListCommand).userId).toBe(USER_ID);
      expect((cmd as BulkIntroduceFromVocabularyListCommand).vocabularyListId).toBe(CONTAINER_ID);
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('marks the event as processed', async () => {
      const { consumer, prisma } = makeConsumer({ autoAddToSrs: true });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope(basePayload, 'evt-abc')),
      );

      expect(prisma.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-abc', eventType: 'learning.enrollment.created' },
      });
    });
  });

  describe('handleMessage — autoAddToSrs=false', () => {
    it('does not dispatch BulkIntroduce and still acks', async () => {
      const { consumer, commandBus } = makeConsumer({ autoAddToSrs: false });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(basePayload)));

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage — content client returns error (non-vocabulary-list container)', () => {
    it('skips SRS introduction and still acks (treats 404 as silent skip)', async () => {
      const { consumer, commandBus } = makeConsumer({ autoAddToSrs: null });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(basePayload)));

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage — idempotency and error paths', () => {
    it('skips processing and acks on duplicate eventId', async () => {
      const { consumer, commandBus } = makeConsumer({
        processedEvent: {
          findUnique: jest.fn<() => Promise<object>>().mockResolvedValue({ eventId: 'evt-dup' }),
          create: jest.fn(),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope(basePayload, 'evt-dup')),
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('nacks without requeue on malformed JSON', async () => {
      const { consumer } = makeConsumer();
      const channel = makeChannel();
      const badMsg = { content: Buffer.from('not-json') } as unknown as ConsumeMessage;

      await (consumer as any).handleMessage(channel, badMsg);

      expect(channel.nack).toHaveBeenCalledWith(badMsg, false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('nacks without requeue when an unexpected error is thrown', async () => {
      const { consumer } = makeConsumer({
        processedEvent: {
          findUnique: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('DB down')),
          create: jest.fn(),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(basePayload)));

      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });
});
