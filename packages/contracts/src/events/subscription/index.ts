import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const SUBSCRIPTION_EVENT_TYPES = {
  ENTITLEMENTS_CHANGED: 'subscription.entitlements.changed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

/** Who pays: a workspace (schoolId, SOLO included) or a self-taught learner (userId). */
export type SubscriptionPayerType = 'workspace' | 'user';

export interface FeatureEntitlementSnapshot {
  enabled: boolean;
  /** Decimal string per credit period; null = unmetered (or not metered in credits). */
  monthlyCredits: string | null;
  limits: Record<string, number>;
}

/**
 * A payer's full entitlements as subscription-service resolved them — the consumer never
 * has to call back for details. Snapshots of one payer can arrive out of order or twice:
 * keep the one with the highest `version` and drop the rest.
 */
export interface EntitlementsChangedPayload {
  account: { type: SubscriptionPayerType; externalId: string };
  /** `free_plan` — no current subscription, the audience's free plan applies. */
  source: 'subscription' | 'free_plan';
  /** Null only when the free plan is not seeded. */
  plan: { code: string; name: string; version: number } | null;
  subscription: {
    id: string;
    status: 'trial' | 'active';
    periodStart: string;
    periodEnd: string | null;
  } | null;
  /** Plan features with active grants applied; a key absent here is not available. */
  features: Record<string, FeatureEntitlementSnapshot>;
  /** ISO 8601 — the credit period monthly allowances are counted in (end exclusive). */
  periodStart: string;
  periodEnd: string;
  /**
   * ISO 8601 — when time alone changes this snapshot (a period rolls over, a grant starts
   * or ends, a subscription runs out). A newer snapshot is sent shortly after; until it
   * arrives, one past this moment is stale.
   */
  validUntil: string;
  /** The account's revision; grows with every change, including the ones time makes. */
  version: number;
}

// ─── Typed event aliases ──────────────────────────────────────────────────────

export type EntitlementsChangedEvent = BaseEvent<EntitlementsChangedPayload>;
