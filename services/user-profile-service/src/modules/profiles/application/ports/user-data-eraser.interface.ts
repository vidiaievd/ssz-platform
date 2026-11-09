/** How many rows each erase removed, for the log; zeros on a replay. */
export interface ErasedUserData {
  profiles: number;
  placementResults: number;
  emailIndex: number;
}

export interface IUserDataEraser {
  /**
   * Hard-deletes the user's profile with its student/tutor/teaching parts, placement
   * results and the e-mail index row, in one transaction. Idempotent.
   */
  erase(userId: string): Promise<ErasedUserData>;
}

export const USER_DATA_ERASER = Symbol('USER_DATA_ERASER');
