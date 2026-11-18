import type { ConsumeMessage } from 'amqplib';
// amqp-connection-manager ships ESM that jest cannot load; the handler under test never touches it.
jest.mock('amqp-connection-manager', () => ({ __esModule: true, default: { connect: jest.fn() } }));

import { SchoolStatusConsumer } from './school-status.consumer.js';

function message(routingKey: string, body: unknown, redelivered = false): ConsumeMessage {
  return { content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), fields: { routingKey, redelivered } } as ConsumeMessage;
}

function setup(saveResult: boolean | Error = true) {
  const store = {
    get: jest.fn(),
    save: jest.fn().mockImplementation(async () => {
      if (saveResult instanceof Error) throw saveResult;
      return saveResult;
    }),
  };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const consumer = new SchoolStatusConsumer({ get: () => undefined } as never, store);
  return { store, channel, consumer };
}

const AT = '2026-11-11T10:00:00.000Z';
const body = { eventId: 'e1', occurredAt: AT, payload: { schoolId: 's1' } };

describe('SchoolStatusConsumer', () => {
  it.each([
    ['school.suspended', 'suspended'],
    ['school.reactivated', 'active'],
    ['school.closed', 'closed'],
    ['school.restored', 'active'],
    ['school.purged', 'purged'],
  ])('%s leaves the school %s, at the moment of the event', async (key, status) => {
    const { store, channel, consumer } = setup();
    await consumer.handle(channel, message(key, body));
    expect(store.save).toHaveBeenCalledWith('s1', status, new Date(AT));
    expect(channel.ack).toHaveBeenCalled();
  });

  it('acks a stale event the store skipped', async () => {
    const { channel, consumer } = setup(false);
    await consumer.handle(channel, message('school.closed', body));
    expect(channel.ack).toHaveBeenCalled();
  });

  it.each([
    ['garbage', 'school.closed', 'not json'],
    ['no schoolId', 'school.closed', { eventId: 'e', occurredAt: AT, payload: {} }],
    ['no time', 'school.closed', { eventId: 'e', payload: { schoolId: 's1' } }],
    ['another event', 'school.created', body],
  ])('drops a malformed message (%s) without requeue', async (_l, key, content) => {
    const { store, channel, consumer } = setup();
    await consumer.handle(channel, message(key, content));
    expect(store.save).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues once on a store failure, then discards', async () => {
    const { channel, consumer } = setup(new Error('db down'));
    await consumer.handle(channel, message('school.closed', body));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
    await consumer.handle(channel, message('school.closed', body, true));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
  });
});
