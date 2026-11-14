import { toAdminActionPerformedEvent } from '../../../../src/infrastructure/audit/admin-action.event.js';
import { adminAuditEntry } from '../../../../src/shared/application/admin-audit.js';

const now = new Date('2026-11-14T18:00:00.000Z');

describe('toAdminActionPerformedEvent (media-service)', () => {
  it('shares the trail row id, names media as the service and leaves an absent before out', () => {
    const entry = adminAuditEntry({
      actor: { userId: 'admin-s', level: 'super' as never },
      action: 'media.sweep.deleted',
      targetType: 'media_sweep',
      targetId: 'orphan_recordings',
      reason: '  bucket at 92 %  ',
      after: { runId: 'run-1', deleted: 3 },
      now,
    });

    const event = toAdminActionPerformedEvent(entry);

    expect(event).toEqual({
      eventId: entry.id,
      eventType: 'admin.action.performed',
      eventVersion: '1.0',
      occurredAt: '2026-11-14T18:00:00.000Z',
      source: 'media-service',
      payload: {
        service: 'media',
        actorId: 'admin-s',
        actorLevel: 'super',
        action: 'media.sweep.deleted',
        targetType: 'media_sweep',
        targetId: 'orphan_recordings',
        reason: 'bucket at 92 %',
        after: { runId: 'run-1', deleted: 3 },
      },
    });
    expect(event.payload).not.toHaveProperty('before');
  });
});
