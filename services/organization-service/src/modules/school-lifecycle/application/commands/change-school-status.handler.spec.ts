import { jest } from '@jest/globals';
import { AdminLevel } from '@ssz/contracts';
import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import { SchoolNotFoundException } from '../../../schools/domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../schools/domain/exceptions/forbidden-operation.exception.js';
import { SchoolLifecycleChangedEvent } from '../../domain/events/school-lifecycle-changed.event.js';
import type { SchoolLifecycleState, SchoolStatusChange } from '../../domain/school-lifecycle.js';
import { SchoolTransitionNotAllowedException } from '../../domain/school-transition-not-allowed.exception.js';
import { ChangeSchoolStatusCommand } from './change-school-status.command.js';
import { ChangeSchoolStatusHandler } from './change-school-status.handler.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const ADMIN = { kind: 'admin' as const, userId: 'admin-1', level: AdminLevel.ADMIN };

const active: SchoolLifecycleState = {
  schoolId: 'school-1',
  ownerId: 'owner-1',
  name: 'Nordick',
  kind: 'SCHOOL',
  status: 'active',
  statusChangedAt: null,
  closesAt: null,
  purgeAt: null,
  statusReason: null,
  deletedAt: null,
};

function setup(state: SchoolLifecycleState | null = active, applied = true) {
  const repository = {
    find: jest.fn<(id: string) => Promise<SchoolLifecycleState | null>>().mockResolvedValue(state),
    apply: jest
      .fn<(c: SchoolStatusChange, e: IDomainEvent[], a: AdminAuditEntry | null) => Promise<boolean>>()
      .mockResolvedValue(applied),
  };
  const handler = new ChangeSchoolStatusHandler(
    repository,
    { suspendDays: 30, archiveDays: 183 },
    () => NOW,
  );
  return { repository, handler };
}

describe('ChangeSchoolStatusHandler', () => {
  it("writes an admin's move with its event and a trail row", async () => {
    const { repository, handler } = setup();

    const after = await handler.execute(new ChangeSchoolStatusCommand('school-1', 'suspend', ADMIN, '  unpaid  '));

    expect(after).toMatchObject({ status: 'suspended', statusReason: 'unpaid' });
    const [change, events, audit] = repository.apply.mock.calls[0];
    expect(change.before).toBe(active);
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(SchoolLifecycleChangedEvent);
    expect(events[0]).toMatchObject({
      eventType: 'school.suspended',
      schoolId: 'school-1',
      ownerId: 'owner-1',
      status: 'suspended',
      previousStatus: 'active',
      by: 'admin',
      changedAt: NOW.toISOString(),
      purgeAt: null,
    });
    expect(events[0]).not.toHaveProperty('reason');
    expect(audit).toMatchObject({
      actor: { userId: 'admin-1', level: 'admin' },
      action: 'school.suspended',
      targetType: 'school',
      targetId: 'school-1',
      reason: 'unpaid',
      before: { status: 'active', closesAt: null, purgeAt: null },
      after: { status: 'suspended', purgeAt: null },
      occurredAt: NOW,
    });
  });

  it("archives on the owner's delete: event by owner, no trail row", async () => {
    const { repository, handler } = setup();

    await handler.execute(new ChangeSchoolStatusCommand('school-1', 'close', { kind: 'owner', userId: 'owner-1' }, null));

    const [, events, audit] = repository.apply.mock.calls[0];
    expect(events[0]).toMatchObject({ eventType: 'school.closed', by: 'owner' });
    expect(audit).toBeNull();
  });

  it('sends no lifecycle event for an early purge, but records it', async () => {
    const { repository, handler } = setup({
      ...active,
      status: 'closed',
      purgeAt: new Date('2027-05-01'),
      deletedAt: new Date('2026-11-01'),
    });

    const after = await handler.execute(
      new ChangeSchoolStatusCommand('school-1', 'purge', { ...ADMIN, level: AdminLevel.SUPER }, 'owner asked'),
    );

    expect(after).toMatchObject({ status: 'closed', purgeAt: NOW });
    const [, events, audit] = repository.apply.mock.calls[0];
    expect(events).toEqual([]);
    expect(audit).toMatchObject({ action: 'school.purge_requested' });
  });

  it('refuses a move the status does not allow, writing nothing', async () => {
    const { repository, handler } = setup();

    await expect(
      handler.execute(new ChangeSchoolStatusCommand('school-1', 'reactivate', ADMIN, 'x')),
    ).rejects.toMatchObject({ constructor: SchoolTransitionNotAllowedException, status: 'active' });
    expect(repository.apply).not.toHaveBeenCalled();
  });

  it('refuses someone else deleting the school as forbidden', async () => {
    const { repository, handler } = setup();

    await expect(
      handler.execute(new ChangeSchoolStatusCommand('school-1', 'close', { kind: 'owner', userId: 'intruder' }, null)),
    ).rejects.toBeInstanceOf(ForbiddenOperationException);
    expect(repository.apply).not.toHaveBeenCalled();
  });

  it('refuses an admin below the move’s level as forbidden', async () => {
    const { handler } = setup();

    await expect(
      handler.execute(new ChangeSchoolStatusCommand('school-1', 'close', ADMIN, 'x')),
    ).rejects.toBeInstanceOf(ForbiddenOperationException);
  });

  it('answers 404 for an unknown school', async () => {
    const { handler } = setup(null);

    await expect(
      handler.execute(new ChangeSchoolStatusCommand('school-1', 'suspend', ADMIN, 'x')),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });

  it('turns a lost race into a conflict naming where the school stands now', async () => {
    const { repository, handler } = setup(active, false);
    repository.find.mockResolvedValueOnce(active).mockResolvedValueOnce({ ...active, status: 'closed' });

    await expect(
      handler.execute(new ChangeSchoolStatusCommand('school-1', 'suspend', ADMIN, 'x')),
    ).rejects.toMatchObject({ constructor: SchoolTransitionNotAllowedException, status: 'closed' });
  });

  it('never writes an admin move without a reason', async () => {
    const { repository, handler } = setup();

    await expect(handler.execute(new ChangeSchoolStatusCommand('school-1', 'suspend', ADMIN, '   '))).rejects.toThrow();
    expect(repository.apply).not.toHaveBeenCalled();
  });
});
