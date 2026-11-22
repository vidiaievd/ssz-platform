import { MemberRole } from './value-objects/member-role.vo.js';

/**
 * Who may ask "does this address have an account" in a school (plan 90, session 16 remark 4):
 * the people who add others to it — the owner (a SOLO tutor included), administrators, managers
 * and teachers. Learners and the other staff roles may not; nor may anyone outside the school.
 */
const LOOKUP_ROLES: readonly MemberRole[] = [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.MANAGER, MemberRole.TEACHER];

export function mayLookUpUsers(role: MemberRole | null): boolean {
  return role !== null && LOOKUP_ROLES.includes(role);
}

/** What a school's dialogs are told about an address — never the account's role list. */
export type SchoolUserLookup =
  | { found: false }
  | { found: true; userId: string; displayName: string | null; isStudent: boolean; isTeacher: boolean };

export function schoolUserLookupOf(account: { userId: string; roles: string[]; displayName?: string | null } | null): SchoolUserLookup {
  if (!account) return { found: false };
  const roles = account.roles.map((r) => r.toLowerCase());
  return {
    found: true,
    userId: account.userId,
    displayName: account.displayName ?? null,
    isStudent: roles.includes('student'),
    isTeacher: roles.includes('teacher'),
  };
}
