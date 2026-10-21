import { randomUUID } from 'node:crypto';
import { SUBSCRIPTION_EVENT_TYPES, type EntitlementsChangedEvent } from '@ssz/contracts';
import type { Entitlements } from '../../domain/entitlements.js';

export function toEntitlementsChangedEvent(e: Entitlements, now: Date): EntitlementsChangedEvent {
  return {
    eventId: randomUUID(),
    eventType: SUBSCRIPTION_EVENT_TYPES.ENTITLEMENTS_CHANGED,
    eventVersion: '1.0',
    occurredAt: now.toISOString(),
    source: 'subscription-service',
    payload: {
      account: { type: e.account.type, externalId: e.account.externalId },
      source: e.source,
      plan: e.plan,
      subscription: e.subscription
        ? {
            id: e.subscription.id,
            // A resolved subscription is always a current one.
            status: e.subscription.status as 'trial' | 'active',
            periodStart: e.subscription.periodStart.toISOString(),
            periodEnd: e.subscription.periodEnd?.toISOString() ?? null,
          }
        : null,
      features: e.features,
      periodStart: e.periodStart.toISOString(),
      periodEnd: e.periodEnd.toISOString(),
      validUntil: e.validUntil.toISOString(),
      version: e.version,
    },
  };
}
