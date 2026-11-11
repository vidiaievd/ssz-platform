// amqp-connection-manager ships ESM that jest cannot load; the handler under test never touches it.
jest.mock('amqp-connection-manager', () => ({ __esModule: true, default: { connect: jest.fn() } }));

// The built contracts package is not resolvable under this service's jest; only two constants are read.
jest.mock(
  '@ssz/contracts',
  () => ({
    EXCHANGES: { ORGANIZATION: 'organization.events' },
    ORGANIZATION_EVENT_TYPES: { SCHOOL_SUSPENDED: 'school.suspended', SCHOOL_CLOSED: 'school.closed', SCHOOL_PURGED: 'school.purged' },
  }),
  { virtual: true },
);

// Importing PrismaService by value loads the generated client (ESM) and breaks jest.
jest.mock('../database/prisma.service.js', () => ({ PrismaService: class {} }));

import type { ConsumeMessage } from 'amqplib';
import { SchoolLifecycleConsumer } from './school-lifecycle.consumer.js';

const SCHOOL = '11111111-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-11T15:30:00.000Z');
const TODAY = new Date('2026-11-11T00:00:00.000Z');
const YESTERDAY = new Date('2026-11-10T00:00:00.000Z');

const msg = (routingKey: string, body: unknown, redelivered = false): ConsumeMessage =>
  ({ content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), fields: { routingKey, redelivered } }) as ConsumeMessage;

function setup(seen = false) {
  const ops: string[] = [];
  const op = (name: string) => jest.fn((args: unknown) => ({ name, args }));
  const prisma = {
    processedEvent: {
      findUnique: jest.fn().mockResolvedValue(seen ? { eventId: 'e1' } : null),
      create: op('marker'),
    },
    lesson: { updateMany: op('lesson.updateMany'), deleteMany: op('lesson.deleteMany') },
    reviewBlock: { deleteMany: op('reviewBlock.deleteMany'), updateMany: op('reviewBlock.updateMany') },
    substituteAssignment: { deleteMany: op('substituteAssignment.deleteMany') },
    substituteRequest: { deleteMany: op('substituteRequest.deleteMany') },
    teacherAbsence: { deleteMany: op('teacherAbsence.deleteMany') },
    slot: { deleteMany: op('slot.deleteMany') },
    curriculumPlan: { deleteMany: op('curriculumPlan.deleteMany') },
    alert: { deleteMany: op('alert.deleteMany') },
    gradingPolicy: { deleteMany: op('gradingPolicy.deleteMany') },
    workloadPolicy: { deleteMany: op('workloadPolicy.deleteMany') },
    schoolMembership: { deleteMany: op('schoolMembership.deleteMany') },
    $transaction: jest.fn(async (list: Array<{ name: string }>) => {
      ops.push(...list.map((o) => o.name));
      return list.map(() => ({ count: 1 }));
    }),
  };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  return { prisma, channel, ops, consumer: new SchoolLifecycleConsumer({ get: () => undefined } as never, prisma as never) };
}

const body = { eventId: 'e1', payload: { schoolId: SCHOOL } };

describe('SchoolLifecycleConsumer (plan 90, phase 5, step 8)', () => {
  it.each([
    ['school.suspended', 'suspended'],
    ['school.closed', 'closed'],
  ])('%s cancels the future of the school and nothing in the past', async (key, why) => {
    const { prisma, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(key, body), NOW);

    expect(prisma.lesson.updateMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL, date: { gte: TODAY }, status: { in: ['scheduled', 'moved'] } },
      data: { status: 'cancelled', note: `School ${why}` },
    });
    expect(prisma.reviewBlock.deleteMany).toHaveBeenCalledWith({ where: { schoolId: SCHOOL, startsOn: { gte: TODAY } } });
    expect(prisma.reviewBlock.updateMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL, startsOn: { lt: TODAY }, OR: [{ endsOn: null }, { endsOn: { gte: TODAY } }] },
      data: { endsOn: YESTERDAY },
    });
    expect(prisma.lesson.deleteMany).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it('school.purged deletes the school\'s data children first, in one transaction', async () => {
    const { prisma, channel, consumer, ops } = setup();
    await consumer.handleMessage(channel, msg('school.purged', body), NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ops.indexOf('substituteAssignment.deleteMany')).toBeLessThan(ops.indexOf('substituteRequest.deleteMany'));
    expect(ops.indexOf('substituteRequest.deleteMany')).toBeLessThan(ops.indexOf('lesson.deleteMany'));
    expect(ops.indexOf('substituteRequest.deleteMany')).toBeLessThan(ops.indexOf('teacherAbsence.deleteMany'));
    expect(prisma.substituteAssignment.deleteMany).toHaveBeenCalledWith({ where: { request: { schoolId: SCHOOL } } });
    expect(prisma.lesson.deleteMany).toHaveBeenCalledWith({ where: { schoolId: SCHOOL } });
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({ data: { eventId: 'e1', eventType: 'school.purged' } });
    expect(channel.ack).toHaveBeenCalled();
  });

  it('skips an event it has seen', async () => {
    const { prisma, channel, consumer } = setup(true);
    await consumer.handleMessage(channel, msg('school.closed', body), NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it.each([
    ['garbage', 'school.closed', 'not json'],
    ['no school id', 'school.closed', { eventId: 'e1', payload: {} }],
    ['an empty school id', 'school.purged', { eventId: 'e1', payload: { schoolId: '' } }],
    ['no event id', 'school.closed', { payload: { schoolId: SCHOOL } }],
    ['another event', 'school.restored', body],
  ])('discards %s without touching a row', async (_label, key, content) => {
    const { prisma, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(key, content), NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues once on a database failure, then discards', async () => {
    const { prisma, channel, consumer } = setup();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await consumer.handleMessage(channel, msg('school.closed', body), NOW);
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
    await consumer.handleMessage(channel, msg('school.closed', body, true), NOW);
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
  });
});
