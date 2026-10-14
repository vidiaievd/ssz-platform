/**
 * Roles that write lessons. Synthesis costs CPU time a student has no reason to spend, and
 * replacing a lesson's narration is an author's act (plan 74).
 */
export const AUTHOR_ROLES: readonly string[] = ['tutor', 'teacher', 'school_admin', 'platform_admin'];

export function isAuthor(roles: readonly string[]): boolean {
  return roles.some((role) => AUTHOR_ROLES.includes(role));
}
