import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AdminActionConsumer } from '../../../../src/modules/admin-audit/consumers/admin-action.consumer.js';
import {
  adminAuditRowOf,
  decodeCursor,
  encodeCursor,
} from '../../../../src/modules/admin-audit/domain/admin-audit.js';
import { whereOf } from '../../../../src/modules/admin-audit/queries/list-admin-audit.handler.js';
import type { AppConfig } from '../../../../src/config/configuration.js';
import type { PrismaService } from '../../../../src/infrastructure/database/prisma.service.js';

/** As auth-service publishes it: C# envelope, class name as eventType, numeric version, nulls omitted. */
const authEnvelope = {
  eventId: '0b9d6c1e-6a43-4b8e-9f36-1f7a0c2d3e4f',
  eventType: 'AdminActionPerformedEvent',
  routingKey: 'admin.action.performed',
  occurredAt: '2026-11-09T14:05:06.789+00:00',
  version: 1,
  source: 'auth-service',
  payload: {
    service: 'auth',
    actorId: 'a1',
    actorLevel: 'super',
    action: 'admin.level_changed',
    targetType: 'admin',
    targetId: 'u2',
    reason: 'moves to support',
    before: { email: 'x@example.com', level: 'admin' },
    after: { email: 'x@example.com', level: 'support' },
  },
};

/** As subscription-service's outbox publishes it: NestJS envelope with a string eventVersion. */
const subscriptionEnvelope = {
  eventId: '7c2e9a10-3b4d-4f5e-8a6b-9c0d1e2f3a4b',
  eventType: 'admin.action.performed',
  eventVersion: '1.0',
  occurredAt: '2026-11-09T15:00:00.000Z',
  source: 'subscription-service',
  payload: {
    service: 'subscription',
    actorId: 'a1',
    actorLevel: 'admin',
    action: 'subscription.canceled',
    targetType: 'workspace',
    targetId: 's1',
    reason: 'school asked',
    before: { planCode: 'pro', version: 2 },
  },
};

describe('adminAuditRowOf (plan 90, step 6)', () => {
  it('files auth\'s C# envelope under auth', () => {
    expect(adminAuditRowOf('auth.events', authEnvelope)).toEqual({
      id: authEnvelope.eventId,
      service: 'auth',
      occurredAt: new Date('2026-11-09T14:05:06.789Z'),
      actorId: 'a1',
      actorLevel: 'super',
      action: 'admin.level_changed',
      targetType: 'admin',
      targetId: 'u2',
      reason: 'moves to support',
      before: { email: 'x@example.com', level: 'admin' },
      after: { email: 'x@example.com', level: 'support' },
    });
  });

  it('files subscription\'s envelope; an absent side is null', () => {
    const row = adminAuditRowOf('subscription.events', subscriptionEnvelope)!;
    expect(row).toMatchObject({ service: 'subscription', targetType: 'workspace', targetId: 's1', after: null });
    expect(row.before).toEqual({ planCode: 'pro', version: 2 });
  });

  it('keeps an action with no person behind it (auth `admin bootstrap`)', () => {
    const { actorId: _a, actorLevel: _l, ...payload } = authEnvelope.payload;
    const row = adminAuditRowOf('auth.events', { ...authEnvelope, payload })!;
    expect(row).toMatchObject({ actorId: null, actorLevel: null });
  });

  it('files ai-service\'s envelope under ai (plan 90, phase 3, step 3)', () => {
    const aiEnvelope = {
      ...subscriptionEnvelope,
      eventId: '3d1f5b7a-9c2e-4a6b-8d0f-1e2a3b4c5d6e',
      source: 'ai-service',
      payload: {
        service: 'ai',
        actorId: 'a1',
        actorLevel: 'admin',
        action: 'payer_policy.changed',
        targetType: 'workspace',
        targetId: 's1',
        reason: 'EU only',
        before: { aiEnabled: true, allowedRegions: null },
        after: { aiEnabled: true, allowedRegions: ['eu'] },
      },
    };
    expect(adminAuditRowOf('ai.events', aiEnvelope)).toMatchObject({
      id: aiEnvelope.eventId,
      service: 'ai',
      action: 'payer_policy.changed',
      targetType: 'workspace',
      targetId: 's1',
      after: { aiEnabled: true, allowedRegions: ['eu'] },
    });
    expect(adminAuditRowOf('ai.events', subscriptionEnvelope)).toBeNull();
  });

  it('takes the service from the exchange: a payload naming another service is refused', () => {
    expect(adminAuditRowOf('subscription.events', authEnvelope)).toBeNull();
    expect(adminAuditRowOf('auth.events', subscriptionEnvelope)).toBeNull();
  });

  it('files organization\'s school lifecycle under organization (plan 90, phase 5)', () => {
    const orgEnvelope = {
      ...subscriptionEnvelope,
      eventId: '5e2a7c9b-1d3f-4b8a-9c0e-2f3a4b5c6d7e',
      source: 'organization-service',
      payload: {
        service: 'organization',
        actorId: 'a1',
        actorLevel: 'super',
        action: 'school.closed',
        targetType: 'school',
        targetId: 's1',
        reason: 'fraud',
        before: { status: 'active' },
        after: { status: 'closed' },
      },
    };
    expect(adminAuditRowOf('organization.events', orgEnvelope)).toMatchObject({
      id: orgEnvelope.eventId,
      service: 'organization',
      action: 'school.closed',
      targetType: 'school',
      targetId: 's1',
      after: { status: 'closed' },
    });
    // The timer and the owner have no admin level: the row is filed, the level stays empty.
    const { actorLevel: _l, ...noLevel } = orgEnvelope.payload;
    expect(adminAuditRowOf('organization.events', { ...orgEnvelope, payload: noLevel })).toMatchObject({ actorLevel: null });
  });

  it('refuses exchanges it does not collect from', () => {
    expect(adminAuditRowOf('content.events', { ...authEnvelope, payload: { ...authEnvelope.payload, service: 'content' } })).toBeNull();
  });

  it('refuses what it cannot file', () => {
    const p = authEnvelope.payload;
    expect(adminAuditRowOf('auth.events', null)).toBeNull();
    expect(adminAuditRowOf('auth.events', { ...authEnvelope, eventId: '' })).toBeNull();
    expect(adminAuditRowOf('auth.events', { ...authEnvelope, occurredAt: 'yesterday' })).toBeNull();
    expect(adminAuditRowOf('auth.events', { ...authEnvelope, payload: { ...p, action: '' } })).toBeNull();
    expect(adminAuditRowOf('auth.events', { ...authEnvelope, payload: { ...p, targetId: 5 } })).toBeNull();
    expect(adminAuditRowOf('auth.events', { ...authEnvelope, payload: { ...p, before: ['x'] } })).toBeNull();
  });

  it('drops an unknown actor level rather than storing it', () => {
    const row = adminAuditRowOf('auth.events', { ...authEnvelope, payload: { ...authEnvelope.payload, actorLevel: 'root' } })!;
    expect(row.actorLevel).toBeNull();
  });
});

