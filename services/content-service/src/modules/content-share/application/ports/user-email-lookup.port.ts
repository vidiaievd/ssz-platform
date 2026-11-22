/** Whose account an e-mail address is — user-profile's `internal/users/lookup` (plan 90, session 16 remark 4). */
export interface IUserEmailLookup {
  /** The account's id, or `null` when nobody has that address. Throws when the answer cannot be read. */
  findUserIdByEmail(email: string): Promise<string | null>;
}

export const USER_EMAIL_LOOKUP = Symbol('USER_EMAIL_LOOKUP');
