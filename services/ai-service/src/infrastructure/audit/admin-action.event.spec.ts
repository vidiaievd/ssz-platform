import { adminAuditEntry } from '../../shared/application/admin-audit.js';
import { toAdminActionPerformedEvent } from './admin-action.event.js';

const now = new Date('2026-11-09T12:00:00.000Z');
const actor = { userId: 'admin-1', level: 'admin' as const };

describe('toAdminActionPerformedEvent (ai-service)', () => {
  it('shares the trail row id, names ai as the service and carries both sides', () => {
    const entry = adminAuditEntry({
      actor,
      action: 'payer_policy.changed',
      targetType: 'workspace',
      targetId: 'school-1',
      reason: '  EU only, ticket #142  ',
      before: { aiEnabled: true, allowedRegions: null },
      after: { aiEnabled: true, allowedRegions: ['eu'] },
      now,
    });
    expect(toAdminActionPerformedEvent(entry)).toEqual({
      eventId: entry.id,
      eventType: 'admin.action.performed',
      eventVersion: '1.0',
      occurredAt: '2026-11-09T12:00:00.000Z',
      source: 'ai-service',
      payload: {
        service: 'ai',
        actorId: 'admin-1',
        actorLevel: 'admin',
        action: 'payer_policy.changed',
        targetType: 'workspace',
        targetId: 'school-1',
        reason: 'EU only, ticket #142',
        before: { aiEnabled: true, allowedRegions: null },
        after: { aiEnabled: true, allowedRegions: ['eu'] },
      },
    });
  });

  it('leaves out an absent before (nothing was stored) instead of sending null', () => {
    const entry = adminAuditEntry({
      actor,
      action: 'payer_policy.changed',
      targetType: 'user',
      targetId: 'u1',
      reason: 'learner asked',
      after: { aiEnabled: false, allowedRegions: null },
      now,
    });
    const { payload } = toAdminActionPerformedEvent(entry);
    expect(payload).not.toHaveProperty('before');
    expect(payload.after).toEqual({ aiEnabled: false, allowedRegions: null });
  });

  it('leaves out an empty reason (a model test given none)', () => {
    const entry = adminAuditEntry({
      actor,
      action: 'model.tested',
      targetType: 'model',
      targetId: 'm1',
      reason: '  ',
      after: { outcome: 'ok' },
      now,
    });
    expect(toAdminActionPerformedEvent(entry).payload).not.toHaveProperty('reason');
  });
});