describe('cursor', () => {
  it('round-trips', () => {
    const cursor = { occurredAt: new Date('2026-11-09T15:00:00.000Z'), id: 'abc|def' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('refuses what it did not write', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('nonsense|x').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('2026-11-09T15:00:00.000Z|').toString('base64url'))).toBeNull();
  });
});

describe('whereOf', () => {
  it('no filter reads everything', () => {
    expect(whereOf({}, null)).toEqual({});
  });

  it('combines filters with AND; from inclusive, to exclusive; cursor continues after the last row', () => {
    const from = new Date('2026-11-01T00:00:00Z');
    const to = new Date('2026-11-10T00:00:00Z');
    const at = new Date('2026-11-09T15:00:00Z');
    expect(whereOf({ service: 'subscription', targetType: 'workspace', targetId: 's1', from, to }, { occurredAt: at, id: 'r9' })).toEqual({
      AND: [
        { service: 'subscription' },
        { targetType: 'workspace' },
        { targetId: 's1' },
        { occurredAt: { gte: from } },
        { occurredAt: { lt: to } },
        { OR: [{ occurredAt: { lt: at } }, { occurredAt: at, id: { lt: 'r9' } }] },
      ],
    });
  });
});

type CreateMany = (args: { data: Record<string, unknown>[]; skipDuplicates: boolean }) => Promise<{ count: number }>;

describe('AdminActionConsumer.handleMessage', () => {
  const message = (body: unknown, redelivered = false) =>
    ({ content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), fields: { redelivered } }) as unknown as ConsumeMessage;

  function setup(opts: { alreadyFiled?: boolean; fail?: boolean } = {}) {
    const tx = {
      processedEvent: { createMany: jest.fn<CreateMany>().mockResolvedValue({ count: opts.alreadyFiled ? 0 : 1 }) },
      adminAuditLog: { createMany: jest.fn<CreateMany>().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        if (opts.fail) throw new Error('db down');
        return fn(tx);
      }),
    } as unknown as PrismaService;
    const channel = { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & {
      ack: jest.Mock;
      nack: jest.Mock;
    };
    const consumer = new AdminActionConsumer({ get: () => undefined } as unknown as ConfigService<AppConfig>, prisma);
    return { consumer, channel, tx };
  }

  it('files the row with the marker and acks', async () => {
    const { consumer, channel, tx } = setup();
    await consumer.handleMessage(channel, 'subscription.events', message(subscriptionEnvelope));

    expect(tx.processedEvent.createMany).toHaveBeenCalledWith({
      data: [{ eventId: subscriptionEnvelope.eventId, processorId: 'admin-audit-log', eventType: 'admin.action.performed' }],
      skipDuplicates: true,
    });
    const data = tx.adminAuditLog.createMany.mock.calls[0]![0].data[0];
    expect(data).toMatchObject({ id: subscriptionEnvelope.eventId, service: 'subscription', action: 'subscription.canceled' });
    expect(channel.ack).toHaveBeenCalled();
  });

  it('a redelivery files nothing and still acks', async () => {
    const { consumer, channel, tx } = setup({ alreadyFiled: true });
    await consumer.handleMessage(channel, 'auth.events', message(authEnvelope));
    expect(tx.adminAuditLog.createMany).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it('dead-letters what it cannot read', async () => {
    const { consumer, channel } = setup();
    await consumer.handleMessage(channel, 'auth.events', message('{not json'));
    await consumer.handleMessage(channel, 'auth.events', message(subscriptionEnvelope));
    expect(channel.nack).toHaveBeenNthCalledWith(1, expect.anything(), false, false);
    expect(channel.nack).toHaveBeenNthCalledWith(2, expect.anything(), false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('requeues a database failure once, then gives up', async () => {
    const { consumer, channel } = setup({ fail: true });
    await consumer.handleMessage(channel, 'auth.events', message(authEnvelope));
    await consumer.handleMessage(channel, 'auth.events', message(authEnvelope, true));
    expect(channel.nack).toHaveBeenNthCalledWith(1, expect.anything(), false, true);
    expect(channel.nack).toHaveBeenNthCalledWith(2, expect.anything(), false, false);
  });
});
