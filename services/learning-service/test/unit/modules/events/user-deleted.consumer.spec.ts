import { jest } from '@jest/globals';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { UserDeletedConsumer } from '../../../../src/modules/events/consumers/user-deleted.consumer.js';
import { EraseDeletedUserCommand } from '../../../../src/modules/user-erasure/application/commands/erase-deleted-user.command.js';

const USER_ID = 'uuuuuuuu-0000-4000-8000-000000000001';

function makeMsg(content: unknown, redelivered = false): ConsumeMessage {
  return {
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
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
      findUnique: jest.fn<() => Promise<object | null>>().mockResolvedValue(seen ? { eventId: 'evt-1' } : null),
      create: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const commandBus = { execute: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) } as any;
  return { consumer: new UserDeletedConsumer(prisma, config, commandBus), prisma, commandBus };
}

// Auth's envelope carries its C# type name, not the event's.
const envelope = { eventId: 'evt-1', eventType: 'IDomainEvent', payload: { userId: USER_ID, email: 'a@b.c' } };

describe('UserDeletedConsumer', () => {
  it('erases the user and records the event under its routing key', async () => {
    const { consumer, prisma, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope));

    expect(commandBus.execute).toHaveBeenCalledWith(new EraseDeletedUserCommand(USER_ID));
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

  it('drops a message without a user id', async () => {
    const { consumer, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg({ eventId: 'evt-1', payload: {} }));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('retries a failed erase once, then drops it', async () => {
    const { consumer, prisma, commandBus } = makeConsumer();
    commandBus.execute.mockRejectedValue(new Error('db down'));
    const first = makeChannel();
    const second = makeChannel();

    await (consumer as any).handleMessage(first, makeMsg(envelope));
    await (consumer as any).handleMessage(second, makeMsg(envelope, true));

    expect(first.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(second.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(prisma.processedEvent.create).not.toHaveBeenCalled();
  });
});
