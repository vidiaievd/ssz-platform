import { jest } from '@jest/globals';
import { ExerciseUpdatedConsumer } from '../../../src/modules/events/exercise-updated.consumer.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeMsg = (payload: object, eventId = 'evt-1') => ({
  content: Buffer.from(
    JSON.stringify({ eventId, eventType: 'content.exercise.updated', payload }),
  ),
});

const makeChannel = () => ({
  ack: jest.fn(),
  nack: jest.fn(),
});

const makeCache = () => ({
  invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
});

const makePrisma = (alreadyProcessed = false) => ({
  processedEvent: {
    findUnique: jest.fn<() => Promise<{ eventId: string } | null>>().mockResolvedValue(
      alreadyProcessed ? { eventId: 'evt-1' } : null,
    ),
    create: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
});

const makeConfig = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'rabbitmq') return { url: 'amqp://localhost', exchange: 'ssz.events' };
    return undefined;
  }),
});

const makeConsumer = (prisma: ReturnType<typeof makePrisma>, cache: ReturnType<typeof makeCache>) =>
  new ExerciseUpdatedConsumer(makeConfig() as any, cache as any, prisma as any);

// Direct access to private handleMessage
const handle = (
  consumer: ExerciseUpdatedConsumer,
  channel: ReturnType<typeof makeChannel>,
  msg: ReturnType<typeof makeMsg>,
) => (consumer as any).handleMessage(channel, msg);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ExerciseUpdatedConsumer', () => {
  describe('happy path', () => {
    it('invalidates cache and marks event processed on first delivery', async () => {
      const cache = makeCache();
      const prisma = makePrisma(false);
      const consumer = makeConsumer(prisma, cache);
      const channel = makeChannel();

      await handle(consumer, channel, makeMsg({ exerciseId: 'ex-42' }));

      expect(cache.invalidate).toHaveBeenCalledWith('ex-42');
      expect(prisma.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-1', eventType: 'content.exercise.updated' },
      });
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('acks without invalidating cache when event was already processed', async () => {
      const cache = makeCache();
      const prisma = makePrisma(true); // already processed
      const consumer = makeConsumer(prisma, cache);
      const channel = makeChannel();

      await handle(consumer, channel, makeMsg({ exerciseId: 'ex-42' }));

      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(prisma.processedEvent.create).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });

  describe('malformed messages', () => {
    it('acks and discards message with missing exerciseId', async () => {
      const cache = makeCache();
      const prisma = makePrisma(false);
      const consumer = makeConsumer(prisma, cache);
      const channel = makeChannel();

      await handle(consumer, channel, makeMsg({})); // no exerciseId

      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('nacks without requeue when message cannot be parsed', async () => {
      const cache = makeCache();
      const prisma = makePrisma(false);
      const consumer = makeConsumer(prisma, cache);
      const channel = makeChannel();
      const badMsg = { content: Buffer.from('not-json') };

      await handle(consumer, channel, badMsg);

      expect(channel.nack).toHaveBeenCalledWith(badMsg, false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });

  describe('null message', () => {
    it('returns immediately on null message (consumer cancelled)', async () => {
      const cache = makeCache();
      const prisma = makePrisma(false);
      const consumer = makeConsumer(prisma, cache);
      const channel = makeChannel();

      await handle(consumer, channel, null);

      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });
});
