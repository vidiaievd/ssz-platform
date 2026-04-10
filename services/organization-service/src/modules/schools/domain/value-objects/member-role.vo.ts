export const MemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
} as const;

export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];
