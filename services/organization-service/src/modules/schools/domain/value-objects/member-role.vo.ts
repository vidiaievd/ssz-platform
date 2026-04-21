export const MemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  CONTENT_ADMIN: 'CONTENT_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;

export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

// Roles that can be assigned via invitation (OWNER is auto-assigned at school creation)
export const InvitableRoles = [
  MemberRole.ADMIN,
  MemberRole.CONTENT_ADMIN,
  MemberRole.TEACHER,
  MemberRole.STUDENT,
] as const;

export type InvitableRole = (typeof InvitableRoles)[number];
