import type { BillingAccountType } from '../domain/billing-account.js';
import type { GrantState } from '../domain/grant.js';
import type { SubscriptionStatus } from '../domain/subscription.js';

export interface AccountView {
  id: string;
  type: BillingAccountType;
  externalId: string;
  createdAt: Date;
}

export interface SubscriptionView {
  id: string;
  planCode: string;
  planName: string;
  planVersion: number;
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date | null;
  createdBy: string;
  createdAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

export interface GrantView {
  id: string;
  featureKey: string;
  /** false = the grant switches the key off. */
  enabled: boolean;
  monthlyCredits: string | null;
  limits: Record<string, number>;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  state: GrantState;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

/** What the account runs on now: the current subscription (null = free plan) and live grants. */
export interface AccountOverview {
  account: AccountView;
  subscription: SubscriptionView | null;
  /** Active and scheduled grants, soonest ending first. */
  grants: GrantView[];
}

/** Everything ever assigned or granted, newest first. */
export interface AccountHistory {
  account: AccountView;
  subscriptions: SubscriptionView[];
  grants: GrantView[];
}

/** Raw rows for one payer in a batch lookup — what the reader found, before anything is decided. */
export interface LookupAccountRow {
  externalId: string;
  /** Rows still marked trial/active; whether one counts now is decided by `isCurrent`. */
  openSubscriptions: Array<{
    id: string;
    planCode: string;
    planName: string;
    planVersion: number;
    status: SubscriptionStatus;
    periodStart: Date;
    periodEnd: Date | null;
    /** The `seats.students` row of the version it is on; null = the version has none. */
    seats: PlanSeatsRow | null;
  }>;
  /** Grants not revoked and not ended yet (active or scheduled). */
  liveGrants: Array<{
    featureKey: string;
    enabled: boolean;
    monthlyCredits: string | null;
    limits: Record<string, number>;
    startsAt: Date;
    endsAt: Date;
    revokedAt: Date | null;
  }>;
}

/** A plan version's `seats.students` feature, as far as the seat limit needs it. */
export interface PlanSeatsRow {
  enabled: boolean;
  limits: Record<string, number>;
}

export interface LookupPlanRef {
  code: string;
  name: string;
  version: number;
}

export interface LookupRows {
  accounts: LookupAccountRow[];
  /** The current version of the audience's free plan; null when it is not seeded. */
  freePlan: (LookupPlanRef & { seats: PlanSeatsRow | null }) | null;
}

/** One payer of a batch lookup: what it runs on now, in a table row's worth of fields. */
export interface AccountLookupItem {
  externalId: string;
  /** False = the payer was never seen here; it is on its audience's free plan all the same. */
  hasAccount: boolean;
  /** Where `plan` came from: a running subscription, or the audience's free plan as fallback. */
  source: 'subscription' | 'free_plan';
  /** Null only when there is no current subscription and the free plan is not seeded. */
  plan: LookupPlanRef | null;
  /** The current subscription; null = on the free plan without a subscription row. */
  subscription: { id: string; status: SubscriptionStatus; periodStart: Date; periodEnd: Date | null } | null;
  /** Grants counting now. */
  activeGrants: number;
  /** Grants that start later. */
  scheduledGrants: number;
  /** Student seat limit now (plan with grants on top); null = no limit (plan 90, phase 4). */
  seats: { max: number } | null;
}
