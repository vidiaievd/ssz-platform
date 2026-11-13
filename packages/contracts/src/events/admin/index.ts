import type { AdminLevel } from '../../enums/admin-level.js';

// ─── Event type constants (= RabbitMQ routing keys) ──────────────────────────

/**
 * One routing key for every service: each publishes it on its own exchange
 * (`auth.events`, `subscription.events`, …), and analytics-service binds the same key on each.
 */
export const ADMIN_EVENT_TYPES = {
  ACTION_PERFORMED: 'admin.action.performed',
} as const;

// ─── Payload ──────────────────────────────────────────────────────────────────

/** Service that performed the change and holds its `admin_audit` row. */
export type AdminAuditService = 'auth' | 'subscription' | 'organization' | 'ai';

/**
 * A change a platform admin made, published after the service's `admin_audit` row is committed
 * (the row and the event share an id — the envelope's `eventId`). Absent fields are null in the row:
 * a publisher omits them rather than sending `null`.
 *
 * Actions are `<object>.<verb>` and owned by the service, e.g. auth: `admin.granted`,
 * `admin.level_changed`, `admin.revoked` (targetType `admin`, before/after `{ email, level }`).
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
