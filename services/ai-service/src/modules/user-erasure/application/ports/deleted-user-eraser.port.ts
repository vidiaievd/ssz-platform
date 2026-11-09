/** How many rows each erase touched, for the log; zeros on a replay. */
export interface ErasedLearnerData {
  /** Ledger rows whose actor was the user — kept, actor cleared. */
  callsUnlinked: number;
  feedback: number;
  /** The user's own payer rows: entitlements snapshot and AI policy. */
  payerRows: number;
}

export interface IDeletedUserEraser {
  /**
   * Clears the user off the ledger (the rows stay: credits were spent, and a school's
   * totals must still add up), deletes their assistant feedback and their own payer rows,
   * in one transaction. Idempotent.
   */
  erase(userId: string): Promise<ErasedLearnerData>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
