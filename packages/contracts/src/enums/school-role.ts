/**
 * Roles within a school (Organization Service).
 * String values match the MemberRole enum in organizations_db.
 */
export const SchoolRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  CONTENT_ADMIN: 'CONTENT_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;

export type SchoolRole = (typeof SchoolRole)[keyof typeof SchoolRole];
