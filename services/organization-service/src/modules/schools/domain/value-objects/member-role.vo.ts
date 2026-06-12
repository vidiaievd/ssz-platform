export const MemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  CONTENT_ADMIN: 'CONTENT_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  SCHEDULER: 'SCHEDULER',
} as const;

export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

// Roles that can be assigned via invitation (OWNER is auto-assigned at school creation)
export const InvitableRoles = [
  MemberRole.ADMIN,
  MemberRole.MANAGER,
  MemberRole.CONTENT_ADMIN,
  MemberRole.TEACHER,
  MemberRole.STUDENT,
  MemberRole.SCHEDULER,
] as const;

export type InvitableRole = (typeof InvitableRoles)[number];
