import { jest } from '@jest/globals';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { DeletedUserPrismaEraser } from '../../../src/modules/user-erasure/infrastructure/persistence/deleted-user.prisma.eraser.js';
import { UserDeletedConsumer } from '../../../src/modules/events/user-deleted.consumer.js';
import { EraseDeletedUserCommand } from '../../../src/modules/user-erasure/application/commands/erase-deleted-user.command.js';

// VoxOrd plan 07, step 3d.

describe('DeletedUserPrismaEraser', () => {
  it('deletes the learner’s attempts and probes in one transaction', async () => {
    const tx = {
      attempt: { deleteMany: jest.fn<(a: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 12 }) },
      probeTask: { deleteMany: jest.fn<(a: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 2 }) },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };

    const erased = await new DeletedUserPrismaEraser(prisma as never).erase('u1');

    expect(erased).toEqual({ attempts: 12, probes: 2 });
    expect(tx.attempt.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.probeTask.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

function makeMsg(content: unknown, redelivered = false): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)), fields: { redelivered } } as unknown as ConsumeMessage;
}

function makeChannel() {
  return { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & { ack: jest.Mock; nack: jest.Mock };
}

function makeConsumer(seen = false) {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn<() => Promise<object | null>>().mockResolvedValue(seen ? { eventId: 'evt-1' } : null),
      create: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const commandBus = { execute: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) };
  const consumer = new UserDeletedConsumer(config as never, prisma as never, commandBus as never);
  return { consumer, prisma, commandBus };
}

// Auth's envelope carries its C# type name, not the event's.
const envelope = { eventId: 'evt-1', eventType: 'IDomainEvent', payload: { userId: 'u1', email: 'a@b.c' } };

describe('UserDeletedConsumer', () => {
  it('erases the user and records the event under its routing key', async () => {
    const { consumer, prisma, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope));

    expect(commandBus.execute).toHaveBeenCalledWith(new EraseDeletedUserCommand('u1'));
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'auth.user.deleted' },
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('acks a replay without erasing again', async () => {
    const { consumer, commandBus } = makeConsumer(true);
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('retries a failed erase once, then drops it', async () => {
    const { consumer, commandBus } = makeConsumer();
    commandBus.execute.mockRejectedValue(new Error('db down'));
    const first = makeChannel();
    const second = makeChannel();

    await (consumer as any).handleMessage(first, makeMsg(envelope));
    await (consumer as any).handleMessage(second, makeMsg(envelope, true));

    expect(first.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(second.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});
