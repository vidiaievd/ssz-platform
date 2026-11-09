jest.mock('../../infrastructure/database/prisma.service.js', () => ({
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
// Its promise-breaker dependency is ESM-only; no test here connects.
jest.mock('amqp-connection-manager', () => ({ __esModule: true, default: { connect: jest.fn() } }));

import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EraseDeletedUserCommand } from './application/commands/erase-deleted-user.command.js';
import { DeletedUserPrismaEraser } from './infrastructure/persistence/deleted-user.prisma.eraser.js';
import { UserDeletedConsumer } from './presentation/events/user-deleted.consumer.js';

// VoxOrd plan 07, step 3e.

function makeMsg(content: unknown, redelivered = false): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)), fields: { redelivered } } as unknown as ConsumeMessage;
}

function makeChannel() {
  return { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & { ack: jest.Mock; nack: jest.Mock };
}

function makeConsumer() {
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const commandBus = { execute: jest.fn().mockResolvedValue({}) };
  return { consumer: new UserDeletedConsumer(config as never, commandBus as never), commandBus };
}

// Auth's envelope carries its C# type name, not the event's.
const envelope = { eventId: 'evt-1', eventType: 'IDomainEvent', payload: { userId: 'u1', email: 'a@b.c' } };

describe('UserDeletedConsumer', () => {
  it('erases the user and acks', async () => {
    const { consumer, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handle(channel, makeMsg(envelope));

    expect(commandBus.execute).toHaveBeenCalledWith(new EraseDeletedUserCommand('u1'));
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('drops a message without a user', async () => {
    const { consumer, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handle(channel, makeMsg({ eventId: 'evt-1', payload: {} }));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('retries a failed erase once, then drops it', async () => {
    const { consumer, commandBus } = makeConsumer();
    commandBus.execute.mockRejectedValue(new Error('db down'));
    const first = makeChannel();
    const second = makeChannel();

    await (consumer as any).handle(first, makeMsg(envelope));
    await (consumer as any).handle(second, makeMsg(envelope, true));

    expect(first.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(second.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});

describe('DeletedUserPrismaEraser', () => {
  function setup() {
    const tx = {
      aiCall: { updateMany: jest.fn().mockResolvedValue({ count: 5 }) },
      assistFeedback: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      aiPayerEntitlements: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiPayerPolicy: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
    return { tx, eraser: new DeletedUserPrismaEraser(prisma as never) };
  }

  it('keeps the ledger rows but clears the actor off them', async () => {
    const { tx, eraser } = setup();

    const erased = await eraser.erase('u1');

    expect(erased).toEqual({ callsUnlinked: 5, feedback: 2, payerRows: 1 });
    expect(tx.aiCall.updateMany).toHaveBeenCalledWith({
      where: { actorUserId: 'u1' },
      data: { actorUserId: null, actorRole: null },
    });
  });

  it("deletes the feedback and only the user's own payer rows", async () => {
    const { tx, eraser } = setup();

    await eraser.erase('u1');

    expect(tx.assistFeedback.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(tx.aiPayerEntitlements.deleteMany).toHaveBeenCalledWith({ where: { payerType: 'user', payerId: 'u1' } });
    expect(tx.aiPayerPolicy.deleteMany).toHaveBeenCalledWith({ where: { payerType: 'user', payerId: 'u1' } });
  });
});
