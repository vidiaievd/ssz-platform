export const SCHOOL_PURGE_LEDGER = Symbol('SCHOOL_PURGE_LEDGER');

export interface PendingSchoolPurge {
  schoolId: string;
  schoolName: string;
  attempts: number;
}

/**
 * Purges content has heard of and not finished (plan 90, phase 5, step 4c; 4b-fix item 3).
 * `school.purged` arrives once: a purge that fails past the consumer's one retry stays here and
 * the cleanup job runs it again until it succeeds.
 */
export interface ISchoolPurgeLedger {
  /** Starts an attempt: the row is created on the first one, `attempts` grows on every one. */
  started(schoolId: string, schoolName: string, at: Date): Promise<void>;
  completed(schoolId: string, at: Date): Promise<void>;
  failed(schoolId: string, error: string): Promise<void>;
  /** Unfinished purges whose last attempt began before `attemptedBefore` (a crash or a failure). */
  findStalled(attemptedBefore: Date, limit: number): Promise<PendingSchoolPurge[]>;
}
