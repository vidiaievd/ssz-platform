import { adminAuditEntry } from '../../shared/application/admin-audit.js';
import { toAdminActionPerformedEvent } from './admin-action.event.js';

const now = new Date('2026-11-09T12:00:00.000Z');
const actor = { userId: 'admin-1', level: 'admin' as const };

describe('toAdminActionPerformedEvent', () => {
  it('shares the trail row id, carries the routing key and the full payload', () => {
    const entry = adminAuditEntry({
      actor,
      action: 'subscription.assigned',
      targetType: 'workspace',
      targetId: 'school-1',
      reason: '  contract signed  ',
      before: { planCode: 'free_workspace' },
      after: { planCode: 'school' },
      now,
    });
    const event = toAdminActionPerformedEvent(entry);
    expect(event).toEqual({
      eventId: entry.id,
      eventType: 'admin.action.performed',
      eventVersion: '1.0',
      occurredAt: '2026-11-09T12:00:00.000Z',
      source: 'subscription-service',
      payload: {
        service: 'subscription',
        actorId: 'admin-1',
        actorLevel: 'admin',
        action: 'subscription.assigned',
        targetType: 'workspace',
        targetId: 'school-1',
        reason: 'contract signed',
        before: { planCode: 'free_workspace' },
        after: { planCode: 'school' },
      },
    });
  });

  it('leaves out a missing before/after instead of sending null', () => {
    const entry = adminAuditEntry({ actor, action: 'grant.issued', targetType: 'user', targetId: 'u1', reason: 'pilot', after: { grantId: 'g1' }, now });
    const { payload } = toAdminActionPerformedEvent(entry);
    expect(payload).not.toHaveProperty('before');
    expect(payload.after).toEqual({ grantId: 'g1' });
  });
});
