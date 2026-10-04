import { jest } from '@jest/globals';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ExerciseReleasedConsumer } from '../../../../src/modules/events/consumers/exercise-released.consumer.js';
import { PruneGapCardsCommand } from '../../../../src/modules/srs/application/commands/prune-gap-cards.command.js';

const EXERCISE_ID = 'eeeeeeee-0000-4000-8000-000000000001';

function makeMsg(content: unknown): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)) } as unknown as ConsumeMessage;
}

function makeChannel() {
  return { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & {
    ack: jest.Mock;
    nack: jest.Mock;
  };
}

function makeConsumer(seen = false) {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn<() => Promise<object | null>>().mockResolvedValue(seen ? { eventId: 'evt-1' } : null),
      create: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const commandBus = { execute: jest.fn<() => Promise<number>>().mockResolvedValue(0) } as any;
  return { consumer: new ExerciseReleasedConsumer(prisma, config, commandBus), prisma, commandBus };
}

const envelope = (itemKeys: string[] | null) => ({
  eventId: 'evt-1',
  eventType: 'content.exercise.released',
  payload: { exerciseId: EXERCISE_ID, templateCode: 'dictation', itemKeys },
});

describe('ExerciseReleasedConsumer', () => {
  it('prunes the gap cards to the pieces the released exercise still has', async () => {
    const { consumer, prisma, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope(['s1', 's3'])));

    expect(commandBus.execute).toHaveBeenCalledWith(new PruneGapCardsCommand(EXERCISE_ID, ['s1', 's3']));
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'content.exercise.released' },
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('prunes everything for an addressable exercise left with no pieces', async () => {
    const { consumer, commandBus } = makeConsumer();

    await (consumer as any).handleMessage(makeChannel(), makeMsg(envelope([])));

    expect(commandBus.execute).toHaveBeenCalledWith(new PruneGapCardsCommand(EXERCISE_ID, []));
  });

  it('leaves the cards alone for a template that keeps nothing per piece (null)', async () => {
    const { consumer, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope(null)));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('skips a redelivered event', async () => {
    const { consumer, commandBus } = makeConsumer(true);
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope(['s1'])));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });
});
