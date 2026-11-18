import type { SchoolLifecycleActor, SchoolLifecycleStatus } from '@ssz/contracts';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';
import type { SchoolLifecycleEventType, SchoolStatusChange } from '../school-lifecycle.js';

/**
 * `school.suspended` / `school.reactivated` / `school.closed` / `school.restored` — one shape
 * (`SchoolLifecyclePayload` in contracts). The admin's reason is not in it.
 */
export class SchoolLifecycleChangedEvent implements IDomainEvent {
  readonly eventType: SchoolLifecycleEventType;
  readonly occurredAt: Date;
  readonly schoolId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly kind: 'SCHOOL' | 'SOLO';
  readonly status: SchoolLifecycleStatus;
  readonly previousStatus: SchoolLifecycleStatus;
  readonly by: SchoolLifecycleActor;
  readonly changedAt: string;
  readonly closesAt: string | null;
  readonly purgeAt: string | null;

  constructor(
    readonly eventId: string,
    eventType: SchoolLifecycleEventType,
    change: SchoolStatusChange,
  ) {
    const { before, after } = change;
    this.eventType = eventType;
    this.occurredAt = change.at;
    this.schoolId = after.schoolId;
    this.ownerId = after.ownerId;
    this.name = after.name;
    this.kind = after.kind;
    this.status = after.status;
    this.previousStatus = before.status;
    this.by = change.actor.kind;
    this.changedAt = change.at.toISOString();
    this.closesAt = after.closesAt?.toISOString() ?? null;
    this.purgeAt = after.purgeAt?.toISOString() ?? null;
  }
}
