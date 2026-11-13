/**
 * A school's lifecycle (plan 90, phase 5): `active → suspended → closed → purged`.
 *
 * - `suspended` — read only for 30 days, then closes by itself (`closesAt`);
 * - `closed` — an archive for 6 months, then purged (`purgeAt`); staff lose their roles, learners keep
 *   their history;
 * - `purged` — the row stays as a tombstone, everything else of the school is gone (step 2).
 *
 * Who may do what is the table below: an `admin` suspends and reactivates; a `super` closes at once
 * (skipping the 30 days), restores from the archive and asks for an early purge; the owner's "delete
 * school" closes it; the timer closes a suspended school whose time ran out. Every admin move carries
 * a reason. Pure: no clock, no I/O — the caller passes `now` and the terms.
 */

import { AdminLevel, adminLevelAtLeast, type SchoolLifecycleStatus } from '@ssz/contracts';
import { Result } from '../../../shared/kernel/result.js';
import { SchoolTransitionNotAllowedException } from './school-transition-not-allowed.exception.js';

export type SchoolStatus = SchoolLifecycleStatus;

export type SchoolTransition = 'suspend' | 'reactivate' | 'close' | 'restore' | 'purge';
export const SCHOOL_TRANSITIONS: readonly SchoolTransition[] = ['suspend', 'reactivate', 'close', 'restore', 'purge'];

/** What an admin's move is called in the admin trail (`admin_audit.action`). */
export type SchoolAdminAction =
  | 'school.suspended'
  | 'school.reactivated'
  | 'school.closed'
  | 'school.restored'
  | 'school.purge_requested';

/** Who moves the school. An admin's level is checked against the table; the owner must own the school. */
export type LifecycleActor =
  | { kind: 'admin'; userId: string; level: AdminLevel }
  | { kind: 'owner'; userId: string }
  | { kind: 'system' };

/** How long each stage lasts, in days (env `SCHOOL_SUSPEND_DAYS`, `SCHOOL_ARCHIVE_DAYS`). */
export interface LifecycleTerms {
  suspendDays: number;
  archiveDays: number;
}

export const DEFAULT_LIFECYCLE_TERMS: LifecycleTerms = { suspendDays: 30, archiveDays: 183 };

export interface SchoolLifecycleState {
  schoolId: string;
  ownerId: string;
  name: string;
  kind: 'SCHOOL' | 'SOLO';
  status: SchoolStatus;
  statusChangedAt: Date | null;
  closesAt: Date | null;
  purgeAt: Date | null;
  statusReason: string | null;
  /** When the school was closed; mirrors the status (set while `closed` / `purged`). */
  deletedAt: Date | null;
}

interface TransitionRule {
  from: readonly SchoolStatus[];
  to: SchoolStatus;
  /** The lowest admin level that may make this move. */
  adminLevel: AdminLevel;
  /** Whether the owner ("delete school") and the timer may make it — admins always go by level. */
  owner: boolean;
  system: boolean;
  action: SchoolAdminAction;
}

export const SCHOOL_TRANSITION_RULES: Readonly<Record<SchoolTransition, TransitionRule>> = {
  suspend: {
    from: ['active'],
    to: 'suspended',
    adminLevel: AdminLevel.ADMIN,
    owner: false,
    system: false,
    action: 'school.suspended',
  },
  reactivate: {
    from: ['suspended'],
    to: 'active',
    adminLevel: AdminLevel.ADMIN,
    owner: false,
    system: false,
    action: 'school.reactivated',
  },
  // From `active` too: closing at once is the "immediate block" of plan 90. The owner may archive a
  // suspended school as well — it only moves the purge date by the days left of the suspension.
  close: {
    from: ['active', 'suspended'],
    to: 'closed',
    adminLevel: AdminLevel.SUPER,
    owner: true,
    system: true,
    action: 'school.closed',
  },
  restore: {
    from: ['closed'],
    to: 'active',
    adminLevel: AdminLevel.SUPER,
    owner: false,
    system: false,
    action: 'school.restored',
  },
  // Not a status of its own: the school stays closed with `purgeAt = now`, and the timer purges it
  // on its next run (step 2). Until then a `restore` still saves it.
  purge: {
    from: ['closed'],
    to: 'closed',
    adminLevel: AdminLevel.SUPER,
    owner: false,
    system: false,
    action: 'school.purge_requested',
  },
};

/** The lifecycle event a change sends to other services; an early-purge request sends none. */
export type SchoolLifecycleEventType = 'school.suspended' | 'school.reactivated' | 'school.closed' | 'school.restored';

