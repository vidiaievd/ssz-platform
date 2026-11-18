import { jest } from '@jest/globals';
import { AdminLevel } from '@ssz/contracts';
import { adminAuditEntry } from '../../shared/application/admin-audit.js';
import { recordAdminAction, toAdminActionPerformedEvent } from './record-admin-action.js';

const entry = adminAuditEntry({
  actor: { userId: 'admin-1', level: AdminLevel.SUPER },
  action: 'school.closed',
  targetType: 'school',
  targetId: 'school-1',
  reason: '  fraud ',
  before: { status: 'active', closesAt: null, purgeAt: null },
  after: { status: 'closed', closesAt: null, purgeAt: '2027-05-12T12:00:00.000Z' },
  now: new Date('2026-11-10T12:00:00.000Z'),
});

describe('organization admin trail', () => {
  it('sends the row as admin.action.performed with service organization, the row id as eventId', () => {
    expect(toAdminActionPerformedEvent(entry)).toEqual({
      eventId: entry.id,
      eventType: 'admin.action.performed',
      eventVersion: '1.0',
      occurredAt: '2026-11-10T12:00:00.000Z',
      source: 'organization-service',
      payload: {
        service: 'organization',
        actorId: 'admin-1',
        actorLevel: 'super',
        action: 'school.closed',
        targetType: 'school',
        targetId: 'school-1',
        reason: 'fraud',
        before: entry.before,
        after: entry.after,
      },
    });
  });

  it('leaves absent sides out of the payload instead of sending null', () => {
    const payload = toAdminActionPerformedEvent({ ...entry, before: null }).payload;
    expect(payload).not.toHaveProperty('before');
  });

  it('writes the row and the outbox row on the transaction it is given', async () => {
    const tx = {
      adminAudit: { create: jest.fn<(a: unknown) => Promise<unknown>>().mockResolvedValue({}) },
      outbox: { create: jest.fn<(a: unknown) => Promise<unknown>>().mockResolvedValue({}) },
    };

    await recordAdminAction(tx as never, entry);

    expect(tx.adminAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: entry.id, actorId: 'admin-1', reason: 'fraud', targetType: 'school' }),
    });
    expect(tx.outbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: entry.id,
        exchange: 'organization.events',
        routingKey: 'admin.action.performed',
      }),
    });
  });
});
