import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const ORGANIZATION_EVENT_TYPES = {
  SCHOOL_CREATED: 'school.created',
  SCHOOL_MEMBER_ADDED: 'school.member.added',
  SCHOOL_MEMBER_REMOVED: 'school.member.removed',
  SCHOOL_INVITATION_SENT: 'school.invitation.sent',
  USER_PLATFORM_ROLE_ASSIGNED: 'user.platform.role.assigned',
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

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type SchoolCreatedEvent = BaseEvent<SchoolCreatedPayload>;
export type SchoolMemberAddedEvent = BaseEvent<SchoolMemberAddedPayload>;
export type SchoolMemberRemovedEvent = BaseEvent<SchoolMemberRemovedPayload>;
export type SchoolInvitationSentEvent = BaseEvent<SchoolInvitationSentPayload>;
export type UserPlatformRoleAssignedEvent = BaseEvent<UserPlatformRoleAssignedPayload>;

export type AnyOrganizationEvent =
  | SchoolCreatedEvent
  | SchoolMemberAddedEvent
  | SchoolMemberRemovedEvent
  | SchoolInvitationSentEvent
  | UserPlatformRoleAssignedEvent;
