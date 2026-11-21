/** user-profile's `internal/users/lookup` — whose account an address is (plan 90, session 16 remark 4). */
export interface UserEmailAccount {
  userId: string;
  roles: string[];
  displayName?: string | null;
}

export interface IUserEmailLookup {
  /** `null` when nobody has the address; throws when the answer cannot be read (never "not found" then). */
  findByEmail(email: string): Promise<UserEmailAccount | null>;
}

export const USER_EMAIL_LOOKUP = Symbol('USER_EMAIL_LOOKUP');
