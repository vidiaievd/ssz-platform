import type { BaseEvent } from '../base.js';

// ─── Event type constants (= RabbitMQ routing keys) ──────────────────────────

export const AUTH_EVENT_TYPES = {
  USER_REGISTERED: 'auth.user.registered',
  USER_LOGGED_IN: 'auth.user.login',
  USER_2FA_ENABLED: 'auth.user.2fa_enabled',
  USER_2FA_DISABLED: 'auth.user.2fa_disabled',
  USER_LOGGED_OUT: 'auth.user.logout',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_CHANGED: 'auth.password_changed',
  EMAIL_VERIFICATION_REQUESTED: 'auth.email_verification_requested',
  EMAIL_VERIFIED: 'auth.email_verified',
  USER_DELETED: 'auth.user.deleted',
  /** A role added after registration (organization's onboarding, self-assignment, admin level). */
  USER_ROLE_ASSIGNED: 'auth.user.role_assigned',
  /** A role taken away (today platform_admin, when an administrator is revoked). */
  USER_ROLE_REMOVED: 'auth.user.role_removed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  roles: string[];
}

/** `auth.user.role_assigned` / `auth.user.role_removed`: one role, lowercase, sent only when it changed. */
export interface UserRoleChangedPayload {
  userId: string;
  role: string;
}

export interface UserLoggedInPayload {
  userId: string;
  mfaUsed: boolean;
}

export interface User2FAEnabledPayload {
  userId: string;
}

export interface User2FADisabledPayload {
  userId: string;
}

export interface UserLoggedOutPayload {
  userId: string;
}

export interface PasswordResetRequestedPayload {
  userId: string;
  email: string;
  /** Full reset URL including the raw token, safe to embed in emails */
  resetUrl: string;
  expiresInMinutes: number;
}

export interface PasswordChangedPayload {
  userId: string;
  email: string;
}

export interface EmailVerificationRequestedPayload {
  userId: string;
  email: string;
  /** Full verification URL including the raw token */
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface EmailVerifiedPayload {
  userId: string;
  email: string;
}

/**
 * The account is erased for good, after its 30-day deletion grace period. Every service drops
 * (not anonymises) what it holds about the user; money ledgers only lose the link. Never
 * published while the deletion is merely requested. May arrive more than once.
 */
export interface UserDeletedPayload {
  userId: string;
  /** The account's address, for what is keyed by it (invitations); auth no longer has it. */
  email: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type UserRegisteredEvent = BaseEvent<UserRegisteredPayload>;
export type UserLoggedInEvent = BaseEvent<UserLoggedInPayload>;
export type User2FAEnabledEvent = BaseEvent<User2FAEnabledPayload>;
export type User2FADisabledEvent = BaseEvent<User2FADisabledPayload>;
export type UserLoggedOutEvent = BaseEvent<UserLoggedOutPayload>;
export type PasswordResetRequestedEvent = BaseEvent<PasswordResetRequestedPayload>;
export type PasswordChangedEvent = BaseEvent<PasswordChangedPayload>;
export type EmailVerificationRequestedEvent = BaseEvent<EmailVerificationRequestedPayload>;
export type EmailVerifiedEvent = BaseEvent<EmailVerifiedPayload>;
export type UserDeletedEvent = BaseEvent<UserDeletedPayload>;

export type AnyAuthEvent =
  | UserRegisteredEvent
  | UserLoggedInEvent
  | User2FAEnabledEvent
  | User2FADisabledEvent
  | UserLoggedOutEvent
  | PasswordResetRequestedEvent
  | PasswordChangedEvent
  | EmailVerificationRequestedEvent
  | EmailVerifiedEvent
  | UserDeletedEvent;
