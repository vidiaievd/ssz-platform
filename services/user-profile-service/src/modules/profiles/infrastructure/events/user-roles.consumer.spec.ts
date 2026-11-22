jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import type { ConsumeMessage } from 'amqplib';
import { UserRolesConsumer } from './user-roles.consumer.js';

function msg(routingKey: string, body: unknown, redelivered = false): ConsumeMessage {
  return {
    content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    fields: { routingKey, redelivered },
  } as unknown as ConsumeMessage;
}

function setup(opts: { processed?: boolean; changed?: number; fail?: boolean } = {}) {
  const sql: { text: string; values: unknown[] }[] = [];
  const prisma = {
    $executeRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      sql.push({ text: strings.join('?'), values });
      return opts.fail ? Promise.reject(new Error('db down')) : Promise.resolve(opts.changed ?? 1);
    }),
  };
  const processed = {
    isProcessed: jest.fn().mockResolvedValue(opts.processed ?? false),
    markProcessed: jest.fn().mockResolvedValue(undefined),
  };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const consumer = new UserRolesConsumer(prisma as any, processed as any, 'amqp://x');
  return { consumer, channel, sql, processed };
}

const event = (role = 'student') => ({ eventId: 'e-1', payload: { userId: 'u-1', role } });

describe('UserRolesConsumer', () => {
  it('adds an assigned role to an existing row only, once', async () => {
    const { consumer, channel, sql, processed } = setup();
    await consumer.handle(channel, msg('auth.user.role_assigned', event('Student')));
    expect(sql).toHaveLength(1);
    expect(sql[0].text).toContain('array_append(roles');
    expect(sql[0].text).toContain('NOT (');
    expect(sql[0].values).toEqual(['student', 'u-1', 'student']);
    expect(processed.markProcessed).toHaveBeenCalledWith('e-1', 'auth.user.role_assigned');
    expect(channel.ack).toHaveBeenCalled();
  });

  it('removes a role the row has', async () => {
    const { consumer, channel, sql } = setup();
    await consumer.handle(channel, msg('auth.user.role_removed', event('platform_admin')));
    expect(sql[0].text).toContain('array_remove(roles');
    expect(sql[0].values).toEqual(['platform_admin', 'u-1', 'platform_admin']);
    expect(channel.ack).toHaveBeenCalled();
  });

  it('acks a row that is not there (registration brings the whole set)', async () => {
    const { consumer, channel } = setup({ changed: 0 });
    await consumer.handle(channel, msg('auth.user.role_assigned', event()));
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('skips an event already applied', async () => {
    const { consumer, channel, sql } = setup({ processed: true });
    await consumer.handle(channel, msg('auth.user.role_assigned', event()));
    expect(sql).toHaveLength(0);
    expect(channel.ack).toHaveBeenCalled();
  });

  it('drops malformed messages without requeue', async () => {
    const { consumer, channel, sql } = setup();
    await consumer.handle(channel, msg('auth.user.role_assigned', 'not json'));
    await consumer.handle(channel, msg('auth.user.role_assigned', { eventId: 'e-2', payload: { userId: 'u-1' } }));
    await consumer.handle(channel, msg('auth.user.login', event()));
    expect(sql).toHaveLength(0);
    expect(channel.nack).toHaveBeenCalledTimes(3);
    for (const call of channel.nack.mock.calls) expect(call.slice(1)).toEqual([false, false]);
  });

  it('requeues a database failure once', async () => {
    const first = setup({ fail: true });
    await first.consumer.handle(first.channel, msg('auth.user.role_assigned', event()));
    expect(first.channel.nack.mock.calls[0].slice(1)).toEqual([false, true]);
    const again = setup({ fail: true });
    await again.consumer.handle(again.channel, msg('auth.user.role_assigned', event(), true));
    expect(again.channel.nack.mock.calls[0].slice(1)).toEqual([false, false]);
  });
});
