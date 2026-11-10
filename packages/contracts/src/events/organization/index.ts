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
  TUTORING_INVITATION_SENT: 'tutoring.invitation.sent',
  // School lifecycle (plan 90, phase 5).
  SCHOOL_SUSPENDED: 'school.suspended',
  SCHOOL_REACTIVATED: 'school.reactivated',
  SCHOOL_CLOSED: 'school.closed',
  SCHOOL_RESTORED: 'school.restored',
  SCHOOL_PURGED: 'school.purged',
  SCHOOL_PURGE_REMINDER: 'school.purge.reminder',
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
  /**
   * What the invitation is into. SOLO means one private tutor's workspace: the
   * invitee must never be told they were invited to a school, and `inviterName`
   * is the tutor's own name. Absent on events published before solo workspaces
   * existed — treat as SCHOOL.
   */
  workspaceKind?: 'SCHOOL' | 'SOLO';
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

export interface TutoringInvitationSentPayload {
  invitationId: string;
  tutorGroupId: string;
  inviteeEmail: string;
  tutorName: string;
  /** Full invitation acceptance URL */
  invitationUrl: string;
  expiresAt: string; // ISO 8601
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

// ─── School lifecycle (plan 90, phase 5) ──────────────────────────────────────

/** `active` → `suspended` (read only) → `closed` (archive) → `purged` (tombstone). */
export type SchoolLifecycleStatus = 'active' | 'suspended' | 'closed' | 'purged';

/** Who moved the school: a platform admin, its owner ("delete school" archives it) or the timer. */
export type SchoolLifecycleActor = 'admin' | 'owner' | 'system';

/**
 * One shape for `school.suspended`, `school.reactivated`, `school.closed` and `school.restored`.
 * The admin's reason stays in the admin trail and is not sent here: owners and learners are told
 * what happened, not why the platform's staff decided it.
 */
export interface SchoolLifecyclePayload {
  schoolId: string;
  ownerId: string;
  name: string;
  kind: 'SCHOOL' | 'SOLO';
  status: SchoolLifecycleStatus;
  previousStatus: SchoolLifecycleStatus;
  by: SchoolLifecycleActor;
  /** ISO 8601 — when the status changed. */
  changedAt: string;
  /** ISO 8601 — when a suspended school closes by itself; null in any other status. */
  closesAt: string | null;
  /** ISO 8601 — when a closed school is purged; null in any other status. */
  purgeAt: string | null;
}

/**
 * `school.purged` — everything of the school is gone from organization-service; the row stays as a
 * tombstone (name, owner, dates). Other services delete what they hold of the school (content's
 * materials, scheduling's slots…) and never a learner's own history (attempts, progress, SRS).
 */
export interface SchoolPurgedPayload {
  schoolId: string;
  ownerId: string;
  name: string;
  kind: 'SCHOOL' | 'SOLO';
  /** ISO 8601. */
  purgedAt: string;
}

/** `school.purge.reminder` — tells the owner a closed school will be purged; sent once at 30 and once at 7 days. */
export interface SchoolPurgeReminderPayload {
  schoolId: string;
  ownerId: string;
  name: string;
  kind: 'SCHOOL' | 'SOLO';
  daysLeft: 30 | 7;
  /** ISO 8601. */
  purgeAt: string;
}

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
export type TutoringInvitationSentEvent = BaseEvent<TutoringInvitationSentPayload>;
export type SchoolLifecycleEvent = BaseEvent<SchoolLifecyclePayload>;
export type SchoolPurgedEvent = BaseEvent<SchoolPurgedPayload>;
export type SchoolPurgeReminderEvent = BaseEvent<SchoolPurgeReminderPayload>;

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
  | StudentNudgedEvent
  | TutoringInvitationSentEvent
  | SchoolLifecycleEvent
  | SchoolPurgedEvent
  | SchoolPurgeReminderEvent;
