jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));
// The package exports only an ESM entry, which this CommonJS jest cannot resolve.
jest.mock(
  '@ssz/contracts',
  () => ({
    EXCHANGES: { ORGANIZATION: 'organization.events' },
    ORGANIZATION_EVENT_TYPES: {
      SCHOOL_CLOSED: 'school.closed',
      SCHOOL_RESTORED: 'school.restored',
      SCHOOL_PURGED: 'school.purged',
    },
  }),
  { virtual: true },
);

import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { SchoolLifecycleConsumer } from './school-lifecycle.consumer.js';
import {
  ApplySchoolClosedCommand,
  ApplySchoolRestoredCommand,
  PurgeSchoolMaterialsCommand,
} from '../../application/commands/school-lifecycle.commands.js';

const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

function setup(processed = false) {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn().mockResolvedValue(processed ? { eventId: 'e1' } : null),
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
  const commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
  const consumer = new SchoolLifecycleConsumer(
    { get: () => undefined } as never,
    prisma as never,
    commandBus as never,
  );
  const channel = { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & {
    ack: jest.Mock;
    nack: jest.Mock;
  };
  const send = (body: unknown, redelivered = false) =>
    (
      consumer as unknown as { handleMessage(c: unknown, m: ConsumeMessage): Promise<void> }
    ).handleMessage(channel, {
      content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      fields: { redelivered, routingKey: 'school.closed' },
    } as unknown as ConsumeMessage);
  return { prisma, commandBus, channel, send };
}

const envelope = (
  eventType: string,
  payload: Record<string, unknown> = { schoolId: SCHOOL, name: 'Nordisk' },
) => ({
  eventId: 'e1',
  eventType,
  payload,
});

describe('SchoolLifecycleConsumer', () => {
  it.each([
    ['school.closed', new ApplySchoolClosedCommand(SCHOOL, 'Nordisk')],
    ['school.restored', new ApplySchoolRestoredCommand(SCHOOL)],
    ['school.purged', new PurgeSchoolMaterialsCommand(SCHOOL, 'Nordisk')],
  ])('%s runs its command, records the event and acks', async (type, command) => {
    const { prisma, commandBus, channel, send } = setup();
    await send(envelope(type));
    expect(commandBus.execute).toHaveBeenCalledWith(command);
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'e1', processorId: 'school-lifecycle', eventType: type },
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('acks a redelivered event without running it again', async () => {
    const { commandBus, channel, send } = setup(true);
    await send(envelope('school.purged'));
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not json'],
    [envelope('school.purged', { name: 'x' })],
    [envelope('school.suspended')],
    [{ eventType: 'school.closed', payload: { schoolId: SCHOOL } }],
  ])('discards a malformed message %#', async (body) => {
    const { commandBus, channel, send } = setup();
    await send(body);
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues a failure once, then gives up', async () => {
    const { commandBus, channel, prisma, send } = setup();
    commandBus.execute.mockRejectedValue(
      new Error('learning-service refused active-learners: HTTP 503'),
    );
    await send(envelope('school.purged'));
    await send(envelope('school.purged'), true);
    expect(channel.nack.mock.calls.map((c) => c[2])).toEqual([true, false]);
    expect(prisma.processedEvent.create).not.toHaveBeenCalled();
  });
});
