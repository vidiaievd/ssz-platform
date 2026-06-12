export const Capability = {
  // Invitations
  INVITATIONS_CREATE_TEACHER: 'invitations:create_teacher',
  INVITATIONS_CREATE_STUDENT: 'invitations:create_student',
  INVITATIONS_MANAGE: 'invitations:manage',          // resend / revoke
  // Members
  MEMBERS_REMOVE: 'members:remove',
  // Students
  STUDENTS_MESSAGE: 'students:message',
  // Content
  CONTENT_MANAGE: 'content:manage',
  // Groups
  GROUPS_CREATE: 'groups:create',
  GROUPS_EDIT: 'groups:edit',
  GROUPS_PUBLISH: 'groups:publish',
  GROUPS_ARCHIVE: 'groups:archive',
  // Scheduling
  SCHEDULE_MANAGE: 'schedule:manage',
  // School-level settings (owner-only in most cases)
  SCHOOL_SETTINGS: 'school:settings',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export const ALL_CAPABILITIES: readonly Capability[] = Object.values(Capability);
