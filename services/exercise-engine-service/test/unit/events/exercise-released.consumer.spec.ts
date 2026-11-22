import { jest } from '@jest/globals';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ExerciseReleasedConsumer } from '../../../src/modules/events/exercise-released.consumer.js';

function makeMsg(content: unknown, redelivered = false): ConsumeMessage {
  const raw = typeof content === 'string' ? content : JSON.stringify(content);
  return { content: Buffer.from(raw), fields: { redelivered } } as unknown as ConsumeMessage;
}

function makeChannel() {
  return { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & { ack: jest.Mock; nack: jest.Mock };
}

function makeConsumer() {
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const cache = { invalidate: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined) };
  const consumer = new ExerciseReleasedConsumer(config as never, cache as never);
  const handle = (channel: ConfirmChannel, msg: ConsumeMessage) =>
    (consumer as unknown as { handleMessage: (c: ConfirmChannel, m: ConsumeMessage) => Promise<void> }).handleMessage(
      channel,
      msg,
    );
  return { handle, cache };
}

const payload = { exerciseId: 'ex-1', templateCode: 'multiple_choice', itemKeys: null };

describe('ExerciseReleasedConsumer', () => {
  it('drops every cached definition of the released exercise', async () => {
    const { handle, cache } = makeConsumer();
    const channel = makeChannel();

    await handle(channel, makeMsg({ eventId: 'evt-1', eventType: 'ExerciseReleasedEvent', payload }));

    expect(cache.invalidate).toHaveBeenCalledWith('ex-1');
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('reads the nested envelope content published before 05133a2e', async () => {
    const { handle, cache } = makeConsumer();
    const channel = makeChannel();

    await handle(channel, makeMsg({ eventId: 'evt-2', payload: { eventType: 'content.exercise.released', payload } }));

    expect(cache.invalidate).toHaveBeenCalledWith('ex-1');
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('acks a message without an exercise id and touches nothing', async () => {
    const { handle, cache } = makeConsumer();
    const channel = makeChannel();

    await handle(channel, makeMsg({ eventId: 'evt-3', payload: {} }));

    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('discards a malformed message without requeue', async () => {
    const { handle, cache } = makeConsumer();
    const channel = makeChannel();

    await handle(channel, makeMsg('{not json'));

    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('retries a failed invalidation once, then leaves it to the TTL', async () => {
    const { handle, cache } = makeConsumer();
    cache.invalidate.mockRejectedValue(new Error('redis down'));
    const first = makeChannel();
    const second = makeChannel();
    const envelope = { eventId: 'evt-4', payload };

    await handle(first, makeMsg(envelope));
    await handle(second, makeMsg(envelope, true));

    expect(first.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(second.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(first.ack).not.toHaveBeenCalled();
  });
});
