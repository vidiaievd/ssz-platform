import { jest } from '@jest/globals';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type {
  LifecycleDueWork,
  PurgeCounts,
  PurgeReminderCandidate,
} from '../../domain/school-lifecycle.repository.js';
import type { PurgeReminder, SchoolLifecycleState } from '../../domain/school-lifecycle.js';
import { SchoolTransitionNotAllowedException } from '../../domain/school-transition-not-allowed.exception.js';
import { ChangeSchoolStatusCommand } from './change-school-status.command.js';
import { LIFECYCLE_BATCH, RunSchoolLifecycleHandler } from './run-school-lifecycle.handler.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const closed = (id: string, purgeAt: Date): SchoolLifecycleState & { purgeAt: Date } => ({
  schoolId: id,
  ownerId: `owner-${id}`,
  name: id.toUpperCase(),
  kind: 'SCHOOL',
  status: 'closed',
  statusChangedAt: new Date('2026-05-01'),
  closesAt: null,
  purgeAt,
  statusReason: null,
  deletedAt: new Date('2026-05-01'),
});

function setup(due: LifecycleDueWork, opts: { locked?: boolean } = {}) {
  const repository = {
    withTimerLock: jest.fn(async (work: () => Promise<void>) => {
      if (opts.locked === false) return false;
      await work();
      return true;
    }),
    findDue: jest.fn<(now: Date, limit: number) => Promise<LifecycleDueWork>>().mockResolvedValue(due),
    purge: jest
      .fn<(b: SchoolLifecycleState, a: SchoolLifecycleState, e: IDomainEvent) => Promise<PurgeCounts | null>>()
      .mockResolvedValue({ members: 3 }),
    markReminded: jest
      .fn<(s: SchoolLifecycleState, r: PurgeReminder, e: IDomainEvent, now: Date) => Promise<boolean>>()
      .mockResolvedValue(true),
  };
  const commandBus = { execute: jest.fn<(c: unknown) => Promise<unknown>>().mockResolvedValue({}) };
  const handler = new RunSchoolLifecycleHandler(repository as never, () => NOW, commandBus as never);
  return { repository, commandBus, handler };
}

const nothing: LifecycleDueWork = { closing: [], purging: [], reminding: [] };

describe('RunSchoolLifecycleHandler', () => {
  it('does nothing while another instance holds the lock', async () => {
    const { repository, handler } = setup(nothing, { locked: false });

    await expect(handler.execute()).resolves.toMatchObject({ ran: false, closed: 0 });
    expect(repository.findDue).not.toHaveBeenCalled();
  });

  it('closes due suspended schools through the same move, as the system', async () => {
    const { repository, commandBus, handler } = setup({ ...nothing, closing: ['s1', 's2'] });

    const result = await handler.execute();

    expect(repository.findDue).toHaveBeenCalledWith(NOW, LIFECYCLE_BATCH);
    expect(commandBus.execute.mock.calls.map(([c]) => c)).toEqual([
      new ChangeSchoolStatusCommand('s1', 'close', { kind: 'system' }, null),
      new ChangeSchoolStatusCommand('s2', 'close', { kind: 'system' }, null),
    ]);
    expect(result).toMatchObject({ ran: true, closed: 2, failed: 0 });
  });

  it('skips a school someone moved first, and counts real failures without stopping', async () => {
    const { commandBus, handler } = setup({ ...nothing, closing: ['s1', 's2', 's3'] });
    commandBus.execute
      .mockRejectedValueOnce(new SchoolTransitionNotAllowedException('s1', 'close', 'active'))
      .mockRejectedValueOnce(new Error('db down'));

    await expect(handler.execute()).resolves.toMatchObject({ closed: 1, failed: 1 });
  });

  it('purges with a school.purged event carrying the tombstone facts', async () => {
    const school = closed('p1', NOW);
    const { repository, handler } = setup({ ...nothing, purging: [school] });

    await expect(handler.execute()).resolves.toMatchObject({ purged: 1 });

    const [before, after, event] = repository.purge.mock.calls[0];
    expect(before).toBe(school);
    expect(after).toMatchObject({ status: 'purged', statusChangedAt: NOW });
    expect(event).toMatchObject({
      eventType: 'school.purged',
      schoolId: 'p1',
      ownerId: 'owner-p1',
      name: 'P1',
      kind: 'SCHOOL',
      purgedAt: NOW.toISOString(),
    });
  });

  it('does not count a purge the repository found restored meanwhile', async () => {
    const { repository, handler } = setup({ ...nothing, purging: [closed('p1', NOW)] });
    repository.purge.mockResolvedValueOnce(null);

    await expect(handler.execute()).resolves.toMatchObject({ purged: 0, failed: 0 });
  });

  it('reminds the owner with the reminder due, once', async () => {
    const reminding: PurgeReminderCandidate[] = [
      { state: closed('r30', new Date(NOW.getTime() + 20 * DAY)), sent: { thirty: false, seven: false } },
      { state: closed('r7', new Date(NOW.getTime() + 5 * DAY)), sent: { thirty: true, seven: false } },
      { state: closed('done', new Date(NOW.getTime() + 5 * DAY)), sent: { thirty: true, seven: true } },
    ];
    const { repository, handler } = setup({ ...nothing, reminding });

    await expect(handler.execute()).resolves.toMatchObject({ reminded: 2 });

    expect(repository.markReminded.mock.calls.map(([s, r]) => [s.schoolId, r])).toEqual([
      ['r30', 30],
      ['r7', 7],
    ]);
    expect(repository.markReminded.mock.calls[1][2]).toMatchObject({
      eventType: 'school.purge.reminder',
      ownerId: 'owner-r7',
      daysLeft: 7,
      purgeAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    });
  });

  it('purges before it reminds', async () => {
    const order: string[] = [];
    const { repository, handler } = setup({
      ...nothing,
      purging: [closed('p1', NOW)],
      reminding: [{ state: closed('r1', new Date(NOW.getTime() + 3 * DAY)), sent: { thirty: true, seven: false } }],
    });
    repository.purge.mockImplementation(async () => (order.push('purge'), {}));
    repository.markReminded.mockImplementation(async () => (order.push('remind'), true));

    await handler.execute();

    expect(order).toEqual(['purge', 'remind']);
  });
});
