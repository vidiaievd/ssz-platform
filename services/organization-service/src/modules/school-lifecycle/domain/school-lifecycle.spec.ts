import { AdminLevel } from '@ssz/contracts';
import {
  auditSnapshot,
  changeSchoolStatus,
  isActiveStatus,
  LifecycleActorNotAllowedError,
  SCHOOL_TRANSITIONS,
  type LifecycleActor,
  type SchoolLifecycleState,
  type SchoolStatus,
  type SchoolTransition,
} from './school-lifecycle.js';
import { SchoolTransitionNotAllowedException } from './school-transition-not-allowed.exception.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const TERMS = { suspendDays: 30, archiveDays: 183 };
const DAY = 24 * 60 * 60 * 1000;
const SUPER: LifecycleActor = { kind: 'admin', userId: 'admin-1', level: AdminLevel.SUPER };
const ADMIN: LifecycleActor = { kind: 'admin', userId: 'admin-2', level: AdminLevel.ADMIN };
const SUPPORT: LifecycleActor = { kind: 'admin', userId: 'admin-3', level: AdminLevel.SUPPORT };
const OWNER: LifecycleActor = { kind: 'owner', userId: 'owner-1' };
const SYSTEM: LifecycleActor = { kind: 'system' };

function school(status: SchoolStatus, extra: Partial<SchoolLifecycleState> = {}): SchoolLifecycleState {
  const closed = status === 'closed' || status === 'purged';
  return {
    schoolId: 'school-1',
    ownerId: 'owner-1',
    name: 'Nordick',
    kind: 'SCHOOL',
    status,
    statusChangedAt: null,
    closesAt: status === 'suspended' ? new Date(NOW.getTime() + 10 * DAY) : null,
    purgeAt: closed ? new Date(NOW.getTime() + 100 * DAY) : null,
    statusReason: null,
    deletedAt: closed ? new Date('2026-10-01T00:00:00.000Z') : null,
    ...extra,
  };
}

const move = (state: SchoolLifecycleState, t: SchoolTransition, actor: LifecycleActor = SUPER, reason = 'why') =>
  changeSchoolStatus(state, t, actor, reason, NOW, TERMS);

describe('changeSchoolStatus — the table', () => {
  // Every (status, move) pair: either the expected next status or a refusal.
  const expected: Record<SchoolStatus, Partial<Record<SchoolTransition, SchoolStatus>>> = {
    active: { suspend: 'suspended', close: 'closed' },
    suspended: { reactivate: 'active', close: 'closed' },
    closed: { restore: 'active', purge: 'closed' },
    purged: {},
  };

  for (const from of Object.keys(expected) as SchoolStatus[]) {
    for (const t of SCHOOL_TRANSITIONS) {
      const to = expected[from][t];
      it(`${from} → ${t} → ${to ?? 'refused'}`, () => {
        const result = move(school(from), t);
        if (to) {
          expect(result.isOk).toBe(true);
          expect(result.value.after.status).toBe(to);
        } else {
          expect(result.error).toBeInstanceOf(SchoolTransitionNotAllowedException);
          expect(result.error).toMatchObject({ status: from, transition: t });
        }
      });
    }
  }
});

describe('changeSchoolStatus — who may', () => {
  it('lets an admin suspend and reactivate, but not close, restore or purge', () => {
    expect(move(school('active'), 'suspend', ADMIN).isOk).toBe(true);
    expect(move(school('suspended'), 'reactivate', ADMIN).isOk).toBe(true);
    expect(move(school('active'), 'close', ADMIN).error).toBeInstanceOf(LifecycleActorNotAllowedError);
    expect(move(school('closed'), 'restore', ADMIN).error).toBeInstanceOf(LifecycleActorNotAllowedError);
    expect(move(school('closed'), 'purge', ADMIN).error).toBeInstanceOf(LifecycleActorNotAllowedError);
  });

  it('lets support do nothing', () => {
    expect(move(school('active'), 'suspend', SUPPORT).error).toBeInstanceOf(LifecycleActorNotAllowedError);
  });

  it('checks the actor before the status: a wrong level is a 403, never a 409', () => {
    expect(move(school('purged'), 'close', ADMIN).error).toBeInstanceOf(LifecycleActorNotAllowedError);
  });

  it('lets the owner close their own school only', () => {
    expect(move(school('active'), 'close', OWNER, '').isOk).toBe(true);
    expect(move(school('suspended'), 'close', OWNER, '').isOk).toBe(true);
    expect(move(school('active'), 'close', { kind: 'owner', userId: 'someone' }).error).toBeInstanceOf(
      LifecycleActorNotAllowedError,
    );
    expect(move(school('active'), 'suspend', OWNER).error).toBeInstanceOf(LifecycleActorNotAllowedError);
    expect(move(school('closed'), 'restore', OWNER).error).toBeInstanceOf(LifecycleActorNotAllowedError);
  });

  it('lets the timer close, and nothing else', () => {
    expect(move(school('suspended'), 'close', SYSTEM).isOk).toBe(true);
    expect(move(school('active'), 'suspend', SYSTEM).error).toBeInstanceOf(LifecycleActorNotAllowedError);
    expect(move(school('closed'), 'purge', SYSTEM).error).toBeInstanceOf(LifecycleActorNotAllowedError);
  });
});

