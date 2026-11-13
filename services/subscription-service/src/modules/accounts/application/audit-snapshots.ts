import type { AdminAuditTargetType } from '../../../shared/application/admin-audit.js';
import type { BillingAccountType } from '../domain/billing-account.js';
import type { Grant } from '../domain/grant.js';
import type { Subscription } from '../domain/subscription.js';

/** An account is logged under its payer, so a school's trail is found by its schoolId. */
export function accountTarget(type: BillingAccountType, externalId: string): { targetType: AdminAuditTargetType; targetId: string } {
  return { targetType: type, targetId: externalId };
}

export function subscriptionSnapshot(s: Subscription): Record<string, unknown> {
  return {
    subscriptionId: s.id,
    planCode: s.planCode,
    planVersion: s.planVersion,
    status: s.status,
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd?.toISOString() ?? null,
  };
}

export function grantSnapshot(grant: Grant): Record<string, unknown> {
  const g = grant.snapshot;
  return {
    grantId: g.id,
    featureKey: g.featureKey,
    monthlyCredits: g.monthlyCredits,
    limits: g.limits,
    startsAt: g.startsAt.toISOString(),
    endsAt: g.endsAt.toISOString(),
  };
}
