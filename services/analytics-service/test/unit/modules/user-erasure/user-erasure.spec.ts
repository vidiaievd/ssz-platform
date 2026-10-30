import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { UserDeletedConsumer } = await import('../../../../src/modules/user-erasure/consumers/user-deleted.consumer.js');
const { DeletedUserPrismaEraser } = await import(
  '../../../../src/modules/user-erasure/infrastructure/persistence/deleted-user.prisma.eraser.js'
);
const { EraseDeletedUserCommand } = await import(
  '../../../../src/modules/user-erasure/application/commands/erase-deleted-user.command.js'
);
const { archivedPayload } = await import('../../../../src/modules/event-archive/consumers/archive-all.consumer.js');

// VoxOrd plan 07, step 3e.

type Fn = (...args: any[]) => any;

function makeMsg(content: unknown, redelivered = false): any {
  return { content: Buffer.from(JSON.stringify(content)), fields: { redelivered } };
}

function makeChannel() {
  return { ack: jest.fn<Fn>(), nack: jest.fn<Fn>() };
}

function makeConsumer(seen = false) {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn<Fn>().mockResolvedValue(seen ? { eventId: 'evt-1' } : null),
      create: jest.fn<Fn>().mockResolvedValue(undefined),
    },
  };
  const config = { get: jest.fn<Fn>().mockReturnValue(undefined) };
  const commandBus = { execute: jest.fn<Fn>().mockResolvedValue({}) };
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

describe('DeletedUserPrismaEraser', () => {
  const tables = [
    'userDirectory',
    'schoolMembership',
    'groupMembership',
    'enrollmentProjection',
    'progressActivity',
    'attemptEvidence',
    'atomEvidence',
    'skillMastery',
    'srsLimitRefusal',
    'itemProgress',
    'schoolActivity',
    'reviewTermAcceptance',
  ] as const;

  function setup() {
    const raw: { sql: string; values: unknown[] }[] = [];
    const tx: Record<string, any> = {
      $executeRaw: jest.fn<Fn>().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
        raw.push({ sql: strings.join('?'), values });
        return Promise.resolve(raw.length === 1 ? 9 : 2);
      }),
    };
    for (const t of tables) tx[t] = { deleteMany: jest.fn<Fn>().mockResolvedValue({ count: 1 }) };
    const prisma = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
    return { tx, raw, eraser: new DeletedUserPrismaEraser(prisma as never) };
  }

  it('deletes every per-learner row', async () => {
    const { tx, eraser } = setup();

    const erased = await eraser.erase('u1');

    expect(erased).toEqual({ directory: 3, learning: 7, schoolRecords: 2, archivedEvents: 9, archivedCallsUnlinked: 2 });
    expect(tx.attemptEvidence.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    // The feed row the learner acted in, not a teacher's row about their work.
    expect(tx.schoolActivity.deleteMany).toHaveBeenCalledWith({ where: { actorId: 'u1' } });
  });

  it('deletes archived events naming the user but keeps the money ones, unlinked', async () => {
    const { raw, eraser } = setup();

    await eraser.erase('u1');

    expect(raw[0].sql).toContain('DELETE FROM event_archive');
    expect(raw[0].values).toEqual(['u1', ['ai.call.completed', 'subscription.entitlements.changed']]);
    expect(raw[1].sql).toContain('"actorUserId": null');
    expect(raw[1].values).toEqual(['u1']);
  });
});

describe('archivedPayload', () => {
  it('drops the address from the deletion event', () => {
    expect(archivedPayload('auth.user.deleted', { userId: 'u1', email: 'a@b.c' })).toEqual({ userId: 'u1' });
  });

  it('keeps every other payload as it came', () => {
    expect(archivedPayload('auth.user.registered', { userId: 'u1', email: 'a@b.c' })).toEqual({
      userId: 'u1',
      email: 'a@b.c',
    });
  });
});
