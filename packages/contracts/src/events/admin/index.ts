import type { AdminLevel } from '../../enums/admin-level.js';

// ─── Event type constants (= RabbitMQ routing keys) ──────────────────────────

/**
 * One routing key for every service: each publishes it on its own exchange
 * (`auth.events`, `subscription.events`, …), and analytics-service binds the same key on each.
 */
export const ADMIN_EVENT_TYPES = {
  ACTION_PERFORMED: 'admin.action.performed',
} as const;

// ─── Auth actions ─────────────────────────────────────────────────────────────

/**
 * Actions auth-service writes to its `admin_audit` (mirrors `AdminActions` / `AdminUserActions`
 * in the C# service). Administrators: targetType `admin`, before/after `{ email, level }`.
 * Accounts (plan 90, phase 6): targetType `user`, before/after `{ email, …the fields touched }`:
 * - `user.blocked` — `{ blocked, activeSessions }`, after adds `blockedAt`;
 * - `user.unblocked` — before `{ blocked, blockedAt, blockedBy, blockReason }`, after `{ blocked }`;
 * - `user.unlocked` — `{ failedLoginAttempts, lockedUntil, mfaCodeFailures, mfaCodesLockedUntil }`;
 * - `user.sessions_revoked` — `{ clientType (null = all), sessions: { <client>: count } }`;
 * - `user.mfa_reset` — `{ twoFactorEnabled, backupCodesLeft, adminSessions }`, after adds
 *   `mfaCodeCounterCleared` (false when Redis could not be reached);
 * - `user.deletion_cancelled` — `{ deletionRequestedAt }`.
 */
export const AUTH_ADMIN_ACTIONS = {
  ADMIN_GRANTED: 'admin.granted',
  ADMIN_LEVEL_CHANGED: 'admin.level_changed',
  ADMIN_REVOKED: 'admin.revoked',
  TOKEN_LIFETIME_CHANGED: 'token_lifetime.changed',
  USER_BLOCKED: 'user.blocked',
  USER_UNBLOCKED: 'user.unblocked',
  USER_UNLOCKED: 'user.unlocked',
  USER_SESSIONS_REVOKED: 'user.sessions_revoked',
  USER_MFA_RESET: 'user.mfa_reset',
  USER_DELETION_CANCELLED: 'user.deletion_cancelled',
} as const;

export type AuthAdminAction = (typeof AUTH_ADMIN_ACTIONS)[keyof typeof AUTH_ADMIN_ACTIONS];

// ─── Payload ──────────────────────────────────────────────────────────────────

/** Service that performed the change and holds its `admin_audit` row. */
export type AdminAuditService = 'auth' | 'subscription' | 'organization' | 'ai' | 'media';

/**
 * A change a platform admin made, published after the service's `admin_audit` row is committed
 * (the row and the event share an id — the envelope's `eventId`). Absent fields are null in the row:
 * a publisher omits them rather than sending `null`.
 *
 * Actions are `<object>.<verb>` and owned by the service, e.g. auth: `AUTH_ADMIN_ACTIONS`.
 */
export interface AdminActionPerformedPayload {
  service: AdminAuditService;
  /** Absent when no person acted — e.g. auth's `admin bootstrap` command. */
  actorId?: string;
  actorLevel?: AdminLevel;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// ─── Envelope ─────────────────────────────────────────────────────────────────

/**
 * Envelope as published. Auth-service sends its own C# envelope: `eventType` is the class name
 * (`AdminActionPerformedEvent`), not the routing key, and `version` is a number — consumers
 * dispatch by routing key, never by `eventType`.
 */
export interface AdminActionPerformedEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  version?: number;
  eventVersion?: string;
  source?: string;
  payload: AdminActionPerformedPayload;
}
