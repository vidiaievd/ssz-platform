import { EXCHANGES, parseAdminLevel } from '@ssz/contracts';
import type { AdminAuditService, AdminLevel } from '@ssz/contracts';

/**
 * The services whose admin trail this journal collects, by the exchange each publishes on.
 * A row's `service` comes from here, never from the payload: a service can only write its own trail.
 * Ai joined in plan 90, phase 3 (payer policies); organization joins when it starts writing one (phase 5).
 */
export const ADMIN_AUDIT_SOURCES: Readonly<Record<string, AdminAuditService>> = {
  [EXCHANGES.AUTH!]: 'auth',
  [EXCHANGES.SUBSCRIPTION!]: 'subscription',
  [EXCHANGES.AI!]: 'ai',
};

export const ADMIN_AUDIT_SERVICES: readonly AdminAuditService[] = ['auth', 'subscription', 'organization', 'ai'];

/** One row of `admin_audit_log`. */
export interface AdminAuditRow {
  id: string;
  service: AdminAuditService;
  occurredAt: Date;
  actorId: string | null;
  actorLevel: AdminLevel | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * The row an `admin.action.performed` envelope makes, or null when it is not one we can file.
 *
 * Reads both envelopes: auth's C# one (`version` number, `eventType` = class name) and the NestJS
 * one (`eventVersion` string) — only `eventId`, `occurredAt` and `payload` are used, so neither
 * version field matters. Absent and null fields are the same thing (auth omits nulls).
 */
export function adminAuditRowOf(exchange: string, envelope: unknown): AdminAuditRow | null {
  const service = ADMIN_AUDIT_SOURCES[exchange];
  if (!service || !isObject(envelope)) return null;

  const { eventId, occurredAt, payload } = envelope;
  if (!nonEmpty(eventId) || !isObject(payload)) return null;

  const at = typeof occurredAt === 'string' ? new Date(occurredAt) : null;
  if (!at || Number.isNaN(at.getTime())) return null;

  // A payload naming another service is a publisher bug; filing it under either name would lie.
  if (payload['service'] !== undefined && payload['service'] !== service) return null;

  const { action, targetType, targetId } = payload;
  if (!nonEmpty(action) || !nonEmpty(targetType) || !nonEmpty(targetId)) return null;

  const before = optionalObject(payload['before']);
  const after = optionalObject(payload['after']);
  if (before === undefined || after === undefined) return null;

  return {
    id: eventId,
    service,
    occurredAt: at,
    actorId: nonEmpty(payload['actorId']) ? payload['actorId'] : null,
    actorLevel: parseAdminLevel(payload['actorLevel']),
    action,
    targetType,
    targetId,
    reason: nonEmpty(payload['reason']) ? payload['reason'] : null,
    before,
    after,
  };
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export const ADMIN_AUDIT_PAGE_DEFAULT = 50;
export const ADMIN_AUDIT_PAGE_MAX = 200;

export interface AdminAuditFilter {
  service?: AdminAuditService;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** Inclusive. */
  from?: Date;
  /** Exclusive. */
  to?: Date;
}

/** Position after the last row of a page: newest first, ties on time broken by id. */
export interface AdminAuditCursor {
  occurredAt: Date;
  id: string;
}

export function encodeCursor(cursor: AdminAuditCursor): string {
  return Buffer.from(`${cursor.occurredAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** Null for anything that is not a cursor this service wrote. */
export function decodeCursor(raw: string): AdminAuditCursor | null {
  let text: string;
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const bar = text.indexOf('|');
  if (bar <= 0 || bar === text.length - 1) return null;
  const occurredAt = new Date(text.slice(0, bar));
  if (Number.isNaN(occurredAt.getTime())) return null;
  return { occurredAt, id: text.slice(bar + 1) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Null when absent, the object when an object, undefined when it is something else (malformed). */
function optionalObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined || value === null) return null;
  return isObject(value) ? value : undefined;
}
