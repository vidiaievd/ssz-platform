import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { PurgeReminder, SchoolLifecycleState } from '../school-lifecycle.js';

/** `school.purged` (`SchoolPurgedPayload`): organization holds nothing of the school but its tombstone. */
export class SchoolPurgedEvent implements IDomainEvent {
  readonly eventType = 'school.purged';
  readonly schoolId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly kind: 'SCHOOL' | 'SOLO';
  readonly purgedAt: string;

  constructor(
    readonly eventId: string,
    state: SchoolLifecycleState,
    readonly occurredAt: Date,
  ) {
    this.schoolId = state.schoolId;
    this.ownerId = state.ownerId;
    this.name = state.name;
    this.kind = state.kind;
    this.purgedAt = occurredAt.toISOString();
  }
}

/** `school.purge.reminder` (`SchoolPurgeReminderPayload`): the owner is told the purge is 30 or 7 days away. */
export class SchoolPurgeReminderEvent implements IDomainEvent {
  readonly eventType = 'school.purge.reminder';
  readonly schoolId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly kind: 'SCHOOL' | 'SOLO';
  readonly purgeAt: string;

  constructor(
    readonly eventId: string,
    state: SchoolLifecycleState & { purgeAt: Date },
    readonly daysLeft: PurgeReminder,
    readonly occurredAt: Date,
  ) {
    this.schoolId = state.schoolId;
    this.ownerId = state.ownerId;
    this.name = state.name;
    this.kind = state.kind;
    this.purgeAt = state.purgeAt.toISOString();
  }
}
