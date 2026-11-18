import type { SchoolLifecycleStatus } from '@ssz/contracts';

/** The school is not in a status this move starts from (plan 90, phase 5). → 409 `SCHOOL_TRANSITION_NOT_ALLOWED`. */
export class SchoolTransitionNotAllowedException extends Error {
  constructor(
    public readonly schoolId: string,
    public readonly transition: string,
    public readonly status: SchoolLifecycleStatus,
  ) {
    super(`School ${schoolId} is ${status}; cannot ${transition}`);
    this.name = 'SchoolTransitionNotAllowedException';
  }
}
