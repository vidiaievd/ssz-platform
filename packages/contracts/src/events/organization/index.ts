import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const ORGANIZATION_EVENT_TYPES = {
  SCHOOL_CREATED: 'school.created',
  SCHOOL_MEMBER_ADDED: 'school.member.added',
  SCHOOL_MEMBER_REMOVED: 'school.member.removed',
  SCHOOL_INVITATION_SENT: 'school.invitation.sent',
  USER_PLATFORM_ROLE_ASSIGNED: 'user.platform.role.assigned',
  GROUP_PUBLISHED: 'school.group.published',
  GROUP_ARCHIVED: 'school.group.archived',
  GROUP_MEMBER_ADDED: 'school.group.member.added',
  GROUP_MEMBER_REMOVED: 'school.group.member.removed',
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

export type AnyOrganizationEvent =
  | SchoolCreatedEvent
  | SchoolMemberAddedEvent
  | SchoolMemberRemovedEvent
  | SchoolInvitationSentEvent
  | UserPlatformRoleAssignedEvent
  | GroupPublishedEvent
  | GroupArchivedEvent
  | GroupMemberAddedEvent
  | GroupMemberRemovedEvent;
