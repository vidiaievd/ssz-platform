import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const ORGANIZATION_EVENT_TYPES = {
  SCHOOL_CREATED: 'school.created',
  SCHOOL_MEMBER_ADDED: 'school.member.added',
  SCHOOL_MEMBER_REMOVED: 'school.member.removed',
  SCHOOL_INVITATION_SENT: 'school.invitation.sent',
  USER_PLATFORM_ROLE_ASSIGNED: 'user.platform.role.assigned',
  SCHOOL_TEACHER_ACCEPTED: 'school.teacher.accepted',
  TEACHER_PROFILE_CHANGED: 'organization.teacher.profile_changed',
  GROUP_PUBLISHED: 'school.group.published',
  GROUP_ARCHIVED: 'school.group.archived',
  GROUP_MEMBER_ADDED: 'school.group.member.added',
  GROUP_MEMBER_REMOVED: 'school.group.member.removed',
  ENROLLMENT_REQUEST: 'school.enrollment.requested',
  ENROLLMENT_APPROVED: 'school.enrollment.approved',
  ENROLLMENT_REJECTED: 'school.enrollment.rejected',
  PLACEMENT_REVIEW_READY: 'school.enrollment.placement_review_ready',
  GROUP_ASSIGNED: 'school.enrollment.group_assigned',
  STUDENT_REMOVED: 'school.student.removed',
  STUDENT_NUDGED: 'school.student.nudged',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface SchoolCreatedPayload {
  schoolId: string;
  ownerId: string;
  name: string;
}

export interface SchoolMemberAddedPayload {
  schoolId: string;
  userId: string;
  role: string;
}

export interface SchoolMemberRemovedPayload {
  schoolId: string;
  userId: string;
}

export interface SchoolInvitationSentPayload {
  invitationId: string;
  schoolId: string;
  schoolName: string;
  inviteeEmail: string;
  inviterName: string;
  /** Full invitation acceptance URL */
  invitationUrl: string;
  role: string;
  expiresAt: string; // ISO 8601
  /** Present only when the invitee already has an account (kind=onboard_existing). Used to create an IN_APP notification. */
  recipientUserId?: string;
}

export interface UserPlatformRoleAssignedPayload {
  userId: string;
  platformRole: string;
}

export interface GroupPublishedPayload {
  schoolId: string;
  groupId: string;
  groupName: string;
  courseId: string | null;
  lang: string | null;
  level: string | null;
}

export interface GroupArchivedPayload {
  schoolId: string;
  groupId: string;
}

export interface GroupMemberAddedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  /** courseId of the group (null if not set) — used by content-service to grant entitlement */
  courseId: string | null;
  groupStatus: string; // 'draft' | 'active' | 'archived'
  /** ISO 8601 */
  addedAt: string;
}

export interface GroupMemberRemovedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string | null;
}

export interface TeacherProfileChangedPayload {
  schoolId: string;
  recipientId: string;
  teacherUserId: string;
  changedFields: string[];
  occurredAt: string; // ISO 8601
}

export interface EnrollmentRequestPayload {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  studentId: string;
  /** Resolved display name of the applying student */
  studentName: string;
  studentAvatarUrl?: string;
  studentEmail?: string;
  /** Onboarding intent, when captured at apply time */
  language?: string;
  ageBand?: string;
  /** How the membership was created: 'public-apply' | 'invite' | 'direct' */
  source: string;
  /** IDs of school OWNER/ADMINs to notify */
  adminIds: string[];
  occurredAt: string;
}

export interface EnrollmentApprovedPayload {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  studentId: string;
  occurredAt: string;
}

export interface EnrollmentRejectedPayload {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  studentId: string;
  occurredAt: string;
}

export interface PlacementReviewReadyPayload {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  studentId: string;
  adminIds: string[];
  occurredAt: string;
}

export interface GroupAssignedPayload {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  studentId: string;
  groupId: string;
  groupName: string;
  occurredAt: string;
}

export interface StudentRemovedPayload {
  schoolId: string;
  userId: string;
}

export interface StudentNudgedPayload {
  schoolId: string;
  studentUserId: string;
  requestedBy: string;
  occurredAt: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type SchoolCreatedEvent = BaseEvent<SchoolCreatedPayload>;
export type SchoolMemberAddedEvent = BaseEvent<SchoolMemberAddedPayload>;
export type SchoolMemberRemovedEvent = BaseEvent<SchoolMemberRemovedPayload>;
export type SchoolInvitationSentEvent = BaseEvent<SchoolInvitationSentPayload>;
export type UserPlatformRoleAssignedEvent = BaseEvent<UserPlatformRoleAssignedPayload>;
export type GroupPublishedEvent = BaseEvent<GroupPublishedPayload>;
export type GroupArchivedEvent = BaseEvent<GroupArchivedPayload>;
export type GroupMemberAddedEvent = BaseEvent<GroupMemberAddedPayload>;
export type GroupMemberRemovedEvent = BaseEvent<GroupMemberRemovedPayload>;
export type TeacherProfileChangedEvent = BaseEvent<TeacherProfileChangedPayload>;
export type EnrollmentRequestEvent = BaseEvent<EnrollmentRequestPayload>;
export type EnrollmentApprovedEvent = BaseEvent<EnrollmentApprovedPayload>;
export type EnrollmentRejectedEvent = BaseEvent<EnrollmentRejectedPayload>;
export type PlacementReviewReadyEvent = BaseEvent<PlacementReviewReadyPayload>;
export type GroupAssignedEvent = BaseEvent<GroupAssignedPayload>;
export type StudentRemovedEvent = BaseEvent<StudentRemovedPayload>;
export type StudentNudgedEvent = BaseEvent<StudentNudgedPayload>;

export type AnyOrganizationEvent =
  | SchoolCreatedEvent
  | SchoolMemberAddedEvent
  | SchoolMemberRemovedEvent
  | SchoolInvitationSentEvent
  | UserPlatformRoleAssignedEvent
  | GroupPublishedEvent
  | GroupArchivedEvent
  | GroupMemberAddedEvent
  | GroupMemberRemovedEvent
  | TeacherProfileChangedEvent
  | EnrollmentRequestEvent
  | EnrollmentApprovedEvent
  | EnrollmentRejectedEvent
  | PlacementReviewReadyEvent
  | GroupAssignedEvent
  | StudentRemovedEvent
  | StudentNudgedEvent;
