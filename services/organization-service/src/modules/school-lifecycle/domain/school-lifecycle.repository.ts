import type { AdminAuditEntry } from '../../../shared/application/admin-audit.js';
import type { IDomainEvent } from '../../../shared/domain/domain-event.interface.js';
import type { PurgeReminder, SchoolLifecycleState, SchoolStatusChange } from './school-lifecycle.js';

export interface ISchoolLifecycleRepository {
  find(schoolId: string): Promise<SchoolLifecycleState | null>;

  /**
   * Writes the new state, its events and (for an admin's move) the trail row in one transaction —
   * only if the school still stands where `change.before` saw it. False = someone moved it meanwhile;
   * nothing was written.
   */
  apply(change: SchoolStatusChange, events: IDomainEvent[], audit: AdminAuditEntry | null): Promise<boolean>;
}

/** A closed school inside 30 days of its purge, with the reminders already sent. */
export interface PurgeReminderCandidate {
  state: SchoolLifecycleState & { purgeAt: Date };
  sent: { thirty: boolean; seven: boolean };
}

/** What the lifecycle timer has to do on one run, each list oldest-due first and capped at `limit`. */
export interface LifecycleDueWork {
  /** Suspended schools whose `closesAt` has come. */
  closing: string[];
  /** Closed schools whose `purgeAt` has come (an early purge included). */
  purging: SchoolLifecycleState[];
  /** Closed schools purged within 30 days that still miss a reminder they are due. */
  reminding: PurgeReminderCandidate[];
}

/** What a purge deleted, for the log. */
export type PurgeCounts = Record<string, number>;

export interface ISchoolLifecycleTimerRepository {
  /**
   * Runs `work` only if no other instance holds the timer's lock (`pg_try_advisory_xact_lock`);
   * false = someone else is on it. The moves themselves stay compare-and-set, so a run without the
   * lock would still be correct — the lock only spares the duplicate work.
   */
  withTimerLock(work: () => Promise<void>): Promise<boolean>;

  findDue(now: Date, limit: number): Promise<LifecycleDueWork>;

  /**
   * Turns the row into a tombstone and deletes everything else of the school (groups and their
   * members, teachers and materials, invitations, applications, roster with its grants and teacher
   * attrs, nudges, reminders, level history, onboarding settings, seat projection), with
   * `school.purged`, in one transaction — only if it is still closed with the same `purgeAt`.
   * Null = moved meanwhile, nothing written.
   */
  purge(before: SchoolLifecycleState, after: SchoolLifecycleState, event: IDomainEvent): Promise<PurgeCounts | null>;

  /** Marks the reminder sent (the 7-day one marks the 30-day one too) with its event; false = already sent or moved. */
  markReminded(state: SchoolLifecycleState & { purgeAt: Date }, reminder: PurgeReminder, event: IDomainEvent, now: Date): Promise<boolean>;
}

export const SCHOOL_LIFECYCLE_TIMER_REPOSITORY = Symbol('ISchoolLifecycleTimerRepository');

export const SCHOOL_LIFECYCLE_REPOSITORY = Symbol('ISchoolLifecycleRepository');
