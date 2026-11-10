import type { AdminAuditEntry } from '../../../shared/application/admin-audit.js';
import type { IDomainEvent } from '../../../shared/domain/domain-event.interface.js';
import type { SchoolLifecycleState, SchoolStatusChange } from './school-lifecycle.js';

export interface ISchoolLifecycleRepository {
  find(schoolId: string): Promise<SchoolLifecycleState | null>;

  /**
   * Writes the new state, its events and (for an admin's move) the trail row in one transaction —
   * only if the school still stands where `change.before` saw it. False = someone moved it meanwhile;
   * nothing was written.
   */
  apply(change: SchoolStatusChange, events: IDomainEvent[], audit: AdminAuditEntry | null): Promise<boolean>;
}

export const SCHOOL_LIFECYCLE_REPOSITORY = Symbol('ISchoolLifecycleRepository');
