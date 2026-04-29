import { jest } from '@jest/globals';
import { ContainerPublishedConsumer } from '../../../../src/modules/events/consumers/container-published.consumer.js';
import type { IContainerItemListCache } from '../../../../src/shared/application/ports/container-item-list-cache.port.js';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

const CONTAINER_ID = 'cccccccc-0000-4000-8000-000000000001';

function makeMsg(content: unknown): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)) } as unknown as ConsumeMessage;
}

function makeChannel(): jest.Mocked<Pick<ConfirmChannel, 'ack' | 'nack'>> {
  return {
    ack: jest.fn(),
    nack: jest.fn(),
  } as any;
}

function makeConsumer(overrides: {
  processedEvent?: { findUnique: any; create: any };
  cache?: Partial<IContainerItemListCache>;
}) {
  const prisma = {
    processedEvent: {
      findUnique: overrides.processedEvent?.findUnique ?? jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: overrides.processedEvent?.create ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;

  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as any;

  const cache: IContainerItemListCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: overrides.cache?.invalidate ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides.cache,
  };

  return { consumer: new ContainerPublishedConsumer(prisma, config, cache), prisma, cache };
}

const validEnvelope = {
  eventId: 'evt-0001',
  eventType: 'content.container.published',
  payload: { containerId: CONTAINER_ID, publishedBy: 'user-001', publishedAt: '2026-04-29T10:00:00Z' },
};

describe('ContainerPublishedConsumer', () => {
  describe('handleMessage', () => {
    it('invalidates cache, marks processed, and acks on happy path', async () => {
      const { consumer, prisma, cache } = makeConsumer({});
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      expect(cache.invalidate).toHaveBeenCalledWith(CONTAINER_ID);
      expect(prisma.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-0001', eventType: 'content.container.published' },
      });
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('skips processing and acks duplicate event (idempotent re-delivery)', async () => {
      const { consumer, cache } = makeConsumer({
        processedEvent: {
          findUnique: jest.fn<() => Promise<object>>().mockResolvedValue({ eventId: 'evt-0001' }),
          create: jest.fn(),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('nacks without requeue on malformed JSON', async () => {
      const { consumer } = makeConsumer({});
      const channel = makeChannel();
      const badMsg = { content: Buffer.from('not-json') } as unknown as ConsumeMessage;

      await (consumer as any).handleMessage(channel, badMsg);

      expect(channel.nack).toHaveBeenCalledWith(badMsg, false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('nacks without requeue when an unexpected error occurs', async () => {
      const { consumer } = makeConsumer({
        cache: {
          invalidate: jest.fn().mockRejectedValue(new Error('Redis down')) as any,
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(validEnvelope));

      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });
});
