import { jest } from '@jest/globals';
import { SchoolPurgedConsumer } from '../../../../src/modules/events/consumers/school-purged.consumer.js';
import type { ConsumeMessage } from 'amqplib';

const SCHOOL_ID = '11111111-0000-4000-8000-000000000001';

const msg = (content: unknown, redelivered = false): ConsumeMessage =>
  ({ content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)), fields: { redelivered } }) as unknown as ConsumeMessage;

function setup(seen = false) {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(seen ? { eventId: 'e1' } : null),
      create: jest.fn((args: unknown) => ({ op: 'marker', args })),
    },
    enrollment: { updateMany: jest.fn((args: unknown) => ({ op: 'enrollments', args })) },
    assignment: { updateMany: jest.fn((args: unknown) => ({ op: 'assignments', args })) },
    $transaction: jest.fn<(ops: unknown[]) => Promise<unknown[]>>().mockResolvedValue([{ count: 3 }, { count: 2 }, {}]),
  };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const consumer = new SchoolPurgedConsumer(prisma as never, { get: () => undefined } as never);
  return { prisma, channel, consumer };
}

describe('SchoolPurgedConsumer (plan 90, phase 5, step 8)', () => {
  it('completes the open enrolments and assignments of the school, and nothing else', async () => {
    const { prisma, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg({ eventId: 'e1', payload: { schoolId: SCHOOL_ID } }));

    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL_ID, status: 'ACTIVE', deletedAt: null },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
    expect(prisma.assignment.updateMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL_ID, status: { in: ['ACTIVE', 'OVERDUE'] }, deletedAt: null },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
    // One transaction with the processed-event marker; progress and SRS tables are never named.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({ data: { eventId: 'e1', eventType: 'school.purged' } });
    expect(channel.ack).toHaveBeenCalled();
  });

  it('skips an event it has seen', async () => {
    const { prisma, channel, consumer } = setup(true);
    await consumer.handleMessage(channel, msg({ eventId: 'e1', payload: { schoolId: SCHOOL_ID } }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it.each([
    ['garbage', 'not json'],
    ['no school id', { eventId: 'e1', payload: {} }],
    ['an empty school id', { eventId: 'e1', payload: { schoolId: '' } }],
    ['no event id', { payload: { schoolId: SCHOOL_ID } }],
  ])('discards %s without touching a row', async (_label, content) => {
    const { prisma, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(content));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues once on a database failure, then discards', async () => {
    const { prisma, channel, consumer } = setup();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    const body = { eventId: 'e1', payload: { schoolId: SCHOOL_ID } };
    await consumer.handleMessage(channel, msg(body));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
    await consumer.handleMessage(channel, msg(body, true));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
  });
});
