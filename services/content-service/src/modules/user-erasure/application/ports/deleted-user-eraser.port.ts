/** How many rows each erase removed, for the log; zeros on a replay. */
export interface ErasedUserContent {
  words: number;
  personalLists: number;
  entitlements: number;
  sharesReceived: number;
  /**
   * Containers, lessons, lists, exercises and rules the user authored, left in place.
   * Only student-only accounts delete themselves, and no screen lets a student author;
   * a non-zero count is something support has to look at.
   */
  authoredLeft: number;
}

export interface IDeletedUserEraser {
  /**
   * Hard-deletes the user's «My words» (entries and the personal lists with their items),
   * their content entitlements and what was shared with them, in one transaction. Idempotent.
   */
  erase(userId: string): Promise<ErasedUserContent>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