describe('changeSchoolStatus — dates and mirrors', () => {
  it('suspends for the suspend term, with no purge date', () => {
    const { after } = move(school('active'), 'suspend', ADMIN, 'unpaid').value;
    expect(after).toMatchObject({
      status: 'suspended',
      statusChangedAt: NOW,
      statusReason: 'unpaid',
      closesAt: new Date(NOW.getTime() + 30 * DAY),
      purgeAt: null,
      deletedAt: null,
    });
    expect(isActiveStatus(after.status)).toBe(false);
  });

  it('closes into the archive term and marks it deleted from now', () => {
    const { after } = move(school('suspended'), 'close').value;
    expect(after).toMatchObject({
      status: 'closed',
      closesAt: null,
      purgeAt: new Date(NOW.getTime() + 183 * DAY),
      deletedAt: NOW,
    });
  });

  it('clears every date on the way back to active', () => {
    for (const [from, t] of [
      ['suspended', 'reactivate'],
      ['closed', 'restore'],
    ] as const) {
      const { after } = move(school(from), t).value;
      expect(after).toMatchObject({ status: 'active', closesAt: null, purgeAt: null, deletedAt: null });
      expect(isActiveStatus(after.status)).toBe(true);
    }
  });

  it('keeps no reason for the owner or the timer', () => {
    expect(move(school('active'), 'close', OWNER, 'ignored').value.after.statusReason).toBeNull();
    expect(move(school('suspended'), 'close', SYSTEM, 'ignored').value.after.statusReason).toBeNull();
  });

  it('an early purge only moves the purge date to now; the closure stays as it was', () => {
    const before = school('closed', { statusReason: 'fraud', statusChangedAt: new Date('2026-10-01') });
    const change = move(before, 'purge', SUPER, 'owner asked').value;
    expect(change.after).toEqual({ ...before, purgeAt: NOW });
    expect(change.eventType).toBeNull();
  });

  it('refuses a second early purge, or one after the purge date passed', () => {
    expect(move(school('closed', { purgeAt: NOW }), 'purge').error).toBeInstanceOf(SchoolTransitionNotAllowedException);
    expect(move(school('closed', { purgeAt: new Date(NOW.getTime() - DAY) }), 'purge').isErr).toBe(true);
  });

  it('restores a school whose early purge has not run yet', () => {
    expect(move(school('closed', { purgeAt: NOW }), 'restore').value.after.status).toBe('active');
  });
});

describe('changeSchoolStatus — events', () => {
  it.each([
    ['active', 'suspend', 'school.suspended'],
    ['suspended', 'reactivate', 'school.reactivated'],
    ['active', 'close', 'school.closed'],
    ['suspended', 'close', 'school.closed'],
    ['closed', 'restore', 'school.restored'],
  ] as const)('%s → %s sends %s', (from, t, event) => {
    expect(move(school(from), t).value.eventType).toBe(event);
  });
});

describe('auditSnapshot', () => {
  it('records the status and both dates as ISO strings', () => {
    expect(auditSnapshot(school('suspended'))).toEqual({
      status: 'suspended',
      closesAt: new Date(NOW.getTime() + 10 * DAY).toISOString(),
      purgeAt: null,
    });
  });
});