export interface SchoolStatusChange {
  transition: SchoolTransition;
  actor: LifecycleActor;
  before: SchoolLifecycleState;
  after: SchoolLifecycleState;
  at: Date;
  /** Null for an early-purge request — the status did not change. */
  eventType: SchoolLifecycleEventType | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The move, or why it cannot be made from where the school stands. A wrong actor (an admin below the
 * level, an owner or the timer on a move that is not theirs) is a `ForbiddenError` — the caller's
 * guard should have stopped it, so it is a 403, not a 409.
 */
export function changeSchoolStatus(
  state: SchoolLifecycleState,
  transition: SchoolTransition,
  actor: LifecycleActor,
  reason: string | null,
  now: Date,
  terms: LifecycleTerms,
): Result<SchoolStatusChange, SchoolTransitionNotAllowedException | LifecycleActorNotAllowedError> {
  const rule = SCHOOL_TRANSITION_RULES[transition];

  if (!actorMay(rule, actor, state)) return Result.err(new LifecycleActorNotAllowedError(transition, actor.kind));

  if (!rule.from.includes(state.status)) {
    return Result.err(new SchoolTransitionNotAllowedException(state.schoolId, transition, state.status));
  }
  // An early purge already asked for (or a purge date already passed) is waiting for the timer.
  if (transition === 'purge' && state.purgeAt !== null && state.purgeAt.getTime() <= now.getTime()) {
    return Result.err(new SchoolTransitionNotAllowedException(state.schoolId, transition, state.status));
  }

  const after = nextState(state, transition, rule.to, actor.kind === 'admin' ? reason : null, now, terms);
  return Result.ok({
    transition,
    actor,
    before: state,
    after,
    at: now,
    eventType: eventTypeOf(state.status, after.status),
  });
}

/** A move made by someone the table does not allow for it. */
export class LifecycleActorNotAllowedError extends Error {
  constructor(
    public readonly transition: SchoolTransition,
    public readonly actorKind: LifecycleActor['kind'],
  ) {
    super(`The ${actorKind} may not ${transition} a school`);
    this.name = 'LifecycleActorNotAllowedError';
  }
}

function actorMay(rule: TransitionRule, actor: LifecycleActor, state: SchoolLifecycleState): boolean {
  switch (actor.kind) {
    case 'admin':
      return adminLevelAtLeast(actor.level, rule.adminLevel);
    case 'owner':
      return rule.owner && actor.userId === state.ownerId;
    case 'system':
      return rule.system;
  }
}

function nextState(
  state: SchoolLifecycleState,
  transition: SchoolTransition,
  to: SchoolStatus,
  reason: string | null,
  now: Date,
  terms: LifecycleTerms,
): SchoolLifecycleState {
  if (transition === 'purge') {
    // The status and its reason stay those of the closure; the purge request's reason is in the trail.
    return { ...state, purgeAt: now };
  }
  return {
    ...state,
    status: to,
    statusChangedAt: now,
    statusReason: reason,
    closesAt: to === 'suspended' ? addDays(now, terms.suspendDays) : null,
    purgeAt: to === 'closed' ? addDays(now, terms.archiveDays) : null,
    deletedAt: to === 'closed' ? now : null,
  };
}

function eventTypeOf(from: SchoolStatus, to: SchoolStatus): SchoolLifecycleEventType | null {
  if (from === to) return null;
  if (to === 'suspended') return 'school.suspended';
  if (to === 'closed') return 'school.closed';
  if (to === 'active') return from === 'closed' ? 'school.restored' : 'school.reactivated';
  return null;
}

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

/** `isActive` mirrors the status: only an active school is open for applications and listed. */
export function isActiveStatus(status: SchoolStatus): boolean {
  return status === 'active';
}

/** The part of the state the admin trail records on both sides of a move. */
export function auditSnapshot(state: SchoolLifecycleState): Record<string, unknown> {
  return {
    status: state.status,
    closesAt: state.closesAt?.toISOString() ?? null,
    purgeAt: state.purgeAt?.toISOString() ?? null,
  };
}

// ─── The timer's own moves (plan 90, phase 5, step 2) ──────────────────────────

/**
 * A closed school whose purge date has come becomes a tombstone. Not in the transition table: nobody
 * asks for it — an admin's early purge only moves `purgeAt` to now, and this runs on the timer.
 */
export function purgeSchool(
  state: SchoolLifecycleState,
  now: Date,
): Result<SchoolLifecycleState, SchoolTransitionNotAllowedException> {
  if (state.status !== 'closed' || state.purgeAt === null || state.purgeAt.getTime() > now.getTime()) {
    return Result.err(new SchoolTransitionNotAllowedException(state.schoolId, 'purge', state.status));
  }
  return Result.ok({ ...state, status: 'purged', statusChangedAt: now, closesAt: null });
}

export type PurgeReminder = 30 | 7;

/**
 * Which reminder a closed school's owner is due, if any: 30 days before the purge, then 7. Each goes
 * once; a school found inside 7 days without the 30-day one (closed late, or an archive shorter
 * than 30 days) gets only the 7-day one. Nothing once the date has passed — the purge is next.
 */
export function purgeReminderDue(
  purgeAt: Date,
  sent: { thirty: boolean; seven: boolean },
  now: Date,
): PurgeReminder | null {
  const left = purgeAt.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= 7 * DAY_MS) return sent.seven ? null : 7;
  if (left <= 30 * DAY_MS) return sent.thirty ? null : 30;
  return null;
}
