import type { SchoolLifecycleStatus } from '@ssz/contracts';

/**
 * The school is not `active`, so nothing in it may change (plan 90, phase 5, step 3).
 * → 409 `SCHOOL_NOT_ACTIVE` with `error.status`, so a screen can say why.
 */
export class SchoolNotActiveException extends Error {
  constructor(
    public readonly schoolId: string,
    public readonly status: SchoolLifecycleStatus,
  ) {
    super(`School ${schoolId} is ${status}; it is read only`);
    this.name = 'SchoolNotActiveException';
  }
}
