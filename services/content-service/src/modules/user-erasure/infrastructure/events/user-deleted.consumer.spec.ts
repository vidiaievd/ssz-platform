jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));
// The package exports only an ESM entry, which this CommonJS jest cannot resolve.
jest.mock(
  '@ssz/contracts',
  () => ({
    EXCHANGES: { AUTH: 'auth.events' },
    AUTH_EVENT_TYPES: { USER_DELETED: 'auth.user.deleted' },
  }),
  { virtual: true },
);

import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { UserDeletedConsumer } from './user-deleted.consumer.js';
import { EraseDeletedUserCommand } from '../../application/commands/erase-deleted-user/erase-deleted-user.command.js';

function makeMsg(content: unknown, redelivered = false): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(content)),
    fields: { redelivered },
  } as unknown as ConsumeMessage;
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
      findUnique: jest.fn().mockResolvedValue(seen ? { eventId: 'evt-1' } : null),
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const commandBus = { execute: jest.fn().mockResolvedValue({}) };
  const consumer = new UserDeletedConsumer(config as never, prisma as never, commandBus as never);
  return { consumer, prisma, commandBus };
}

// Auth's envelope carries its C# type name, not the event's.
const envelope = { eventId: 'evt-1', eventType: 'IDomainEvent', payload: { userId: 'u1', email: 'a@b.c' } };

describe('UserDeletedConsumer', () => {
  it('erases the user and records the event under its own processor', async () => {
    const { consumer, prisma, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope));

    expect(commandBus.execute).toHaveBeenCalledWith(new EraseDeletedUserCommand('u1'));
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', processorId: 'user-deleted', eventType: 'auth.user.deleted' },
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
