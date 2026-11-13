import { grantState } from '../domain/grant.js';
import { isCurrent } from '../domain/subscription.js';
import type { AccountLookupItem, LookupRows } from './account-views.js';

/**
 * Turns a batch read into one item per requested id, in the order asked. A payer without an
 * account, or without a current subscription, is on the audience's free plan — the same rule
 * entitlements resolution follows (plan 78 §4), so the panel shows what the services enforce.
 */
export function summariseLookup(ids: readonly string[], rows: LookupRows, now: Date): AccountLookupItem[] {
  const byId = new Map(rows.accounts.map((a) => [a.externalId, a]));
  return ids.map((externalId) => {
    const row = byId.get(externalId);
    const current = row?.openSubscriptions.find((s) => isCurrent(s, now)) ?? null;
    let activeGrants = 0;
    let scheduledGrants = 0;
    for (const g of row?.liveGrants ?? []) {
      const state = grantState(g, now);
      if (state === 'active') activeGrants += 1;
      else if (state === 'scheduled') scheduledGrants += 1;
    }
    return {
      externalId,
      hasAccount: row !== undefined,
      source: current ? 'subscription' : 'free_plan',
      plan: current ? { code: current.planCode, name: current.planName, version: current.planVersion } : rows.freePlan,
      subscription: current
        ? { id: current.id, status: current.status, periodStart: current.periodStart, periodEnd: current.periodEnd }
        : null,
      activeGrants,
      scheduledGrants,
    };
  });
}
