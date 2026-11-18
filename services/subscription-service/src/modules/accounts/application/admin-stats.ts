import type { PlanAudience, PlanStatus } from '../../plans/domain/plan.js';
import type { BillingAccountType } from '../domain/billing-account.js';
import type { SubscriptionStatus } from '../domain/subscription.js';

/** Ending-soon lists stop at this many rows each; `truncated` says there were more. */
export const ENDING_SOON_LIMIT = 100;

/** Raw rows of the subscription stats (plan 90, phase 3, step 2), before anything is summed. */
export interface AdminStatsRows {
  plans: Array<{ code: string; name: string; audience: PlanAudience; status: PlanStatus; currentVersion: number }>;
  /** Current subscriptions (trial/active, not run out) counted per plan, version and status. */
  currentSubscriptions: Array<{ planCode: string; planVersion: number; status: SubscriptionStatus; count: number }>;
  /** Billing accounts per payer type. */
  accounts: Array<{ type: BillingAccountType; count: number }>;
  /** Live grants ending inside the window, soonest first; at most ENDING_SOON_LIMIT + 1. */
  grantsEnding: EndingGrant[];
  /** Current subscriptions whose term ends inside the window, soonest first; at most ENDING_SOON_LIMIT + 1. */
  subscriptionsEnding: EndingSubscription[];
}

export interface EndingGrant {
  grantId: string;
  accountType: BillingAccountType;
  externalId: string;
  featureKey: string;
  /** false = the grant switches the key off; its end gives the key back. */
  enabled: boolean;
  startsAt: Date;
  endsAt: Date;
}

export interface EndingSubscription {
  subscriptionId: string;
  accountType: BillingAccountType;
  externalId: string;
  planCode: string;
  planName: string;
  planVersion: number;
  status: SubscriptionStatus;
  periodEnd: Date;
}

export interface PlanStats {
  code: string;
  name: string;
  audience: PlanAudience;
  status: PlanStatus;
  currentVersion: number;
  /** Payers running on the plan now through a subscription row. */
  subscribers: number;
  trial: number;
  /** Subscribers per version, newest version first; versions nobody is on are left out. */
  byVersion: Array<{ version: number; count: number }>;
}

export interface PayerStats {
  /** Payers this service has an account for. A payer never seen is on its free plan and is not counted. */
  accounts: number;
  withSubscription: number;
  /** Accounts without a current subscription — on the audience's free plan by fallback. */
  withoutSubscription: number;
}

export interface AdminStats {
  generatedAt: Date;
  withinDays: number;
  /** End of the window the ending-soon lists look into. */
  horizon: Date;
  plans: PlanStats[];
  payers: Record<BillingAccountType, PayerStats>;
  endingSoon: {
    grants: EndingGrant[];
    subscriptions: EndingSubscription[];
    /** One of the lists hit ENDING_SOON_LIMIT and was cut. */
    truncated: boolean;
  };
}

const PAYER_TYPE_OF: Record<PlanAudience, BillingAccountType> = { workspace: 'workspace', individual: 'user' };

/**
 * The dashboard's subscription numbers. Each account has at most one current subscription,
 * so subscribers of an audience's plans and its accounts without one add up to its accounts.
 */
export function summariseAdminStats(rows: AdminStatsRows, now: Date, withinDays: number, horizon: Date): AdminStats {
  const plans: PlanStats[] = rows.plans.map((p) => {
    const mine = rows.currentSubscriptions.filter((s) => s.planCode === p.code);
    const versions = new Map<number, number>();
    for (const s of mine) versions.set(s.planVersion, (versions.get(s.planVersion) ?? 0) + s.count);
    return {
      code: p.code,
      name: p.name,
      audience: p.audience,
      status: p.status,
      currentVersion: p.currentVersion,
      subscribers: mine.reduce((n, s) => n + s.count, 0),
      trial: mine.filter((s) => s.status === 'trial').reduce((n, s) => n + s.count, 0),
      byVersion: [...versions].sort((a, b) => b[0] - a[0]).map(([version, count]) => ({ version, count })),
    };
  });

  const payers: Record<BillingAccountType, PayerStats> = {
    workspace: { accounts: 0, withSubscription: 0, withoutSubscription: 0 },
    user: { accounts: 0, withSubscription: 0, withoutSubscription: 0 },
  };
  for (const a of rows.accounts) payers[a.type].accounts += a.count;
  for (const p of plans) payers[PAYER_TYPE_OF[p.audience]].withSubscription += p.subscribers;
  for (const t of Object.keys(payers) as BillingAccountType[]) {
    payers[t].withoutSubscription = Math.max(0, payers[t].accounts - payers[t].withSubscription);
  }

  const truncated = rows.grantsEnding.length > ENDING_SOON_LIMIT || rows.subscriptionsEnding.length > ENDING_SOON_LIMIT;
  return {
    generatedAt: now,
    withinDays,
    horizon,
    plans,
    payers,
    endingSoon: {
      grants: rows.grantsEnding.slice(0, ENDING_SOON_LIMIT),
      subscriptions: rows.subscriptionsEnding.slice(0, ENDING_SOON_LIMIT),
      truncated,
    },
  };
}
